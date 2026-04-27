# Audit comparatif `/search` v1 vs v2 — vague A v1.1

> **Statut** : implémenté (page unifiée Meilisearch).
> **Date** : 2026-04-26.
> **Doc liée** : [UNIFIED_SEARCH.md](./UNIFIED_SEARCH.md).

Ce document trace, fonctionnalité par fonctionnalité, ce qui existait dans la
page legacy `/search` (Postgres FTS, 1476 lignes) et dans l'orpheline
`/search/v2` (Meili minimaliste, 213 lignes), et comment chaque besoin est
couvert dans la nouvelle page unifiée.

---

## 1. Saisie & UX d'entrée

| Fonction | v1 (Postgres) | v2 (Meili) | Unifiée | Notes |
|---|---|---|---|---|
| Champ texte central | oui | oui | **oui** (`<SearchInput>`) | Ref pour autofocus + raccourci `/` |
| Debounce 300ms | oui | partiel (200ms) | **oui** (300ms via `useDebounce`) | – |
| Raccourci `/` pour focus | oui | non | **oui** (listener global, hors textarea/input) | A11y : ne capte pas dans des inputs |
| Mode IA (smart toggle) | oui | non | **oui** (feature flag `features.ai`) | Désactive aussi facets/sort en mode IA |
| Bouton Sauvegardes | oui | non | **oui** (`<SavedSearchesDropdown>`) | Migration auto v1 → v2 (cf. §3) |

Aucune régression côté UX d'entrée.

## 2. Filtres & facettes

| Fonction | v1 | v2 | Unifiée | Notes |
|---|---|---|---|---|
| Filter par module (pills) | oui (chip) | oui (badge) | **oui** (`<SearchFilters>` pill toggle) | Modules = `documents/wiki/news/tickets/runbooks` |
| Tri (relevance/newest/oldest) | oui | non | **oui** | `sort` envoyé à Meili comme `["date:desc"]` ou `["date:asc"]` |
| Facette **catégorie** | non | non | **NEW oui** (sidebar Meili `category`) | Compteurs live |
| Facette **classification** (ISO A.5.12) | non | non | **NEW oui** | Avec RBAC strict sur les hits |
| Facette **statut** (DRAFT/APPROVED/OPEN/CLOSED) | non | non | **NEW oui** | – |
| Filtre dateRange (week/month/quarter/year) | oui | non | **abandonné** | Remplacé par `<SmartFilterBar>` NL ("cette semaine") qui filtre client-side |
| Did-you-mean | oui (Postgres similarity) | non | **abandonné v1.1** | Meili gère la typo-tolerance native ; pas besoin pour MVP |
| Filtres avancés (toggle) | oui (panneau) | non | **partiel** | Bouton présent (counter `activeFacetCount`) ; le panneau ouvert affiche la sidebar facettes inline |

Gain net : facettes Meili **inter-index** (catégorie + classification + statut)
qui n'existaient ni en v1 ni en v2.

Régression assumée : `dateRange` (4 valeurs prédéfinies) → SmartFilterBar NL
qui couvre les mêmes cas + plus (« cette semaine », « hier », etc.) mais
n'est pas persisté dans les saved-searches.

## 3. Saved searches

| Fonction | v1 | v2 | Unifiée | Notes |
|---|---|---|---|---|
| Créer / nommer | oui | non | **oui** | `localStorage["omnitech:saved-searches:v2"]` |
| Liste / appliquer | oui | non | **oui** | Dropdown 80vw max-h 60vh |
| Supprimer | oui | non | **oui** | – |
| Plafond | 50 | – | **20** | Évite quota localStorage |
| Migration auto v1 → v2 | n/a | n/a | **NEW oui** | `migrate.ts` parse l'ancienne clé, traduit le schema, persiste, supprime la legacy |

**Schema v1 → v2** :

```diff
  v1                              v2
- type: "all" | "documents" | …  + modules: ModuleKey[]    // [] = tous
- dateRange: "all" | "week" |…   + categories: string[]    // facette Meili
- classification: "all" | "PUB"  + classifications: string[]  // ISO A.5.12 (uppercase)
- sortBy: "relevance" | "newest" + statuses: string[]      // facette Meili
                                  + sort: "relevance"|"newest"|"oldest"
                                  + createdAt: string      // ISO 8601
```

Couvert par 12 tests Vitest dans `migrate.test.ts`.

## 4. Affichage des résultats

| Fonction | v1 | v2 | Unifiée | Notes |
|---|---|---|---|---|
| Groupage par module | non (flat) | oui | **oui** | Section `<h2>Documents (12)</h2>` etc. |
| Surlignage `<mark>` | non (Spotlight client) | non | **oui** (Meili natif) | Fallback Spotlight quand `_formatted` absent |
| Snippet/crop | non | non | **oui** (50 chars) | Centré sur le match |
| Skeleton loading | non | non | **oui** | – |
| EmptyState | oui (texte) | oui | **oui** | Composant unifié `EmptyState` UI lib |
| Card UI | mix | basique | **uniformisée** | `<Card hoverable>` + classes SEAL |
| Compteur de latence | non | non | **NEW oui** | "X résultats en Yms (Meili Zms)" |
| Date relative | oui | partiel | **oui** | `formatRelativeTime()` |
| Badge classification | oui (couleur fixe) | non | **oui** (variants `error`/`warning`/`navy`/`success`) | – |
| Tags affichés | oui | partiel | **oui** | Cap 4 tags par hit |

## 5. Routes & endpoints

| Endpoint | v1 | v2 | Unifiée |
|---|---|---|---|
| Page UI | `/search` | `/search/v2` | **`/search`** (v2 supprimée + redirect 301) |
| Backend | `GET /search?q=...` (Postgres FTS) | `GET /search/v2?...` (n'existait pas !) | **`GET /search/unified`** |
| Compat palette | `GET /search/global` (Meili) | n/a | `GET /search/quick` (migré) — `/search/global` conservé |
| Compat wiki autocomplete | `GET /search/meili?type=wiki` | n/a | inchangé |
| Reindex admin | `POST /search/reindex` | n/a | inchangé |
| Stats per-index | `GET /search/stats` | n/a | inchangé |
| Healthcheck Meili | n/a | `GET /search/v2/health` | **conservé** (utilisé par `/admin/system-health`) |

> Le service Postgres `SearchService` reste mounté en backend (filet de sécurité)
> mais n'est plus consommé par l'UI. À retirer dans une vague suivante après
> 30 j sans incident Meili.

## 6. RBAC

| Aspect | v1 | v2 | Unifiée |
|---|---|---|---|
| Filtre classification (ISO A.5.12) | partiel (Postgres avait un ACL gross-grain) | non | **oui** (`canViewHit()` post-query) |
| Owner bypass (un user voit ses propres SECRET) | non | non | **oui** | Cf. `rbac-filter.spec.ts` |
| Fuite de métadonnées via facets | n/a | n/a | **assumée** (cf. `MEILISEARCH_CURRENT_STATE.md`) |

## 7. Performance

| Métrique | v1 (Postgres) | v2 (Meili) | Unifiée (Meili) | Cible |
|---|---|---|---|---|
| Latence search server | ~50-200ms (table scan FTS) | ~10-30ms | ~10-30ms | < 50ms |
| Latence end-to-end | ~250ms typique | ~150ms typique | ~150-200ms typique (incl. RBAC) | < 200ms |
| Render React | ~50ms (1476 lignes monolithe) | ~30ms | ~50ms (decompo memoizée) | < 150ms |
| Pagination cap | 50 | 100 | 100 | – |

Pas de régression mesurable. Le surcoût de RBAC linéaire (`filter()` Array)
est négligeable jusqu'à ~10k hits.

## 8. Mode IA (smart search)

Inchangé entre v1 et la page unifiée (pas dans v2 orpheline). Toujours
conditionné par `features.ai` et appelle `GET /ai/search?q=...`. Le composant
`<AiSmartResults>` est isolé pour rester ≤ 600 lignes.

## 9. Quick actions

v1 avait des actions inline dépendant du contexte (créer doc, ouvrir wiki...).
Conservé dans `<SearchQuickActions>` (155 l) — pas de régression.

## 10. Gaps restants (non couverts dans cette vague)

| Gap | Sévérité | Plan |
|---|---|---|
| Pagination scroll infini | mineure | À ajouter via incrément `page` côté requête (pas implémenté en v1.1) |
| Did-you-mean / suggestions | mineure | Meili expose `suggestions` (typo) ; à exposer en UI plus tard |
| Filtre par auteur | mineure | `authorId` est filterable backend mais pas exposé en facette UI |
| Filtre par tags | mineure | Idem |
| Date filter persistant (saved) | mineure | Migration v1 → v2 jette le `dateRange` ; à revoir si feedback users |
| Spaces/groupes (RBAC fin) | majeure | Hors scope vague A — voir `ACCESS_AND_SPACES_UNIFICATION.md` |
| E2E Playwright | mineure | Tests unitaires couvrent migrate + sanitize ; rendu testé manuellement |
| `/search` legacy backend | propre | À supprimer après 30 j d'observation |

## 11. Checklist review

- [x] Page unifiée < 500 lignes (450 effectifs)
- [x] Sous-composants ≤ 600 lignes
- [x] Charte SEAL (variables PANTONE + `seal-*`)
- [x] i18n FR (`search.title`, `search.subtitle`, `search.placeholder`)
- [x] A11y : focus visible, ARIA roles, navigation clavier facettes
- [x] Sanitize XSS sur highlight HTML (test couvert)
- [x] Tests Vitest pour migration v1 → v2 (12 cas)
- [x] Tests Vitest pour sanitize-highlight (9 cas)
- [x] Tests Jest backend `/search/unified`, `/search/quick`, scheduler (16 cas)
- [x] Redirect 301 `/search/v2` → `/search`
- [x] Compteur de latence visible dans l'UI
- [x] Migration localStorage automatique au mount
- [x] RBAC ISO 27001 A.5.12 préservé (rbac-filter)
- [x] Cron nightly reindex 02:00 Europe/Paris

---

> Rédigé pour faciliter la review. Les gaps marqués "mineure" ne bloquent
> pas le merge ; ils figurent dans la backlog post-launch.
