# Mission 3 Phase 1 — Baseline des migrations Prisma (Option A)

**Date** : 2026-04-20 22:10 (Europe/Paris)
**Opérateur** : Claude Code
**Branche** : `feat/chatbot-unified-backend`
**Validation humaine** : `GO option A — baseline existante` (checkpoint P1.9.M3.1.1)
**Backup préalable** : `/var/backups/omnitech/db_pre_mission3_20260420_215821.sql.gz` (1.4 MB)

## Contexte

La base a été construite via `prisma db push` au démarrage du projet, jamais via le système `migrate`. Conséquence :
- 68 tables existent avec les bons schémas
- Les 16 migrations dans `packages/database/prisma/migrations/` existent mais ne sont pas enregistrées en DB
- La table `_prisma_migrations` est absente

L'opération consiste à **baseline** la DB existante : exécuter `prisma migrate resolve --applied <name>` pour chaque migration, ce qui crée `_prisma_migrations` et enregistre les 16 migrations comme "déjà appliquées" **sans exécuter le moindre DDL sur les tables existantes**.

## Snapshot AVANT baseline

### Tables
| Indicateur | Valeur |
|---|---|
| Nombre total de tables | **68** |
| Présence `_prisma_migrations` | ❌ absente |

### Row counts principales tables

| Table | Rows |
|---|---:|
| User | 108 |
| Document | 9 |
| DocumentVersion | 9 |
| RagQueryLog | 12 |
| RagChunk | 143 |
| Ticket | 257 |
| WikiPage | 59 |
| Charte | 3 |
| NewsPost | 8 |
| Notification | 85 |
| AuditLog | 1 486 |

## Liste des 16 migrations à marquer "applied"

```
20260403_chartes_pdf_veille_bulletin_prestataires
20260409_ticket_tags
20260409_veille_sources
20260410_access_reviews
20260410_perf_indexes
20260410_push_subscription
20260411_it_exports
20260411_tickets_dept
20260411_wiki_collab
20260412_audit_preservation
20260412_calendar_events
20260412_document_inline_editor
20260412_incidents
20260412_saved_filters
20260412_workflow_review_approved
20260418_notification_types
```

## Exécution

Commande exacte (boucle, une invocation par migration avec logs stdout/stderr) :

```bash
cd packages/database
LOG=/tmp/baseline_log_$(date +%s).log
FAIL=0
for m in $(ls prisma/migrations/ | grep -v migration_lock); do
  echo ">>> resolve --applied $m" | tee -a $LOG
  if pnpm --silent prisma migrate resolve --applied "$m" 2>&1 | tee -a $LOG ; then
    echo "<<< OK" | tee -a $LOG
  else
    echo "<<< FAIL" | tee -a $LOG
    FAIL=1
    break
  fi
done
echo "FAIL=$FAIL"
```

**Résultat** : `FAIL=0` — 16 OK / 16.

## Snapshot APRÈS baseline

### Tables
| Indicateur | AVANT | APRÈS | Delta |
|---|---:|---:|---|
| Nombre total | 68 | **69** | +1 (`_prisma_migrations` créée) |
| Présence `_prisma_migrations` | ❌ | ✅ 16 lignes | OK |

### Row counts (doivent être INCHANGÉS)

| Table | AVANT | APRÈS | Diff |
|---|---:|---:|---|
| User | 108 | 108 | 0 ✅ |
| Document | 9 | 9 | 0 ✅ |
| DocumentVersion | 9 | 9 | 0 ✅ |
| RagQueryLog | 12 | 12 | 0 ✅ |
| RagChunk | 143 | 143 | 0 ✅ |
| Ticket | 257 | 257 | 0 ✅ |
| WikiPage | 59 | 59 | 0 ✅ |
| Charte | 3 | 3 | 0 ✅ |
| NewsPost | 8 | 8 | 0 ✅ |
| Notification | 85 | 85 | 0 ✅ |
| AuditLog | 1 486 | 1 486 | 0 ✅ |

### `prisma migrate status`

```
16 migrations found in prisma/migrations
Database schema is up to date!
```

✅ Database schema is up to date.

### `SELECT * FROM _prisma_migrations`

16 lignes, timestamps `started_at`/`finished_at` tous datés du 2026-04-20 22:10:22 → 22:10:39 (durée totale ~17s, une seconde par migration en moyenne).

## Rollback (en cas de besoin)

Si l'on veut revenir à l'état pré-baseline :

```sql
-- Sans déclencher les cascades, la table _prisma_migrations est isolée (aucune FK)
BEGIN;
DROP TABLE IF EXISTS "_prisma_migrations";
COMMIT;
```

Puis `pnpm prisma migrate status` retournera à l'état "16 migrations not yet applied" comme avant.

## Log d'exécution

Disponible dans `/tmp/baseline_log_1776715820.log` (environnement éphémère — archivé dans le rapport ci-dessus).

## Conclusion

**Opération non destructive validée**. La DB est désormais gérée par le système `migrate` Prisma. Les migrations futures (notamment `add_chat_unified_models` de Mission 3) pourront être créées via `pnpm prisma migrate dev --create-only`.

Prochaine étape : **1.2 Feature flag infrastructure**.
