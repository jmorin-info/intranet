# Audit des empty states — Intranet OMNITECH

**Date** : 2026-04-21 (Mission UX-2, Étape 2.1)
**Composant canonique** : `packages/ui/src/empty-state.tsx`

## Composant unifié — rappel API

```tsx
<EmptyState
  type="documents | users | news | notifications | search | general | success | tickets"
  title="Titre court en FR"
  description="Description orientée action (optionnel)"
  action={<Button>...</Button>}  // CTA optionnel
/>
```

Le composant gère déjà :
- Icône contextualisée avec fond coloré adouci (ring subtil)
- Couleurs charte SEAL + dark mode
- Animation `fadeIn`
- Responsive (padding adapté)

## 🟢 Pages avec EmptyState cohérent (conformes)

42 fichiers utilisent déjà `<EmptyState>` depuis `@omnitech/ui`. Extrait des pages principales conformes :

| Page | Fichier | Statut |
|---|---|---|
| Tickets (liste) | `app/(app)/tickets/page.tsx:1330` | ✅ |
| Documents (liste) | `app/(app)/documents/page.tsx:1209` | ✅ |
| News (liste) | `app/(app)/news/page.tsx:231` | ✅ |
| Incidents (liste) | `app/(app)/incidents/page.tsx:587` | ✅ |
| Notifications | `app/(app)/notifications/page.tsx:485` | ✅ |
| Search (v1) | `app/(app)/search/page.tsx:753, 776` | ✅ |
| Certificates | `app/(app)/certificates/page.tsx:196` | ✅ |
| Alerts | `app/(app)/alerts/page.tsx:307` | ✅ |
| Veille | `app/(app)/veille/page.tsx:679, 927, 938` | ✅ |
| Testimonials | `app/(app)/testimonials/page.tsx:153` | ✅ |
| Satisfaction | `app/(app)/satisfaction/page.tsx:609` | ✅ |
| Media (albums) | `app/(app)/media/page.tsx:99` | ✅ |
| Media album détail | `app/(app)/media/albums/[slug]/page.tsx:134` | ✅ |
| Admin feedback | `app/(app)/admin/feedback/page.tsx:226, 377` | ✅ |
| Admin workflows | `app/(app)/admin/workflows/page.tsx:158` | ✅ |
| Admin chartes | `app/(app)/admin/chartes/page.tsx:295` | ✅ |
| Admin system-monitoring | `app/(app)/admin/system-monitoring/page.tsx:558, 595` | ✅ |
| Admin ldap-pending | `app/(app)/admin/ldap-pending/page.tsx:247` | ✅ |
| Admin onboarding | `app/(app)/admin/onboarding/page.tsx:254` | ✅ |
| Admin access-reviews | `app/(app)/admin/access-reviews/page.tsx:432, 584, 908` | ✅ |
| Admin external-access | `app/(app)/admin/external-access/page.tsx:369` | ✅ |
| Admin it-exports | `app/(app)/admin/it-exports/page.tsx:936` | ✅ |
| Admin compliance frameworks | `app/(app)/admin/compliance/ComplianceFrameworks.tsx:283` | ✅ |
| Admin compliance planning | `app/(app)/admin/compliance/CompliancePlanning.tsx:345, 811` | ✅ |
| Admin ticket-spaces | `app/(app)/admin/ticket-spaces/page.tsx:407` | ✅ |
| Admin signatures | `app/(app)/admin/signatures/page.tsx:361` | ✅ |
| Admin certificates | `app/(app)/admin/certificates/page.tsx:709` | ✅ |
| Admin media | `app/(app)/admin/media/page.tsx:165` | ✅ |
| Admin audit log | `components/admin/audit-log-view.tsx:517` | ✅ |
| Admin audit timeline | `components/admin/audit-timeline-view.tsx:450` | ✅ |
| Wiki | `app/(app)/wiki/WikiContent.tsx:3053` | ✅ |
| Runbooks | `app/(app)/wiki/RunbooksContent.tsx` | ✅ |
| TicketSpacesHub | `app/(app)/tickets/TicketSpacesHub.tsx:92` | ✅ |
| Signatures (liste) | `app/(app)/signatures/page.tsx` | ✅ |

## 🟡 Pages avec empty state custom à migrer

Liste des empty states UI principaux non unifiés — cibles prioritaires de l'Étape 2.2.

### Priorité haute (pages fortement visitées)

| Page | Localisation | Contexte actuel | Migration proposée |
|---|---|---|---|
| **Dashboard — tickets** | `app/(app)/dashboard/page.tsx:254-260` | Card + Ticket icon + `<p>Aucun ticket…</p>` | `<EmptyState type="tickets" title="Aucun ticket pour le moment" description="Vos demandes de support apparaîtront ici." />` |
| **Dashboard — documents** | `app/(app)/dashboard/page.tsx:281-287` | Card + FileText icon + `<p>Aucun document…</p>` | `<EmptyState type="documents" title="Aucun document contractuel" description="Les documents liés à votre contrat apparaîtront ici." />` |
| **Changelog** | `app/(app)/changelog/page.tsx:76-80` | Card + `<p>Aucune entrée…</p>` | `<EmptyState type="general" title="Aucune entrée dans le changelog" description="L'historique des changements apparaîtra ici." />` |
| **Timeline** | `app/(app)/timeline/page.tsx:251-258` | Card + Clock + `<p>Aucun évènement…</p>` | `<EmptyState type="general" title="Aucun évènement à afficher" description="Votre activité et celle de votre équipe apparaîtront ici." />` |
| **Directory — organigramme** | `app/(app)/directory/organigramme/page.tsx:321-331` | Card + Building2 + `<p>Aucun département</p>` | `<EmptyState type="users" title="Aucun département" description="Les départements apparaîtront ici une fois créés." />` |
| **Directory — contacts** | `app/(app)/directory/contacts/page.tsx:222-231` | Card + Users + `<p>Aucun contact…</p>` | `<EmptyState type="users" title="Aucun contact trouvé" description="Essayez de modifier vos filtres de recherche." />` |
| **Tips** | `app/(app)/tips/page.tsx:147-149` | `<p>Aucune astuce…</p>` | `<EmptyState type="search" title="Aucune astuce trouvée" description="Aucune astuce ne correspond à votre recherche." />` |
| **Helpdesk — demandes récentes** | `app/(app)/helpdesk/SelfServicePortal.tsx:281` | `<p>` italique | `<EmptyState type="tickets" title="Aucune demande récente" description="Vos futures demandes de support apparaîtront ici." />` |
| **Helpdesk — FAQ search vide** | `app/(app)/helpdesk/SelfServicePortal.tsx:413` | `<p>` simple | `<EmptyState type="search" title="Aucun guide trouvé" description="..." action={...} />` |
| **Admin — backups** | `app/(app)/admin/backups/page.tsx:231-234` | Div gris centré | `<EmptyState type="general" title="Aucune sauvegarde disponible" description="Les sauvegardes apparaîtront ici dès leur création." />` |
| **Admin — AD audit** | `app/(app)/admin/ad-audit/page.tsx:505` | Inline dans Card | `<EmptyState type="general" title="Aucun audit précédent" description="Lancez un scan rapide pour commencer." />` |
| **Extranet** | `app/(app)/extranet/page.tsx:167-171` | Custom `<p>` + `<p>` | `<EmptyState type="users" title="Aucun accès prestataire" description="Aucun accès extranet configuré." />` |
| **Search v2 — pas de résultat** | `app/(app)/search/v2/page.tsx:271` | `<p>Aucun résultat…</p>` | `<EmptyState type="search" title="Aucun résultat" description="Aucun contenu ne correspond à cette recherche." />` |

### Priorité moyenne (pages détail — empty states internes aux onglets)

| Page | Localisation | Note |
|---|---|---|
| **Documents détail** | `app/(app)/documents/[id]/page.tsx:1743, 1952, 2005, 2073, 2113` | 5 onglets (versions, signatures, lectures, historique, commentaires) — migration onglet par onglet |
| **Incidents détail** | `app/(app)/incidents/[id]/page.tsx:487, 576` | 2 onglets (remédiations, chronologie) |
| **Procedures détail** | `app/(app)/procedures/[id]/page.tsx:399` | Onglet versions |
| **Admin rssi-dashboard** | `app/(app)/admin/rssi-dashboard/page.tsx:511, 529, 567` | 3 widgets (bulletins, incidents, alertes veille) |
| **Admin certificates** | `app/(app)/admin/certificates/page.tsx:943, 1132` | 2 sections (externes, KnowBe4) |
| **Wiki** | `app/(app)/wiki/WikiContent.tsx:1407, 2347, 3398` | Versions, pièces jointes, catégories |
| **Profile** | `app/(app)/profile/page.tsx:780, 1087, 1153` | Département, quiz, activité |
| **Tickets Kanban** | `app/(app)/tickets/page.tsx:2143` | Colonne vide |
| **Admin ticket-spaces** | `app/(app)/admin/ticket-spaces/page.tsx:544, 675` | Catégories custom, membres |

### Priorité basse (empty states très petits / contextuels)

Ces empty states sont volontairement compacts (badges, listes dans sidebars) et ne justifient pas forcément le composant `<EmptyState>` complet. À évaluer au cas par cas :

- `components/layout/header.tsx:627` — Popover notifications
- `components/layout/sidebar.tsx:1095` — Recherche navigation
- `components/layout/status-bar.tsx:447, 584, 630` — Mini statuts
- `components/layout/command-palette.tsx:447` — Palette Ctrl+K
- `components/layout/annotations-drawer.tsx:187` — Drawer compact
- `components/widgets/docs-due-review-widget.tsx:90` — Widget dashboard
- `components/widgets/rss-feed-widget.tsx:73` — Widget RSS
- `components/widgets/ldap-pending-widget.tsx:27` — Widget mini
- `components/widgets/morning-briefing-widget.tsx:55` — Texte contextuel
- `components/widgets/quote-widget.tsx` — Quote dérivée

**Décision** : on laisse ces mini empty states en l'état (compacité assumée dans les sidebars/popovers).

## 🔴 Pages publiques (hors périmètre app)

- `app/(public)/welcome/page.tsx` — Landing publique, design différent assumé
- `app/(public)/kiosk/page.tsx` — Mode borne, design lumineux
- `app/(app)/not-found.tsx` — Page 404, design dédié

Ces pages ne doivent **pas** utiliser `<EmptyState>` (contexte et style différents).

## 🎯 Plan de migration (Étape 2.2)

**Scope minimal** : 12 pages prioritaires listées en "priorité haute".

**Scope idéal (si temps disponible)** : + 5 pages priorité moyenne les plus visitées.

**Conventions retenues** :
- Titre : commence par "Aucun"/"Aucune" + sujet, sans point final
- Description : une phrase orientée action ("… apparaîtront ici dès que…")
- `type` choisi en priorité : `tickets`, `documents`, `users`, `news`, `search`, puis `general` par défaut
- CTA : ajouté si une action naturelle existe (créer, rechercher, retirer filtres), optionnel
