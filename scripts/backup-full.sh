#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Sauvegarde COMPLÈTE (projet + base + storage + config)
# =============================================================================
#
# Crée une archive unique contenant TOUT ce qu'il faut pour restaurer
# l'intranet sur une machine vierge :
#   - Code source complet (monorepo)
#   - Base de données PostgreSQL (pg_dump)
#   - Fichiers uploadés (documents, avatars, certificats)
#   - Configuration (.env)
#   - Scripts systemd
#   - Guide de restauration
#
# Usage :
#   ./backup-full.sh
#
# Résultat :
#   /var/backups/omnitech/omnitech-full-YYYYMMDD_HHMMSS.tar.gz
#   + copie sur partage réseau si configuré
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/omnitech"
WORK_DIR=$(mktemp -d "${BACKUP_DIR}/full-${TIMESTAMP}.XXXXXX")
ARCHIVE_NAME="omnitech-full-${TIMESTAMP}.tar.gz"

# Load env
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a; source "${PROJECT_DIR}/.env"; set +a
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "============================================"
log "OMNITECH — Sauvegarde COMPLÈTE"
log "============================================"

mkdir -p "$BACKUP_DIR"

# --- 1. Code source ---
log "1/5 — Code source..."
rsync -a --exclude='node_modules' --exclude='.next' --exclude='dist' \
  --exclude='.turbo' --exclude='*.log' \
  "${PROJECT_DIR}/" "${WORK_DIR}/project/"
log "   Code source copié"

# --- 2. Base de données ---
log "2/5 — PostgreSQL dump..."
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
PGPASSWORD="${POSTGRES_PASSWORD:-omnitech_dev_2024}" \
  pg_dump -h "$DB_HOST" -p "$DB_PORT" \
  -U "${POSTGRES_USER:-omnitech}" \
  -d "${POSTGRES_DB:-omnitech_intranet}" \
  --no-owner --no-acl --clean --if-exists \
  | gzip > "${WORK_DIR}/database.sql.gz"
log "   DB : $(du -sh "${WORK_DIR}/database.sql.gz" | cut -f1)"

# --- 3. Storage (uploads, avatars, certificats) ---
log "3/5 — Fichiers storage..."
mkdir -p "${WORK_DIR}/storage"
[ -d "${PROJECT_DIR}/storage" ] && cp -r "${PROJECT_DIR}/storage" "${WORK_DIR}/storage/main" 2>/dev/null || true
[ -d "${PROJECT_DIR}/uploads" ] && cp -r "${PROJECT_DIR}/uploads" "${WORK_DIR}/storage/uploads" 2>/dev/null || true
log "   Storage : $(du -sh "${WORK_DIR}/storage" 2>/dev/null | cut -f1)"

# --- 4. Configuration ---
log "4/5 — Configuration..."
mkdir -p "${WORK_DIR}/config"
cp "${PROJECT_DIR}/.env" "${WORK_DIR}/config/.env" 2>/dev/null || true
cp /etc/systemd/system/omnitech-*.service "${WORK_DIR}/config/" 2>/dev/null || true
# Manifest
cat > "${WORK_DIR}/manifest.json" << MANIFEST
{
  "type": "full-backup",
  "version": "1.0",
  "timestamp": "${TIMESTAMP}",
  "date": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "postgres_version": "$(pg_dump --version 2>/dev/null | head -1 || echo 'unknown')",
  "contents": ["project", "database", "storage", "config", "restore-guide"]
}
MANIFEST

# --- 5. Guide de restauration ---
cp "${PROJECT_DIR}/RESTORE.md" "${WORK_DIR}/RESTORE.md" 2>/dev/null || true

# --- Archive finale ---
log "5/5 — Compression archive..."
cd "$BACKUP_DIR"
tar -czf "$ARCHIVE_NAME" -C "$(dirname "$WORK_DIR")" "$(basename "$WORK_DIR")"
rm -rf "$WORK_DIR"

ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
log "   Archive : ${ARCHIVE_PATH} ($(du -sh "$ARCHIVE_PATH" | cut -f1))"

# --- Copie réseau ---
SMB_SHARE="${SMB_BACKUP_SHARE:-}"
SMB_MOUNT="${SMB_BACKUP_MOUNT:-/mnt/intranet-backup}"
SMB_USER="${SMB_BACKUP_USER:-}"
SMB_PASS="${SMB_BACKUP_PASSWORD:-}"
SMB_DOMAIN="${SMB_BACKUP_DOMAIN:-SECURITY}"

if [ -n "$SMB_SHARE" ] && [ -n "$SMB_USER" ]; then
  log "📤 Copie vers partage réseau..."
  mkdir -p "$SMB_MOUNT"
  CRED_TMP=$(mktemp); chmod 600 "$CRED_TMP"
  echo "username=${SMB_USER}" > "$CRED_TMP"
  echo "password=${SMB_PASS}" >> "$CRED_TMP"
  echo "domain=${SMB_DOMAIN}" >> "$CRED_TMP"

  if mount -t cifs "$SMB_SHARE" "$SMB_MOUNT" -o credentials="$CRED_TMP",vers=3.0 2>/dev/null; then
    cp "$ARCHIVE_PATH" "${SMB_MOUNT}/"
    log "   Copié : ${SMB_MOUNT}/${ARCHIVE_NAME}"
    # Rétention : garder max 5 sauvegardes complètes
    ls -t "${SMB_MOUNT}"/omnitech-full-*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null
    umount "$SMB_MOUNT" 2>/dev/null
  else
    log "   ⚠️ Montage SMB échoué — sauvegarde locale uniquement"
  fi
  rm -f "$CRED_TMP"
fi

log "✅ Sauvegarde complète terminée : ${ARCHIVE_PATH}"
log "============================================"
