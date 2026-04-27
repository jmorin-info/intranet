#!/usr/bin/env bash
# =============================================================================
# backup-storage.sh — Sauvegarde des fichiers uploadés vers Restic/S3
# -----------------------------------------------------------------------------
# Wave D item 20 — Backup offsite chiffré pour les pièces jointes / médias.
#
# Couvre /var/omnitech/storage (chartes, vidéos, documents, posts médias)
# avec déduplication Restic : seuls les chunks nouveaux sont uploadés.
#
# RPO storage = 24h (cron quotidien). Si besoin RPO plus serré, programmer
# un timer toutes les 6h (impact bande passante minime grâce au dedup).
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

load_env
require_restic

STORAGE_PATH="${STORAGE_PATH:-/var/omnitech/storage}"

if [ ! -d "$STORAGE_PATH" ]; then
  err "STORAGE_PATH=${STORAGE_PATH} introuvable. Skip backup storage."
  exit 0  # exit 0 pour ne pas spammer les alertes si le dir est juste manquant
fi

log "=== Backup storage -> Restic offsite ==="
log "  Source : ${STORAGE_PATH}"
log "  Repo   : ${RESTIC_REPOSITORY}"

# Restic gère lui-même la dedup et le chiffrement
# --exclude : on évite les fichiers temporaires + caches potentiels
restic backup "$STORAGE_PATH" \
  --tag storage --tag "host:${RESTIC_HOST}" \
  --host "$RESTIC_HOST" \
  --exclude "*.tmp" \
  --exclude ".cache" \
  --exclude "node_modules" \
  --one-file-system

log "=== Backup storage OK ==="
