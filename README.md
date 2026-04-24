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
