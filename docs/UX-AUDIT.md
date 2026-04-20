# Audit d'ergonomie OMNITECH Intranet — 2026-04-14

> Audit réalisé en lecture seule sur `apps/frontend/src/app/**`, `components/layout/sidebar.tsx` et composants associés. Échantillonnage + grep ciblé plutôt qu'inspection ligne à ligne exhaustive.

## 1. Synthèse exécutive

- **82 fichiers `page.tsx` inventoriés** (dont 75 dans `(app)`/`(auth)`/`(public)`, 5 redirects pures, 2 hors-groupe).
- **6 doublons structurels majeurs** détectés (search v1/v2, audit-log/audit-timeline, wiki/runbooks, signatures user/admin, helpdesk/selfservice, documents new/new-inline).
- **5 pages-squelettes** (< 10 lignes, redirects) candidates à suppression pure si la redirection ne porte pas de valeur SEO interne.
- **1 lien mort confirmé** (`/admin/audit` dans dashboard).
- **Incohérence visuelle systémique** : 62 fichiers définissent un `<h1>` maison, seulement **7** utilisent le composant `PageHeader` partagé. Classes legacy `text-navy`/`text-taupe` : **616 occurrences** / classes chartes `seal-*` : **34 occurrences** → la charte SEAL n'est pas appliquée sur l'intranet.
- **62 `console.error` en prod** sur 30 fichiers (dont 10 dans `profile/page.tsx`). Peu de `required` HTML (11 occurrences).
- **Score ergonomie estimé : 5,5 / 10** — fondations solides (hubs, sidebar riche, PageHeader disponible) mais cohérence visuelle et navigation très hétérogènes, plusieurs pages faisant doublon.

## 2. Inventaire des pages

Légende rôle : `-` = public/auth, `COLLAB` = COLLABORATEUR, `REV` = REVIEWER, `ADM` = ADMIN, `SA` = SUPER_ADMIN. Les rôles sont ceux déclarés dans `components/layout/sidebar.tsx` (niveau du hub quand l'item hérite).

### 2.1 Pages utilisateur `(app)`

| URL | Titre H1 visible | Rôle min | Lignes | Remarque |
| --- | --- | --- | --- | --- |
| `/dashboard` | « Bonjour {prenom} » (l.499) + « Espace Prestataire » (l.140) | tous | 1409 | Page géante, contient 2 H1 selon le mode prestataire. |
| `/notifications` | `{t('notifications.title')}` | tous | 579 | H1 maison. |
| `/profile` | `{user.firstName}` | tous | 1248 | 10 `console.error`. |
| `/tickets` | — (tabs) | tous | 1393 | Utilise header maison. |
| `/tickets/[id]` | `{ticket.title}` | tous | 561 | H1 maison. |
| `/signatures` | `{t('mySignatures.title')}` | tous | 202 | Doublon potentiel avec `/admin/signatures`. |
| `/calendar` | « Calendrier » + icône | tous | 640 | H1 maison. |
| `/mfa` | « Authentification MFA » | tous | 368 | H1 maison. |
| `/hub/work` | (HubLanding) | tous | 78 | Page hub, OK. |
| `/hub/security` | (HubLanding) | tous | 71 | Page hub, OK. |
| `/documents` | (PageHeader ?) | tous | **1472** | Gros listing + filtres. |
| `/documents/new` | « Nouveau document » | tous | 717 | Formulaire upload fichier. |
| `/documents/new-inline` | « Nouveau document en ligne » | tous | 182 | **Doublon** de `/documents/new` côté UX — non référencé depuis sidebar. |
| `/documents/pending` | `{t('pending.title')}` | tous | 294 | H1 maison. |
| `/documents/[id]` | `{doc.title}` | tous | **1888** | Plus gros fichier, viewer + commentaires + versions. |
| `/documents/[id]/edit` | « Modifier le document » | tous | 374 | H1 maison. |
| `/documents/[id]/editor` | éditeur inline | tous | 888 | Ok. |
| `/procedures` | `{t('procedures.title')}` | tous | 338 | H1 maison. |
| `/procedures/[id]` | `{doc.title}` | tous | 482 | H1 maison, pas de dark:text. |
| `/news` | (PageHeader ?) | tous | 380 | Liste actus. |
| `/news/[slug]` | `{post.title}` | tous | 373 | H1 maison. |
| `/news/[slug]/edit` | « Modifier l'article » | tous | 234 | H1 maison. |
| `/news/compose` | `{t('newsCompose.title')}` | tous | 386 | H1 maison. |
| `/wiki` | « Base de connaissances » (PageHeader) | tous | 119 | Onglets `wiki` / `runbooks`. |
| `/runbooks` | « Runbooks » (PageHeader) | tous | 20 | **Doublon de l'onglet `/wiki?tab=runbooks`**. |
| `/directory` | « Annuaire » | tous | 432 | H1 maison. |
| `/directory/contacts` | « Contacts » | tous | 317 | H1 maison. |
| `/directory/organigramme` | « Organigramme » | tous | 344 | H1 maison. |
| `/files` | « Serveur de fichiers » | tous | 490 | H1 maison. |
| `/files/smb-editor/[sessionId]` | (Link retour) | tous | 223 | Pas d'H1 clair. |
| `/search` | `{t('search.title')}` | tous | 787 | Page v1 Postgres. |
| `/search/v2` | « Recherche federee » | tous | 213 | **Doublon explicite** (Meilisearch). Non lié depuis sidebar. |
| `/tools/pdf` | Icône + texte (l.278) | COLLAB | 614 | Outils PDF. |
| `/incidents` | (header custom) | COLLAB | 695 | 1 `console.error`. |
| `/incidents/[id]` | `{incident.title}` | COLLAB | 774 | H1 maison. |
| `/alerts` | « Alertes de sécurité » | COLLAB | 406 | H1 maison (tailles différentes: `text-[26px]`). |
| `/veille` | « Veille Cybersécurité » | REV | 962 | H1 maison, 4 console.error. |
| `/chartes` (public root duplicat) | « Chartes obligatoires » | tous | 358 | Voir § 6.2. |
| `/helpdesk` | `{t('helpdesk.supportTitle')}` | tous | 80 | Onglets chat/selfservice. |
| `/selfservice` | (redirect) | tous | **5** | Redirect pur vers `/helpdesk?tab=selfservice`. |
| `/quiz` | « Quiz » (2 H1 dans le fichier) | COLLAB | 1141 | 1 console.error. |
| `/satisfaction` | « Enquêtes et formulaires » | COLLAB | 839 | H1 maison. |
| `/tips` | (header custom) | tous | 165 | — |
| `/changelog` | « Nouveautes » | tous | 202 | `text-3xl font-semibold` = variante encore différente. |
| `/chat` | « Messagerie » (x3 selon status) | tous | 118 | Iframe Rocket.Chat — 3 H1 différents par état. |
| `/extranet` | (title) | ADM (sidebar) | 225 | Lié depuis admin. |

### 2.2 Pages admin

| URL | Titre H1 | Rôle min | Lignes | Remarque |
| --- | --- | --- | --- | --- |
| `/admin` | (HubLanding) | ADM | 120 | Landing cards. |
| `/admin/users` | « Utilisateurs » | ADM | **1003** | H1 maison. |
| `/admin/users/import` | « Importer des utilisateurs (CSV) » | ADM | 340 | — |
| `/admin/ldap-pending` | « Validation LDAP » | ADM | 428 | — |
| `/admin/departments` | `{t('departments.title')}` | ADM | 609 | — |
| `/admin/compliance` | (onglets frameworks/controls/planning) | REV | 109 | Onglets. |
| `/admin/compliance-tasks` | — | REV | **5** | Redirect `/admin/compliance?tab=planning`. |
| `/admin/frameworks` | — | REV | **5** | Redirect `/admin/compliance?tab=frameworks`. |
| `/admin/iso-controls` | — | REV | **5** | Redirect `/admin/compliance?tab=controls`. |
| `/admin/workflows` | « Workflows… » | ADM | 268 | — |
| `/admin/workflows/[id]` | `{wf.name}` | ADM | 473 | — |
| `/admin/access-reviews` | « Revue périodique des accès » | SA | 1052 | 1 console.error. |
| `/admin/audit-log` | `{t('auditLog.title')}` | SA | **576** | **Doublon** thème audit. |
| `/admin/audit-timeline` | « Frise d'audit » | ADM | **567** | **Doublon** thème audit — même source de données. |
| `/admin/ad-audit` | « AD Audit » | ADM | 564 | H1 maison. |
| `/admin/reports` | `{t('reports.title')}` | ADM | 304 | — |
| `/admin/rssi-dashboard` | 2 H1 (l.117, l.122) | SA | 535 | **8 console.error**. Raccourcis vers pages doublons. |
| `/admin/system-health` | « Santé système » | ADM | 291 | — |
| `/admin/dark-mode-audit` | « Audit Dark Mode » | ADM | 283 | Outil dev, probablement pas à garder en prod. |
| `/admin/config` | « Configuration » | SA | **1214** | Page tentaculaire. |
| `/admin/spaces` | « Espaces & modules » | SA | 373 | — |
| `/admin/chartes` | « Gestion des Chartes » | ADM | 500 | — |
| `/admin/external-access` | « Accès Prestataires Externes » | ADM | 437 | — |
| `/admin/it-exports` | 2 H1 (l.838, l.1087) | ADM | **1184** | Gros fichier. |
| `/admin/onboarding` | « Onboarding / Offboarding » | ADM (feature-flagged) | 419 | Peut être caché par feature flag. |
| `/admin/signatures` | « Gestion des signatures » | ADM (non déclaré dans sidebar) | 458 | **Orpheline sidebar** (pas de lien dans `hub.items`). |

### 2.3 Auth / public / hors-groupe

| URL | Titre | Rôle | Lignes | Remarque |
| --- | --- | --- | --- | --- |
| `/login` | « Bienvenue » | - | 277 | — |
| `/logout` | « À bientôt ! » | - | 68 | — |
| `/forgot-password` | `{t('forgotPassword.title')}` | - | 152 | — |
| `/reset-password` | `{t('resetPassword.title')}` | - | 220 | — |
| `/welcome` (public) | « Bienvenue… » | - | 671 | Landing public, 2 console.error. |
| `/kiosk` (public) | — | - | 293 | Mode borne. |
| `/chartes` (root, hors `(app)`) | « Chartes obligatoires » | - | 358 | **Doublon possible** avec l'item sidebar `/chartes` rattaché à `hub/security`. |
| `/maintenance` | « Maintenance » | - | 164 | — |
| `/offline` | « Hors ligne » | - | 99 | — |
| `/` | — | - | 27 | Redirige vers dashboard. |

## 3. Doublons et redondances

### 3.1 Pages doublonnes

1. **`/search` (787 lignes, v1 Postgres) ET `/search/v2` (213 lignes, Meilisearch)** — Commentaire explicite dans `apps/frontend/src/app/(app)/search/v2/page.tsx:5` : *« Cette page coexiste avec `/search` (v1 Postgres) pendant la migration »*. Seule `/search` est liée depuis la sidebar (`sidebar.tsx:249`). `/search/v2` est orpheline et stylée différemment (classes `seal-text-navy`, `text-slate-600` au lieu de `text-taupe`).
2. **`/admin/audit-log` (576 lignes) ET `/admin/audit-timeline` (567 lignes)** — Même entité (journal d'audit), deux présentations : tableau paginé (`DataTable`) vs frise verticale. Les deux sont listées côte à côte dans la sidebar (`sidebar.tsx:283-284`). Candidats à fusion en onglets d'une seule page `/admin/audit`.
3. **`/wiki?tab=runbooks` ET `/runbooks`** — La page `/runbooks` (`apps/frontend/src/app/(app)/runbooks/page.tsx`, 20 lignes) rend exactement `<RunbooksContent />`, composant déjà affiché par l'onglet « Runbooks » de `/wiki/page.tsx:98`. Résultat : deux URLs mènent au même composant.
4. **`/signatures` (user) ET `/admin/signatures` (admin)** — Fonctionnellement proches : gestion de signatures. La page admin est **orpheline** (absente de `sidebar.tsx`). Un super-admin est probablement la cible de la page admin, mais le libellé « Mes signatures » côté user et « Gestion des signatures » côté admin mériteraient un flux unique avec switch « Mes / Toutes ».
5. **`/helpdesk` ET `/selfservice`** — `/selfservice` est un redirect 1-ligne (`apps/frontend/src/app/(app)/selfservice/page.tsx`) vers `/helpdesk?tab=selfservice`. Déjà partiellement consolidé, mais le segment est toujours exposé.
6. **`/documents/new` (717 lignes) ET `/documents/new-inline` (182 lignes)** — Deux parcours de création : upload externe vs rédaction in-line. `/documents/new-inline` n'est pas atteignable depuis la sidebar ni explicitement depuis `/documents/new`. Devrait être un onglet de `/documents/new` (« Uploader un fichier » / « Rédiger en ligne »).

### 3.2 Widgets doublonnés (dashboard)

Le fichier `apps/frontend/src/app/(app)/dashboard/page.tsx` importe 14 widgets (`ClockWidget`, `LuccaWidget`, `WeatherWidget`, `QuickLinks`, `QuoteWidget`, `RSSFeedWidget`, `RecentPagesWidget`, `MyNotificationsWidget`, `SystemHealthCompact`, `LdapPendingWidget`, `DocsDueReviewWidget`, `SmsiIndicatorsWidget`, `GedDashboardWidget`, `TipOfTheDay`) et encode en + des blocs JSX internes pour les stats documents, tickets, notifications et conformité (voir l. 40-50).

Redondances repérées :
- **`SmsiIndicatorsWidget` + `GedDashboardWidget` + blocs internes `DashboardStats`/`ComplianceSummary`** présentent chacun un sous-ensemble documents/conformité. Le même chiffre « X documents en revue » apparaît ~2 fois (widget + bloc actions).
- **`MyNotificationsWidget` + `/notifications`** : la même donnée est résumée en widget et détaillée en page dédiée, mais la pagination/lecture ne se partage pas (le widget n'ouvre pas `/notifications` en deep-link ciblé, il redirige en haut de liste).
- **`SystemHealthCompact` (widget) ET `/admin/system-health` (page)** : le widget affiche déjà 80 % des indicateurs. La page dédiée est ~291 lignes avec peu de valeur ajoutée au-delà du widget étendu.

### 3.3 Formulaires répétitifs

- **Formulaire signataires** : la sélection d'un signer (recherche user + toggle multi) existe dans `admin/signatures/page.tsx:36-60`, `documents/[id]/page.tsx` (action de demande signature) et `admin/workflows/[id]/page.tsx`. Pas de composant `SignerPicker` mutualisé.
- **Champs « Classification / Catégorie / Domaine »** : dupliqués entre `documents/new/page.tsx` et `documents/new-inline/page.tsx:24-34`. Même `CLASSIFICATION_OPTIONS` recopié.
- **Filtre « severity INFO/WARN/CRITICAL »** : défini dans `admin/audit-log/page.tsx`, `admin/audit-timeline/page.tsx` et `alerts/page.tsx` avec chacun son `Badge` custom.

## 4. Pages candidates à fusion (priorisées)

| Priorité | Pages à fusionner | Dans | Justification |
| --- | --- | --- | --- |
| **P0** | `/search` + `/search/v2` | `/search` (nouveau tab `v2` ou bascule feature flag) | Dette de migration explicite (commentaire dans le code). `/search/v2` est orpheline. |
| **P0** | `/admin/audit-log` + `/admin/audit-timeline` | `/admin/audit` avec onglets « Table » / « Frise » | Même donnée, deux UX. Une page unique réduit la confusion SUPER_ADMIN / ADMIN. |
| **P0** | `/runbooks` | Onglet existant de `/wiki` | `/runbooks` n'apporte rien, la page `/wiki` fait déjà le boulot. |
| **P0** | `/documents/new` + `/documents/new-inline` | `/documents/new` (onglets « Uploader » / « Rédiger ») | Options mutuellement exclusives d'un même workflow. |
| **P1** | `/admin/compliance-tasks`, `/admin/frameworks`, `/admin/iso-controls` | Déjà redirects vers `/admin/compliance?tab=…` | Supprimer les 3 fichiers-redirects ; conserver uniquement le deep-link. Rediriger via `next.config` au lieu d'un `page.tsx`. |
| **P1** | `/selfservice` | Déjà redirect | Même traitement. |
| **P1** | `/signatures` + `/admin/signatures` | `/signatures` avec onglet « Toutes » (admin only) | Évite l'orpheline admin. |
| **P1** | `/admin/system-health` widget + page | Exposer la page uniquement depuis le widget (« Voir plus ») | Éviter la duplication d'indicateurs. |
| **P2** | `/directory` + `/directory/contacts` + `/directory/organigramme` | `/directory` avec onglets « Liste / Contacts / Organigramme » | Cohérence avec patterns `/helpdesk` et `/wiki`. |
| **P2** | `/admin/dark-mode-audit` | À supprimer ou déplacer sous un flag `devtools` | Outil interne, pas une fonctionnalité métier. |

## 5. Pages vides / orphelines

**Redirects purs (< 10 lignes)** — à remplacer par des redirects Next.js natifs :
- `apps/frontend/src/app/(app)/selfservice/page.tsx` (5 l.)
- `apps/frontend/src/app/(app)/admin/compliance-tasks/page.tsx` (5 l.)
- `apps/frontend/src/app/(app)/admin/frameworks/page.tsx` (5 l.)
- `apps/frontend/src/app/(app)/admin/iso-controls/page.tsx` (5 l.)
- `apps/frontend/src/app/page.tsx` (27 l., redirect root)

**Pages squelettes sans logique propre** :
- `apps/frontend/src/app/(app)/runbooks/page.tsx` (20 l.) — ne fait que délégué au composant `RunbooksContent` déjà utilisé par `/wiki`.

**Pages non référencées depuis la sidebar** (orphelines) :
- `/search/v2` — absente de `sidebar.tsx` (seul `/search` est déclaré l.249).
- `/admin/signatures` — absente du tableau `href` de la section Administration (`sidebar.tsx:277-295`). Seul `/signatures` (user) y figure.
- `/admin/dark-mode-audit` — présent dans la sidebar (l.287) mais manifestement un outil de dev.
- `/documents/new-inline` — atteignable uniquement via lien interne (à vérifier) ; aucune action « Créer en ligne » n'a été trouvée dans les pages parcourues.
- `/documents/pending` — pas trouvé dans la sidebar (vérifier `DocsDueReviewWidget`).

## 6. Navigation

### 6.1 Profondeur de clic par fonctionnalité clé (depuis `/dashboard`)

| Fonctionnalité | Clics | Chemin |
| --- | --- | --- |
| Créer un ticket | 2 | sidebar « Tickets » → bouton « Nouveau » |
| Créer un document (upload) | 3 | sidebar « Documents » → bouton « + Nouveau » → parcours upload |
| Rédiger un document inline | ≥ 4 (orphelin) | Pas de lien direct, il faut connaître `/documents/new-inline` |
| Gérer les utilisateurs | 2 | sidebar « Administration » (hub) → « Utilisateurs » |
| Valider un user LDAP | 2 | sidebar « Administration » → « Validation LDAP » |
| Voir le journal d'audit | 2 | sidebar → « Journal d'audit » |
| Lancer une revue d'accès | 2 | sidebar → « Revue des accès » (SUPER_ADMIN) |
| Voir la frise d'audit | 2 | sidebar → « Frise audit » (mais redondant avec ci-dessus) |
| Accéder aux runbooks | 2 chemins différents | sidebar → « Wiki » (tab) **ou** URL directe `/runbooks` |
| Dashboard RSSI | 2 | hub « Administration » → « Dashboard RSSI » |

**Observation** : L'arbre est globalement plat (≤ 2 clics) grâce à la sidebar plate + hubs, **mais** la multiplication d'entrées quasi-doublonnes (ex : `audit-log` / `audit-timeline`) produit de la charge cognitive à l'ouverture du hub Administration (~17 items).

### 6.2 Liens morts

- **`/admin/audit`** référencé à `apps/frontend/src/app/(app)/dashboard/page.tsx:1167` :
  ```tsx
  <Link href="/admin/audit" className="text-xs text-primary hover:underline …">
  ```
  Aucune page `apps/frontend/src/app/(app)/admin/audit/page.tsx` n'existe. La route correcte est `/admin/audit-log` ou `/admin/audit-timeline`. **À corriger.**

- **`/chartes`** est référencé à deux endroits : la sidebar (`sidebar.tsx:263`) pointe vers `/chartes` qui correspond à `apps/frontend/src/app/(app)/chartes/page.tsx` (n'existe pas dans `(app)` — le fichier est `apps/frontend/src/app/chartes/page.tsx`, hors-groupe). À vérifier : le routing Next.js servira-t-il la bonne page pour un utilisateur authentifié ? Si oui, le layout `(app)` (sidebar etc.) sera absent. **Probable bug de layout.**

- **Aucune autre route sidebar manquante** : toutes les entrées de la sidebar (`/admin/users`, `/admin/departments`, `/admin/config`, etc.) ont bien leur `page.tsx` correspondant.

## 7. Incohérences visuelles

### 7.1 Headers de page

- **7 fichiers** utilisent le composant partagé `PageHeader` (`runbooks`, `wiki`, `hub/work`, `hub/security`, `admin` landing, et 2-3 autres).
- **62 fichiers** définissent leur propre `<h1>` maison, avec au moins 6 variantes de tailles :
  - `text-2xl font-medium text-navy dark:text-white` (variante « par défaut », ~40 fichiers)
  - `text-2xl font-bold text-navy …` (`admin/workflows`, `admin/audit-timeline`)
  - `text-[26px] font-medium text-navy …` (`alerts/page.tsx:166`, `dashboard/page.tsx:499`)
  - `text-2xl text-navy …` (pas de `font-medium`, 4 fichiers : `chat`, `admin/system-health`, `admin/access-reviews`, `admin/dark-mode-audit`, `admin/ldap-pending`)
  - `text-xl font-medium …` (`documents/[id]`, `tickets/[id]`, `incidents/[id]`, `admin/it-exports` à 838)
  - `text-3xl font-semibold tracking-tight` (`changelog/page.tsx:81`)
- **Fichier `/chat/page.tsx`** affiche **3 H1 différents** selon l'état (`unconfigured`, `unreachable`, `ready`) — tailles `text-2xl` / `text-2xl` / `text-lg font-semibold`. Le titre de la page change avec l'état technique, ce qui n'est jamais attendu par un utilisateur.
- **`/admin/rssi-dashboard/page.tsx`** a **2 H1 simultanés** (l.117 « OMNITECH Security — Tableau de bord RSSI » puis l.122 « Tableau de bord RSSI »), ce qui est un défaut SEO et a11y.
- **`/documents/[id]/page.tsx`** contient **103 occurrences** de `text-navy` — le plus gros concentré de style legacy.

### 7.2 États de chargement

- **14 pages** utilisent `Skeleton`.
- **25 pages** utilisent `Loader2` / `animate-spin`.
- **Plusieurs pages utilisent les deux dans le même fichier** (ex : `admin/signatures/page.tsx` importe `Skeleton, Loader2` — cohabitation). Résultat : certains blocs s'affichent en skeleton, d'autres en spinner, donnant une impression d'incohérence.
- **Fichier `wiki/page.tsx` (Suspense)** : skeleton en dur, dimensionné en colonnes `md:grid-cols-2 lg:grid-cols-3`, alors que la vraie liste utilise d'autres proportions.
- **Beaucoup de pages n'ont aucun état de chargement** : simples `if (loading) return null` qui produit un flash de contenu blanc.

### 7.3 Boutons et actions

- **90 occurrences de `<button>` brut** dans les pages (hors composant `Button` de `@omnitech/ui`) contre un usage régulier du composant partagé. La cohabitation produit des états hover/focus incohérents.
- **Libellés hétérogènes** pour « créer » :
  - « Créer » (`documents/new-inline/page.tsx:176`)
  - « Ajouter » / « + Nouveau » / « Nouveau »
  - « Importer » pour les users
- **Icônes-seules sans `aria-label`** : seulement **28 occurrences** d'`aria-label` sur 90 `<button>` bruts. Beaucoup d'actions (`XCircle`, `Eye`, `Trash2`) sont des icones nues.
- **Charte SEAL non propagée** : les utilitaires `seal-*` ne sont utilisés que 34 fois sur 11 fichiers (dont `offline/page.tsx` 13 fois). Tout le reste utilise encore `text-navy` / `text-taupe` / `text-primary`.

## 8. Formulaires

### 8.1 Validations manquantes

- Seules **11 occurrences** de l'attribut HTML `required` sur l'ensemble des pages. La plupart des formulaires valident côté JS via `toast.error('Titre requis')` après soumission, pas en prévention HTML5.
- `documents/new-inline/page.tsx:47` : validation min-length 3 appliquée via un `toast.error`, pas via `<Input required minLength={3}>`. Idem pour `category`.
- Aucune bibliothèque de validation (zod / yup / react-hook-form) n'apparaît dans les fichiers échantillonnés — validation ad hoc dans chaque `handleSubmit`.

### 8.2 Champs obligatoires mal signalés

- Les `<label>` n'ont **pas d'astérisque** `*` visible ni de badge « requis » pour signaler les champs obligatoires. Exemple : `documents/new-inline/page.tsx:100-103` :
  ```tsx
  <label className="text-xs font-medium text-navy …">Titre</label>
  <Input value={title} onChange={…} placeholder="…" />
  ```
  Aucune indication visuelle que le titre est obligatoire ; l'utilisateur l'apprend uniquement au clic sur « Créer ».
- Les messages d'erreur varient : `'Titre requis (min. 3 caractères)'`, `'Catégorie requise'`, ou `"Erreur lors de la création"` (fallback générique).

## 9. Microcopy et cohérence textuelle

### 9.1 Labels de boutons non uniformes

| Concept | Libellés rencontrés |
| --- | --- |
| Créer une entité | « Créer », « + Nouveau », « Ajouter », « Nouveau document », « Créer le ticket » |
| Valider / soumettre | « Enregistrer », « Sauvegarder », « Valider », « Envoyer » |
| Annuler | « Annuler », « Retour », `ArrowLeft Retour` |
| Supprimer | « Supprimer », « Révoquer », `<Trash2 />` seul |

### 9.2 Titres de pages

- `/admin/users` → « Utilisateurs » (nu)
- `/admin/departments` → clé i18n `{t('departments.title')}` (probablement « Départements »)
- `/admin/chartes` → « Gestion des Chartes » (préfixe « Gestion des »)
- `/admin/external-access` → « Accès Prestataires Externes »
- `/admin/ldap-pending` → « Validation LDAP »
- `/admin/audit-log` → `{t('auditLog.title')}`
- `/admin/audit-timeline` → « Frise d'audit »
- `/admin/system-health` → « Santé système »

→ Trois conventions coexistent : **substantif nu**, **« Gestion des X »**, **verbe d'action**. Choisir une seule convention (recommandation : substantif nu pluriel).

## 10. Accessibilité

- **28 `aria-label`** vs **90 `<button>` bruts** dans les pages. L'écart est principalement dans `documents/page.tsx` (12 button vs 6 aria-label) et `search/page.tsx` (11 button vs 0 aria-label).
- **Contrastes à risque** : combinaison `text-slate-500` / `text-slate-400` sur `bg-white` est utilisée dans plusieurs endroits (ex : `search/v2/page.tsx:107`), proche du seuil WCAG AA.
- **`<h1>` multiples** sur une même page : `chat/page.tsx` (3), `admin/rssi-dashboard/page.tsx` (2), `quiz/page.tsx` (2), `admin/it-exports/page.tsx` (2), `dashboard/page.tsx` (2). Mauvais pour lecteurs d'écran et SEO interne.
- **Pas de `<main>` ni `<section>` structurant** dans les pages échantillonnées (layouts à base de `<div className="space-y-6">`).
- **Iframes** (`chat`, `files/smb-editor`) sans `title` systématique (ok dans `chat` l.112, mais à vérifier ailleurs).

## 11. Plan d'action recommandé (priorisé)

### P0 — Quick wins structurels (< 2 jours dev)

1. **Corriger le lien mort** `/admin/audit` → `/admin/audit-log` dans `dashboard/page.tsx:1167`.
2. **Supprimer `/runbooks/page.tsx`** et ajouter un redirect `/runbooks → /wiki?tab=runbooks`.
3. **Fusionner `/admin/audit-log` + `/admin/audit-timeline`** en `/admin/audit` avec 2 onglets. Supprimer une entrée de la sidebar.
4. **Retirer `/search/v2`** de l'app (ou au moins bloquer son accès derrière un feature flag) jusqu'à décision sur la migration Meilisearch.
5. **Centraliser les headers** : forcer l'usage de `PageHeader` via un lint custom ou au moins documenter la convention. Objectif : 0 `<h1>` maison dans les pages `page.tsx`.
6. **Fixer le bug sidebar `/chartes`** : vérifier si la route sert la page `(app)/chartes` ou la page root `chartes/page.tsx` (layout différent).

### P1 — Cohérence UX (sprint)

7. **Charte SEAL** : migrer les 616 occurrences `text-navy` / `text-taupe` vers les classes `seal-*`. Commencer par les 30 fichiers impactés ; peut être scripté.
8. **Fusionner `/documents/new` + `/documents/new-inline`** en une seule page à 2 onglets (Upload / Rédiger).
9. **Remplacer les 5 pages-redirects** (`selfservice`, `compliance-tasks`, `frameworks`, `iso-controls`, `admin/compliance-tasks` suite à migration) par des `redirects` dans `next.config.js`.
10. **Composant `SignerPicker`** mutualisé pour les 3 formulaires de sélection user.
11. **Validation formulaire** : adopter `react-hook-form + zod` pour `documents/new*`, `news/compose`, `admin/users/import`. Indiquer visuellement les champs obligatoires (astérisque orange `seal-orange`).
12. **Uniformiser états loading** : choisir `Skeleton` pour les listes/tables et `Loader2` uniquement pour les actions impératives (submit, sync). Audit dédié.

### P2 — Polish et accessibilité

13. **`aria-label` sur toutes les actions icône-seule** (`<Trash2 />`, `<Eye />`, `<X />`). Règle ESLint `jsx-a11y/aria-label` en erreur.
14. **Normaliser le microcopy** : « Créer » partout (bannir « Ajouter », « Nouveau », « + »). Substantif nu pour les titres de pages.
15. **Supprimer `/admin/dark-mode-audit`** de la sidebar (outil dev).
16. **Supprimer ou feature-flag les 62 `console.error`** — logger vers Sentry/logging backend.
17. **Structurer les pages avec `<main>` et `<h2>` hiérarchiques** au lieu de `<div className="space-y-6">`.
18. **Regroupement de la section Administration** en sous-menus (« Utilisateurs », « Conformité », « Infrastructure », « Audit ») : 17 items à plat dans un hub est beaucoup trop. Les icônes se ressemblent (4 fois `Users`, 3 fois `ShieldAlert`).

---

**Score ergonomie estimé** : 5,5 / 10

- Points forts : routing Next 15 app-router bien organisé, composant `PageHeader` dispo, structure hubs (Work / Security / Administration) claire, sidebar intelligente (pinning, recents, badges), feature flags déjà en place.
- Points faibles : duplication de pages/widgets, charte visuelle non uniformisée, formulaires sans validation native, accessibilité basique négligée, 17 items dans le hub Admin sans regroupement.
