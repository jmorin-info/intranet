#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Backup Restore Drill (ISO 27001 A.5.29 — ICT readiness)
# =============================================================================
#
# Test automatisé et non-destructif de restauration des backups PostgreSQL.
#
#   1. Sélectionne le dump .sql.gz le plus récent dans /var/backups/omnitech/
#   2. Crée une base temporaire `omnitech_intranet_drill` (drop si existante)
#   3. Restaure le dump dans cette base
#   4. Exécute des SELECT COUNT(*) sur tables critiques (User, Document,
#      Ticket, AuditLog) et compare à des seuils de cohérence
#   5. Drop la DB temporaire
#   6. Logue tout dans /var/log/omnitech/backup-drill.log
#   7. Envoie un mail à $ALERT_EMAIL si échec
#
# Cron: 0 3 * * 0 /opt/omnitech/scripts/backup-drill.sh
#       (chaque dimanche à 3h du matin — 1h après le backup nocturne)
#
# Usage manuel :
#   sudo -u postgres /opt/omnitech/scripts/backup-drill.sh
#   ou
#   BACKUP_DIR=/tmp/mybackups ./scripts/backup-drill.sh
#
# Exit codes :
#   0 = drill OK
#   1 = erreur d'environnement (pas de backup, postgres indisponible…)
#   2 = restore échoué
#   3 = intégrité échouée (counts incohérents)
# =============================================================================
set -euo pipefail

# --- Configuration ---
BACKUP_DIR="${BACKUP_DIR:-/var/backups/omnitech}"
LOG_DIR="${LOG_DIR:-/var/log/omnitech}"
LOG_FILE="${LOG_DIR}/backup-drill.log"
DRILL_DB="${DRILL_DB:-omnitech_intranet_drill}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load env for DB credentials & ALERT_EMAIL / SMTP
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a; source "${PROJECT_DIR}/.env"; set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-omnitech}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
ALERT_EMAIL="${ALERT_EMAIL:-jmorin@omnitech-security.fr}"

# Seuils minimum de cohérence — un backup qui remonte moins que ça est suspect
MIN_USERS="${MIN_USERS:-10}"
MIN_DOCUMENTS="${MIN_DOCUMENTS:-0}"
MIN_TICKETS="${MIN_TICKETS:-0}"
MIN_AUDITLOG="${MIN_AUDITLOG:-1}"

# --- Plomberie ---
DRILL_FAILED=0
DRILL_REASON=""
START_TS=$(date +%s)

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

fail() {
  DRILL_FAILED=1
  DRILL_REASON="${1:-unknown}"
  log "FAIL: $DRILL_REASON"
}

notify_admin() {
  local subject="$1"
  local body="$2"
  if command -v mail >/dev/null 2>&1 && [ -n "$ALERT_EMAIL" ]; then
    printf '%s\n' "$body" | mail -s "$subject" "$ALERT_EMAIL" || \
      log "WARNING: échec envoi mail à $ALERT_EMAIL"
  else
    log "NOTE: 'mail' non installé ou ALERT_EMAIL vide — notification sautée"
  fi
}

cleanup() {
  local code=$?
  # Nettoie le PGPASSFILE
  [ -n "${PGPASS_FILE:-}" ] && rm -f "$PGPASS_FILE" 2>/dev/null || true

  # Drop la DB drill quoi qu'il arrive
  if [ "${DRILL_DB_CREATED:-0}" = "1" ]; then
    log "Cleanup — drop DB ${DRILL_DB}"
    PGPASSWORD="$POSTGRES_PASSWORD" dropdb \
      -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
      --if-exists "$DRILL_DB" 2>>"$LOG_FILE" || \
      log "WARNING: drop DB ${DRILL_DB} a échoué — à vérifier manuellement"
  fi

  local duration=$(( $(date +%s) - START_TS ))
  if [ "$DRILL_FAILED" = "1" ] || [ "$code" != "0" ]; then
    log "=== DRILL FAILED (${duration}s) — reason: ${DRILL_REASON:-exit=$code} ==="
    notify_admin \
      "[OMNITECH][A.5.29] Drill de restauration ÉCHOUÉ" \
      "Le test de restauration des backups a échoué sur $(hostname).

Raison : ${DRILL_REASON:-exit=$code}
Log    : ${LOG_FILE}
Durée  : ${duration}s

Un backup qui ne se restaure pas est un backup inexistant.
Traiter en priorité (ISO 27001 A.5.29)."
    exit "${code:-1}"
  else
    log "=== DRILL OK (${duration}s) ==="
  fi
}
trap cleanup EXIT

# --- 0. Vérifications préliminaires ---
log "============================================"
log "OMNITECH — Backup Restore Drill (A.5.29)"
log "============================================"
log "Host          : $(hostname)"
log "Backup dir    : ${BACKUP_DIR}"
log "Target DB     : ${DRILL_DB}"
log "Postgres      : ${POSTGRES_USER}@${DB_HOST}:${DB_PORT}"

for bin in pg_restore psql dropdb createdb gunzip; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    fail "outil manquant: $bin"
    exit 1
  fi
done

if [ ! -d "$BACKUP_DIR" ]; then
  fail "répertoire de backup introuvable: $BACKUP_DIR"
  exit 1
fi

# Sélection du backup le plus récent
LATEST_BACKUP=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db_*.sql.gz' \
  -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | awk '{print $2}')

if [ -z "${LATEST_BACKUP:-}" ] || [ ! -f "$LATEST_BACKUP" ]; then
  fail "aucun dump db_*.sql.gz trouvé dans ${BACKUP_DIR}"
  exit 1
fi

BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
BACKUP_MTIME=$(date -r "$LATEST_BACKUP" '+%Y-%m-%d %H:%M:%S')
log "Backup choisi : ${LATEST_BACKUP}"
log "   Taille     : ${BACKUP_SIZE}"
log "   Modifié le : ${BACKUP_MTIME}"

# --- 1. PGPASSFILE ---
PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
# Pattern : host:port:database:user:password (on force `*` pour la DB car drill/postgres)
echo "${DB_HOST}:${DB_PORT}:*:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

# --- 2. Drop + Create DB drill ---
log "1/5 — Préparation base temporaire ${DRILL_DB}"
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
  --if-exists "$DRILL_DB" 2>>"$LOG_FILE" || {
    fail "dropdb initial impossible — droits Postgres ?"
    exit 1
  }
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
  -O "$POSTGRES_USER" "$DRILL_DB" 2>>"$LOG_FILE" || {
    fail "createdb ${DRILL_DB} impossible — droits Postgres ?"
    exit 1
  }
DRILL_DB_CREATED=1

# --- 3. Restore ---
log "2/5 — Restauration du dump (pg_restore)"
# Le dump de backup.sh est --format=custom compressé en .gz
# pg_restore sait lire un dump custom ; on pipe le gunzip
RESTORE_LOG=$(mktemp)
set +e
gunzip -c "$LATEST_BACKUP" | pg_restore \
  -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
  -d "$DRILL_DB" \
  --no-owner --no-acl --exit-on-error \
  --single-transaction \
  > "$RESTORE_LOG" 2>&1
RC=$?
set -e

if [ "$RC" != "0" ]; then
  log "pg_restore a retourné $RC — dernières lignes :"
  tail -20 "$RESTORE_LOG" | tee -a "$LOG_FILE"
  rm -f "$RESTORE_LOG"
  fail "pg_restore a échoué (rc=$RC)"
  exit 2
fi
rm -f "$RESTORE_LOG"
log "   Restore OK"

# --- 4. Vérifs d'intégrité (SELECT COUNT) ---
log "3/5 — Vérification des counts sur tables critiques"
run_count() {
  local table="$1"
  local min="$2"
  local count
  count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
    -d "$DRILL_DB" -tAc "SELECT count(*) FROM \"${table}\";" 2>>"$LOG_FILE") || {
      fail "SELECT COUNT(*) échoué sur ${table}"
      return 1
    }
  count=$(echo "$count" | tr -d '[:space:]')
  log "   ${table}: ${count} (min ${min})"
  if ! [[ "$count" =~ ^[0-9]+$ ]]; then
    fail "count non-numérique pour ${table}: '${count}'"
    return 1
  fi
  if [ "$count" -lt "$min" ]; then
    fail "${table} count=${count} < seuil ${min} — backup suspect"
    return 1
  fi
  return 0
}

INTEGRITY_OK=1
run_count User       "$MIN_USERS"      || INTEGRITY_OK=0
run_count Document   "$MIN_DOCUMENTS"  || INTEGRITY_OK=0
run_count Ticket     "$MIN_TICKETS"    || INTEGRITY_OK=0
run_count AuditLog   "$MIN_AUDITLOG"   || INTEGRITY_OK=0

if [ "$INTEGRITY_OK" != "1" ]; then
  exit 3
fi

# --- 5. Checks d'intégrité additionnels ---
log "4/5 — Checks d'intégrité schema"
# Au moins une migration Prisma appliquée
MIG_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
  -d "$DRILL_DB" -tAc \
  "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" \
  2>>"$LOG_FILE" || echo 0)
MIG_COUNT=$(echo "$MIG_COUNT" | tr -d '[:space:]')
log "   Migrations Prisma appliquées : ${MIG_COUNT:-0}"
if [ "${MIG_COUNT:-0}" -lt 1 ]; then
  fail "aucune migration Prisma dans le backup — schema incomplet ?"
  exit 3
fi

log "5/5 — Drill terminé avec succès"
log "   Backup  : ${LATEST_BACKUP}"
log "   Age     : ${BACKUP_MTIME}"
log "   Size    : ${BACKUP_SIZE}"
# cleanup() se charge du drop et du summary
