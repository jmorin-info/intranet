# Mission 3 Phase 1 — Backup de sécurité

**Date** : 2026-04-20 21:58:21 (Europe/Paris)
**Opérateur** : Claude Code (agent IA)
**Branche au moment du backup** : `feat/chatbot-unified-backend` (créée depuis `feat/p1-9-prelaunch` HEAD `de1e5e4`)

## Fichiers produits

| Fichier | Taille | Chemin complet |
|---|---|---|
| Dump PostgreSQL | 1.4 MB | `/var/backups/omnitech/db_pre_mission3_20260420_215821.sql.gz` |
| Archive storage | 24 MB | `/var/backups/omnitech/storage_pre_mission3_20260420_215821.tar.gz` |

## Vérifications intégrité

- ✅ `gunzip -t db_pre_mission3_20260420_215821.sql.gz` → OK
- ✅ `tar tzf storage_pre_mission3_20260420_215821.tar.gz` → OK
- ✅ Taille DB > 100 KB (sanity check)

## Contexte

- PostgreSQL en local (non dockerisé) sur `localhost:5432`, base `omnitech_intranet`, user `omnitech`.
- Seuls `onlyoffice-ds`, `meilisearch`, `stirling-pdf`, `omnitech-docuseal` tournent en Docker.
- Credentials chargés depuis `/root/omnitech-intranet/.env`.

## Commande de restauration complète (rollback total)

```bash
# 1. Stopper le backend pour éviter écritures pendant restore
systemctl stop omnitech-backend

# 2. Dropper + recréer la base (SUPPRIME toutes les données actuelles)
export PGPASSWORD="<POSTGRES_PASSWORD>"
psql -U omnitech -h localhost -d postgres <<'EOF'
DROP DATABASE omnitech_intranet WITH (FORCE);
CREATE DATABASE omnitech_intranet OWNER omnitech;
EOF

# 3. Restaurer le dump
gunzip -c /var/backups/omnitech/db_pre_mission3_20260420_215821.sql.gz \
  | psql -U omnitech -h localhost -d omnitech_intranet

# 4. Restaurer le storage
rm -rf /root/omnitech-intranet/storage.pre_rollback
mv /root/omnitech-intranet/storage /root/omnitech-intranet/storage.pre_rollback
tar xzf /var/backups/omnitech/storage_pre_mission3_20260420_215821.tar.gz \
  -C /root/omnitech-intranet/

# 5. Redémarrer backend
systemctl start omnitech-backend
```

## Rollback partiel (migration Prisma uniquement)

Si seule la migration `add_chat_unified_models` pose problème, utiliser le
rollback SQL ciblé dans le dossier de migration (voir Étape 1.3.3) :

```bash
psql -U omnitech -h localhost -d omnitech_intranet \
  -f packages/database/prisma/migrations/<timestamp>_add_chat_unified_models/rollback.sql
```

Puis marquer la migration comme rolled-back côté Prisma :

```bash
pnpm prisma migrate resolve --rolled-back <timestamp>_add_chat_unified_models
```

## Note rétention

Le script `backup.sh` existant applique une rétention de 30 jours sur
`/var/backups/omnitech`. Les fichiers `*_pre_mission3_*` sont **nommés
spécifiquement** pour être identifiables ; ils seront purgés à partir du
2026-05-20 automatiquement. Pour les préserver plus longtemps en cas de
besoin, les copier ailleurs ou exclure du cleanup.
