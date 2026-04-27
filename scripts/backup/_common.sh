#!/usr/bin/env bash
# =============================================================================
# Helpers communs pour les scripts Restic (item 20 Wave D)
# Source ce fichier dans tous les scripts backup/ via :
#   source "$(dirname "$0")/_common.sh"
# =============================================================================
set -euo pipefail

# === Config commune ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${LOG_DIR:-/var/log/omnitech}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/restic.log}"

mkdir -p "$LOG_DIR" 2>/dev/null || true

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

err() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

# === Chargement env ===
load_env() {
  if [ -f "${PROJECT_DIR}/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_DIR}/.env"
    set +a
  fi
}

# === Vérifications obligatoires ===
require_restic() {
  if ! command -v restic >/dev/null 2>&1; then
    err "restic CLI introuvable. Installer : apt install restic OU télécharger depuis github.com/restic/restic"
    exit 1
  fi
  # Variables obligatoires (l'absence = abort, pas de fallback dangereux)
  : "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY non défini dans .env (ex: s3:s3.fr-par.scw.cloud/omnitech-backups/intranet)}"
  : "${RESTIC_PASSWORD:?RESTIC_PASSWORD non défini dans .env (générer : openssl rand -base64 32)}"
  # Pour S3 (Scaleway/AWS/etc.), ces deux-là sont obligatoires
  if [[ "$RESTIC_REPOSITORY" == s3:* ]] || [[ "$RESTIC_REPOSITORY" == b2:* ]]; then
    : "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID requis pour repo S3}"
    : "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY requis pour repo S3}"
  fi
  export RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
  # Optionnel : tag identifiant l'hôte source
  export RESTIC_HOST="${RESTIC_HOST:-$(hostname -s)}"
}

# === Hook de sortie : alerte si échec ===
on_exit() {
  local rc=$?
  if [ $rc -ne 0 ]; then
    err "Script $(basename "$0") a échoué (exit=$rc)"
    if command -v systemctl >/dev/null 2>&1 && \
       systemctl list-unit-files alerter@.service &>/dev/null; then
      systemctl start "alerter@$(basename "$0" .sh).service" 2>/dev/null || true
    fi
  fi
  exit $rc
}
trap on_exit EXIT
