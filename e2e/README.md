# Tests E2E de l’intranet

Deux profils distinguent la vérification visuelle locale et les parcours métier réels.

## UI locale avec API simulée

```bash
corepack pnpm exec playwright test --config playwright.ui.config.ts
```

Ce profil démarre son propre serveur Next sur `127.0.0.1:17691`, avec un cache
`.next-ui-qa` séparé, et une mini API en lecture seule sur `127.0.0.1:17692`
pour les rendus serveur. Chaque navigateur utilise une session vierge et des données
fictives `example.test` explicitement réservées aux tests. Les appels API sont
interceptés ; les écritures non prévues échouent et les origines externes sont
bloquées. Aucun backend, compte réel ou base de données n’est nécessaire.

Les captures bureau/mobile sont sous `test-results/ui/`. Ce profil vérifie
l’affichage, les filtres, la confirmation d’un refus et le traitement d’un
conflit. Il ne prouve pas le fonctionnement du moteur d’approbation ou des
notifications sur une vraie base.

La CI exécute ce profil dans le job distinct **UI navigateur avec mocks**.
En local, utiliser le Chromium correspondant à Playwright ; un binaire déjà
installé peut être sélectionné par `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

## Parcours métier avec services réels et base jetable

Le workflow `.github/workflows/e2e.yml` démarre PostgreSQL 16.16, Redis et
Meilisearch. Il génère ses propres secrets de session, trois mots de passe
fictifs et un secret TOTP, puis crée des comptes `@e2e.local` distincts pour
SUPER_ADMIN, ADMIN et COLLABORATEUR. Les comptes ont un MFA réellement actif.
Les helpers soumettent un mot de passe et un OTP valides au backend, contrôlent
l’identité et le rôle via `/auth/me` puis conservent uniquement les cookies
émis par ce backend. Un challenge MFA partiel échoue explicitement.

La base est initialisée par `packages/database/prisma/seed-e2e.ts` : ce script
refuse un autre mode que `NODE_ENV=test` avec `E2E_EPHEMERAL_DATABASE=1`, un
hôte hors loopback, un nom de base hors `omnitech_e2e[_...]`, un rôle hors
e2e/test ou une base contenant déjà des tables. Il vérifie également l’identité
renvoyée par PostgreSQL avant le bootstrap. Aucun reset, force-reset ni
`--accept-data-loss` n’est utilisé.

Les migrations historiques étant incomplètes pour une base vierge, ce
bootstrap jetable utilise `prisma db push --skip-generate`. Cette solution
n’altère pas les migrations de production et ne prouve pas leur capacité à
reconstruire le schéma. Les extensions/index raw SQL optionnels ne sont pas
qualifiés par ce bootstrap ; les contrôles PostgreSQL/pgvector ont leur harnais
séparé.

### Origine unique et démarrage

Le navigateur utilise `BASE_URL` et `E2E_API_URL` sur la même origine locale.
`scripts/e2e/proxy.mjs` route `/api/*` vers le vrai backend, les pages vers le
vrai frontend et les upgrades Socket.IO vers le backend. Il transmet les
réponses et cookies sans simuler l’authentification. Les origines internes et
publiques doivent être trois origines HTTP loopback distinctes avec ports
explicites. La CSP, ses nonces et le script-src restent ceux de l’application.

`scripts/e2e/wait-ready.ts` exige un vrai état `db: up` du backend et une
réponse HTML Next.js du frontend/proxy. Le démarrage échoue si le processus
s’arrête ou si le délai expire. Une boucle terminée sans résultat ne permet
pas de poursuivre les tests.

La CI utilise un worker pour limiter les collisions de fixtures. Les sessions
de rôle évitent de répéter les connexions ; un 429 doit respecter le délai du
serveur, sans relever la limite ni fabriquer d’adresse de proxy. Les OTP sont
générés à partir du secret fictif explicite ; les appels évitent la dernière
fraction de leur fenêtre de validité.

### Commandes et variables

Après avoir préparé les services jetables, les variables et le stockage de
test conformément au workflow (Python 3 est requis pour inspecter l’archive
ZIP d’export personnel avec sa bibliothèque standard) :

```bash
corepack pnpm --filter @omnitech/database exec prisma generate
corepack pnpm --filter @omnitech/frontend exec tsc --project ../../tsconfig.e2e.json
corepack pnpm --filter @omnitech/database exec tsx prisma/seed-e2e.ts
corepack pnpm exec playwright test --project=chromium
```

| Variable | Usage |
|---|---|
| `DATABASE_URL` | PostgreSQL jetable loopback avec rôle e2e/test et base omnitech_e2e[_...] |
| `E2E_EPHEMERAL_DATABASE=1`, `NODE_ENV=test` | Autorisation explicite du bootstrap jetable |
| `BASE_URL` | Origine publique locale du proxy ; défaut général localhost:3001 |
| `E2E_API_URL` | API sous la même origine que le proxy, avec suffixe /api/v1 |
| `E2E_FRONTEND_INTERNAL_URL`, `E2E_BACKEND_INTERNAL_URL` | Origines loopback des deux vrais services |
| `E2E_ADMIN_EMAIL/PASSWORD` | Compte ADMIN fictif dédié |
| `E2E_COLLAB_EMAIL/PASSWORD` | Compte COLLABORATEUR fictif dédié |
| `E2E_SUPER_ADMIN_EMAIL/PASSWORD` | Compte SUPER_ADMIN fictif distinct |
| `E2E_TOTP_SECRET` | Secret Base32 fictif utilisé lors du seed et des connexions |
| `E2E_<ROLE>_TOTP_SECRET` | Secret TOTP propre au rôle si la fixture le demande |
| `STORAGE_PATH` | Chemin absolu `<checkout>/.e2e-runtime/storage`, vide avant bootstrap, sans lien symbolique |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Secrets éphémères du vrai backend de test |
| `REDIS_HOST/PORT`, `MEILISEARCH_URL/MASTER_KEY` | Coordonnées des services de test |
| `RUN_DESTRUCTIVE=1` | Scénarios d’écriture supplémentaires, sur base jetable seulement |
| `E2E_SKIP_LOGIN=1` | État vide réservé aux parcours publics ; ne valide aucun MFA |

**Les suites peuvent écrire des données, publier des pages ou demander un
mot de passe oublié même sans `RUN_DESTRUCTIVE`.** Toute la suite nécessite
une instance isolée et des identités fictives. Les services SMTP, SMS, LDAP,
SharePoint et LLM ne doivent avoir aucune connexion ni clé de production.

Le garde `helpers/test-environment.ts` refuse les trois adresses de production
connues (`10.33.120.55`, `bx-it-intranet-vm.omnitech.security`,
`intranet.omnitech-security.fr`), tout port et les alias IPv4 canoniques. Il
vérifie aussi les `NEXT_PUBLIC_*_URL` des fichiers `.env`. Le garde navigateur
reste actif. Ces contrôles ne remplacent pas l’isolation réseau.

`global-setup.ts` vide les anciens états avant la connexion ; les fichiers
`.auth/*.json` sont privés, ignorés par Git et ne doivent pas être publiés.
Les préférences de langue des navigateurs sont fixées au français ; elles ne
remplacent pas l’authentification. Les service workers restent bloqués dans le
profil général afin de conserver l’interception réseau. Les vrais parcours
PWA/offline nécessitent une qualification séparée.

Le scénario FreshMFA utilise une nouvelle session réellement authentifiée.
Un helper limité à la base loopback jetable, à un compte fictif et au marqueur
`e2e.fixture=synthetic-only` vieillit uniquement cette session, puis demande
au vrai serveur de renouveler ses cookies. Le test vérifie le code précis
`MFA_REVALIDATION_REQUIRED`, un nouvel OTP et le retour à la page d’origine.
Il ne fabrique aucun JWT et ne change pas l’horloge ou le garde du backend.

Les préférences locales désactivent le tour de présentation et les astuces
temporaires pour stabiliser les parcours d’un utilisateur habitué. Elles ne
complètent ni l’authentification ni une formalité côté serveur. Le tour de
première connexion n’est pas qualifié par ces scénarios.

Le RAG est désactivé dans cette recette : l’ouverture du dialogue est testée,
ses réponses et leurs actions restent ignorées explicitement. Les anciens
tests Push simulent les API du navigateur et ne prouvent pas une livraison
Web Push réelle. Les scénarios marqués destructifs restent optionnels ; lire
leurs annotations avant d’interpréter le résultat global.

Le contrôle axe existant bloque les violations `serious` et `critical` de sa
configuration. Il conserve ses exclusions historiques `color-contrast` et
`region` ; les violations modérées/mineures sont rapportées. Un succès ne
constitue pas un audit WCAG complet ni une certification d’accessibilité.

## Validation avant livraison

- Vérifier les étapes séquentielles/parallèles, les délégations et les rôles.
- Tester deux décisions concurrentes : une seule doit être appliquée.
- Confirmer motif du refus, relance quotidienne, escalade et audit.
- Vérifier une version remplacée/supprimée et un fichier non sain : aucune publication.
- Tester le parcours GED complet et les notifications sur une vraie base de test.
- Relire les tests ignorés : un scénario ignoré ne constitue pas une couverture.

Les rapports, captures et traces sont sous `playwright-report/` et
`test-results/`, ignorés par Git. Ne pas y utiliser de données réelles.
