# Changelog OMNITECH Intranet

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versionnement sémantique.

## [Non publié] — 2026-05-18

Module CMS interne (branche `feature/admin-content-management`) : gestion de
pages éditoriales statiques et de blocs réutilisables sans redéploiement.

### Ajouté

#### Backend (NestJS) — module `apps/backend/src/content/`

- **3 modèles Prisma** (migration `20260518100000_add_cms_content`) :
  `ContentPage`, `ContentRevision`, `ContentBlock` + enum `ContentStatus`.
- **ContentService** : sanitization HTML via `sanitizeRichText`, slug unique
  via `generateUniqueSlug`, versioning automatique à chaque update, endpoints
  dédiés publish/unpublish, restauration de révision avec snapshot préalable,
  audit logs sur toutes les mutations (severity WARN sur DELETE).
- **Routes admin** `/api/v1/admin/content/*` (`@Roles(ADMIN, SUPER_ADMIN)`,
  `@UserThrottle` 30 créations/min, 60–120 patches/min).
- **Routes publiques** `/api/v1/content/pages/:slug` (auth) et
  `/api/v1/content/blocks?keys=` (`@Public()` car consommé par `/welcome`
  avant login). Header `Cache-Control: private, max-age=300, stale-while-revalidate=3600`.

#### Frontend (Next.js 15) — UI admin + Welcome dynamique

- Routes `/admin/content` (landing), `/admin/content/pages` (liste + édition
  avec RichTextEditor + sidebar SEO/statut/historique), `/admin/content/blocks`
  (liste + création dialog + édition avec champ JSON validé).
- Sidebar : entrée « Pages CMS » en section _Contenus & animation_.
- Hub admin landing : carte « Pages CMS » en section _C — Content & Data_.
- Page Welcome refactorée en Server Component pré-fetchant 6 blocs CMS avec
  fallback hardcodé garantissant le rendu même DB vide.
- Endpoint `/api/cms/revalidate` (secret partagé) pour invalider le cache à
  la publication d'un bloc.

#### Outils & seeder

- `packages/database/prisma/seed-cms.ts` (idempotent, 6 blocs Welcome).
  `pnpm --filter @omnitech/database run seed-cms`.
- Variable `CMS_REVALIDATE_SECRET` documentée dans `.env.example`.

#### Documentation

- `docs/cms/architecture.md` (modèle, APIs, RBAC, sanitization, cache, scope).
- `docs/cms/admin-guide.md` (workflow, troubleshooting, rôles, limites MVP).
- `docs/cms/developer-guide.md` (conventions clés, helpers, extension, migrations).

#### Tests

- 84 tests Jest unit backend (ContentService, controllers, RBAC).
- 19 tests Jest `common/sanitize.spec.ts` (suite XSS OWASP paramétrée).
- 7 tests Vitest frontend (`cms.test.ts` helpers).
- `e2e/cms-content.spec.ts` Playwright (CRUD + XSS strip + RBAC gated).

### Notes ISO 27001

- **A.5.33** : `actorSnapshot` capturé automatiquement dans `metadata`.
- **A.8.28** : sanitization HTML en deux passes (backend `sanitize-html` +
  frontend `DOMPurify` defense in depth).

---

## [Non publié] — 2026-04-13

Session majeure de migration vers HTTPS publique derrière BunkerWeb (WAF),
intégration OnlyOffice Document Server + Stirling PDF en sous-domaines
dédiés, et déploiement d'un premier batch de fonctionnalités d'enrichissement.

### Ajouté

#### Infrastructure & reverse proxy

- **Sous-domaines dédiés** `office.omnitech-security.fr` et `stirling.omnitech-security.fr`
  derrière BunkerWeb, avec certificats Let's Encrypt automatiques.
- **Fichier `infra/bunkerweb.env`** : template de référence multisite pour la
  configuration BunkerWeb (reverse proxy + WAF + géo-filtrage + HSTS).
- **Mode kiosque plein écran** `/kiosk?interval=15` pour les écrans muraux de
  salle de pause (ISO 27001 A.5.13), rotation news → veille → indicateurs SMSI,
  horloge + météo en header. Route publique rate-limitée.
- **Endpoints backend `/api/kiosk/*`** (news, veille, stats) publics et
  sanitisés, 30 req/min par IP.
- **Scaffolding Rocket.Chat Community Edition** dans `infra/rocketchat-compose.yml`
  (MongoDB replSet + rocketchat 7.0) et page intranet `/chat` (iframe embed avec
  détection d'état) pour messagerie self-hosted future.

#### Backend (NestJS)

- **Module `exports/`** : génération de PDF signés via `pdf-lib` avec SHA-256
  du contenu, UUID d'export, horodatage ISO, métadonnées PDF et pied de page
  détaillé pour traçabilité audit (ISO 27001). Endpoint `POST /api/exports/pdf`.
- **Module `mentions/`** : service `MentionsService` qui extrait les mentions
  `@username` d'un texte (via parser regex, ignorant blocs code markdown et
  emails), résout les handles vers les utilisateurs actifs via leur email
  local-part ou `firstname.lastname`, et crée des notifications. Exporté et
  injectable dans n'importe quel service.
  - Branché sur `TicketsService.addComment` (commentaires non-internes).
  - Branché sur `NewsService.create` (posts publiés, parsing titre + excerpt
    - contenu plain-text).
- **Module `kiosk/`** : controller avec 3 endpoints publics rate-limités pour
  l'affichage mural (`news`, `veille`, `stats`).
- **Instrumentation OnlyOffice** : logs détaillés sur `/api/office/file`
  (GET origin, IP client, user-agent, état du token, nom du fichier,
  content-type) pour tracer les tentatives de téléchargement par le Docs
  Server.
- **`OfficeService.dropSession(key)`** : nouvelle méthode qui force OnlyOffice
  Docs à dropper une session en cache via CommandService (`c: "drop"`), utile
  avant réouverture pour éviter les restaurations de sessions fantômes.
- **Clé OnlyOffice unique par ouverture** (nonce `crypto.randomBytes(6).hex`)
  remplaçant le bucket temporel de 10 min, empêchant toute réutilisation d'une
  session Docs Server précédemment corrompue.
- **Stirling : séparation URL interne / URL publique**. Nouveau service
  `getPublicUrl()` et variable `STIRLING_PDF_PUBLIC_URL` pour exposer au
  navigateur une URL HTTPS distincte de l'URL backend `localhost:8080`.

#### Frontend (Next.js)

- **Widget « Pages récentes »** sur le dashboard (hook `useRecentPages` +
  `useTrackPageVisit` branché dans `AuthProvider`, persistance localStorage,
  8 dernières pages avec timestamps relatifs, blocklist des routes sensibles).
- **Widget météo enrichi** : prévisions 3 jours + lien vers le trafic régional
  (Sytadin pour Paris, InfoRoute pour PACA, Bison Futé pour Bordeaux).
- **Librairie `lib/export-csv.ts`** : export CSV RFC 4180 (séparateur `;`,
  échappement correct, BOM UTF-8 pour compatibilité Excel).
- **Composant `ExportButton`** générique, à brancher sur n'importe quelle liste
  via une config de colonnes. Indique le nombre de lignes, désactivé quand vide,
  nom de fichier horodaté automatique.
  - Branché sur : `/tickets`, `/incidents`, `/admin/chartes`,
    `/admin/external-access`, `/admin/access-reviews`.
- **Librairie `lib/export-pdf.ts`** : helper `generateSignedPdf()` qui appelle
  l'endpoint backend et déclenche le téléchargement client-side.
- **Composant `PdfExportButton`** : bouton générique de génération PDF signé
  avec toast de succès affichant l'ID d'export et les premiers caractères du
  hash SHA-256 pour preuve immédiate.
  - Branché sur `/admin/access-reviews` (procès-verbal ISO A.5.18).
- **Outil admin `/admin/dark-mode-audit`** : audit automatique du thème sombre
  sur 29 pages via iframe cachée, détection des éléments à fond clair
  (luminance > 0.9) sans classe `dark:`, export CSV des trouvailles pour
  prioriser les fixes.
- **Page `/chat`** : embed iframe Rocket.Chat avec détection d'état
  (non-configuré / injoignable / prêt), prête à recevoir l'URL via
  `NEXT_PUBLIC_CHAT_URL`.
- **Panneau de diagnostic DOM en direct** dans l'éditeur OnlyOffice : affiche
  les dimensions réelles du placeholder, de l'iframe et du canvas interne,
  rafraîchies toutes les 500 ms tant que l'éditeur n'est pas monté, avec
  guide d'interprétation intégré.

### Modifié

#### Sécurité & production

- **`NODE_ENV=production`** généralisé, avec `CORS_ORIGINS` strict
  (`https://intranet.omnitech-security.fr`), rejet explicite des origines
  non listées en prod dans `main.ts` au lieu du `callback(null, true)`
  silencieux.
- **`trust proxy` activé** sur Express via env var `TRUST_PROXY` (défaut
  conservateur `loopback, linklocal, uniquelocal`), pour que `req.ip` reflète
  l'IP client réelle derrière BunkerWeb.
- **CSP (helmet)** : suppression de `ws:` dans `connect-src` (prod = `wss:`
  uniquement).
- **Service worker v7** : stratégie network-first sur les navigations de
  pages (plus de HTML obsolète qui référence d'anciens chunks Next.js), cache
  dédié `omnitech-static-v7`, notification aux onglets ouverts via message
  `SW_UPDATED` quand la nouvelle version prend la main.
- **Layout racine** : handler global `window.addEventListener('error')` qui
  détecte `ChunkLoadError`, désenregistre tous les service workers, purge
  les caches et recharge automatiquement la page (recovery silencieux après
  déploiement).
- **Systemd `omnitech-frontend.service`** : passage de `next dev` à
  `next start` + `NODE_ENV=production`.

#### Configuration

- **Docker Compose prod** : ports backend/frontend/onlyoffice publiés sur
  `${DOCKER_BIND_IP:-127.0.0.1}` (binding LAN restreint pour BunkerWeb),
  suppression du service `nginx` interne (remplacé par BunkerWeb frontal).
- **`.env` prod** :
  - `DOCKER_BIND_IP=10.33.120.55`
  - `TRUST_PROXY=10.33.0.0/16`
  - `ONLYOFFICE_DOCUMENT_SERVER_URL=https://office.omnitech-security.fr`
  - `ONLYOFFICE_INTERNAL_URL=http://10.33.120.55:3000` (LAN IP au lieu de
    `host.docker.internal`, résolvable depuis l'hôte ET le conteneur Docs)
  - `ONLYOFFICE_ALLOW_UNSIGNED=true` (cohérent avec `JWT_ENABLED=false` côté
    conteneur onlyoffice-ds)
  - `STIRLING_PDF_PUBLIC_URL=https://stirling.omnitech-security.fr`
- **`apps/frontend/next.config.js`** : `eslint.ignoreDuringBuilds=true`
  (ESLint doit tourner en CI, pas en build), suppression de l'option
  dépréciée `experimental.missingSuspenseWithCSRBailout`.
- **Dockerfile.backend** : fix `COPY ... tsconfig.json` → `tsconfig.base.json`.
- **Page racine `/`** : suppression du splash artificiel 400 ms + animation
  de fade-out, redirection immédiate vers `/dashboard` ou `/welcome`. Fin du
  « doublon de présentation » observé par les utilisateurs.

#### OnlyOffice (frontend éditeur)

- **Validation stricte de la config** avant `new DocsAPI.DocEditor()` :
  vérification de la présence du placeholder DOM, de `cfg.config.document.url`,
  `key`, `fileType`, `documentType`. Messages d'erreur actionnables au lieu
  du cryptique minifié « t is null ».
- **Gestion robuste du chargement api.js** : vérification post-load que
  `window.DocsAPI.DocEditor` est bien défini (évite les faux positifs quand un
  404 HTML est servi comme JS), détection de mixed content HTTPS/HTTP avec
  message explicite.
- **Gestion des réponses `data: null`** depuis l'intercepteur axios
  (qui avale silencieusement 403/429 sur GET) : messages distincts pour
  « Accès refusé », « Trop de requêtes », et « Configuration manquante ».

#### Corrections mineures

- **`helpdesk.service.ts`** : FAQ statique `http://10.33.120.55:3001` →
  `https://intranet.omnitech-security.fr`.
- **`admin/ad-audit/page.tsx`** : instruction PowerShell `http://10.33.120.55:3000/api`
  → `https://intranet.omnitech-security.fr/api`.
- **`apps/frontend/.env.local`** : `NEXT_PUBLIC_DOCUSEAL_URL` ajouté
  (placeholder à remapper quand la route BunkerWeb sera en place).

### Corrigé

- **Bug « t is null » OnlyOffice** : cause racine identifiée dans
  `api.ts:91-93` (intercepteur axios transforme silencieusement les 403/429
  en `{ data: null }`) combinée au `ForbiddenException` lancé par
  `office.service.ts:265-272` quand `ONLYOFFICE_JWT_SECRET` était vide sans
  `ONLYOFFICE_ALLOW_UNSIGNED=true`. Les deux correctifs ont été appliqués
  (env + null-check explicite côté éditeur).
- **Bug « restored old session »** OnlyOffice : la clé Docs Server était
  basée sur un timestamp 10 min, ce qui faisait qu'une session corrompue
  (ex: pendant un redémarrage backend avec `ECONNREFUSED`) était réutilisée
  par la prochaine ouverture dans la même fenêtre. Nouvelle clé 100% unique
  par ouverture via nonce cryptographique.
- **Bug CSP `frame-ancestors`** : BunkerWeb bloquait l'iframe OnlyOffice et
  Stirling par défaut avec `frame-ancestors 'self'`. Override via
  `office.omnitech-security.fr_CONTENT_SECURITY_POLICY` et
  `stirling.omnitech-security.fr_CONTENT_SECURITY_POLICY` pour autoriser
  l'intranet comme origine d'embed.
- **Bug chunks Next.js 404 après déploiement** (`ChunkLoadError: Loading
chunk 9734 failed`) : le service worker en cache-first servait un HTML
  référençant des hashes de chunks qui n'existaient plus après rebuild.
  Nouveau SW v7 passe en network-first sur les navigations, et un handler
  global dans `layout.tsx` capture l'erreur à l'exécution, purge tous les
  caches et recharge automatiquement.
- **Bug diagnose OnlyOffice faux négatif** : le `healthcheck` utilisait
  `host.docker.internal` qui ne résout pas depuis le processus backend
  natif (DNS Docker-only). Remplacé par l'IP LAN `10.33.120.55` résolvable
  des deux côtés.
- **Bug `ts build` backend** : chemin `tsconfig.json` inexistant dans
  `docker/Dockerfile.backend` (le projet utilise `tsconfig.base.json`).

### Sécurité

- Routes `kiosk/*` et `exports/pdf` ajoutent des rate limits stricts
  (30 req/min/IP pour kiosk, via `@Throttle`).
- Cookies `HttpOnly` + `SameSite=Lax` + `Secure` auto (via
  `intranet.omnitech-security.fr_COOKIE_FLAGS`).
- HSTS `max-age=31536000; includeSubDomains` via helmet.
- Mode BunkerWeb `detect` (logs uniquement) — à passer en `block` après
  calibration des seuils.

### Connu / à suivre

- **Éditeur OnlyOffice — canvas vide** : le fichier est bien téléchargé
  (logs `[office/file] streaming ...` confirmés côté backend, converter
  génère bien un `Editor.bin` de 600 Ko côté conteneur), mais le rendu
  client reste vide. Les warnings console Firefox (`Feature Policy
ignored`, source map 404) sont cosmétiques. Le panneau de diagnostic
  DOM en direct ajouté dans cette session permettra d'identifier si le
  problème est CSS (dimensions du placeholder), JS (iframe non montée),
  ou rendu interne OnlyOffice (canvas 0×0 dans l'iframe).
- **Chat Rocket.Chat** : compose fourni, à déployer. LDAP à configurer via
  l'UI admin Rocket.Chat après premier démarrage, route BunkerWeb
  `chat.omnitech-security.fr` à ajouter.
- **Mentions** : branché sur tickets + news. À étendre sur wiki comments,
  incidents timeline, chartes, et (optionnel) documents workflow.
- **Export CSV** : branché sur 4 pages. À étendre sur notifications,
  compliance, saved-filters, onboarding.
- **Export PDF signé** : branché sur access-reviews. À étendre sur
  incidents (rapport post-mortem), compliance (rapport de maturité),
  chartes (récépissé de signature horodaté).

### Prochains chantiers planifiés

- **#1 Recherche globale fédérée** (Meilisearch) — big, session dédiée.
- **#6 Workflow d'approbation configurable** — big, migration Prisma
  (`ApprovalWorkflow`, `WorkflowStep`, `ApprovalInstance`).
- **#9 DocuSeal étendu** — workflow automatique sur chartes + politiques.
- **#20 Recherche `Ctrl+K` AI/RAG** — big, nécessite provider LLM +
  vector store (pgvector ou Qdrant).
- **#22 SMS fallback** — choix Twilio vs OVH + module notifications.
- **#3 Open in OnlyOffice depuis SMB** — integration fileserver +
  session éphémère OnlyOffice.

---

## [1.0.0] — date à définir (premier tag versionné)

Version initiale en production. Le détail des fonctionnalités antérieures
à la session du 2026-04-13 n'est pas listé ici — ce CHANGELOG démarre à
partir de la session de migration HTTPS/BunkerWeb. Les futures entrées
suivront le format Keep a Changelog.
