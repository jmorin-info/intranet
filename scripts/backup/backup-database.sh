#!/usr/bin/env bash
# =============================================================================
# backup-database.sh — Dump Postgres + push chiffré AES-256 vers Restic/S3
# -----------------------------------------------------------------------------
# Wave D item 20 — Backup offsite chiffré quotidien.
#
# Pipe pg_dump --format=custom -j N → restic backup --stdin
#
# Le mot de passe Restic chiffre AES-256 le snapshot. La passphrase n'est
# JAMAIS transmise au provider S3 ; côté Scaleway/OVH/etc. on ne voit que
# des blobs chiffrés.
#
# Idempotent : peut être relancé sans danger (Restic dédoublonne sur le
# contenu du flux ; un dump identique = pas d'octet supplémentaire écrit).
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

load_env
require_restic

# === Pré-requis Postgres ===
: "${POSTGRES_USER:?POSTGRES_USER requis}"
: "${POSTGRES_DB:?POSTGRES_DB requis}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD requis}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
PARALLEL_JOBS="${BACKUP_PG_DUMP_JOBS:-4}"

log "=== Backup database -> Restic offsite ==="
log "  Source : ${DB_HOST}:${DB_PORT}/${POSTGRES_DB}"
log "  Repo   : ${RESTIC_REPOSITORY}"
log "  Tag    : db-$(date +%Y%m%d)"

# === pgpass temporaire (jamais en argv) ===
PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"
trap 'rm -f "$PGPASS_FILE"' EXIT

# === Dump + Restic stdin ===
# pg_dump --format=custom est compressé nativement (zstd ou lz4 si dispo) ;
# Restic dédoublonne ensuite par chunks de 1MB. Le résultat reste petit.
# --jobs N : parallélise le dump (gain x2-x4 sur DB > 5GB)
#
# IMPORTANT : on n'utilise PAS pg_dumpall (perte du format custom).
# Pour les rôles globaux, on fait un dump séparé en SQL plain.
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')

# 1. Dump custom de la DB applicative
log "1/2 — Dump pg_dump (parallel jobs=${PARALLEL_JOBS}) -> restic --stdin"
DUMP_DIR=$(mktemp -d)
trap 'rm -rf "$DUMP_DIR" "$PGPASS_FILE"' EXIT

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=directory --jobs="$PARALLEL_JOBS" --compress=9 --no-password \
  --file="${DUMP_DIR}/dump"

# Le format directory est trop multifichier pour --stdin ; on fait un tar
# pipé vers restic. Restic dedup-friendly sur tar non compressé.
log "  Pipe tar -> restic backup --stdin --stdin-filename db.dump.tar"
tar -cf - -C "$DUMP_DIR" dump | \
  restic backup --stdin --stdin-filename "db-${POSTGRES_DB}.dump.tar" \
    --tag database --tag "host:${RESTIC_HOST}" --tag "db:${POSTGRES_DB}" \
    --host "$RESTIC_HOST"

# 2. Dump des rôles globaux (utiles en cas de restore complet sur cluster vide)
log "2/2 — Dump pg_dumpall --globals-only -> restic --stdin"
pg_dumpall -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" --globals-only --no-password | \
  restic backup --stdin --stdin-filename "db-globals.sql" \
    --tag database --tag globals --tag "host:${RESTIC_HOST}" \
    --host "$RESTIC_HOST"

log "=== Backup database OK (${TIMESTAMP}) ==="
