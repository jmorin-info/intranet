# Espaces & modules — décisions d'architecture

**Dernière mise à jour** : 2026-04-21

## 1. Catalogue `AVAILABLE_MODULES` — règles de placement

Source : `apps/backend/src/spaces/spaces.service.ts`

Chaque module déclaré devient :
- **Visible** en tant qu'item de la sidebar (filtrage `moduleOf(href) === module.code`).
- **Configurable** dans `/admin/spaces` (activation/désactivation par scope GLOBAL / ROLE / DEPARTMENT / USER).
- **Retourné** par `GET /spaces/my-modules` selon les règles de résolution.

Les modules sont regroupés par `section` : `monEspace`, `work`, `security`, `admin`, `transverse`.

## 2. Cas particulier : `ticket-spaces`

### Contexte

La page `/admin/ticket-spaces` permet aux admins de gérer les **workspaces de ticketing** (espaces logiques regroupant des tickets par équipe / département / projet).

Question posée (audit UX-3 post-merge) : faut-il exposer `ticket-spaces` comme module propre dans `AVAILABLE_MODULES`, pour permettre à un admin de **désactiver la feature** pour un département ou globalement ?

### Décision : **non — ticket-spaces reste sous le module `admin`**

Raisons :

1. **Scope admin-only** : `/admin/ticket-spaces` est une page ADMIN+. Les autres rôles n'y accèdent jamais.
   Désactiver cette feature par département n'a pas de sens fonctionnel — les admins la gèrent de façon centralisée.

2. **Impact architectural si désactivé** : si ticket-spaces était disabled globalement, le backend devrait fallback sur un pool "sans workspace". Les URL existantes (`/tickets?spaceSlug=...`) deviendraient partiellement cassées. Ce n'est pas une simple masquerade UI.

3. **Cohérence avec les autres sous-pages admin** : aucune autre sous-route `/admin/*` n'a son flag propre (ex : `audit`, `backups`, `rssi-dashboard`). Le module `admin` couvre l'ensemble, ce qui garde le catalogue lisible (37 items vs potentiellement 60+).

4. **Si besoin futur** : on pourrait introduire une `AppConfig` clé `ticket_spaces.enabled` (séparée du système `AVAILABLE_MODULES`) qui couperait la feature au runtime. Préférable à polluer `AVAILABLE_MODULES` avec des sous-modules.

### Si l'utilisateur veut réellement désactiver ticket-spaces

Deux options, dans l'ordre de priorité recommandée :

1. **Soft-disable** : laisser les admins ne pas créer d'espaces (la table reste vide → le système fonctionne en pool unique par défaut).
2. **Hard-disable** (à implémenter plus tard si demandé) : ajouter une `AppConfig` `feature.ticketSpaces.enabled` vérifiée dans `TicketsService.findAllSpaces()` qui retourne `[]` de manière inconditionnelle, et masquer la page `/admin/ticket-spaces` via `role-guard` feature flag.

## 3. Modules actuellement dans le catalogue

Voir `apps/backend/src/spaces/spaces.service.ts` pour la liste canonique (37 entrées au 2026-04-21).

### Règles pour ajouter un nouveau module

1. Le module doit correspondre à un **premier segment d'URL** utilisé par le frontend (ex : `media` pour `/media/*`, `workflows` pour `/workflows/*` et `/admin/workflows`).
2. Il doit avoir une **icône** identifiable dans `route-registry.ts`.
3. Il doit appartenir à **une seule section** (`monEspace`, `work`, `security`, `admin`, `transverse`).
4. Les modules `alwaysOn` (dashboard, notifications, profile) ne sont **pas** désactivables — réserver cet attribut aux vrais essentiels.

## 4. Référence

- `apps/backend/src/spaces/spaces.service.ts` — catalogue + service de résolution
- `apps/frontend/src/app/(app)/admin/spaces/page.tsx` — UI admin de configuration
- `apps/frontend/src/components/layout/sidebar.tsx` — consommateur de `/spaces/my-modules`
