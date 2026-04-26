#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Automated Backup (ISO 27001 A.8.13)
# Schedule: 0 2 * * * /opt/omnitech/scripts/backup.sh
# =============================================================================
set -euo pipefail

# --- Configuration ---
BACKUP_DIR="${BACKUP_DIR:-/var/backups/omnitech}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"

# Load environment
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a; source "${PROJECT_DIR}/.env"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER required}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB required}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# --- Functions ---
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

cleanup() {
  rm -f "$PGPASS_FILE" 2>/dev/null
  if [ "${BACKUP_FAILED:-0}" = "1" ]; then
    log "ERROR: Backup FAILED — check log: $LOG_FILE"
    # Send alert if mail configured
    if command -v mail &>/dev/null && [ -n "${ALERT_EMAIL:-}" ]; then
      echo "Backup failed at $(date). See: $LOG_FILE" | mail -s "[OMNITECH] Backup FAILED" "$ALERT_EMAIL"
    fi
  fi
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"

log "=== OMNITECH Backup Starting ==="
log "Target: ${BACKUP_DIR}"

# --- 1. PostgreSQL Backup ---
log "1/4 — PostgreSQL dump..."
PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

DB_BACKUP="${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-password --format=custom --compress=9 -f "${DB_BACKUP%.gz}"; then
  gzip "${DB_BACKUP%.gz}"
  log "  DB backup: $(du -h "$DB_BACKUP" | cut -f1)"
else
  BACKUP_FAILED=1
  log "  ERROR: pg_dump failed!"
fi
rm -f "$PGPASS_FILE"
unset PGPASSFILE

# --- 2. Verify backup integrity ---
if [ -f "$DB_BACKUP" ] && command -v pg_restore &>/dev/null; then
  log "2/5 — Verifying backup integrity..."
  if gunzip -c "$DB_BACKUP" | pg_restore --list > /dev/null 2>&1; then
    log "  Integrity check: PASSED"
  else
    log "  WARNING: Integrity check failed"
  fi
else
  log "2/5 — Integrity check skipped"
fi

# --- 2b. SHA-256 checksums (preuve d'intégrité — ISO 27001 A.8.13) ---
if command -v sha256sum >/dev/null 2>&1; then
  if [ -f "$DB_BACKUP" ]; then
    sha256sum "$DB_BACKUP" > "${DB_BACKUP}.sha256" 2>/dev/null && \
      log "  SHA-256 DB     : $(awk '{print $1}' "${DB_BACKUP}.sha256")"
  fi
fi

# --- 3. Storage files backup ---
log "3/5 — Storage files..."
STORAGE_BACKUP="${BACKUP_DIR}/storage_${TIMESTAMP}.tar.gz"
STORAGE_PATH="${STORAGE_PATH:-${PROJECT_DIR}/storage}"
if [ -d "$STORAGE_PATH" ]; then
  tar -czf "$STORAGE_BACKUP" -C "$(dirname "$STORAGE_PATH")" "$(basename "$STORAGE_PATH")" 2>/dev/null
  log "  Storage backup: $(du -h "$STORAGE_BACKUP" | cut -f1)"
  if [ -f "$STORAGE_BACKUP" ] && command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$STORAGE_BACKUP" > "${STORAGE_BACKUP}.sha256" 2>/dev/null && \
      log "  SHA-256 storage: $(awk '{print $1}' "${STORAGE_BACKUP}.sha256")"
  fi
else
  log "  WARNING: Storage dir not found: $STORAGE_PATH"
fi

# --- 4. Retention cleanup ---
log "4/5 — Cleaning backups older than ${RETENTION_DAYS} days..."
# Délégué à backup-cleanup.sh si disponible (rotation 7d/4w/12m), sinon flat
if [ -x "${PROJECT_DIR}/scripts/backup-cleanup.sh" ]; then
  log "  Délégué à backup-cleanup.sh (rotation 7d/4w/12m)"
  "${PROJECT_DIR}/scripts/backup-cleanup.sh" >> "$LOG_FILE" 2>&1 || \
    log "  WARNING: backup-cleanup.sh a retourné non-zéro (continuer quand même)"
else
  DELETED=$(find "$BACKUP_DIR" -name "*.gz" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
  DELETED_SHA=$(find "$BACKUP_DIR" -name "*.sha256" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
  DELETED_LOGS=$(find "$BACKUP_DIR" -name "*.log" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
  log "  Deleted: ${DELETED} backup files, ${DELETED_SHA} sha256 files, ${DELETED_LOGS} log files"
fi

# --- 5. SMB remote copy (if configured) ---
SMB_SHARE="${SMB_BACKUP_SHARE:-}"
SMB_MOUNT="${SMB_BACKUP_MOUNT:-/mnt/intranet-backup}"
SMB_USER="${SMB_BACKUP_USER:-}"
SMB_PASS="${SMB_BACKUP_PASSWORD:-}"
SMB_DOMAIN="${SMB_BACKUP_DOMAIN:-omnitech.security}"

if [ -n "$SMB_SHARE" ] && [ -n "$SMB_USER" ]; then
  log "5/5 — Copie vers partage réseau ${SMB_SHARE}"
  mkdir -p "$SMB_MOUNT"

  # Monte le partage si pas déjà monté
  if ! mountpoint -q "$SMB_MOUNT" 2>/dev/null; then
    CRED_TMP=$(mktemp)
    chmod 600 "$CRED_TMP"
    echo "username=${SMB_USER}" > "$CRED_TMP"
    echo "password=${SMB_PASS}" >> "$CRED_TMP"
    echo "domain=${SMB_DOMAIN}" >> "$CRED_TMP"

    if mount -t cifs "$SMB_SHARE" "$SMB_MOUNT" -o credentials="$CRED_TMP",vers=3.0,uid=root,gid=root,file_mode=0660,dir_mode=0770 2>/dev/null; then
      log "  Partage monté : ${SMB_MOUNT}"
    else
      log "  WARNING: Montage SMB échoué — sauvegarde locale uniquement"
      rm -f "$CRED_TMP"
    fi
  fi

  if mountpoint -q "$SMB_MOUNT" 2>/dev/null; then
    # Copie les fichiers de backup du jour (dump + checksums)
    cp "$DB_BACKUP" "${SMB_MOUNT}/" 2>/dev/null && log "  DB copié vers réseau"
    [ -f "${DB_BACKUP}.sha256" ] && cp "${DB_BACKUP}.sha256" "${SMB_MOUNT}/" 2>/dev/null
    [ -f "$STORAGE_BACKUP" ] && cp "$STORAGE_BACKUP" "${SMB_MOUNT}/" 2>/dev/null && log "  Storage copié vers réseau"
    [ -f "${STORAGE_BACKUP}.sha256" ] && cp "${STORAGE_BACKUP}.sha256" "${SMB_MOUNT}/" 2>/dev/null

    # Nettoyage réseau (même rétention)
    find "$SMB_MOUNT" -name "*.gz" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null
    find "$SMB_MOUNT" -name "*.sha256" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null

    # Démonte proprement
    umount "$SMB_MOUNT" 2>/dev/null
    log "  Partage démonté"
  fi
  rm -f "$CRED_TMP" 2>/dev/null
else
  log "5/5 — Copie réseau ignorée (SMB_BACKUP_SHARE non configuré dans .env)"
fi

# --- Summary ---
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "=== Backup Complete ==="
log "  Total backup storage: $TOTAL_SIZE"
log "  DB: $DB_BACKUP"
[ -f "$STORAGE_BACKUP" ] && log "  Storage: $STORAGE_BACKUP"
