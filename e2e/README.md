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

## Parcours métier sur une instance isolée

Le défaut est **localhost**, jamais la VM de production. Démarrer séparément
le frontend et le backend de test, avec leur base et leur messagerie isolées.

```bash
# Définir les identifiants dans l’environnement de test ; aucun défaut embarqué.
# E2E_ADMIN_EMAIL et E2E_ADMIN_PASSWORD : compte de test dédié.
BASE_URL=http://localhost:3001 E2E_API_URL=http://localhost:3000/api/v1 \
  corepack pnpm exec playwright test --project=chromium

# Parcours publics seulement, sans connexion globale :
E2E_SKIP_LOGIN=1 corepack pnpm exec playwright test --project=unauthenticated
```

| Variable | Défaut | Usage |
|---|---|---|
| `BASE_URL` | `http://localhost:3001` | Frontend de test |
| `E2E_API_URL` | `http://localhost:3000/api/v1` | API de test |
| `API_BASE_URL`, `E2E_API_BASE_URL` | Aucun | Alias validés si fournis |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | Aucun | Connexion globale fraîche |
| `E2E_COLLAB_EMAIL`, `E2E_COLLAB_PASSWORD` | Aucun | Parcours collaborateur |
| `E2E_SUPER_ADMIN_EMAIL`, `E2E_SUPER_ADMIN_PASSWORD` | Aucun | Super administrateur dédié, sinon compte admin explicite |
| `E2E_SKIP_LOGIN=1` | Désactivé | Écrit un état vide, destiné aux tests publics |
| `RUN_DESTRUCTIVE=1` | Désactivé | Active certains scénarios d’écriture supplémentaires |
| `CI` | Aucun | Interdit `test.only`, active une nouvelle tentative |

**Les suites métier peuvent envoyer des requêtes de connexion, de mot de passe
oublié ou d’autres écritures même sans `RUN_DESTRUCTIVE`.** Une instance de test
isolée est donc requise pour toute la suite. Aucun seed/nettoyage automatique ne
rend une base de production utilisable pour ces scénarios.

Le garde `helpers/test-environment.ts` refuse les trois adresses de production
connues (`10.33.120.55`, `bx-it-intranet-vm.omnitech.security`,
`intranet.omnitech-security.fr`), tout port et les alias IPv4 canoniques.
Il contrôle aussi les URL d’API et les `NEXT_PUBLIC_*_URL` des fichiers `.env`
locaux : un frontend localhost peut sinon contenir une API de production dans
son bundle. `helpers/safe-test.ts` bloque également ces requêtes dans le
navigateur. Importer `test` depuis ce helper pour toute nouvelle spécification.
Ces contrôles ne remplacent pas l’isolation réseau de l’environnement de test.

`global-setup.ts` efface l’ancien état avant de vérifier les identifiants. Un
échec de connexion échoue explicitement ; une authentification MFA partielle
n’est pas considérée comme une session valide. `.auth/admin.json` reste privé,
ignoré par Git, et n’est jamais utilisé par le profil UI simulé.

Les service workers sont bloqués dans le profil général afin de permettre
l’interception réseau fiable. Les scénarios PWA/offline nécessitent un profil
dédié dans la préproduction isolée ; ne pas interpréter leur simple présence
dans la suite comme une preuve de validation.

## Validation avant livraison

- Vérifier les étapes séquentielles/parallèles, les délégations et les rôles.
- Tester deux décisions concurrentes : une seule doit être appliquée.
- Confirmer motif du refus, relance quotidienne, escalade et audit.
- Vérifier une version remplacée/supprimée et un fichier non sain : aucune publication.
- Tester le parcours GED complet et les notifications sur une vraie base de test.
- Relire les tests ignorés : un scénario ignoré ne constitue pas une couverture.

Les rapports, captures et traces sont sous `playwright-report/` et
`test-results/`, ignorés par Git. Ne pas y utiliser de données réelles.
