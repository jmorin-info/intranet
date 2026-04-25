# Runbook — Activation Sentry en production

> Sentry est **déjà câblé** dans le code (backend + frontend). Il suffit de
> renseigner le DSN et les variables d'env pour activer la collecte. Tant
> que `SENTRY_DSN` reste vide, le SDK est no-op (zéro coût, zéro réseau).

## Quand utiliser ce runbook

- Activation initiale pour le passage en production
- Rotation du DSN (compromission, changement d'org Sentry)
- Bascule d'environnement (`development` → `production`)
- Upload de source maps lors d'un déploiement majeur

## Pré-requis

- Compte admin sur l'org Sentry OMNITECH
- Projet Sentry **backend Node.js** créé → DSN serveur
- Projet Sentry **frontend Next.js** créé → DSN browser (publishable)
- Auth token Sentry avec scope `project:write` + `project:releases` (CI uniquement)
- Accès SSH `root` à la VM Debian 12

## Procédure

### 1. Récupérer les valeurs Sentry

Depuis l'UI Sentry → Settings → Projects → `<projet>` → Client Keys :

- DSN backend : `https://<KEY>@<ORG>.ingest.sentry.io/<PROJECT_ID>`
- DSN frontend : idem (clé publique distincte côté browser)
- Auth token : Settings → Account → API → Auth Tokens

### 2. Renseigner les variables d'env

Le fichier `/root/omnitech-intranet/.env` est lu par les deux unités systemd
via `EnvironmentFile=`. Ajouter (ou modifier) ces lignes :

```bash
# === Sentry — backend (NestJS) ===
SENTRY_DSN=<DSN_BACKEND_HERE>
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=omnitech-intranet@1.0.0
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1

# === Sentry — frontend (Next.js) ===
NEXT_PUBLIC_SENTRY_DSN=<DSN_FRONTEND_HERE>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_RELEASE=omnitech-intranet@1.0.0
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_REPLAY_RATE=0

# === Source maps upload (CI uniquement — NE PAS COMMITTER) ===
SENTRY_ORG=omnitech-security
SENTRY_PROJECT=intranet-frontend
SENTRY_AUTH_TOKEN=<TOKEN_HERE>
```

> **NB** : `NODE_ENV=production` est déjà géré par les unités systemd / Next.
> `sentry.init.ts` lit `NODE_ENV` à défaut de `SENTRY_ENVIRONMENT`.
> `sentry.client.config.ts` (frontend) lit `NEXT_PUBLIC_SENTRY_ENVIRONMENT`.

Sécuriser le fichier (recommandé) :

```bash
chmod 600 /root/omnitech-intranet/.env
chown root:root /root/omnitech-intranet/.env
```

### 3. Redémarrer les services

```bash
systemctl restart omnitech-backend.service
systemctl restart omnitech-frontend.service
systemctl status omnitech-backend.service omnitech-frontend.service
```

### 4. Vérifier l'init côté backend

```bash
# 4.1 — Logs Pino : on cherche l'absence d'erreur Sentry au boot
journalctl -u omnitech-backend --since "2 min ago" | grep -i sentry
# Pas de ligne "[Sentry] init failed" → init OK
# Si SENTRY_DSN absent : init() retourne false silencieusement (no-op)

# 4.2 — Tester un envoi manuel (route admin SUPER_ADMIN)
# [À COMPLÉTER PAR L'ÉQUIPE OPS : exposer une route /admin/_sentry-test
#  qui force `Sentry.captureMessage('manual test')` — actuellement aucune
#  route dédiée n'existe, on peut soit l'ajouter (5 lignes), soit déclencher
#  une vraie 500 ciblée pour valider la chaîne.]
```

### 5. Vérifier l'init côté frontend

Ouvrir `https://intranet.omnitech-security.fr` dans Chrome → DevTools → Network :

- Filtrer sur `sentry` → on doit voir une requête `POST /api/<PROJECT>/envelope/`
  (transactions ou heartbeats selon `tracesSampleRate`)
- Console : pas de message `Sentry has been initialized multiple times`
- Forcer une erreur : dans la console JS du navigateur,
  taper `throw new Error('sentry-test-' + Date.now())`
- Vérifier l'apparition de l'event dans Sentry → Issues sous 30 secondes

### 6. (Optionnel) Upload des source maps lors du déploiement

Le wizard `@sentry/nextjs` est déjà configuré dans
`apps/frontend/next.config.js` (à vérifier en cas de doute). En présence
de `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` lors du `pnpm build`,
les source maps sont uploadées automatiquement. Sinon, l'output reste
fonctionnel (les stacks restent obfusquées côté Sentry).

## Vérifications post-action

- Les deux DSN sont visibles **redactés** dans `journalctl -u omnitech-backend`
  (la lib ne logue jamais le DSN complet, seulement `Sentry] initialized`)
- Aucun secret en clair dans les logs (`grep -E 'SENTRY_DSN|AUTH_TOKEN' /var/log/omnitech/*.log`)
- Sentry → Issues affiche au moins l'event de test dans les 5 min
- Healthcheck inchangé (`curl /api/health` → `status: ok`)
- `chmod 600 /root/omnitech-intranet/.env` confirmé : `stat -c '%a' /root/omnitech-intranet/.env` → `600`

## Rollback

Pour désactiver Sentry sans rollback de code :

```bash
# Vider le DSN dans .env
sed -i 's/^SENTRY_DSN=.*/SENTRY_DSN=/' /root/omnitech-intranet/.env
sed -i 's/^NEXT_PUBLIC_SENTRY_DSN=.*/NEXT_PUBLIC_SENTRY_DSN=/' /root/omnitech-intranet/.env

# Redémarrer
systemctl restart omnitech-backend.service omnitech-frontend.service
```

Avec un DSN vide, `initSentry()` (backend) et `Sentry.init()` (frontend)
deviennent strictement no-op : zéro requête, zéro overhead.

## Escalade

- Erreurs d'init au boot backend : Logs Pino → DSI → RSSI si volume anormal
- Quota Sentry dépassé : DSI ajuste `tracesSampleRate` (0.05 voire 0)
  ou contacte le support Sentry
- Suspicion fuite PII via Sentry : RSSI → revoir `beforeSend()` dans
  `apps/backend/src/common/sentry.init.ts` (déjà strip cookie / authorization
  / x-api-key / request body)

## Annexes

- Code d'init backend : `apps/backend/src/common/sentry.init.ts`
- Filtre exception NestJS : `apps/backend/src/common/sentry.filter.ts`
- Configs frontend : `apps/frontend/sentry.client.config.ts`,
  `apps/frontend/sentry.server.config.ts`, `apps/frontend/sentry.edge.config.ts`
- Variables documentées : `.env.example` (sections Sentry)
- Politique d'échantillonnage par défaut : 10 % (configurable via env)
- PII strippé automatiquement : cookies, `Authorization`, `x-api-key`, body
  (cf. `beforeSend` dans `sentry.init.ts`)
