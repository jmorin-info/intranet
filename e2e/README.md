# E2E Playwright Suite — OMNITECH Intranet

Tests end-to-end couvrant les flux métier critiques : auth/MFA, documents,
tickets, chatbot RAG, overlay Glance, PWA, portail public, admin/access.

## Lancement

```bash
pnpm test:e2e                                 # 3 browsers (chromium/firefox/webkit) + unauthenticated
pnpm test:e2e -- --project=chromium           # un seul browser
pnpm test:e2e -- --project=unauthenticated    # flux publics uniquement
pnpm test:e2e -- e2e/auth.spec.ts             # un fichier
pnpm test:e2e -- --ui                         # mode debug interactif
```

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `BASE_URL` | `http://10.33.120.55:3001` | Front cible |
| `E2E_API_URL` | `http://10.33.120.55:3000/api` | API backend |
| `E2E_ADMIN_EMAIL` | `jmorin@omnitech-security.fr` | Login global-setup |
| `E2E_ADMIN_PASSWORD` | `Admin123!` | Mot de passe |
| `RUN_DESTRUCTIVE` | `` (off) | Active les tests `@destructive` (create/upload/comment) |
| `CI` | `` | Active retries=1 et forbidOnly |

## Architecture

- `global-setup.ts` : login SUPER_ADMIN unique → storageState dans `.auth/admin.json`
- `helpers/auth.ts` : `loginAsAdmin`, `loginAsCollaborateur`, `resetTestUser`, `logout`
- 3 projets authentifiés (chromium/firefox/webkit) réutilisent le storageState
- 1 projet `unauthenticated` pour `auth.spec.ts`, `portal.spec.ts`, `pwa.spec.ts`

## Couverture

| Fichier | Tests |
|---|---|
| `auth.spec.ts` | login OK/KO, MFA challenge, forgot-password, refresh, logout (7) |
| `mfa.spec.ts` | setup QR, activate invalid, disable/me, status (4) |
| `dashboard.spec.ts` | greeting, widgets, nav sidebar (4) |
| `documents.spec.ts` | liste, filtres, wizard, versioning, approve, watermark (7) |
| `tickets.spec.ts` | liste, kanban, create+AI, comment, statut, assignee (6) |
| `admin-access.spec.ts` | 3 onglets, switch, save config (3) |
| `chatbot.spec.ts` | Ctrl+Shift+K, streaming, stop, copy, feedback neg (5) |
| `glance.spec.ts` | Alt+click, Escape, étendre (3) |
| `pwa.spec.ts` | manifest, SW registered, /offline, offline fallback (4) |
| `portal.spec.ts` | public portal + route health (17 existants) |

## Base préprod — sécurité

Les tests ciblent `10.33.120.55` (préprod). **Aucun seeding n'est fait**
— les tests destructifs sont gated par `RUN_DESTRUCTIVE=1`. Par défaut on ne
fait que **lire** la base et valider les endpoints/UI. Les specs ratant un
pré-requis (compte absent, feature off, modale non rendue) utilisent
`test.skip(true, 'raison')` plutôt que `fail` pour ne pas bloquer la CI.

## Rapports

- `playwright-report/` (HTML) + `test-results/` (traces/vidéos). Ignored par git.
