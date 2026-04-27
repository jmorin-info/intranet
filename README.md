# OMNITECH Intranet

Intranet GED sécurisé pour OMNITECH Security — conforme ISO 27001:2022.

Monorepo `pnpm` + `turbo` :

- `apps/frontend` — Next.js 15 / React 19
- `apps/backend` — NestJS
- `packages/*` — code partagé (`@omnitech/shared`, `@omnitech/ui`, `@omnitech/database`)

## Démarrage rapide

```bash
pnpm install
pnpm db:generate
pnpm dev          # backend + frontend en parallèle
```

Pré-requis : Node.js 20 LTS, pnpm 9.15+, PostgreSQL 16, Redis 7.

## Structure

```
apps/        backend (NestJS) + frontend (Next.js)
packages/    database (Prisma), shared types, UI kit
scripts/     ops, backups, drills, déploiement
docs/        architecture, runbooks, audit, compliance
```

## Backup & DR

L'intranet applique la politique de sauvegarde / restauration ISO 27001
A.8.13 (sauvegarde) + A.5.29 (préparation TIC) + A.5.30 (continuité).

| Script                          | Rôle                                          |
|---------------------------------|-----------------------------------------------|
| `scripts/backup.sh`             | Backup quotidien DB + storage + copie SMB     |
| `scripts/backup-full.sh`        | Archive complète (code + DB + storage + conf) |
| `scripts/backup-drill.sh`       | Test hebdomadaire de restauration (drill)     |
| `scripts/backup-restore.sh`     | Wrapper de restauration RÉEL (incident)       |

### Cron de référence

```cron
# Backup quotidien — chaque jour à 02:00
0 2 * * * root /opt/omnitech/scripts/backup.sh

# Drill de restauration — chaque dimanche à 03:00
# (1h après le backup nocturne, vérifie qu'il est restaurable)
0 3 * * 0 root /opt/omnitech/scripts/backup-drill.sh

# Backup complet (code + DB + conf) — chaque dimanche à 04:00
0 4 * * 0 root /opt/omnitech/scripts/backup-full.sh
```

### Restauration en cas d'incident

Toute restauration suit la procédure documentée dans
[`RESTORE.md`](./RESTORE.md) :

- **RPO 24 h / RTO 2 h (DB) / RTO 4 h (global)**
- Restauration complète sur machine vierge (§3)
- Restauration partielle (table unique) (§4)
- Rollback post-incident (§5)
- Validation drill (§6)
- Contacts d'escalade RSSI / DSI / DPO / Direction (§7)
- Checklist post-restore (§8)

Pour un incident en cours, lancer **toujours** un dry-run d'abord :

```bash
sudo bash scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<date>.sql.gz \
  --db=omnitech_intranet
# Puis, après revue 4-yeux RSSI + DSI, ajouter --confirm --prod
```

## Sécurité

- Charte graphique SEAL : `docs/design-system/seal_charter.md`
- Audit logs : `apps/backend/src/audit-log/`
- Politique CSP / headers : `nginx/`, BunkerWeb
- Plan de continuité : voir `RESTORE.md` + `docs/compliance/`

## Observabilité

L'intranet expose une stack d'observabilité **opt-in** : si aucune des
variables d'environnement décrites ci-dessous n'est définie, l'application
fonctionne normalement et n'effectue **aucun appel réseau** vers un service
externe (compatible déploiement on-prem / air-gapped).

### Variables d'environnement

| Variable                          | Cible    | Rôle                                                   |
|-----------------------------------|----------|--------------------------------------------------------|
| `SENTRY_DSN`                      | backend  | DSN Sentry pour le NestJS (5xx + uncaught seulement)   |
| `NEXT_PUBLIC_SENTRY_DSN`          | frontend | DSN Sentry pour le navigateur + SSR Next.js            |
| `SENTRY_TRACES_SAMPLE_RATE`       | backend  | % de traces envoyées (défaut `0.1`)                    |
| `SENTRY_PROFILES_SAMPLE_RATE`     | backend  | % de profils CPU (défaut `0.1`)                        |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | frontend | Idem côté navigateur (défaut `0.1`)              |
| `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` | both | SHA du commit déployé (utilisé pour le tagging) |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | build | Upload des source maps Next.js (CI uniquement) |
| `LOG_LEVEL`                       | backend  | Niveau pino (`trace`/`debug`/`info`/`warn`/`error`)    |

### Activer Sentry en prod

1. Créer un projet Node.js et un projet Next.js sur https://sentry.io
   (ou une instance self-hosted Sentry).
2. Copier le DSN du projet Node → variable `SENTRY_DSN` du backend.
3. Copier le DSN du projet Next → variable `NEXT_PUBLIC_SENTRY_DSN` du
   frontend (préfixe `NEXT_PUBLIC_` requis pour exposition au bundle browser).
4. (Optionnel) Pour uploader les source maps lors du build CI :
   `SENTRY_ORG=omnitech SENTRY_PROJECT=intranet-frontend SENTRY_AUTH_TOKEN=...`
5. Redéployer. Les erreurs `5xx` côté API et les exceptions React/Next côté
   client remontent automatiquement avec :
   - `request_id` (corrélation avec les logs pino)
   - utilisateur authentifié (si JWT valide)
   - méthode + route + query (jamais le body, jamais les headers d'auth)

Les erreurs `4xx` (validation, not-found, forbidden) ne sont **pas** envoyées
à Sentry pour éviter le bruit.

### Logs structurés (pino)

Le backend utilise `nestjs-pino` qui produit du JSON structuré (`ndjson`)
en production, avec un champ `req.id` égal à l'en-tête `X-Request-ID` —
permettant de corréler une trace HTTP depuis le navigateur jusqu'aux logs
serveur jusqu'à un événement Sentry.

```bash
# Lecture en dev (pretty colorisé via pino-pretty, automatique si NODE_ENV ≠ production)
LOG_LEVEL=debug pnpm --filter @omnitech/backend dev

# Lecture en prod (JSON ndjson — utiliser jq pour explorer)
docker logs -f omnitech-backend | jq 'select(.level >= 40)'

# Filtrer par requête (X-Request-ID renvoyé dans la réponse HTTP)
docker logs omnitech-backend | jq 'select(.req.id == "abc-123")'
```

Les champs `password`, `token`, `secret`, `cookie`, `authorization` sont
automatiquement remplacés par `[REDACTED]` (ISO 27001 A.5.34).

## Design system

Les composants partagés (Button, Card, DataTable, Skeleton, EmptyState…) sont
isolés dans `packages/ui` (`@omnitech/ui`) et documentés via Storybook 8.

```bash
pnpm --filter @omnitech/ui storybook       # serveur local sur :6006
pnpm --filter @omnitech/ui build-storybook # build statique
```

19 stories couvrent les primitives MVP, alignées avec la charte
[SEAL System](docs/design-system/SEAL_USAGE.md) (couleurs PANTONE
`f9964a` / `004469`, typo Century Gothic / Nunito, dark mode).

Les pull requests qui touchent `packages/ui/**`, `globals.css` ou la config
Tailwind déclenchent le workflow GitHub Actions
[`chromatic.yml`](.github/workflows/chromatic.yml) qui publie le Storybook
sur Chromatic et détecte les régressions visuelles. Configurer une fois le
secret `CHROMATIC_PROJECT_TOKEN` (cf [`STORYBOOK.md`](docs/design-system/STORYBOOK.md)).

## Build hardening

Le build local reste tolérant (`eslint.ignoreDuringBuilds: true` dans
`apps/frontend/next.config.js`) afin de ne pas bloquer le développement, mais
plusieurs garde-fous sont en place pour piloter la dette lint et la taille
du bundle.

- `pnpm --filter @omnitech/frontend lint` — exécute `next lint` et affiche les
  warnings/errors actuels (non bloquant).
- `pnpm --filter @omnitech/frontend lint:strict` — exécute
  `next lint --max-warnings 0` ; échoue dès le premier warning. Utilisé par la
  CI (`.github/workflows/lint-strict.yml`) sur chaque pull request pour empêcher
  l'introduction de nouvelles violations.
- `pnpm --filter @omnitech/frontend analyze` — équivalent à
  `ANALYZE=true next build` ; produit un rapport HTML interactif (via
  `@next/bundle-analyzer`) ouvert automatiquement dans le navigateur, utile
  pour identifier les chunks lourds.

## Support

- Helpdesk : https://intranet.omnitech-security.fr/helpdesk
- Email RSSI : jmorin@omnitech-security.fr
