# État actuel Meilisearch — OMNITECH (2026-04-21)

## Indexes actifs

| Index | Documents | Champs principaux |
|---|---|---|
| `documents` | 16 | `id`, `title`, `content`, `category`, `classification`, `status`, `reference`, `authorId`, `tags`, `date` |
| `news` | 8 | `id`, `title`, `content`, `category`, `authorId`, `type`, `url`, `tags`, `date` |
| `tickets` | 368 | `id`, `title`, `content`, `category`, `reference`, `status`, `type`, `authorId`, `tags`, `date` |
| `wiki` | 65 | `id`, `title`, `content`, `category`, `type`, `url`, `authorId`, `tags`, `date` |

## Configuration commune (tous indexes)

- `searchableAttributes` : `title`, `content`, `category`, `reference`
- `filterableAttributes` : `category`, `status`, `classification`, `authorId`, `type`
- `primaryKey` : `id`

## Entités *non* indexées (gap identifié)

| Entité Prisma | Raison actuelle | Priorité indexation |
|---|---|---|
| `Runbook` | Pas d'indexer dédié | Moyenne — recherche utile pour les équipes Ops |
| `RunbookExecution` | Transactionnel (historique) | Basse — pas de valeur search |
| `FAQ` / `Procedures` | Couverts par `documents` (catégorie PROCEDURE) et `wiki` | N/A |

## Endpoints backend

| Endpoint | Rôle | Usage |
|---|---|---|
| `GET /search/meili?q=...&type=...&limit=...` | JWT | Recherche brute multi-index (pas de RBAC post-query) |
| `GET /search/global?q=...&limit=...` | JWT | **Nouveau (UX-3.4)** — recherche groupée + filtrage RBAC post-query (classification documentaire) |
| `POST /search/reindex` | ADMIN | Réindexation complète depuis Prisma |
| `GET /search/stats` | JWT | Stats Meilisearch (per-index) |
| `GET /search/v2/health` | JWT | Healthcheck live |

## RBAC de recherche — approche retenue (Option A du brief UX-3)

### Règles de classification documentaire (ISO 27001 A.5.12)

| Classification | Rôle minimum (level) |
|---|---|
| `PUBLIC` | tous (y compris PRESTATAIRE) |
| `INTERNE` | PRESTATAIRE+ (≥ 5) |
| `CONFIDENTIEL` | REVIEWER+ (≥ 40) |
| `SECRET` | ADMIN+ (≥ 80) ou owner (authorId == user.id) |

Le filtrage est **post-query** dans `apps/backend/src/search/rbac-filter.ts` :
```ts
canViewHit(hit, user)
```

### Limites et dette technique assumée

- **Fuite de métadonnées possible** : un user peut voir qu'une classification existe (via `estimatedTotalHits`) sans accéder au contenu. Acceptable pour Phase 1.
- **Perf en grand corpus** : post-filter implique de récupérer tous les hits pertinents pour les refiltrer. Pour scale au-delà de 10 000 documents CONFIDENTIEL/SECRET, envisager Option B (index par classification + query conditionnée au rôle).
- **Autres types** (`tickets`, `wiki`, `news`) : non filtrés au-delà du JWT. La visibilité est censée être gérée par les endpoints métier quand l'utilisateur clique — acceptable tant qu'aucune des pages de détail n'autorise l'accès public.

## Roadmap

### Court terme (restes de UX-3)

- [ ] Indexer `Runbook` (priorité moyenne)
- [ ] Ajouter un indicateur "recherche Meilisearch indispo" dans la palette si `/search/global` échoue

### Moyen terme

- [ ] Option B : index par classification pour documents (`documents_public`, `documents_interne`, ...) et routage conditionnel selon rôle
- [ ] Réindex temps réel sur événements Prisma (actuellement : reindex complet via `/search/reindex`)
- [ ] Highlight client-side des termes matchés

### Long terme

- [ ] Abstraction multi-tenant pour future rupture entre sociétés (OMNITECH + filiales)
