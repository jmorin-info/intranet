#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Backup Restore (real recovery wrapper)
# =============================================================================
#
# Wrapper de restauration RÉEL utilisé en cas d'incident (perte DB,
# corruption, ransomware…). Orchestration step-by-step avec garde-fous,
# logs détaillés et notification email post-restore.
#
# À NE PAS confondre avec scripts/backup-drill.sh qui ne fait que tester
# la cohérence d'un dump dans une base éphémère.
#
# Usage :
#   sudo bash scripts/backup-restore.sh \
#     --backup=/var/backups/omnitech/db_20260420_020001.sql.gz \
#     --db=omnitech_intranet_restore \
#     --confirm
#
# Sans --confirm, le script reste en DRY-RUN (affiche le plan + abort).
# Sans --prod, refuse de restaurer dans la base de production
# (POSTGRES_DB du .env). Le flag --prod est explicitement requis pour
# écraser la prod (à n'utiliser qu'après revue 4-yeux).
#
# Arguments :
#   --backup=<path>   Chemin vers le dump (.sql, .sql.gz, .dump, .tar.gz)
#   --db=<name>       Nom de la base de données cible
#   --confirm         Exécution réelle (sinon dry-run)
#   --prod            Autorise la restauration sur la base de prod
#   --storage=<path>  Tar.gz du storage à restaurer (optionnel)
#   --no-email        Ne pas envoyer la notification email post-restore
#   --help            Affiche ce message
#
# Exit codes :
#   0 = OK (ou dry-run)
#   1 = arguments invalides / usage
#   2 = backup invalide (introuvable, illisible, non reconnu)
#   3 = erreur PostgreSQL (connexion, restore, intégrité)
#   4 = erreur de restauration storage (tar invalide, écriture impossible)
# =============================================================================
set -euo pipefail

# --- Constantes ---
SCRIPT_NAME="$(basename "$0")"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${LOG_DIR:-/var/log/omnitech}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/backup-restore.log}"
START_TS=$(date +%s)

# --- Defaults ---
BACKUP_PATH=""
TARGET_DB=""
STORAGE_PATH=""
CONFIRM=0
ALLOW_PROD=0
SEND_EMAIL=1

# --- Logging ---
ensure_log_dir() {
  if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
    LOG_DIR="/tmp"
    LOG_FILE="/tmp/omnitech-backup-restore.log"
    mkdir -p "$LOG_DIR" 2>/dev/null || true
  fi
  touch "$LOG_FILE" 2>/dev/null || true
}
log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  if [ -w "$LOG_FILE" ] 2>/dev/null; then
    printf '%s\n' "$line" | tee -a "$LOG_FILE"
  else
    printf '%s\n' "$line"
  fi
}

# --- Usage ---
usage() {
  cat <<USAGE
${SCRIPT_NAME} — wrapper de restauration OMNITECH Intranet

Usage :
  ${SCRIPT_NAME} --backup=<path> --db=<target-db> --confirm [options]

Options obligatoires :
  --backup=<path>   Dump à restaurer (.sql, .sql.gz, .dump, .tar.gz)
  --db=<name>       Base de données PostgreSQL cible
  --confirm         Exécute réellement (sans : dry-run + abort)

Options :
  --prod            Autorise l'écrasement de la base de prod (POSTGRES_DB)
  --storage=<path>  Archive .tar.gz du storage à restaurer
  --no-email        Désactive la notification email post-restore
  --help            Affiche ce message

Exit codes :
  0 = OK   1 = args   2 = backup invalide   3 = DB   4 = storage

Exemples :
  # Dry-run (vérifie le plan sans rien toucher)
  ${SCRIPT_NAME} --backup=/var/backups/omnitech/db_20260420.sql.gz --db=omnitech_restore

  # Restauration réelle dans une base de tests
  sudo ${SCRIPT_NAME} \\
    --backup=/var/backups/omnitech/db_20260420.sql.gz \\
    --db=omnitech_intranet_restore --confirm

  # Restauration prod (à utiliser uniquement après go RSSI/DSI)
  sudo ${SCRIPT_NAME} \\
    --backup=/var/backups/omnitech/db_20260420.sql.gz \\
    --db=omnitech_intranet --confirm --prod \\
    --storage=/var/backups/omnitech/storage_20260420.tar.gz
USAGE
}

# --- Parse args ---
if [ "$#" -eq 0 ]; then
  usage
  exit 1
fi

for arg in "$@"; do
  case "$arg" in
    --backup=*)  BACKUP_PATH="${arg#*=}" ;;
    --db=*)      TARGET_DB="${arg#*=}" ;;
    --storage=*) STORAGE_PATH="${arg#*=}" ;;
    --confirm)   CONFIRM=1 ;;
    --prod)      ALLOW_PROD=1 ;;
    --no-email)  SEND_EMAIL=0 ;;
    -h|--help)   usage; exit 0 ;;
    *)
      echo "ERROR: argument inconnu : $arg" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$BACKUP_PATH" ] || [ -z "$TARGET_DB" ]; then
  echo "ERROR: --backup et --db sont obligatoires." >&2
  usage
  exit 1
fi

ensure_log_dir

# --- Load env ---
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a; source "${PROJECT_DIR}/.env"; set +a
fi
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-omnitech}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
PROD_DB="${POSTGRES_DB:-omnitech_intranet}"
ALERT_EMAIL="${ALERT_EMAIL:-jmorin@omnitech-security.fr}"

# --- Header ---
log "============================================"
log "OMNITECH — Backup Restore (wrapper réel)"
log "============================================"
log "  Host        : $(hostname)"
log "  User        : $(id -un)"
log "  Backup      : ${BACKUP_PATH}"
log "  Target DB   : ${TARGET_DB} (${POSTGRES_USER}@${DB_HOST}:${DB_PORT})"
log "  Storage     : ${STORAGE_PATH:-<aucun>}"
log "  Mode        : $([ "$CONFIRM" = "1" ] && echo 'EXECUTE' || echo 'DRY-RUN')"
log "  Allow prod  : $([ "$ALLOW_PROD" = "1" ] && echo 'OUI' || echo 'NON')"
log "  Log file    : ${LOG_FILE}"

# --- 1. Vérifications du backup ---
log "1/6 — Vérification du backup"
if [ ! -f "$BACKUP_PATH" ]; then
  log "  ERROR: backup introuvable : ${BACKUP_PATH}"
  exit 2
fi
if [ ! -r "$BACKUP_PATH" ]; then
  log "  ERROR: backup non lisible : ${BACKUP_PATH}"
  exit 2
fi

BACKUP_SIZE=$(du -h "$BACKUP_PATH" 2>/dev/null | cut -f1)
BACKUP_BYTES=$(stat -c '%s' "$BACKUP_PATH" 2>/dev/null || stat -f '%z' "$BACKUP_PATH" 2>/dev/null || echo 0)
BACKUP_MTIME=$(date -r "$BACKUP_PATH" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'unknown')
BACKUP_SHA=""
if command -v sha256sum >/dev/null 2>&1; then
  BACKUP_SHA=$(sha256sum "$BACKUP_PATH" | awk '{print $1}')
fi

log "  Path        : ${BACKUP_PATH}"
log "  Taille      : ${BACKUP_SIZE} (${BACKUP_BYTES} bytes)"
log "  Modifié le  : ${BACKUP_MTIME}"
log "  SHA-256     : ${BACKUP_SHA:-(sha256sum absent)}"

if [ "${BACKUP_BYTES:-0}" -lt 100 ]; then
  log "  ERROR: backup suspect (taille < 100 bytes)"
  exit 2
fi

# --- 2. Détection format ---
log "2/6 — Détection format du dump"
DUMP_KIND=""
case "$BACKUP_PATH" in
  *.sql.gz)
    DUMP_KIND="sql_gz"
    # Détecter si c'est un dump custom (pg_dump -F c) ou plain SQL
    if gunzip -c "$BACKUP_PATH" 2>/dev/null | head -c 5 | grep -q 'PGDMP'; then
      DUMP_KIND="custom_gz"
      log "  Format détecté : pg_dump custom (gzippé)"
    else
      log "  Format détecté : SQL plain (gzippé)"
    fi
    ;;
  *.dump|*.pgdump|*.custom)
    DUMP_KIND="custom"
    log "  Format détecté : pg_dump custom"
    ;;
  *.sql)
    DUMP_KIND="sql"
    log "  Format détecté : SQL plain"
    ;;
  *.tar.gz|*.tgz)
    DUMP_KIND="tar"
    log "  Format détecté : archive tar.gz (full backup)"
    ;;
  *)
    log "  ERROR: extension non reconnue (.sql, .sql.gz, .dump, .tar.gz attendus)"
    exit 2
    ;;
esac

# --- 3. Garde-fou prod ---
log "3/6 — Garde-fou base de production"
if [ "$TARGET_DB" = "$PROD_DB" ] && [ "$ALLOW_PROD" != "1" ]; then
  log "  ERROR: la cible '${TARGET_DB}' est la base de production (${PROD_DB})."
  log "         Ajoute --prod explicitement pour autoriser l'écrasement."
  log "         (et fais valider par RSSI + DSI avant.)"
  exit 1
fi
if [ "$TARGET_DB" = "$PROD_DB" ]; then
  log "  WARNING: cible = PROD ${PROD_DB} — flag --prod fourni, on continue."
else
  log "  OK : cible '${TARGET_DB}' != prod '${PROD_DB}'"
fi

# --- 4. Dry-run check ---
if [ "$CONFIRM" != "1" ]; then
  log "4/6 — DRY-RUN (pas de --confirm) — abort sans modification"
  log "  Pour exécuter réellement : relancer avec --confirm"
  log "============================================"
  exit 0
fi

# --- Vérifier outils ---
log "4/6 — Vérification outillage Postgres"
for bin in psql pg_restore createdb dropdb gunzip; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    log "  ERROR: outil manquant : ${bin}"
    exit 3
  fi
done
log "  OK : psql / pg_restore / createdb / dropdb / gunzip présents"

# --- PGPASSFILE ---
PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:*:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

cleanup_pgpass() {
  rm -f "$PGPASS_FILE" 2>/dev/null || true
}

# Ping Postgres
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d postgres \
       -tAc 'SELECT 1;' >/dev/null 2>>"$LOG_FILE"; then
  log "  ERROR: connexion Postgres impossible (${POSTGRES_USER}@${DB_HOST}:${DB_PORT})"
  cleanup_pgpass
  exit 3
fi
log "  OK : Postgres accessible"

# --- 5. Restauration DB ---
log "5/6 — Restauration de la base ${TARGET_DB}"
RESTORE_LOG=$(mktemp)

# (Re)créer la cible : drop+create si elle existe
DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}';" 2>>"$LOG_FILE" || echo "")
if [ "$DB_EXISTS" = "1" ]; then
  log "  Drop existing DB ${TARGET_DB}"
  if ! dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
        --if-exists "$TARGET_DB" 2>>"$LOG_FILE"; then
    log "  ERROR: dropdb a échoué"
    cleanup_pgpass; rm -f "$RESTORE_LOG"
    exit 3
  fi
fi
log "  Create DB ${TARGET_DB}"
if ! createdb -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
      -O "$POSTGRES_USER" "$TARGET_DB" 2>>"$LOG_FILE"; then
  log "  ERROR: createdb a échoué"
  cleanup_pgpass; rm -f "$RESTORE_LOG"
  exit 3
fi

set +e
case "$DUMP_KIND" in
  custom_gz)
    gunzip -c "$BACKUP_PATH" | pg_restore \
      -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
      -d "$TARGET_DB" --no-owner --no-acl --exit-on-error --single-transaction \
      > "$RESTORE_LOG" 2>&1
    RC=$?
    ;;
  custom)
    pg_restore \
      -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
      -d "$TARGET_DB" --no-owner --no-acl --exit-on-error --single-transaction \
      "$BACKUP_PATH" > "$RESTORE_LOG" 2>&1
    RC=$?
    ;;
  sql_gz)
    gunzip -c "$BACKUP_PATH" | psql \
      -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
      -d "$TARGET_DB" -v ON_ERROR_STOP=1 \
      > "$RESTORE_LOG" 2>&1
    RC=$?
    ;;
  sql)
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
      -d "$TARGET_DB" -v ON_ERROR_STOP=1 -f "$BACKUP_PATH" \
      > "$RESTORE_LOG" 2>&1
    RC=$?
    ;;
  tar)
    log "  Archive tar.gz détectée — extraction temporaire"
    EXTRACT_DIR=$(mktemp -d)
    tar -xzf "$BACKUP_PATH" -C "$EXTRACT_DIR" 2>>"$LOG_FILE"
    INNER_DUMP=$(find "$EXTRACT_DIR" -maxdepth 4 -type f \
      \( -name 'database.sql.gz' -o -name 'db_*.sql.gz' \) | head -1)
    if [ -z "$INNER_DUMP" ]; then
      log "  ERROR: dump SQL introuvable dans l'archive"
      RC=2
    else
      log "  Dump interne : ${INNER_DUMP}"
      gunzip -c "$INNER_DUMP" | psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
        -d "$TARGET_DB" -v ON_ERROR_STOP=1 \
        > "$RESTORE_LOG" 2>&1
      RC=$?
    fi
    rm -rf "$EXTRACT_DIR"
    ;;
esac
set -e

if [ "$RC" != "0" ]; then
  log "  ERROR: restauration échouée (rc=$RC) — extrait :"
  tail -20 "$RESTORE_LOG" | tee -a "$LOG_FILE" >/dev/null
  rm -f "$RESTORE_LOG"
  cleanup_pgpass
  exit 3
fi
rm -f "$RESTORE_LOG"
log "  Restauration DB OK"

# Sanity check : compte les tables
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$TARGET_DB" -tAc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public';" 2>>"$LOG_FILE" || echo 0)
log "  Tables publiques restaurées : ${TABLE_COUNT}"
if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
  log "  ERROR: aucune table après restore — backup vide ?"
  cleanup_pgpass
  exit 3
fi

cleanup_pgpass

# --- 6. Storage (optionnel) ---
log "6/6 — Storage"
STORAGE_RESTORED="non"
if [ -n "$STORAGE_PATH" ]; then
  if [ ! -f "$STORAGE_PATH" ]; then
    log "  ERROR: archive storage introuvable : ${STORAGE_PATH}"
    exit 4
  fi
  STORAGE_TARGET="${PROJECT_DIR}/storage"
  log "  Restauration de ${STORAGE_PATH} -> ${STORAGE_TARGET}"
  mkdir -p "$STORAGE_TARGET" || { log "  ERROR: mkdir échoué"; exit 4; }
  if ! tar -xzf "$STORAGE_PATH" -C "$(dirname "$STORAGE_TARGET")" 2>>"$LOG_FILE"; then
    log "  ERROR: tar -xzf a échoué"
    exit 4
  fi
  STORAGE_RESTORED="oui ($(du -sh "$STORAGE_TARGET" 2>/dev/null | cut -f1))"
  log "  Storage restauré : ${STORAGE_RESTORED}"
else
  log "  Pas de --storage fourni — étape sautée"
fi

# --- Notification email ---
DURATION=$(( $(date +%s) - START_TS ))
SUMMARY="OMNITECH — Backup restore terminé sur $(hostname)

Cible        : ${TARGET_DB}
Source       : ${BACKUP_PATH}
Taille       : ${BACKUP_SIZE}
SHA-256      : ${BACKUP_SHA:-n/a}
Tables OK    : ${TABLE_COUNT}
Storage      : ${STORAGE_RESTORED}
Durée        : ${DURATION}s
Log complet  : ${LOG_FILE}

Checklist post-restore : voir RESTORE.md (section 'Checklist post-restore')."

if [ "$SEND_EMAIL" = "1" ] && command -v mail >/dev/null 2>&1 && [ -n "$ALERT_EMAIL" ]; then
  if printf '%s\n' "$SUMMARY" | mail -s "[OMNITECH] Restore OK — ${TARGET_DB}" "$ALERT_EMAIL"; then
    log "Notification envoyée à ${ALERT_EMAIL}"
  else
    log "WARNING: envoi mail à ${ALERT_EMAIL} a échoué"
  fi
else
  log "Notification email désactivée ou 'mail' non installé"
fi

log "============================================"
log "RESTAURATION TERMINÉE en ${DURATION}s — DB '${TARGET_DB}' prête"
log "============================================"
exit 0
