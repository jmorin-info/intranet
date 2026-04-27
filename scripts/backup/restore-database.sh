#!/usr/bin/env bash
# =============================================================================
# restore-database.sh — Guide interactif de restauration Postgres depuis Restic
# -----------------------------------------------------------------------------
# Wave D item 20 — Procédure de restauration testable.
#
# Étapes :
#   1. Liste les snapshots avec tag "database"
#   2. L'opérateur choisit un snapshot (ID court)
#   3. Confirmation explicite (taper "RESTORE" ; pas de --yes muet)
#   4. restic dump | tar -x -> répertoire temporaire
#   5. pg_restore -> base cible (par défaut DB_RESTORE_TARGET)
#
# Sécurité :
#   - Refuse de restaurer dans la DB de prod sauf si DB_RESTORE_FORCE_PROD=1
#   - Création d'une DB temporaire (intranet_restore_<timestamp>) par défaut
#   - Aucun argument auto : tout passe par prompt interactif
#
# Usage :
#   bash restore-database.sh                  # interactif
#   SNAPSHOT_ID=abc123 bash restore-database.sh   # non-interactif (ops)
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

load_env
require_restic

: "${POSTGRES_USER:?POSTGRES_USER requis}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD requis}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
TARGET_DB_DEFAULT="intranet_restore_$(date +%Y%m%d_%H%M%S)"
TARGET_DB="${DB_RESTORE_TARGET:-$TARGET_DB_DEFAULT}"

# === Garde-fou DB de prod ===
if [ "$TARGET_DB" = "${POSTGRES_DB:-omnitech_intranet}" ] && [ "${DB_RESTORE_FORCE_PROD:-0}" != "1" ]; then
  err "REFUS : restauration dans la DB de prod (${TARGET_DB}) sans DB_RESTORE_FORCE_PROD=1"
  err "Pour restaurer en prod : DB_RESTORE_FORCE_PROD=1 DB_RESTORE_TARGET=${POSTGRES_DB} $0"
  exit 2
fi

log "=== Restauration database depuis Restic offsite ==="

# === 1. Lister snapshots ===
log "1/5 — Liste des snapshots database"
restic snapshots --tag database --json | \
  python3 -c "
import json, sys
snaps = json.load(sys.stdin)
for s in snaps[-15:]:
    tags = ','.join(s.get('tags', []))
    print(f\"{s['short_id']}  {s['time']}  host={s['hostname']}  tags={tags}\")
" || restic snapshots --tag database --last 15

# === 2. Sélection ===
SNAPSHOT_ID="${SNAPSHOT_ID:-}"
if [ -z "$SNAPSHOT_ID" ]; then
  echo
  read -r -p "Snapshot ID à restaurer (short_id, ex: abc123) : " SNAPSHOT_ID
fi

if [ -z "$SNAPSHOT_ID" ]; then
  err "Aucun snapshot sélectionné. Abort."
  exit 1
fi

log "  Snapshot choisi : $SNAPSHOT_ID"
log "  DB cible        : $TARGET_DB"

# === 3. Confirmation explicite ===
if [ -z "${ASSUME_YES:-}" ]; then
  echo
  echo "ATTENTION : ceci va créer/écraser la DB '${TARGET_DB}' sur ${DB_HOST}:${DB_PORT}."
  read -r -p "Tapez exactement RESTORE pour continuer : " CONFIRM
  if [ "$CONFIRM" != "RESTORE" ]; then
    err "Confirmation invalide ('$CONFIRM' != 'RESTORE'). Abort."
    exit 1
  fi
fi

# === 4. Dump du snapshot vers répertoire temporaire ===
log "2/5 — Téléchargement snapshot vers /tmp/restore-${SNAPSHOT_ID}"
RESTORE_DIR=$(mktemp -d "/tmp/restore-${SNAPSHOT_ID}.XXXXXX")
trap 'rm -rf "$RESTORE_DIR"' EXIT

restic restore "$SNAPSHOT_ID" --target "$RESTORE_DIR" --include "*.tar"

# Le snapshot stdin a un nom comme db-<dbname>.dump.tar
TAR_FILE=$(find "$RESTORE_DIR" -name "*.dump.tar" | head -1)
if [ -z "$TAR_FILE" ]; then
  err "Aucun fichier .dump.tar trouvé dans le snapshot. Snapshot peut-être de type 'globals' ?"
  exit 3
fi
log "  Archive : $TAR_FILE ($(du -h "$TAR_FILE" | cut -f1))"

# === 5. pg_restore ===
log "3/5 — Extraction tar"
EXTRACT_DIR="${RESTORE_DIR}/extracted"
mkdir -p "$EXTRACT_DIR"
tar -xf "$TAR_FILE" -C "$EXTRACT_DIR"

PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:postgres:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:${TARGET_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" >> "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"
trap 'rm -rf "$RESTORE_DIR" "$PGPASS_FILE"' EXIT

log "4/5 — Création de la DB cible (${TARGET_DB})"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS \"${TARGET_DB}\";" >/dev/null
psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d postgres -c \
  "CREATE DATABASE \"${TARGET_DB}\" OWNER \"${POSTGRES_USER}\";" >/dev/null

log "5/5 — pg_restore (peut prendre plusieurs minutes)"
DUMP_DIR=$(find "$EXTRACT_DIR" -type d -name "dump" | head -1)
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$TARGET_DB" \
  --jobs="${PARALLEL_JOBS:-4}" --no-owner --no-acl --verbose "$DUMP_DIR" 2>&1 | \
  tail -20

log "=== Restore OK : DB '${TARGET_DB}' restaurée depuis snapshot ${SNAPSHOT_ID} ==="
log "  Pour basculer en prod, vérifier l'intégrité (count des tables critiques)"
log "  puis  ALTER DATABASE \"${POSTGRES_DB}\" RENAME TO old_<date>; ALTER DATABASE \"${TARGET_DB}\" RENAME TO \"${POSTGRES_DB}\";"
