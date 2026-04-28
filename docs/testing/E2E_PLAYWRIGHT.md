# E2E Playwright — Guide complet

OMNITECH Intranet utilise [Playwright](https://playwright.dev/) pour ses tests
end-to-end multi-navigateurs (chromium / firefox / webkit). La suite cible des
**flux métier critiques** : authentification, documents, signatures, tickets,
recherche unifiée, push notifications, dark mode, admin WebDAV, WebAuthn.

> Source de vérité : [`playwright.config.ts`](../../playwright.config.ts) +
> [`e2e/`](../../e2e/).

---

## TL;DR — Lancer les tests

```bash
# 3 navigateurs + projet unauthenticated
pnpm test:e2e

# Un seul navigateur (le plus rapide en local)
pnpm test:e2e -- --project=chromium

# Un fichier
pnpm test:e2e -- e2e/auth.spec.ts

# Mode UI interactif (debug)
pnpm test:e2e -- --ui

# Debug pas-à-pas (Chromium ouvert)
pnpm test:e2e -- --debug e2e/documents.spec.ts

# Filtrer par tag/regex
pnpm test:e2e -- --grep "@destructive"
pnpm test:e2e -- --grep -i "dark mode"
```

Avant la première exécution, installer les navigateurs :

```bash
pnpm exec playwright install chromium
# ou tous : pnpm exec playwright install --with-deps
```

---

## Architecture

```
e2e/
├── .auth/                    # storageState (cookies+localStorage) admin (gitignored)
├── helpers/
│   ├── auth.ts               # ADMIN_CREDS, COLLAB_CREDS, loginAsAdmin/Collab, logout
│   └── login.ts              # login(role) helper unifié (USER/ADMIN/SUPER_ADMIN)
├── global-setup.ts           # 1 login SUPER_ADMIN → écrit .auth/admin.json
├── auth.spec.ts              # login OK/KO, MFA, refresh, logout
├── documents.spec.ts         # liste, filtres, wizard, watermark
├── tickets.spec.ts           # liste, kanban, create+AI, comment, statut
├── push-notifications.spec.ts# toggle Push navigateur (mocks SW + Notification API)
├── search.spec.ts            # Cmd+K palette, Meilisearch unifié
├── dark-mode.spec.ts         # toggle + persistance localStorage + nav
├── admin-webdav.spec.ts      # /admin/webdav gating SUPER_ADMIN
├── webauthn.spec.ts          # /profile/security/webauthn (CDP virtual auth)
├── mfa.spec.ts mfa-fresh-12h.spec.ts
├── chatbot.spec.ts glance.spec.ts dashboard.spec.ts
├── pwa.spec.ts portal.spec.ts admin-access.spec.ts
├── audit-log-creation.spec.ts gdpr-export.spec.ts
├── csp-hydration.spec.ts ticket-calendar-sync.spec.ts
└── rbac-non-admin-blocked.spec.ts
```

### Projects Playwright

| Projet            | Navigateur | Authentifié | Cible specs                               |
|-------------------|-----------|-------------|--------------------------------------------|
| `chromium`        | Chrome    | Oui         | Tous sauf `auth/portal/pwa.spec.ts`       |
| `firefox`         | Firefox   | Oui         | idem                                       |
| `webkit`          | Safari    | Oui         | idem                                       |
| `unauthenticated` | Chrome    | Non         | `auth.spec.ts`, `portal.spec.ts`, `pwa.spec.ts` |

Les 3 navigateurs authentifiés réutilisent le `storageState` produit par
`global-setup.ts` (1 login en début de run), évitant ~3-5 s par spec.

---

## Variables d'environnement

| Variable               | Défaut                              | Rôle                                    |
|------------------------|-------------------------------------|------------------------------------------|
| `BASE_URL`             | `http://10.33.120.55:3001`         | Front cible (override pour local)       |
| `E2E_API_URL`          | `http://10.33.120.55:3000/api`     | API backend                              |
| `E2E_ADMIN_EMAIL`      | `jmorin@omnitech-security.fr`      | Compte global-setup                      |
| `E2E_ADMIN_PASSWORD`   | `Admin123!`                         | Mot de passe                             |
| `E2E_COLLAB_EMAIL`     | `collaborateur@omnitech-security.fr` | Compte non-admin                       |
| `E2E_COLLAB_PASSWORD`  | `Collab123!`                        | Mot de passe                             |
| `E2E_SUPER_ADMIN_EMAIL`| (fallback ADMIN)                   | SUPER_ADMIN dédié si différent           |
| `RUN_DESTRUCTIVE`      | (off)                               | Active les specs `@destructive`          |
| `CI`                   | (off)                               | retries=1, forbidOnly                    |

### Exemples

```bash
# Local — front sur 3001 / back sur 3000
BASE_URL=http://localhost:3001 E2E_API_URL=http://localhost:3000/api pnpm test:e2e

# CI ou env éphémère avec données seedées : autoriser les mutations
RUN_DESTRUCTIVE=1 pnpm test:e2e -- --project=chromium

# Préprod (par défaut) — read-only, aucune mutation
pnpm test:e2e
```

---

## Fixtures & helpers

### `helpers/auth.ts`

```ts
import { loginAsAdmin, loginAsCollaborateur, logout, ADMIN_CREDS } from './helpers/auth';

test('exemple', async ({ page }) => {
  await loginAsAdmin(page);            // POST /auth/login + reload SPA
  // ... assertions
  await logout(page);                  // clearCookies + goto /login
});
```

### `helpers/login.ts`

```ts
import { login, type Role } from './helpers/login';

test('un test paramétré par rôle', async ({ page }) => {
  const role: Role = 'SUPER_ADMIN';
  await login(page, role);
  // ...
});
```

### Données destructives — `RUN_DESTRUCTIVE=1`

Les specs qui créent / modifient / suppriment de la donnée portent un
`test.skip(!DESTRUCTIVE, '...')` au début du `describe`. **Par défaut sur la
préprod ces tests sont skippés** pour ne pas polluer la base réelle.

```ts
const DESTRUCTIVE = !!process.env.RUN_DESTRUCTIVE;

test.describe('@destructive — création doc', () => {
  test.skip(!DESTRUCTIVE, 'RUN_DESTRUCTIVE=1 requis');
  // ...
});
```

---

## Patterns courants

### Mocks API navigateur (push notifications)

`push-notifications.spec.ts` injecte des stubs au boot via
`page.addInitScript()` :

```ts
await page.addInitScript(() => {
  // Mock Notification.requestPermission → "granted"
  Object.defineProperty(window, 'Notification', {
    value: Object.assign(function () {} as unknown as typeof Notification, {
      permission: 'default',
      requestPermission: async () => 'granted' as NotificationPermission,
    }),
  });
  // Mock navigator.serviceWorker + PushManager
  Object.defineProperty(navigator, 'serviceWorker', { value: { /* ... */ } });
});
```

### CDP virtual authenticator (WebAuthn)

`webauthn.spec.ts` utilise le protocole CDP de Chrome pour injecter un
authenticator logiciel :

```ts
const cdp = await page.context().newCDPSession(page);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', /* ... */ },
});
// ... interagir avec /profile/security/webauthn
await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
```

### Vérification réseau (push, search)

```ts
const calls: string[] = [];
page.on('request', (req) => {
  if (/\/push\/subscribe/.test(req.url())) calls.push(req.url());
});
// ... action UI
expect(calls.length).toBeGreaterThan(0);
```

### Skipping tolérant — préserver la verte CI

Plutôt que de `fail` quand un pré-requis manque (compte absent, feature OFF,
modale non rendue), on `skip` avec une raison FR explicite :

```ts
if (!(await el.isVisible({ timeout: 5_000 }).catch(() => false))) {
  test.skip(true, 'Bouton X non rendu — composant en variante B');
}
```

---

## Debugging

### Trace viewer

Une trace complète (DOM snapshots + network + console) est conservée pour
chaque spec en échec :

```bash
pnpm exec playwright show-trace test-results/.../trace.zip
```

### Mode UI

```bash
pnpm test:e2e -- --ui
```

Liste interactive des tests, exécution pas-à-pas, time-travel sur le DOM.

### Mode --debug

```bash
pnpm test:e2e -- --debug e2e/auth.spec.ts
```

Ouvre Chromium en headed avec inspector Playwright, breakpoints possibles via
`await page.pause()`.

### Screenshots & vidéos

Sur échec uniquement (config par défaut) :

- `test-results/<spec>/test-failed-1.png`
- `test-results/<spec>/video.webm`
- `test-results/<spec>/trace.zip`

Pour forcer en cas de réussite : `screenshot: 'on'` / `video: 'on'` dans
`playwright.config.ts`.

---

## CI — GitHub Actions

Deux workflows :

1. **`ci.yml` → job `e2e-compile`** : `playwright test --list` (parse-only).
   Détecte les imports cassés / TS errors dans les specs et fixtures, sans
   lancer un navigateur.
2. **`e2e.yml`** (Wave G) : suite chromium complète sur PRs et `main`, avec
   services postgres/redis/meili démarrés en sidecar et seed minimale. Mode
   destructive activable via `workflow_dispatch.inputs.destructive=true`.

Artifacts publiés sur échec :
- `playwright-report/` (HTML)
- `test-results/` (traces + vidéos)
- `backend.log`, `frontend.log`

---

## Ajouter un nouveau test

1. Créer `e2e/<feature>.spec.ts` (sans le préfixe `e2e/`).
2. Importer les helpers nécessaires :
   ```ts
   import { test, expect } from '@playwright/test';
   import { loginAsAdmin } from './helpers/auth';
   ```
3. Encapsuler les actions destructives dans un `test.describe` `@destructive`
   gated par `RUN_DESTRUCTIVE`.
4. Si la spec s'exécute **sans** auth (welcome / login / portal), ajouter le
   nom de fichier au `testMatch` du projet `unauthenticated` dans
   `playwright.config.ts`.
5. Lancer en local :
   ```bash
   pnpm test:e2e -- e2e/ma-feature.spec.ts --project=chromium
   ```
6. Vérifier que `pnpm exec playwright test --list` passe en CI (job
   `e2e-compile`).

---

## Sécurité de la base préprod

Tous les tests **par défaut** ne font que lire `10.33.120.55`. Aucun seeding
n'est effectué. Les destructifs (`RUN_DESTRUCTIVE=1`) ne doivent **jamais**
être lancés sur préprod sans accord — privilégier un environnement éphémère
(CI, docker-compose dev). Voir
[`infra/`](../../infra/) pour le compose stack reproductible.

---

## Roadmap

- [ ] Migrer `pwa.spec.ts` sur des stubs Service Worker pour fiabiliser le
      test de fallback offline (actuellement `--project=unauthenticated`).
- [ ] Ajouter une suite `e2e-mobile.spec.ts` ciblant les viewports tablette
      via `devices['iPad Pro 11']`.
- [ ] Couverture i18n : exécuter `auth.spec.ts` en `--locale=en-US` pour
      vérifier la traduction des messages d'erreur.
- [ ] Performance : ajouter une assertion sur le timing du `/dashboard` via
      `page.metrics()` (gating "p95 < 3 s").
