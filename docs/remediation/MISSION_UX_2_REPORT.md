# Mission UX-2 · Cohérence visuelle & états — Rapport d'exécution

**Date** : 2026-04-21
**Branche** : `feat/ux-visual-coherence` (depuis `feat/ux-navigation-foundations`)
**Durée totale** : ~0.5 journée Claude Code

## Résumé exécutif

Mission **réalisée intégralement**. Étapes 2.1 → 2.6 livrées, 5 commits atomiques,
typecheck passant, build OK, 50 tests qui passent (10 nouveaux + 40 existants),
service actif HTTP 200.

## Livraison par étape

| Étape | Statut | Commit |
|---|---|---|
| 2.1 Audit empty states | ✅ | `716b83d` docs(ux): audit empty states across intranet |
| 2.2 Migration empty states (11 pages) | ✅ | `78bd6c7` refactor(ui): unify empty states across key pages |
| 2.3 Audit dark mode | ✅ | `7d56972` docs(ux): dark mode audit v1 — findings mineurs identifiés |
| 2.4 Corrections dark mode (10 icônes) | ✅ | `17c4951` fix(theme): dark mode contrast for utility icons |
| 2.5 Widget "Récemment visités" | ✅ | `92583ea` feat(dashboard): enrich "recently visited" widget |
| 2.6 Tests & validation | ✅ | (inclus dans 2.5) |

## Livrables

### Documents produits

| Fichier | Rôle |
|---|---|
| `docs/ux/EMPTY_STATES_AUDIT.md` | Inventaire 42 pages conformes + 13 priorité haute à migrer |
| `docs/ux/DARK_MODE_AUDIT_v1.md` | Audit statique : dark mode conforme à ~95%, findings mineurs listés |

### Pages empty states migrés (11)

- `app/(app)/dashboard/page.tsx` — tickets + documents contractuels
- `app/(app)/changelog/page.tsx`
- `app/(app)/timeline/page.tsx`
- `app/(app)/directory/organigramme/page.tsx`
- `app/(app)/directory/contacts/page.tsx`
- `app/(app)/tips/page.tsx` — avec CTA "Réinitialiser filtres"
- `app/(app)/helpdesk/SelfServicePortal.tsx` — FAQ search vide
- `app/(app)/admin/backups/page.tsx`
- `app/(app)/admin/ad-audit/page.tsx`
- `app/(app)/extranet/page.tsx` — avec variante `search` / `users`
- `app/(app)/search/v2/page.tsx`

### Icônes dark mode corrigées (9 fichiers, 10 sites)

Ajout du variant `dark:text-slate-500` (ou `dark:text-slate-400`) sur
les icônes utilitaires qui n'avaient que `text-gray-400`/`text-gray-500` :

- `wiki/WikiContent.tsx` — X icon color picker transparent
- `veille/page.tsx` — Shield default severity
- `admin/compliance/CompliancePlanning.tsx` — Repeat icon
- `extranet/page.tsx` — Users icon (expirés)
- `tickets/page.tsx` — Clock LOW priority
- `tickets/[id]/page.tsx` — Timer WAITING + CheckCircle2 CLOSED
- `documents/new/page.tsx` — File generic icon
- `documents/[id]/page.tsx` — ArrowLeftRight archive
- `files/page.tsx` — FileText txt/md

### Widget "Récemment visités" enrichi

- **Hook** `hooks/use-recent-pages.ts` :
  - `isTrackablePath()` extrait en fonction pure (testable hors React)
  - 10 entrées max (brief respecté)
  - Préfixes bloqués étendus : `/auth/*`, `/error`, `/404`, `/500`,
    `/forgot-password`, `/en-construction`
  - Dashboard + racine exclus explicitement
  - Déduplication + remontée en tête à chaque revisite
  - StorageEvent diffusé sur write pour synchro cross-tab
- **Widget** `components/widgets/recent-pages-widget.tsx` :
  - Icônes contextuelles par type de page (14 règles : documents,
    tickets, wiki, médiathèque, admin, notifications, etc.)
  - Formattage temporel : "à l'instant", "il y a X min/h", "hier",
    "il y a X j", "il y a X sem."
  - Affichage limité à 5 items (même si le store en garde 10)
  - Focus-visible ring orange SEAL pour navigation clavier
  - Bouton "Effacer l'historique" avec tooltip + aria-label
  - Empty state intégré avec message orienté action
- **Intégration** : widget déjà présent dans `dashboard/page.tsx:1066`
  (colonne de gauche du grid 3 colonnes, avec MyNotifications + DocsDueReview)
- **Tracking automatique** : `useTrackPageVisit()` appelé dans
  `auth-provider.tsx:44` — aucune action requise dans les pages.

## Métriques

- **Commits** : 5 sur la branche `feat/ux-visual-coherence`
- **Fichiers créés** : 3 (2 audits docs + 1 fichier tests)
- **Fichiers modifiés** : 22 (pages + hook + widget)
- **Lignes nettes** : +398 / -78 environ
- **Tests** : 50 passent (10 nouveaux sur `isTrackablePath` + 40 existants)
- **TypeScript** : 0 erreur
- **Build** : OK, toutes routes Next générées
- **Service** : `systemctl status omnitech-frontend` → `active (running)`, HTTP 200

## Points à valider humainement

Hard-refresh **Ctrl+Shift+R** nécessaire côté navigateur pour invalider le cache HTML.

### Pages à tester (screenshots recommandés)

1. **Dashboard (light + dark)**
   - Widget "Récemment consulté" visible dans la grille 3 colonnes
   - Après navigation sur 3-4 pages, retour dashboard → widget affiche ces pages
     avec icônes contextuelles (ex: Ticket pour /tickets, BookOpen pour /wiki)
   - Click sur une entrée → navigation fluide
   - Bouton X en haut à droite → historique effacé
2. **Empty states migrés** : vérifier cohérence visuelle sur
   - Dashboard (tickets/docs vides)
   - Changelog
   - Timeline
   - Directory organigramme + contacts (avec filtre inutile)
   - Tips (recherche sans résultat + bouton reset)
   - Extranet (sans accès / avec filtre search)
3. **Dark mode**
   - Toggle dark mode depuis le header
   - Vérifier que les icônes utilitaires corrigées restent visibles :
     - `/tickets` formulaire priorité LOW → clock icon visible
     - `/documents/new` drop zone → File icon visible
     - `/wiki` édition → color picker transparent X visible
     - `/extranet` → Users icon sur accès révoqué visible

## Items hors scope (reportés)

- ❌ Bulk actions (UX-3)
- ❌ Exports CSV (UX-3)
- ❌ Dashboard drag-drop widgets
- ❌ Refonte complète du dashboard
- ❌ Migration des empty states "priorité moyenne" (8 pages en onglets) —
  listés dans `EMPTY_STATES_AUDIT.md`, à faire progressivement

## Validation technique finale

```bash
# Typecheck
cd apps/frontend && pnpm tsc --noEmit
# → 0 erreur

# Tests
pnpm test -- --run
# → 4 files, 50 tests, 0 échec

# Build
rm -rf .next && pnpm build
# → Compiled successfully

# Restart
systemctl restart omnitech-frontend
# → active (running), HTTP 200
```

## Checkpoint humain

✅ **Mission UX-2 terminée.** Prêt pour review humaine et validation sur navigateur.

Après validation, merger `feat/ux-visual-coherence` → `feat/p1-9-prelaunch`
(ou d'abord `feat/ux-navigation-foundations` → `feat/p1-9-prelaunch` puis cette
branche par-dessus).

Commandes de merge proposées :

```bash
# Option 1 : merger UX-1 puis UX-2 en cascade
git checkout feat/p1-9-prelaunch
git merge --no-ff feat/ux-navigation-foundations
git merge --no-ff feat/ux-visual-coherence

# Option 2 : merger directement UX-2 (qui contient déjà UX-1)
git checkout feat/p1-9-prelaunch
git merge --no-ff feat/ux-visual-coherence
```
