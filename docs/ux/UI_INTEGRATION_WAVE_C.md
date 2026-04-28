# UI integration — Wave C → Wave G câblage

Ce document récapitule comment les composants frontend livrés par la Wave C
(prêts mais non câblés) ont été intégrés dans les pages caller pendant la
Wave G. Tous les changements sont des intégrations purement UI : aucune
logique métier n'a été modifiée.

## Connaissance / Wiki

Fichier : `apps/frontend/src/app/(app)/wiki/WikiContent.tsx`

| Composant Wave C | Statut | Branchement |
| ---------------- | ------ | ----------- |
| `<WikiBacklinks />` | déjà câblé (Wave C) | rendu sous l'article (`viewingPage.id`) avec `onNavigate` qui appelle `handleViewPage(slug)` |
| `<WikiOutline />` + `extractOutline()` | déjà câblé (Wave C) | colonne droite sticky desktop ≥ 1280px, drawer mobile via le bouton flottant |
| `<WikiTagInput />` | **nouveau (G)** | injecté dans la modale d'édition (`isEdit && WikiTagInput`). `editingTags` state hydraté via `GET /wiki/pages/:id/tags` à l'ouverture de l'édition. Le `PATCH /wiki/pages/:id/tags` est déclenché après le `PATCH /wiki/:id` (sauve du contenu) — best-effort, n'invalide pas le save principal en cas d'erreur tags |
| **Tags badges + filter** | **nouveau (G)** | `viewingPageTags` chargé via `GET /wiki/pages/:id/tags` à l'entrée d'une page. Badges cliquables dans l'en-tête article → `setSearch(tag.name)` + `tagFilter`. Bannière "Filtré par tag" en tête de liste avec bouton Retirer |

### Endpoints utilisés

- `GET /wiki/pages/:id/tags` — chargement des tags d'une page
- `PATCH /wiki/pages/:id/tags { tagIds: string[] }` — sauvegarde
- `GET /wiki/tags` — liste globale (consommée par `<WikiTagInput />`)
- `POST /wiki/tags` — création (admin uniquement)

### Comportement UX

- Tag badges : couleur dérivée de `colorHex` (transparent + bordure douce).
- Création de tag à la volée : possible en édition uniquement, et seulement
  si `isAdmin === true` (le composant gère l'erreur 403 / 409 via `sonner`).
- Au save : si le tag PATCH échoue, le contenu reste sauvegardé et un toast
  d'erreur "Tags non sauvegardes" est affiché.

## Éditeur WYSIWYG (News)

Fichiers :
- `apps/frontend/src/app/(app)/news/compose/page.tsx`
- `apps/frontend/src/app/(app)/news/[slug]/edit/page.tsx`

| Hook / composant Wave C | Branchement |
| ----------------------- | ----------- |
| `useEditorPreviewMode()` | persiste le mode `edit-only` / `split-h` / `split-v` / `preview-only` dans `localStorage` (clé `editor.previewMode`). Le bouton "Aperçu live" du compose est mappé vers `setPreviewMode('split-h' | 'edit-only')`. La page edit utilise le `<EditorPreview />` toolbar pour exposer les 4 modes |
| `<EditorPreview />` | branchée dans `news/[slug]/edit/page.tsx` autour du contentEditable + toolbar. La page compose conserve son ancien panneau d'aperçu (already shipped), mais le mode est désormais persisté |
| `useEditorAutosave()` | branché sur les deux pages : `entityKey = 'news:new'` (compose) ou `'news:<id>'` (edit). Flush 5s par défaut, draft restauré via toast `sonner` au mount avec actions Restaurer / Ignorer |
| `Cmd/Ctrl+S` | listener global ajouté dans les deux pages. `compose` : flush draft + toast "Brouillon enregistré localement" (pas de submit auto, l'auteur publie manuellement). `edit` : flush draft + `handleSubmit(onSubmit)()` |
| `Cmd+B / Cmd+I / Cmd+K / Cmd+Shift+K` | hérités de `<RichTextEditor />` Wave C — non utilisé sur les pages news qui ont leur propre toolbar contentEditable. Conservé sur le wiki (qui utilise déjà RichTextEditor) |

### Wiki edit

Pas de page séparée `/wiki/[slug]/edit` (la wiki a une UI inline via la
modale `showEdit` dans `WikiContent.tsx`). Le sous-objectif "Câbler dans
apps/frontend/src/app/(app)/wiki/[slug]/edit/page.tsx" est marqué comme
**skippé** : page inexistante. Les hooks `useEditorAutosave` et
`useEditorPreviewMode` n'ont donc pas été branchés côté wiki — l'édition
inline reste fonctionnelle telle quelle et tient sur quelques minutes.

## Tickets

Fichier : `apps/frontend/src/app/(app)/tickets/page.tsx`

| Composant Wave C | Branchement |
| ---------------- | ----------- |
| `<TicketKanban />` | remplace l'ancienne implémentation locale `KanbanBoard` (HTML5 DnD). Utilise dnd-kit, colonnes OPEN/IN_PROGRESS/WAITING/RESOLVED. Le mapping TicketItem → KanbanTicket convertit `assignee {firstName, lastName}` → `assigneeName: string`. Le `onStatusChange` réutilise `PATCH /tickets/:id` puis `fetchTickets()` |
| `useTicketsViewMode()` | remplace `useState<'table'|'kanban'>('table')`. Persiste `tickets.viewMode` en localStorage avec sync cross-tabs (storage event). Toggle UI inchangé |
| `<TicketFilterChips />` + `applyTicketChipFilters()` | placée sous la `<SmartFilterBar />`. 5 chips : Mes / Mentions / SLA dépassé / Aujourd'hui / Cette semaine. Filtrage **client-side** appliqué à `sortedFilteredTickets` → `chipFilteredTickets` (combiné AND). Les chips affectent à la fois la table et le kanban |
| `<TicketQuickActions />` | injecté dans la cellule actions du tableau (déjà en `opacity-0 group-hover:opacity-100`). Actions : M'assigner, Marquer résolu, Archiver (CLOSED), Copier le lien. Chaque callback PATCH le ticket et `fetchTickets()` pour rafraîchir |
| `useTicketShortcuts()` | branché au niveau de la page tickets : `c` = ouvrir création, `j/k` = focus next/prev, `Enter` = ouvrir, `e` = m'assigner, `r` = résoudre, `?` = aide. Désactivé si `showCreate` est ouvert. Le focus est tracké en interne via `focusedIdx` |
| `<TicketShortcutsModal />` | monté en bas de la page, ouverte via `?` ou par le bouton **HelpCircle** ajouté à côté d'`<ExportButton />` dans la page header |

### Notes d'intégration

- `applyTicketChipFilters` attend un `TicketLite` avec `assigneeId: string | null` et `mentionedUserIds: string[]`. Le serveur ne fournit pas ces champs sur la liste tickets : on injecte une approximation à partir du nom de l'assignee (`firstName + lastName === user`). Pour `mentions`, on passe un tableau vide tant que le backend n'expose pas la liste des mentioned user IDs (chip "Mes mentions" filtre alors zéro résultat — comportement acceptable, pas de crash).
- Le `TicketQuickActions` est désactivé pour les tickets `CLOSED` (pas de quick actions sur un ticket archivé).
- Le bouton de copie référence existant n'a pas été retiré — il copie juste la **référence**, pas le lien complet (le menu Wave C couvre le lien).

## i18n

Toutes les clés `wiki.*`, `editor.*` et `ticketsView.*` ajoutées par la
Wave C dans `apps/frontend/messages/fr.json` (et `en.json`) sont réutilisées.
Aucune nouvelle clé créée — la Wave G n'introduit que des appels :

- `t('wiki.tags.label')`, `t('wiki.tags.filterByTag')`
- `t('editor.autosave.draftFound')`, `t('editor.autosave.restore')`, `t('editor.autosave.discard')`

Les composants Wave C eux-mêmes contiennent déjà des labels en dur en
français (ex: "Aucun ticket" dans `<TicketKanban />`) — non touchés par
la Wave G, à harmoniser dans une passe i18n ultérieure.

## Charte SEAL

Préservée : aucune nouvelle classe CSS introduite, les composants Wave C
respectent déjà la palette `seal-*` et la classe `seal-bg-blue` (chips
actives).

## Tests

Tests unitaires Wave C (`ticket-filter-chips.test.ts`, `use-editor-autosave.test.ts`, `use-recent-pages.test.ts`) restent verts puisqu'aucune
modification des composants/hooks Wave C eux-mêmes — uniquement des appels
côté caller. Tests d'intégration page (table tickets, news compose) à
revérifier en CI.
