# Recherche unifiée — OMNITECH Intranet (vague A v1.1)

> **Statut** : implémenté — fusion `/search` (v1 Postgres FTS) + `/search/v2` (orpheline Meili)
> **Date** : 2026-04-26
> **Endpoint canonique** : `GET /api/v1/search/unified`

---

## 1. Contexte de la fusion

Avant la vague A, deux pages de recherche coexistaient :

| Route | Backend | UI | Lignes | Statut sidebar/palette |
|---|---|---|---|---|
| `/search` | Postgres FTS + fallback Meili | Riche : facettes, filtres, sort, AI smart, did-you-mean | **1476** | Branchée |
| `/search/v2` | Meilisearch (endpoint manquant `/search/v2` !) | Minimaliste : groupes par index | 213 | **Orpheline** (pas de lien) |

**Problèmes** :
1. Code mort (la page v2 ne pouvait pas fonctionner — son endpoint backend n'existait pas).
2. Doublon UX (deux pages pour le même use-case).
3. Mégafichier de 1476 lignes côté frontend.
4. Le fallback Meili dans v1 était un best-effort sans facettes.

**Décision** : conserver `/search`, supprimer `/search/v2`, basculer le primaire sur Meilisearch et gagner les facettes natives.

## 2. Architecture cible

### 2.1 Frontend

```
apps/frontend/src/app/(app)/search/
├── page.tsx                              ← orchestrateur (~370 lignes)
└── _components/
    ├── types.ts                          ← types partagés + helpers
    ├── search-filters.tsx                ← pills modules + sort toggle
    ├── facet-sidebar.tsx                 ← facettes Meili (catégorie/classification/statut)
    ├── search-results.tsx                ← rendu Meili groupé par module
    ├── search-quick-actions.tsx          ← actions inline (créer doc/ticket...)
    ├── search-empty-state.tsx            ← popular + recent
    ├── saved-searches-dropdown.tsx       ← sauvegardes localStorage v2
    ├── ai-smart-results.tsx              ← mode IA (`/ai/search`) — feature flag
    ├── sanitize-highlight.ts             ← helper XSS-safe pour <mark>
    ├── migrate.ts                        ← v1 → v2 migration des saved-filters
    └── __tests__/
        ├── migrate.test.ts
        └── sanitize-highlight.test.ts
```

**Aucun composant n'excède 400 lignes**.

### 2.2 Backend

```
apps/backend/src/search/
├── meilisearch.service.ts                ← wrapper HTTP + facets/sort/highlight
├── meilisearch.controller.ts             ← endpoints REST (+ /unified, /quick)
├── meilisearch.module.ts                 ← module + scheduler
├── meili-reindex.scheduler.ts            ← cron 02:00 nightly reindex
├── rbac-filter.ts                        ← classification ISO 27001 A.5.12
├── rbac-filter.spec.ts                   ← tests RBAC
├── meilisearch.controller.spec.ts        ← tests controller (mocked)
├── search.controller.ts                  ← LEGACY Postgres (fallback toujours là)
└── search.service.ts                     ← LEGACY Postgres
```

> Le service Postgres est **conservé** comme filet de sécurité (fallback si Meili tombe). Aucun appel UI ne passe plus par lui par défaut, mais il reste mounté.

## 3. Endpoints

| Endpoint | Auth | Description | Consommateur |
|---|---|---|---|
| `GET /search/unified?q=…&modules=wiki,documents&page=1&limit=20&categories=…&classifications=…&statuses=…&sort=date:desc` | JWT | **Endpoint canonique post-merge**. Renvoie `hits` + `byIndex` + `facetDistribution` + `processingTimeMs`. RBAC post-query sur classification documentaire. | `/search` UI |
| `GET /search/quick?q=…&limit=8` | JWT | Top N cross-modules pour la palette Cmd+K. Format flat (`hits[]`). | `command-palette.tsx` |
| `GET /search/global?q=…&limit=5` | JWT | Format groupé `{ results: { documents, tickets, wiki, news } }`. **Conservé** (ancien consommateur palette + endpoints externes éventuels). | – |
| `GET /search/meili?q=…&type=wiki&limit=20` | JWT | Brut, sans RBAC. **Conservé** pour `/wiki` (autocomplete inline). | `WikiContent.tsx` |
| `POST /search/reindex` | ADMIN | Reindex complet depuis Prisma. | bouton admin |
| `GET /search/stats` | JWT | Stats per-index. | `/admin/system-health` |
| `GET /search/v2/health` | JWT | Healthcheck. **Path historique conservé**. | bannière portail |

> **Endpoint legacy `/search`** : route Nest toujours mounted (Postgres FTS) pour le fallback éventuel, plus rien ne le consomme côté UI. À supprimer dans une vague suivante (B ou C) après période d'observation.

## 4. Facettes Meilisearch

### 4.1 Champs facetable

```ts
const FILTERABLE_ATTRIBUTES = [
  "category",
  "status",
  "classification",
  "authorId",
  "type",
  "tags",
  "priority",
];
```

(Configuré dans `meilisearch.service.ts::ensureIndex`.)

### 4.2 Distribution exposée

À chaque appel `GET /search/unified`, le service demande à Meili :
```
facets: ["category", "classification", "status", "type"]
```
et agrège la distribution **inter-index** dans `facetDistribution` (ex. `{ category: { ISO: 12, SECURITY: 8 }, classification: { PUBLIC: 18, INTERNE: 4 } }`).

La sidebar `<FacetSidebar>` rend ces compteurs en checkboxes : cocher une facette ajoute à `categories[]` / `classifications[]` / `statuses[]` et relance la recherche. Les compteurs sont **live** (Meili recalcule après chaque filtrage).

### 4.3 RBAC ISO 27001 A.5.12

Les facettes `classification` montrent **toutes** les valeurs distribuées (PUBLIC/INTERNE/CONFIDENTIEL/SECRET) sauf si filtrées par RBAC en amont — on assume la fuite de métadonnées (un user voit qu'un SECRET existe sans y accéder), conforme à la dette technique acceptée Phase 1 (cf. `MEILISEARCH_CURRENT_STATE.md`).

Le filtrage des **hits** est en revanche strict : `canViewHit(hit, user)` dans `rbac-filter.ts`, exactement comme `/search/global`.

## 5. Reindex flow

### 5.1 Hooks Prisma (incrémental, hot path)

Chaque service métier (`documents`, `tickets`, `wiki`, `news`, `runbooks`) appelle `meilisearch.indexOne(...)` à chaque create/update et `deleteDocument(...)` à chaque suppression. Cela garde l'index frais sans round-trip massif.

### 5.2 Cron nightly (filet de sécurité)

`MeiliReindexScheduler` (`meili-reindex.scheduler.ts`) tourne tous les jours à **02:00 Europe/Paris** :
```ts
@Cron('0 2 * * *', { timeZone: 'Europe/Paris' })
async reindexNightly() {
  await this.meili.reindexAll();
}
```

Rattrape :
- Les hooks ratés (Meili indispo lors de l'écriture).
- Les imports massifs hors-API (LDAP sync, scripts admin).
- Les drifts de schema (champ ajouté, classification corrigée rétroactivement).

Kill-switch : `MEILISEARCH_ENABLED=false`.

### 5.3 Reindex manuel

```bash
curl -X POST -H "Authorization: Bearer <JWT_ADMIN>" \
  http://localhost:3000/api/v1/search/reindex
```

Retourne le décompte par index :
```json
{
  "success": true,
  "indexed": { "documents": 16, "tickets": 368, "wiki": 65, "news": 8, "runbooks": 2 }
}
```

## 6. Performance

### 6.1 Latence cible

| Étape | Cible | Mesuré |
|---|---|---|
| Meilisearch (server) | < 50 ms | typique 10-20 ms (16 docs / 368 tickets / 65 wiki / 8 news) |
| RBAC post-query | < 5 ms | dépend du nombre de hits (filter() linéaire) |
| Réseau LAN | < 10 ms | – |
| Render React | < 150 ms | re-render mémoizé sur byIndex change |
| **Total end-to-end** | **< 200 ms** | observable dans l'UI : `X résultats en Y ms (Meili Z ms)` |

L'UI affiche les deux latences pour rendre la perf visible (et la régression détectable).

### 6.2 Pagination

Cap server-side : `limit ≤ 100`. Le frontend demande 20 par page. Pour scroll infini, augmenter `page` côté requête (pas implémenté en v1.1 — le frontend ne renvoie qu'une page).

### 6.3 Highlight

Meilisearch retourne `_formatted.title` et `_formatted.content` avec balises `<mark>...</mark>`. Le composant `<SearchResults>` les rend via `dangerouslySetInnerHTML` après passage par `sanitizeHighlight()` (XSS-safe : seules les `<mark>` sont préservées, tout le reste est échappé).

Fallback : si `_formatted` est absent (cas du fallback Postgres ou query vide), le composant `<Spotlight>` côté client highlight les occurrences case+accent-insensitive.

### 6.4 Cmd+K palette

La palette `command-palette.tsx` consomme `/search/quick` (Meilisearch + RBAC,
sans facets/highlight pour minimiser la latence). Format flat `hits[]` —
un seul tableau au lieu de quatre groupes à concaténer côté client.

L'endpoint `/search/global` reste mounté pour compat avec d'éventuels
consommateurs externes (extensions, mobile à venir...) mais n'est plus
utilisé par l'UI.

## 7. Migration des saved-filters v1 → v2

### 7.1 Schema v1 (legacy)

```ts
{
  id: string;
  name: string;
  query: string;
  type: "all" | "documents" | "wiki" | "news" | "tickets" | "runbooks";
  dateRange: "all" | "week" | "month" | "quarter" | "year";
  classification: "all" | "PUBLIC" | "INTERNE" | "CONFIDENTIEL" | "SECRET";
  sortBy: "relevance" | "newest" | "oldest";
}
```

(Stocké dans `localStorage["omnitech:saved-searches"]` — clé legacy.)

### 7.2 Schema v2

```ts
{
  id: string;
  name: string;
  query: string;
  modules: ModuleKey[];        // [] = tous
  categories: string[];        // facette Meili
  classifications: string[];   // ISO A.5.12
  statuses: string[];          // facette Meili
  sort: "relevance" | "newest" | "oldest";
  createdAt: string;           // ISO 8601
}
```

(Stocké dans `localStorage["omnitech:saved-searches:v2"]`.)

### 7.3 Migration automatique

Au montage de `<SavedSearchesDropdown>`, si la clé v2 est vide mais la v1 existe :
1. Parse JSON legacy.
2. Mapping `type` → `modules` (table `TYPE_TO_MODULES` dans `migrate.ts`).
3. `classification` → `classifications[]` (uppercase).
4. `dateRange` → **abandonné** (préférer la SmartFilterBar NL).
5. `sortBy` → `sort` (validation ; fallback `relevance`).
6. Persist en v2, supprime la v1.

Couvert par 11 tests Vitest dans `migrate.test.ts`.

## 8. Tests

| Test | Type | Couvre |
|---|---|---|
| `apps/backend/src/search/rbac-filter.spec.ts` | Jest | `canViewHit` / `allowedClassifications` (existant) |
| `apps/backend/src/search/meilisearch.controller.spec.ts` | Jest (nouveau) | `/search/unified`, `/search/quick`, `/search/global`, `/search/reindex` ; RBAC ; cap limit ; owner bypass |
| `apps/frontend/src/app/(app)/search/_components/__tests__/migrate.test.ts` | Vitest (nouveau) | Migration v1 → v2 (11 cas) |
| `apps/frontend/src/app/(app)/search/_components/__tests__/sanitize-highlight.test.ts` | Vitest (nouveau) | XSS-safe `<mark>` (8 cas) |

Lancer :
```bash
pnpm --filter backend test
pnpm --filter frontend test
```

## 9. Suppression `/search/v2`

| Action | Fichier |
|---|---|
| Page supprimée | `apps/frontend/src/app/(app)/search/v2/page.tsx` |
| Redirect 301 | `apps/frontend/next.config.js` (`/search/v2` → `/search`) |
| Lien chatbot retiré | `apps/frontend/src/components/ai/ai-chatbot.tsx` |
| Endpoint backend `/search/v2` | n'existait pas — rien à supprimer côté API |
| Path `/search/v2/health` | **conservé** (utilisé par `/admin/system-health`) |

## 10. Points d'attention review

1. **Service `SearchService` Postgres conservé** : non consommé par l'UI, mais module monté (filet de sécurité). À retirer dans une vague suivante après 30 j sans incident Meili.
2. **Palette Cmd+K migrée vers `/search/quick`** dans la même vague — bénéfice latence (skip facets+highlight). `ContentHit` étendu pour le type `runbook`.
3. **Highlight HTML via `dangerouslySetInnerHTML`** : sanitize basique, pas de DOMPurify (volontairement, pour éviter une dep cliente). Le test `sanitize-highlight.test.ts` couvre les payloads XSS connus.
4. **Date filter** v1 (`dateRange = week|month|quarter|year`) abandonné dans la v2. Remplaçable via SmartFilterBar (« cette semaine », « ce mois »...) qui filtre côté client. **Migration des saved-filters jette ce champ**.
5. **Facettes v2 = tous les champs filterable** (catégorie, classification, statut). On ne montre PAS `tags` ni `priority` dans la sidebar (trop de cardinality) — ils restent filterable côté backend si besoin futur.
6. **Cron 02:00** s'exécute en plus du RAG cron 01:00. Vérifier la charge Meilisearch nocturne en prod (env. 460 docs total au moment de la fusion — négligeable).
7. **Le mode IA (smart search via `/ai/search`)** est inchangé et toujours conditionné par `features.ai`.

---

> Pour étendre la recherche à un nouveau type (ex. ajouter `incidents` aux index Meili) :
> 1. Ajouter le type dans `MeiliDocument["type"]`.
> 2. Ajouter `INDEX_INCIDENTS` dans `ALL_INDEXES`.
> 3. Implémenter `indexIncidents()` + brancher dans `reindexAll()`.
> 4. Ajouter le hook incrémental dans `IncidentsService`.
> 5. Ajouter le mapping `incidents` dans `INDEX_TO_MODULE` (frontend) + `MODULE_LABELS`.
