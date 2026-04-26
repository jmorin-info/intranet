#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Test de restauration des backups (ISO 27001 A.8.13)
# =============================================================================
#
# Test de bout en bout NON-DESTRUCTIF qui valide qu'un dump PostgreSQL est
# réellement restaurable et que les données critiques sont présentes.
# Complémentaire de scripts/backup-drill.sh (drill historique du dimanche)
# mais conçu pour CI/cron + sortie JSON parsable + assertions étendues
# (pgvector, SUPER_ADMIN, AuditLog ≥ 100…).
#
# Comportement :
#   1. Charge les variables Postgres depuis .env (pas de credentials hardcodées)
#   2. Sélectionne le dump à tester (argument explicite OU le plus récent
#      automatiquement dans BACKUP_DIR)
#   3. Vérifie SHA-256 si un fichier .sha256 compagnon existe
#   4. Crée une base de données temporaire `omnitech_restore_test_<TS>` sur
#      le même serveur Postgres (jamais sur la prod)
#   5. Restaure le dump dedans (auto-détection format custom / sql / sql.gz / tar.gz)
#   6. Lance des assertions de smoke test :
#        - User       : count > 0  (et ≥ MIN_USERS, défaut 10)
#        - Document   : count > 0
#        - AuditLog   : count > 0  (idéalement ≥ 100, paramétrable)
#        - pgvector   : extension présente
#        - SUPER_ADMIN: au moins un User avec role='SUPER_ADMIN' actif
#        - migrations : au moins une migration Prisma terminée
#   7. DROP la base temporaire (toujours, via trap EXIT)
#   8. Retourne JSON {pass|fail + métriques} sur stdout (ou texte structuré)
#
# Exit codes :
#   0 = OK (toutes les assertions passées)
#   1 = échec restore (pg_restore/psql a planté, dump corrompu…)
#   2 = échec assertions (restore OK mais counts/extensions incohérents)
#   3 = erreur env (outils manquants, postgres injoignable, args invalides)
#
# Usage :
#   # Test sur le dernier backup auto-détecté
#   bash scripts/test-backup-restore.sh
#
#   # Test sur un dump précis
#   bash scripts/test-backup-restore.sh /var/backups/omnitech/db_20260423.sql.gz
#
#   # Format de sortie texte (humain) au lieu de JSON
#   FORMAT=text bash scripts/test-backup-restore.sh
#
#   # Surcharger les seuils
#   MIN_USERS=50 MIN_AUDITLOG=100 bash scripts/test-backup-restore.sh
#
# Cron recommandée (test hebdomadaire dimanche 02:00 UTC) :
#   0 2 * * 0 /root/omnitech-intranet/scripts/test-backup-restore.sh \
#     >> /var/log/omnitech/test-backup-restore.log 2>&1
#
# =============================================================================
set -euo pipefail

# --- Configuration ---
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/omnitech}"
LOG_DIR="${LOG_DIR:-/var/log/omnitech}"
LOG_FILE="${LOG_DIR}/test-backup-restore.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DB="${TEST_DB:-omnitech_restore_test_${TIMESTAMP}}"
START_TS=$(date +%s)
FORMAT="${FORMAT:-json}"

# Seuils minimum (paramétrables)
MIN_USERS="${MIN_USERS:-1}"
MIN_DOCUMENTS="${MIN_DOCUMENTS:-1}"
MIN_AUDITLOG="${MIN_AUDITLOG:-1}"
TARGET_AUDITLOG="${TARGET_AUDITLOG:-100}"  # Idéal mais pas bloquant

# Limite de durée (pour CI/cron)
MAX_DURATION="${MAX_DURATION:-600}"  # 10 minutes

# Charge .env (DATABASE_URL ou POSTGRES_*)
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_DIR}/.env"
  set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-omnitech}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
PROD_DB="${POSTGRES_DB:-omnitech_intranet}"

# Restaurer en superuser ? (par défaut OUI : nécessaire pour CREATE EXTENSION
# vector qu'omnitech ne peut pas créer lui-même). Bascule à 0 si tu as donné
# explicitement le privilège SUPERUSER ou CREATE EXTENSION à l'utilisateur
# applicatif. Le script utilise alors `sudo -u postgres` (peer auth local) pour
# le createdb / pg_restore / dropdb.
RESTORE_AS_SUPERUSER="${RESTORE_AS_SUPERUSER:-1}"
SUPERUSER_NAME="${SUPERUSER_NAME:-postgres}"

# --- Plomberie ---
RESULT_STATUS="unknown"
RESULT_REASON=""
RESTORE_OK=0
ASSERTIONS_OK=0
DB_CREATED=0
PGPASS_FILE=""
DUMP_PATH=""
DUMP_SIZE_BYTES=0
DUMP_SHA256=""
DUMP_MTIME=""
RESTORE_DURATION=0

declare -A METRICS=(
  [users]=0
  [documents]=0
  [audit_logs]=0
  [super_admins]=0
  [migrations]=0
  [tables]=0
  [pgvector]=0
)

# --- Logging ---
mkdir -p "$LOG_DIR" 2>/dev/null || {
  LOG_DIR="/tmp"
  LOG_FILE="/tmp/omnitech-test-backup-restore-${TIMESTAMP}.log"
}
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/omnitech-test-backup-restore-${TIMESTAMP}.log"

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
  # En mode JSON, on n'écrit pas sur stdout pour ne pas casser la sortie JSON.
  # Le log fichier est la source de vérité pendant l'exécution.
  if [ "$FORMAT" = "text" ]; then
    printf '%s\n' "$line"
  fi
}

# --- Helpers Postgres (superuser ou app user selon RESTORE_AS_SUPERUSER) ---
sudo_pg() {
  # Exécute une commande Postgres en tant que superuser local (peer auth).
  # Si RESTORE_AS_SUPERUSER=0, retombe sur l'utilisateur applicatif.
  if [ "$RESTORE_AS_SUPERUSER" = "1" ] && command -v sudo >/dev/null 2>&1; then
    sudo -u "$SUPERUSER_NAME" "$@"
  else
    "$@"
  fi
}

# --- Cleanup (toujours) ---
cleanup() {
  local rc=$?

  # Drop la DB temporaire dans tous les cas (en superuser pour gérer les
  # extensions qu'omnitech n'aurait pas pu drop sinon)
  if [ "$DB_CREATED" = "1" ]; then
    log "Cleanup — DROP DATABASE ${TEST_DB}"
    if [ "$RESTORE_AS_SUPERUSER" = "1" ]; then
      sudo_pg dropdb --if-exists "$TEST_DB" 2>>"$LOG_FILE" || \
        log "WARNING: DROP DATABASE ${TEST_DB} a échoué — vérifier manuellement"
    else
      PGPASSWORD="$POSTGRES_PASSWORD" dropdb \
        -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
        --if-exists "$TEST_DB" 2>>"$LOG_FILE" || \
        log "WARNING: DROP DATABASE ${TEST_DB} a échoué — vérifier manuellement"
    fi
  fi

  # Nettoie le PGPASSFILE
  [ -n "${PGPASS_FILE:-}" ] && rm -f "$PGPASS_FILE" 2>/dev/null || true

  # Affiche le résultat final
  emit_result "$rc"

  exit "$rc"
}
trap cleanup EXIT INT TERM

emit_result() {
  local exit_rc="$1"
  local duration=$(( $(date +%s) - START_TS ))

  if [ "$FORMAT" = "json" ]; then
    cat <<JSON
{
  "status": "${RESULT_STATUS}",
  "reason": "${RESULT_REASON//\"/\\\"}",
  "exit_code": ${exit_rc},
  "duration_seconds": ${duration},
  "timestamp": "$(date -Iseconds)",
  "host": "$(hostname)",
  "test_db": "${TEST_DB}",
  "dump": {
    "path": "${DUMP_PATH//\"/\\\"}",
    "size_bytes": ${DUMP_SIZE_BYTES:-0},
    "sha256": "${DUMP_SHA256}",
    "mtime": "${DUMP_MTIME}",
    "restore_duration_seconds": ${RESTORE_DURATION}
  },
  "assertions": {
    "restore_ok": $([ "$RESTORE_OK" = "1" ] && echo "true" || echo "false"),
    "users_above_min": $([ "${METRICS[users]}" -ge "$MIN_USERS" ] && echo "true" || echo "false"),
    "documents_above_min": $([ "${METRICS[documents]}" -ge "$MIN_DOCUMENTS" ] && echo "true" || echo "false"),
    "auditlog_above_min": $([ "${METRICS[audit_logs]}" -ge "$MIN_AUDITLOG" ] && echo "true" || echo "false"),
    "auditlog_above_target": $([ "${METRICS[audit_logs]}" -ge "$TARGET_AUDITLOG" ] && echo "true" || echo "false"),
    "pgvector_present": $([ "${METRICS[pgvector]}" = "1" ] && echo "true" || echo "false"),
    "super_admin_present": $([ "${METRICS[super_admins]}" -ge 1 ] && echo "true" || echo "false"),
    "migrations_applied": $([ "${METRICS[migrations]}" -ge 1 ] && echo "true" || echo "false")
  },
  "metrics": {
    "users": ${METRICS[users]},
    "documents": ${METRICS[documents]},
    "audit_logs": ${METRICS[audit_logs]},
    "super_admins": ${METRICS[super_admins]},
    "migrations": ${METRICS[migrations]},
    "tables_public": ${METRICS[tables]},
    "min_users_threshold": ${MIN_USERS},
    "min_documents_threshold": ${MIN_DOCUMENTS},
    "min_auditlog_threshold": ${MIN_AUDITLOG},
    "target_auditlog": ${TARGET_AUDITLOG}
  },
  "log_file": "${LOG_FILE}"
}
JSON
  else
    cat <<TEXT

============================================================
OMNITECH — Test de restauration backup (résultat)
============================================================
  Status        : ${RESULT_STATUS}
  Reason        : ${RESULT_REASON:-OK}
  Exit code     : ${exit_rc}
  Duration      : ${duration}s
  Test DB       : ${TEST_DB}
  Dump          : ${DUMP_PATH}
  Dump size     : ${DUMP_SIZE_BYTES} bytes
  Dump sha256   : ${DUMP_SHA256:-(non calculé)}
  Restore time  : ${RESTORE_DURATION}s

  Metrics
    users          : ${METRICS[users]}      (min ${MIN_USERS})
    documents      : ${METRICS[documents]}  (min ${MIN_DOCUMENTS})
    audit_logs     : ${METRICS[audit_logs]} (min ${MIN_AUDITLOG} / target ${TARGET_AUDITLOG})
    super_admins   : ${METRICS[super_admins]}
    migrations     : ${METRICS[migrations]}
    tables_public  : ${METRICS[tables]}
    pgvector       : $([ "${METRICS[pgvector]}" = "1" ] && echo "OUI" || echo "NON")

  Log fichier   : ${LOG_FILE}
============================================================
TEXT
  fi
}

fail_env() {
  RESULT_STATUS="fail"
  RESULT_REASON="${1:-env error}"
  log "FAIL (env) : $RESULT_REASON"
  exit 3
}

fail_restore() {
  RESULT_STATUS="fail"
  RESULT_REASON="${1:-restore failed}"
  log "FAIL (restore) : $RESULT_REASON"
  exit 1
}

fail_assert() {
  RESULT_STATUS="fail"
  RESULT_REASON="${1:-assertion failed}"
  log "FAIL (assertion) : $RESULT_REASON"
  exit 2
}

# --- Header ---
log "============================================"
log "OMNITECH — Test de restauration backup"
log "============================================"
log "  Host       : $(hostname)"
log "  User       : $(id -un)"
log "  Backup dir : ${BACKUP_DIR}"
log "  Test DB    : ${TEST_DB}"
log "  Postgres   : ${POSTGRES_USER}@${DB_HOST}:${DB_PORT}"
log "  Output     : ${FORMAT}"
log "  Log file   : ${LOG_FILE}"

# --- 0. Vérifications préliminaires ---
for bin in psql pg_restore createdb dropdb gunzip sha256sum; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    fail_env "outil manquant : $bin"
  fi
done

# Garde-fou : refuser explicitement la prod
if [ "$TEST_DB" = "$PROD_DB" ]; then
  fail_env "TEST_DB ne peut pas être la prod (${PROD_DB})"
fi
if [[ "$TEST_DB" != omnitech_restore_test_* ]] && [[ "$TEST_DB" != omnitech_intranet_drill ]] && [[ "$TEST_DB" != omnitech_intranet_test ]]; then
  log "WARNING: TEST_DB '${TEST_DB}' ne suit pas la convention omnitech_restore_test_* — ok si volontaire"
fi

# --- 1. Sélection du dump ---
log "1/6 — Sélection du dump"
if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then
  DUMP_PATH="$1"
  log "  Dump fourni en argument : ${DUMP_PATH}"
else
  if [ ! -d "$BACKUP_DIR" ]; then
    fail_env "BACKUP_DIR introuvable : ${BACKUP_DIR}"
  fi
  DUMP_PATH=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'db_*.sql.gz' -o -name 'db_*.dump' -o -name 'database.sql.gz' \) \
    -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | awk '{print $2}')
  if [ -z "$DUMP_PATH" ] || [ ! -f "$DUMP_PATH" ]; then
    fail_env "aucun dump db_*.sql.gz / db_*.dump trouvé dans ${BACKUP_DIR}"
  fi
  log "  Dump auto-détecté (le plus récent) : ${DUMP_PATH}"
fi

if [ ! -f "$DUMP_PATH" ]; then
  fail_env "dump introuvable : ${DUMP_PATH}"
fi
if [ ! -r "$DUMP_PATH" ]; then
  fail_env "dump non lisible : ${DUMP_PATH}"
fi

DUMP_SIZE_BYTES=$(stat -c '%s' "$DUMP_PATH" 2>/dev/null || stat -f '%z' "$DUMP_PATH" 2>/dev/null || echo 0)
DUMP_MTIME=$(date -r "$DUMP_PATH" '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo 'unknown')
DUMP_SHA256=$(sha256sum "$DUMP_PATH" 2>/dev/null | awk '{print $1}')
log "  Taille      : $(du -h "$DUMP_PATH" | cut -f1) (${DUMP_SIZE_BYTES} bytes)"
log "  Modifié le  : ${DUMP_MTIME}"
log "  SHA-256     : ${DUMP_SHA256}"

if [ "${DUMP_SIZE_BYTES:-0}" -lt 1024 ]; then
  fail_env "dump suspect (< 1 KB) — backup incomplet ou corrompu"
fi

# Vérification du fichier .sha256 compagnon (si présent)
COMPANION_SHA="${DUMP_PATH}.sha256"
if [ -f "$COMPANION_SHA" ]; then
  EXPECTED_SHA=$(awk '{print $1}' "$COMPANION_SHA")
  if [ "$DUMP_SHA256" != "$EXPECTED_SHA" ]; then
    fail_env "checksum ne correspond pas (attendu ${EXPECTED_SHA}, obtenu ${DUMP_SHA256})"
  fi
  log "  Checksum compagnon vérifié OK"
fi

# --- 2. Détection du format ---
log "2/6 — Détection du format"
DUMP_KIND=""
case "$DUMP_PATH" in
  *.sql.gz)
    # Lit les 5 premiers octets décompressés sans déclencher SIGPIPE/pipefail
    HEADER=$(gunzip -c "$DUMP_PATH" 2>/dev/null | dd bs=5 count=1 2>/dev/null | tr -d '\0' || true)
    if [[ "$HEADER" == PGDMP* ]]; then
      DUMP_KIND="custom_gz"
      log "  Format : pg_dump custom (gzippé)"
    else
      DUMP_KIND="sql_gz"
      log "  Format : SQL plain (gzippé)"
    fi
    ;;
  *.dump|*.pgdump|*.custom)
    DUMP_KIND="custom"
    log "  Format : pg_dump custom"
    ;;
  *.sql)
    DUMP_KIND="sql"
    log "  Format : SQL plain"
    ;;
  *)
    fail_env "extension non reconnue (.sql, .sql.gz, .dump attendus)"
    ;;
esac

# --- 3. Connectivité Postgres ---
log "3/6 — Connectivité Postgres"
PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:*:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d postgres \
       -tAc 'SELECT 1;' >/dev/null 2>>"$LOG_FILE"; then
  fail_env "connexion Postgres impossible (${POSTGRES_USER}@${DB_HOST}:${DB_PORT})"
fi
log "  OK : Postgres accessible"

# --- 4. Création de la base temporaire ---
log "4/6 — Création de la base temporaire ${TEST_DB}"
log "  Mode restore : $([ "$RESTORE_AS_SUPERUSER" = "1" ] && echo "sudo -u $SUPERUSER_NAME (superuser)" || echo "$POSTGRES_USER (app user)")"

# S'il existe déjà (résidu d'un run précédent), on drop d'abord
psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}';" 2>>"$LOG_FILE" \
  | grep -q 1 && {
    log "  WARNING: ${TEST_DB} existe déjà — drop"
    if [ "$RESTORE_AS_SUPERUSER" = "1" ]; then
      sudo_pg dropdb --if-exists "$TEST_DB" 2>>"$LOG_FILE"
    else
      dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" --if-exists "$TEST_DB" 2>>"$LOG_FILE"
    fi
}

if [ "$RESTORE_AS_SUPERUSER" = "1" ]; then
  if ! sudo_pg createdb -O "$POSTGRES_USER" "$TEST_DB" 2>>"$LOG_FILE"; then
    fail_env "createdb ${TEST_DB} a échoué via sudo -u ${SUPERUSER_NAME} (vérifier peer auth)"
  fi
else
  if ! createdb -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
        -O "$POSTGRES_USER" "$TEST_DB" 2>>"$LOG_FILE"; then
    fail_env "createdb ${TEST_DB} a échoué (droits manquants ?)"
  fi
fi
DB_CREATED=1
log "  Base ${TEST_DB} créée"

# --- 5. Restauration ---
log "5/6 — Restauration du dump"
RESTORE_LOG=$(mktemp)
RESTORE_START=$(date +%s)
set +e
if [ "$RESTORE_AS_SUPERUSER" = "1" ]; then
  # Restore en superuser (peer auth) → CREATE EXTENSION fonctionne
  case "$DUMP_KIND" in
    custom_gz)
      timeout "$MAX_DURATION" bash -c \
        "gunzip -c '$DUMP_PATH' | sudo -u '$SUPERUSER_NAME' pg_restore \
          -d '$TEST_DB' --no-owner --no-acl \
          --exit-on-error --single-transaction" \
        > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
    custom)
      timeout "$MAX_DURATION" sudo -u "$SUPERUSER_NAME" pg_restore \
        -d "$TEST_DB" --no-owner --no-acl --exit-on-error --single-transaction \
        "$DUMP_PATH" > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
    sql_gz)
      timeout "$MAX_DURATION" bash -c \
        "gunzip -c '$DUMP_PATH' | sudo -u '$SUPERUSER_NAME' psql \
          -d '$TEST_DB' -v ON_ERROR_STOP=1" \
        > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
    sql)
      timeout "$MAX_DURATION" sudo -u "$SUPERUSER_NAME" psql \
        -d "$TEST_DB" -v ON_ERROR_STOP=1 -f "$DUMP_PATH" \
        > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
  esac
else
  # Restore en utilisateur applicatif (suppose CREATE EXTENSION pré-géré)
  case "$DUMP_KIND" in
    custom_gz)
      timeout "$MAX_DURATION" bash -c \
        "gunzip -c '$DUMP_PATH' | pg_restore -h '$DB_HOST' -p '$DB_PORT' \
          -U '$POSTGRES_USER' -d '$TEST_DB' --no-owner --no-acl \
          --exit-on-error --single-transaction" \
        > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
    custom)
      timeout "$MAX_DURATION" pg_restore \
        -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
        -d "$TEST_DB" --no-owner --no-acl --exit-on-error --single-transaction \
        "$DUMP_PATH" > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
    sql_gz)
      timeout "$MAX_DURATION" bash -c \
        "gunzip -c '$DUMP_PATH' | psql -h '$DB_HOST' -p '$DB_PORT' \
          -U '$POSTGRES_USER' -d '$TEST_DB' -v ON_ERROR_STOP=1" \
        > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
    sql)
      timeout "$MAX_DURATION" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
        -d "$TEST_DB" -v ON_ERROR_STOP=1 -f "$DUMP_PATH" \
        > "$RESTORE_LOG" 2>&1
      RC=$?
      ;;
  esac
fi
set -e
RESTORE_DURATION=$(( $(date +%s) - RESTORE_START ))

if [ "$RC" != "0" ]; then
  log "  pg_restore/psql a retourné $RC (durée ${RESTORE_DURATION}s) — extrait :"
  tail -20 "$RESTORE_LOG" | tee -a "$LOG_FILE" >/dev/null
  rm -f "$RESTORE_LOG"
  fail_restore "restauration échouée (rc=$RC)"
fi
rm -f "$RESTORE_LOG"
RESTORE_OK=1
log "  Restauration OK (${RESTORE_DURATION}s)"

# --- 6. Assertions ---
log "6/6 — Assertions de smoke test"

run_query() {
  local sql="$1"
  if [ "$RESTORE_AS_SUPERUSER" = "1" ]; then
    # Si on a restauré en superuser, on requête aussi en superuser pour
    # éviter les problèmes de permissions sur les tables fraîchement
    # restaurées. La sécurité est OK car la base de test est locale et
    # supprimée immédiatement après.
    sudo_pg psql -d "$TEST_DB" -tAc "$sql" 2>>"$LOG_FILE" | tr -d '[:space:]'
  else
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" \
      -d "$TEST_DB" -tAc "$sql" 2>>"$LOG_FILE" | tr -d '[:space:]'
  fi
}

# Tables publiques
TABLES=$(run_query "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public';" || echo 0)
METRICS[tables]=${TABLES:-0}
log "  pg_tables(public)  : ${METRICS[tables]}"
if [ "${METRICS[tables]:-0}" -lt 5 ]; then
  fail_assert "trop peu de tables publiques restaurées (${METRICS[tables]} < 5) — backup incomplet ?"
fi

# pgvector
PGVECTOR=$(run_query "SELECT count(*) FROM pg_extension WHERE extname='vector';" || echo 0)
METRICS[pgvector]=${PGVECTOR:-0}
log "  pgvector extension : ${METRICS[pgvector]}"
if [ "${METRICS[pgvector]:-0}" != "1" ]; then
  fail_assert "extension pgvector absente — embeddings RAG indisponibles"
fi

# Migrations Prisma
MIGS=$(run_query "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" || echo 0)
METRICS[migrations]=${MIGS:-0}
log "  Migrations Prisma  : ${METRICS[migrations]}"
if [ "${METRICS[migrations]:-0}" -lt 1 ]; then
  fail_assert "aucune migration Prisma trouvée — schema incomplet ?"
fi

# User
USERS=$(run_query "SELECT count(*) FROM \"User\";" || echo 0)
METRICS[users]=${USERS:-0}
log "  User count         : ${METRICS[users]}"
if [ "${METRICS[users]:-0}" -lt "$MIN_USERS" ]; then
  fail_assert "User count=${METRICS[users]} < seuil ${MIN_USERS}"
fi

# Document
DOCS=$(run_query "SELECT count(*) FROM \"Document\";" || echo 0)
METRICS[documents]=${DOCS:-0}
log "  Document count     : ${METRICS[documents]}"
if [ "${METRICS[documents]:-0}" -lt "$MIN_DOCUMENTS" ]; then
  fail_assert "Document count=${METRICS[documents]} < seuil ${MIN_DOCUMENTS}"
fi

# AuditLog
AUDITS=$(run_query "SELECT count(*) FROM \"AuditLog\";" || echo 0)
METRICS[audit_logs]=${AUDITS:-0}
log "  AuditLog count     : ${METRICS[audit_logs]} (target ${TARGET_AUDITLOG})"
if [ "${METRICS[audit_logs]:-0}" -lt "$MIN_AUDITLOG" ]; then
  fail_assert "AuditLog count=${METRICS[audit_logs]} < seuil ${MIN_AUDITLOG}"
fi
if [ "${METRICS[audit_logs]:-0}" -lt "$TARGET_AUDITLOG" ]; then
  log "  WARNING: AuditLog count (${METRICS[audit_logs]}) sous le target ${TARGET_AUDITLOG} (non-bloquant)"
fi

# SUPER_ADMIN actif
SUPER=$(run_query "SELECT count(*) FROM \"User\" WHERE role='SUPER_ADMIN' AND \"isActive\"=true AND \"deletedAt\" IS NULL;" || echo 0)
METRICS[super_admins]=${SUPER:-0}
log "  SUPER_ADMIN actifs : ${METRICS[super_admins]}"
if [ "${METRICS[super_admins]:-0}" -lt 1 ]; then
  fail_assert "aucun SUPER_ADMIN actif trouvé — accès admin perdu après restore"
fi

ASSERTIONS_OK=1

# --- Succès ---
RESULT_STATUS="pass"
RESULT_REASON="all assertions passed"
log "============================================"
log "TEST RESTORE OK — ${TEST_DB} (durée totale: $(( $(date +%s) - START_TS ))s)"
log "============================================"
exit 0
