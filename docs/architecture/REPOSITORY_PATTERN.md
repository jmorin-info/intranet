# Repository Pattern — Backend NestJS

Date : 2026-04-26
Auteur : équipe technique
Statut : adopté progressivement

## Contexte

Avant cette migration, **tous les services NestJS** consommaient `PrismaService` directement (ex : `this.prisma.document.findUnique(...)`). Conséquences :

- **Testabilité réduite** : impossible de mocker un sous-ensemble d'opérations sans tout mocker
- **Couplage à l'API Prisma** : un changement d'ORM ou un upgrade Prisma majeur impacte ~70 services
- **Mélange des préoccupations** : la logique métier cohabite avec la construction de `where`/`include`
- **Réutilisation difficile** : 2 services qui veulent lire un Document avec ses ACK dupliquent le `include`

## Décision

Introduire un **Repository pattern fin** entre `Service` et `PrismaService`. Le repository :

- Encapsule les opérations Prisma sur **une seule entité** (ex : `Document`, `Ticket`, `User`)
- Expose des méthodes nommées par usage métier (`findById`, `findManyWithCount`, `count`, `groupByCategory`)
- **N'embarque AUCUNE logique métier** (les transitions de statut, validations, audit logs restent dans le service)
- Centralise les `include`/`select` partagés via constantes module-scoped (DRY)

### Non-objectifs

- ❌ Pas une couche d'abstraction "ORM-agnostic" — on assume Prisma volontairement (types, `Prisma.WhereInput`, etc.)
- ❌ Pas de pattern Repository "DDD lourd" — pas de `IRepository`, pas d'interfaces vides
- ❌ Pas de Big Bang — migration progressive, module par module, à effort constant

## Pattern adopté

### Avant (couplage direct)

```ts
// documents.service.ts
@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, currentUser: RequestUser) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, firstName: true, ... } },
        versions: { orderBy: { createdAt: 'desc' }, include: { ... } },
        isoControls: { include: { isoControl: true } },
        // ... 80 lignes d'include nested
      },
    });
    if (!document) throw new NotFoundException();
    // ... logique RBAC, classification check, ACL granulaire
    return enrichIsoControls(document);
  }
}
```

Problèmes :
- Le service est testé avec un mock Prisma volumineux (chaque champ de `include`)
- Le même `include` est dupliqué dans `findById`, `findAll`, `getHistory`, `findRelated`
- Toute évolution du modèle Document touche le service métier

### Après (repository fin)

```ts
// documents.repository.ts
const DOCUMENT_DETAIL_INCLUDE = {
  owner: { select: { id: true, firstName: true, ... } },
  versions: { orderBy: { createdAt: 'desc' as const }, include: { ... } },
  isoControls: { include: { isoControl: true } },
  // ...
} as const;

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.document.findUnique({
      where: { id },
      include: DOCUMENT_DETAIL_INCLUDE,
    });
  }

  async findManyWithCount(where, orderBy, skip, take) {
    return Promise.all([
      this.prisma.document.findMany({ where, include: DOCUMENT_LIST_INCLUDE, orderBy, skip, take }),
      this.prisma.document.count({ where }),
    ]);
  }
}
```

```ts
// documents.service.ts
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,    // pour les jointures cross-entité
    private readonly repo: DocumentsRepository, // pour les ops Document pures
    // ... autres deps
  ) {}

  async findById(id: string, currentUser: RequestUser) {
    const document = await this.repo.findById(id);
    if (!document) throw new NotFoundException();
    // ... logique RBAC, classification check, ACL granulaire
    return enrichIsoControls(document);
  }
}
```

### Module — enregistrement du repository

```ts
// documents.module.ts
@Module({
  providers: [
    DocumentsRepository,    // déclaré AVANT le service
    DocumentsService,
    // ...
  ],
  // Pas exporté hors du module — le service est l'unique consommateur public.
})
export class DocumentsModule {}
```

## Justification

| Critère | Avant | Après |
|---|---|---|
| Test du service : taille du mock Prisma | ~25 méthodes mockées | ~5-8 méthodes Repository mockées |
| Réutilisation d'`include` | dupliqué N fois | constante module-scoped |
| Évolution schéma Document | impacte le service | impacte uniquement le repository |
| Couplage Prisma → métier | fort | localisé au repository |
| Couplage Prisma → tests | requiert Prisma client mock | requiert repo mock |

## Migration progressive (état actuel + plan)

### Modules déjà migrés

| Module | Repository | Date | Notes |
|--------|-----------|------|-------|
| **Tickets** | `tickets.repository.ts` | 2026-04-25 | Migration complète, 18+ méthodes Prisma extraites |
| **Documents** | `documents.repository.ts` | 2026-04-26 (ce PR) | **Lecture seule** : `findById`, `findManyWithCount`, `count`, `groupBy*`, `findManyForBulk`. Écriture (create/update/softDelete/upload) reste dans le service. |

### Plan v1.2 — Modules à migrer ensuite (par priorité)

Effort estimé : 0.3 j à 1 j par module pour un repository "lecture seule" + 0.5 j à 1.5 j par module pour migration complète (lecture + écriture).

#### Priorité 1 — Modules à fort trafic + sécurité

| Module | Effort lecture | Effort complet | Justification |
|--------|---------------|----------------|---------------|
| **Users** | 0.5 j | 1.5 j | Service massif (~1500 lignes), critique sécurité (RBAC, MFA, GDPR). |
| **Auth** | 0.3 j | 1 j | Logique d'auth, tokens, password hash. Repository `RefreshTokenRepository` séparé probable. |
| **Audit** | 0.3 j | 0.5 j | Service simple, mais lecture intensive (timeline, stats). Bon ROI. |
| **Notifications** | 0.3 j | 0.8 j | Trafic élevé (broadcast, mark-as-read), service de taille moyenne. |

#### Priorité 2 — Modules métier ISO

| Module | Effort lecture | Effort complet | Justification |
|--------|---------------|----------------|---------------|
| **Incidents** | 0.3 j | 0.8 j | Workflow complexe + remédiations sub-relation. |
| **Signatures** | 0.3 j | 0.8 j | Couplé à Documents — repository peut bénéficier des includes Document. |
| **Compliance Tasks** | 0.2 j | 0.5 j | Service simple, peu volumineux. |
| **Access Reviews** | 0.3 j | 0.6 j | Cycle de vie campagnes/decisions. |
| **Frameworks / ISO Analyzer** | 0.3 j | 0.5 j | Lecture massive sur référentiels statiques. |

#### Priorité 3 — Knowledge

| Module | Effort lecture | Effort complet | Justification |
|--------|---------------|----------------|---------------|
| **Wiki** | 0.3 j | 0.7 j | WikiPage versions, recherche full-text. |
| **News** | 0.2 j | 0.4 j | Service simple (CRUD + lecture). |
| **Veille** | 0.2 j | 0.5 j | Lecture cyclique (cron) — bon pour repo. |
| **RAG** | 0.5 j | 1 j | Embeddings + sources cross-module. |

#### Priorité 4 — Helpdesk + collaboration

| Module | Effort lecture | Effort complet | Justification |
|--------|---------------|----------------|---------------|
| **Helpdesk** | 0.2 j | 0.5 j | Sub-set de tickets (déjà migré). |
| **Calendar** | 0.3 j | 0.7 j | Multi-équipes, visibilité, iCal. |
| **Quiz** | 0.2 j | 0.5 j | Service simple. |
| **Chat** | 0.3 j | 0.7 j | WebSockets + persistence. |

#### Priorité 5 — Périphérie

Tous les autres (~30 modules) : à migrer **opportunément** lorsqu'on touche au service pour autre raison. Effort cumulé : ~12-15 j-dev.

### Effort total estimé v1.2 → v1.3

| Lot | Effort | Cumul |
|-----|--------|-------|
| P1 (4 modules)  | ~4 j   | 4 j  |
| P2 (5 modules)  | ~3 j   | 7 j  |
| P3 (4 modules)  | ~2.5 j | 9.5 j |
| P4 (4 modules)  | ~2.5 j | 12 j |
| P5 (~30 modules opportunistes) | ~12 j | **24 j** |

## Règles à respecter (anti-anti-patterns)

1. **Repository = thin wrapper Prisma** — pas de logique métier, pas de transactions multi-entités.
2. **Cross-domain queries** (ex : "users + departments + permissions") restent dans le **service**, pas dans le repository (sauf si une seule entité racine est concernée).
3. **Le repository accepte des `Prisma.WhereInput` typés** — pas de `any` en signature publique. Exception tolérée pour `data` payload create/update si la complexité du type est démesurée (TODO: à durcir progressivement).
4. **Constants `INCLUDE`/`SELECT` au top du fichier** — facilite la lecture, évite la duplication.
5. **Pas d'injection croisée** : un `DocumentsRepository` ne dépend QUE de `PrismaService`. Pas de notification/audit/storage.
6. **Tests** : chaque repository a son `*.repository.spec.ts` avec un mock Prisma minimal. Le test du service mocke ensuite uniquement le repository.

## Anti-patterns à éviter

- ❌ Repository "fat" qui gère storage + audit + notifications
- ❌ Repository qui retourne des DTOs dénormalisés (la transformation reste dans le service)
- ❌ Repository qui throw `NotFoundException`/`ForbiddenException` (codes HTTP = service controller-side)
- ❌ Repository qui prend `RequestUser` en paramètre (RBAC = service)
- ❌ Cycle Repository ↔ Service (le repository ne connaît jamais le service)

## Quand NE PAS introduire de repository

- Service trivial (< 100 lignes, < 5 appels Prisma)
- Service en cours de refactor majeur — différer
- Pré-prod (T-7 jours) — risque trop élevé pour ROI marginal

## Métriques de succès

- ⬇ Réduire le nombre moyen de lignes Prisma directes par service de **70 %** d'ici v1.3
- ⬆ Permettre des tests unitaires de service avec **moins de 10 méthodes mockées** (vs ~25 aujourd'hui)
- ⬆ Réduire la duplication d'`include`/`select` à **0** au sein d'un module donné
- ⬇ Temps moyen pour ajouter un test de service unitaire : 30 min (vs 1.5 h aujourd'hui)

## Évolutions ultérieures (out-of-scope v1.x)

- **Repository générique** : usage de mixins TypeScript pour mutualiser `findById/count/findManyWithCount` entre tous les repositories. À évaluer après 8 modules migrés.
- **Caching layer transparent** : ajouter `@Cacheable` decorator sur les méthodes repository (avec TTL configurable), supprime le cache manuel dans les services.
- **Outbox pattern** : pour les opérations asynchrones (notifications, audit), publier des events depuis les repositories au lieu d'invoquer les services. Étude v2.x.
