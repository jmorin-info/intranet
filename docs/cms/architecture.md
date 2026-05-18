# CMS interne — Architecture cible

> **Statut** : v1 — proposition validée.
> **Branche** : `feature/admin-content-management`
> **Date** : 2026-05-18

---

## 1. Pourquoi un module CMS

L'audit Phase 1 a identifié plus de 10 zones de contenu hardcodé dans le frontend qui imposent un redéploiement à chaque modification d'un texte :

- Pages légales statiques (`/legal`, `/privacy-policy`, `/cookies`) — édition par juridique impossible sans dev.
- Page d'accueil publique `/welcome` (sections hero, services, FAQ) — communication marketing figée dans le code.
- Trust center (`/trust`) — engagements ISO/SOC2 qui évoluent avec les certifications.
- Daily security tips (`dashboard-tips-banner`) — 43 tips RSSI rotés à la journée, non éditables.

Les besoins existants couverts par d'autres modules (et **hors scope** de ce CMS) :

| Besoin                              | Module existant                  | Raison                                             |
| ----------------------------------- | -------------------------------- | -------------------------------------------------- |
| Articles d'actualité chronologiques | `News` (`/api/news`)             | Workflow propre (épingles, broadcast, catégories). |
| Pages collaboratives wiki           | `Wiki` (`/api/wiki`)             | Co-édition, visibility par espace.                 |
| Bannières d'alerte P1/P2/P3         | `Banners`                        | UI dédiée, rotation par priorité.                  |
| Traductions UI génériques           | `next-intl` (`messages/fr.json`) | Fichiers de dictionnaire build-time.               |

Le CMS gère un **3e type de contenu** : pages éditoriales **statiques** (legal, accueil, à propos) et **blocs de page** réutilisables, avec workflow brouillon → publication, historique de versions, et rendu sécurisé du HTML.

## 2. Modèle de données

Deux entités, séparées pour clarté :

### 2.1 `ContentPage` — page éditoriale standalone

Une `ContentPage` a une URL publique propre (`/page/<slug>`). Cas d'usage : mentions légales, politique de confidentialité, cookies, FAQ.

```prisma
enum ContentStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model ContentPage {
  id              String              @id @default(uuid())
  slug            String
  locale          String              @default("fr")
  title           String
  excerpt         String?
  content         String              // HTML sanitisé (sanitize-html backend)
  status          ContentStatus       @default(DRAFT)
  seoTitle        String?
  seoDescription  String?
  publishedAt     DateTime?
  authorId        String
  updatedById     String?
  deletedAt       DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  author          User                @relation("ContentPageAuthor", fields: [authorId], references: [id])
  updatedBy       User?               @relation("ContentPageEditor", fields: [updatedById], references: [id])
  revisions       ContentRevision[]

  @@unique([slug, locale])
  @@index([status, locale])
  @@index([deletedAt])
  @@index([publishedAt])
}

model ContentRevision {
  id              String        @id @default(uuid())
  pageId          String
  version         Int
  title           String
  content         String
  excerpt         String?
  seoTitle        String?
  seoDescription  String?
  status          ContentStatus
  authorId        String
  comment         String?       // message libre fourni par l'éditeur
  createdAt       DateTime      @default(now())

  page            ContentPage   @relation(fields: [pageId], references: [id], onDelete: Cascade)
  author          User          @relation(fields: [authorId], references: [id])

  @@unique([pageId, version])
  @@index([pageId, createdAt])
}
```

**Règles** :

- `slug` unique par `locale` (deux pages peuvent partager le slug `mentions-legales` si l'une est `fr` et l'autre `en`).
- Soft delete via `deletedAt` (conforme aux conventions existantes : Document, Ticket, etc.).
- Chaque `update` du service crée une `ContentRevision` (snapshot du titre + contenu + meta SEO avant écrasement). `version` est auto-incrémenté par page.
- La publication renseigne `publishedAt` (premier passage en PUBLISHED) et le maintient sur les republications successives.

### 2.2 `ContentBlock` — bloc réutilisable identifié par clé

Un `ContentBlock` n'a pas d'URL propre ; il est consommé par un composant front via sa clé (ex. `welcome.hero.title`, `welcome.faq`, `trust.commitment.iso27001`).

```prisma
model ContentBlock {
  id              String        @id @default(uuid())
  key             String        // ex: "welcome.hero.title"
  locale          String        @default("fr")
  title           String?
  body            String        // texte court ou HTML court sanitisé
  data            Json?         // structuré (liste FAQ, liste services, etc.)
  status          ContentStatus @default(PUBLISHED)
  updatedById     String?
  deletedAt       DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  updatedBy       User?         @relation(fields: [updatedById], references: [id])

  @@unique([key, locale])
  @@index([deletedAt])
}
```

**Règles** :

- Pas de versioning sur les blocs (granularité plus fine, churn élevé). Audit log suffit pour traçabilité.
- `data` Json autorise les blocs structurés (ex. `welcome.services` = `[{ icon, title, body, href }]`) sans schéma rigide en DB. La validation forte est faite côté DTO en entrée.
- Le statut `DRAFT` masque le bloc côté public (le composant front utilise un fallback hardcodé).

### 2.3 Ce que le CMS NE gère PAS

- **Upload d'images** : les images consommées par les pages CMS proviennent du module `media` existant (`/admin/media`). Le `RichTextEditor` accepte un callback `onImageButton` que l'admin câblera vers le picker `media`.
- **Multi-tenant / espaces** : le CMS est global (un admin = toutes pages). Pas de visibilité par département en MVP.
- **Scheduled publishing** : pas en MVP. La publication est immédiate.

## 3. APIs

### 3.1 Routes admin (auth + `@Roles(ADMIN, SUPER_ADMIN)`)

Préfixe : `/api/v1/admin/content`

| Méthode | Route                                     | Description                                                                             |
| ------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| GET     | `/pages?status=&locale=&q=&page=&limit=`  | Liste paginée (defaults page=1 limit=20 max=100). Inclut DRAFT et ARCHIVED.             |
| POST    | `/pages`                                  | Création (status = DRAFT par défaut). Body : `CreateContentPageDto`.                    |
| GET     | `/pages/:id`                              | Détail (toute version, y compris DRAFT).                                                |
| PATCH   | `/pages/:id`                              | Édition. Body : `UpdateContentPageDto`. Crée une `ContentRevision`.                     |
| POST    | `/pages/:id/publish`                      | Bascule en PUBLISHED, renseigne `publishedAt`, déclenche revalidation Next.js.          |
| POST    | `/pages/:id/unpublish`                    | Bascule en ARCHIVED.                                                                    |
| DELETE  | `/pages/:id`                              | Soft delete (`deletedAt = now()`).                                                      |
| GET     | `/pages/:id/revisions`                    | Liste des révisions (paginée).                                                          |
| POST    | `/pages/:id/revisions/:version/restore`   | Restaure le contenu d'une révision (crée une nouvelle révision avec le contenu ancien). |
| GET     | `/blocks?prefix=&locale=&q=&page=&limit=` | Liste blocs (filtrable par préfixe de clé).                                             |
| POST    | `/blocks`                                 | Création. Clé unique par locale.                                                        |
| PATCH   | `/blocks/:id`                             | Édition.                                                                                |
| DELETE  | `/blocks/:id`                             | Soft delete.                                                                            |

### 3.2 Routes publiques (auth utilisateur connecté requise)

Préfixe : `/api/v1/content`

| Méthode | Route                             | Description                                                                                                    |
| ------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET     | `/pages/:slug?locale=fr`          | Récupère une page PUBLIED (404 si DRAFT/ARCHIVED/manquante). Cache 5min.                                       |
| GET     | `/blocks?keys=k1,k2,k3&locale=fr` | Batch fetch — retourne `{ [key]: ContentBlockPublic }` pour les blocs PUBLISHED. Manquants → omis. Cache 5min. |

**Pourquoi `auth requise` sur les routes publiques** : l'intranet est interne (pas de visiteur anonyme). Les pages légales sont consultées par des collaborateurs authentifiés. Cela permet de garder l'`AuditService` du log d'accès. Si une page doit être exposée sans auth (`/welcome` accessible avant login), on ajoute la route au décorateur `@Public()` existant.

### 3.3 Conventions de réponse

- **Pagination** : `{ data: T[], meta: { total, page, limit, totalPages } }` — strict alignement avec `PaginatedResult<T>` (`apps/backend/src/common/interfaces.ts`).
- **Codes** : 200/201/204 standards. 400 (validation), 401 (auth), 403 (rôle), 404 (introuvable ou non publié pour route publique), 409 (conflit slug).
- **Headers de cache** sur routes publiques : `Cache-Control: private, max-age=300, stale-while-revalidate=3600`.

## 4. RBAC

| Rôle                  | Liste pages admin | Création/Édition | Publication/Dépublication | Suppression | Routes publiques |
| --------------------- | ----------------- | ---------------- | ------------------------- | ----------- | ---------------- |
| SUPER_ADMIN           | ✓                 | ✓                | ✓                         | ✓           | ✓                |
| ADMIN                 | ✓                 | ✓                | ✓                         | ✓           | ✓                |
| DIRECTION             | ✓ (read-only)     | ✗                | ✗                         | ✗           | ✓                |
| MANAGER → PRESTATAIRE | ✗                 | ✗                | ✗                         | ✗           | ✓                |

Pattern : `@UseGuards(JwtAuthGuard, RolesGuard)` au niveau controller, `@Roles(...)` par route.

## 5. Validation, sanitization et sécurité

### 5.1 Validation entrée (backend)

DTOs `class-validator` (cohérent avec le reste du backend, cf. `news`, `tickets`). Exemples :

- `title` : `@IsString() @MinLength(1) @MaxLength(255)`
- `slug` : `@IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(120)` (si fourni ; sinon généré côté service via `generateUniqueSlug`).
- `locale` : `@IsIn(['fr', 'en'])`
- `content` : `@IsString() @MaxLength(200_000)` (200 Ko de HTML max).
- `seoTitle` / `seoDescription` : `@IsOptional() @IsString() @MaxLength(60/160)`.
- `status` : `@IsEnum(ContentStatus)` (uniquement pour patches qui modifient explicitement le statut hors des endpoints `/publish` `/unpublish`).

`ValidationPipe` global (`apps/backend/src/main.ts`) avec `whitelist: true, forbidNonWhitelisted: true` reste actif.

### 5.2 Sanitization HTML (backend, source de vérité)

Tout `content` (page) ou `body` (bloc HTML) passe par `sanitizeRichText()` (`apps/backend/src/common/sanitize.ts`) **avant** persistance. Whitelist déjà calibrée : 27 tags safe (p, h2-h4, strong, em, ul, ol, li, blockquote, code, pre, a avec rel=noopener, img avec src whitelisté, table, etc.). Aucun script/iframe/form n'est jamais accepté en DB.

### 5.3 Rendu (frontend, defense in depth)

Côté Next.js, le HTML renvoyé par l'API (déjà sanitisé en DB) est passé une seconde fois dans `DOMPurify.sanitize(html, DOMPURIFY_CMS_CONFIG)` avant `dangerouslySetInnerHTML`. Config CMS dédiée : pas de `ADD_TAGS` permissifs ; les attributs ID sont autorisés pour les ancres (table des matières).

### 5.4 CSRF, rate limiting, audit

- CSRF : couvert par `SecFetchSiteGuard` global existant.
- Rate limit admin : `@UserThrottle({ limit: 30, ttl: 60_000 })` sur création/édition (anti-abus admin compromis).
- Rate limit public : `@UserThrottle({ limit: 120, ttl: 60_000 })` (génération de cache).
- Audit log obligatoire sur :
  - `CONTENT_PAGE_CREATED` (severity INFO)
  - `CONTENT_PAGE_UPDATED` (INFO, metadata = diff de titre/statut)
  - `CONTENT_PAGE_PUBLISHED` / `CONTENT_PAGE_UNPUBLISHED` (INFO)
  - `CONTENT_PAGE_DELETED` (WARN)
  - `CONTENT_PAGE_RESTORED` (INFO, metadata = version restaurée)
  - `CONTENT_BLOCK_UPDATED` (INFO)

## 6. Architecture frontend admin

### 6.1 Routes

- `/admin/content` — landing avec deux onglets (Pages / Blocs).
- `/admin/content/pages` — liste paginée.
- `/admin/content/pages/new` — création.
- `/admin/content/pages/[id]` — édition (formulaire + sidebar meta).
- `/admin/content/pages/[id]/revisions` — historique versions.
- `/admin/content/blocks` — liste blocs.
- `/admin/content/blocks/[id]` — édition bloc.

Insertion dans la sidebar admin : section **C · Content & Data** (cf. `docs/admin/HUB_TAXONOMY.md`), entrée « Pages CMS », icône `FileText`, `minRole: ADMIN`.

### 6.2 Composants réutilisés

| Concern          | Composant existant                                                               |
| ---------------- | -------------------------------------------------------------------------------- |
| Header de page   | `PageHeader hub="admin"` (`apps/frontend/src/components/layout/page-header.tsx`) |
| Liste tabulaire  | `DataTable` (`packages/ui/src/data-table.tsx`)                                   |
| Modale           | `Dialog`, `ConfirmDialog` (`packages/ui/src/dialog.tsx`)                         |
| Forms            | `react-hook-form` + `zodResolver`                                                |
| Toast            | `sonner`                                                                         |
| Skeleton / Empty | `SkeletonTable`, `EmptyState` (`packages/ui`)                                    |
| HTTP             | `api` axios instance (`apps/frontend/src/lib/api.ts`)                            |
| Éditeur          | `RichTextEditor` (`apps/frontend/src/components/editor/rich-text-editor.tsx`)    |

Aucune nouvelle dépendance npm n'est introduite.

### 6.3 UX d'édition

Layout deux colonnes :

- **Gauche (2/3)** : titre + slug + RichTextEditor + excerpt.
- **Droite (1/3)** : sidebar meta — statut (badge), locale, SEO title/description, dates, auteur, dernière modif, bouton « Voir les révisions », bouton primaire « Publier » / « Dépublier », bouton « Aperçu », bouton « Supprimer » (ConfirmDialog danger).

La sauvegarde est explicite (bouton « Enregistrer »). Pas d'auto-save en MVP (évite des révisions sur chaque keystroke). Un indicateur « non sauvegardé » apparaît si le formulaire est dirty.

### 6.4 Aperçu

`/page/[slug]?preview=<token>` côté public : si l'utilisateur est authentifié ADMIN et fournit le token de prévisualisation (cookie temporaire généré par le backend à la demande), le rendu inclut les DRAFT. Sinon 404.

## 7. Page Welcome dynamique

La page `/welcome` (`apps/frontend/src/app/(public)/welcome/page.tsx`) est refactorée en **Server Component** qui pré-fetch les blocs nécessaires :

```ts
const blocks = await getContentBlocks(
  [
    "welcome.hero.title",
    "welcome.hero.subtitle",
    "welcome.hero.cta",
    "welcome.steps", // data: array of { title, body }
    "welcome.services", // data: array of { icon, title, body, href }
    "welcome.faq", // data: array of { question, answer }
    "welcome.trust", // data: array of commitments
  ],
  locale,
);
```

Chaque section accepte un `block` typé et un fallback hardcodé (cas où le bloc n'existe pas ou est en DRAFT). À la publication d'un bloc `welcome.*`, le service `ContentBlockService.publish()` appelle `revalidatePath('/welcome')` (Next.js on-demand revalidation).

Le seeder Prisma (`packages/database/prisma/seed-cms.ts`) charge le contenu actuel de la page Welcome en DB comme état initial, sans casser le rendu si la DB est fraîche (les fallbacks tiennent).

## 8. Stratégie de cache

- **Server-side** : `unstable_cache` Next.js par clé `cms:pages:<locale>:<slug>` et `cms:blocks:<locale>:<keys-sorted-hash>`, TTL 5 min, tag `cms` pour invalidation en masse.
- **HTTP** : `Cache-Control: private, max-age=300, stale-while-revalidate=3600` sur routes publiques.
- **Invalidation** : à chaque mutation publishe/unpublish/delete, le backend émet un event que le frontend consomme via `revalidateTag('cms')` (BFF) **ou** via un endpoint `/api/cms/revalidate` protégé par secret partagé.

Choix MVP : on commence avec `revalidatePath()` direct dans une action serveur côté Next, sans BFF dédié. Si le couplage devient gênant, on basculera vers un mécanisme événementiel.

## 9. Tests

| Niveau              | Cible                                                                                                      | Outils                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| Unit backend        | `ContentService` (slug unique, sanitization, revision, soft delete, publish workflow)                      | Jest, mock Prisma        |
| Unit backend        | `ContentController` RBAC, pagination, codes HTTP                                                           | Jest, `Reflector`        |
| Integration backend | DB réelle via Prisma test schema                                                                           | Jest + supertest         |
| Unit frontend       | Page admin liste : filtres, recherche, pagination, ConfirmDialog                                           | Vitest + Testing Library |
| Unit frontend       | Page édition : RHF + Zod, dirty state, save/publish                                                        | Vitest                   |
| E2E                 | Login admin → créer page → éditer → publier → vérifier rendu public sanitisé                               | Playwright               |
| E2E                 | Login COLLABORATEUR → accès `/admin/content/*` refusé (403/redirect)                                       | Playwright               |
| E2E                 | XSS payload `<script>alert(1)</script>` dans contenu → vérifie qu'il est strip à la sauvegarde et au rendu | Playwright               |
| A11y                | Pages `/admin/content/*` audit pa11y                                                                       | pa11y-ci                 |

Cible de couverture : ≥ 80 % sur `apps/backend/src/content/` (cohérent avec les modules existants).

## 10. Migrations Prisma

Une seule migration : `20260518_add_content_cms` qui crée :

- table `ContentPage` (+ FK author, updatedBy)
- table `ContentRevision` (+ FK page, author, ON DELETE CASCADE)
- table `ContentBlock` (+ FK updatedBy)
- enum `ContentStatus`
- indexes définis ci-dessus

Pas de modification de tables existantes. Rollback : `DROP TABLE` cascade des 3 tables + enum. Aucune donnée existante perdue.

## 11. Plan d'exécution

| Phase | Livrable                                                                                              | Estimation | Dépendances  |
| ----- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------ |
| 4A    | Backend (schema, migration, module content, controller, service, repository, DTOs, audit, tests unit) | grosse     | —            |
| 4B    | UI admin (routes /admin/content/\*, liste, édition, publication, historique, sidebar entry)           | grosse     | 4A           |
| 4C    | Refacto page Welcome dynamique + seeder blocs initiaux                                                | moyenne    | 4A           |
| 5     | Tests intégration + E2E                                                                               | moyenne    | 4A + 4B + 4C |
| 6     | Hardening (audit pa11y, perf, indexes review, XSS pen test)                                           | petite     | 5            |
| 7     | Documentation (admin guide, dev guide, architecture déjà fait)                                        | petite     | 6            |
| 8     | Préparation PR                                                                                        | petite     | 7            |

Les commits suivent la convention `feat(cms):`, `test(cms):`, `docs(cms):`, etc.

## 12. Hors scope explicite

- Multi-tenant / visibilité par département (réserve V2).
- Scheduled publishing (date de publication future).
- Workflow de relecture (REVIEWER → ADMIN approve).
- Internationalisation automatique (traduction d'un contenu fr vers en).
- Upload direct dans l'éditeur — passage par le picker `media` existant.
- Module `Wiki` / `News` : déjà couvert ailleurs, non touché.
