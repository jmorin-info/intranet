#!/usr/bin/env bash
# =============================================================================
# backup-prune.sh — Politique de rétention Restic + nettoyage du repo
# -----------------------------------------------------------------------------
# Wave D item 20 — Rotation des snapshots offsite.
#
# Politique GFS étendue :
#   --keep-daily    7
#   --keep-weekly   4
#   --keep-monthly 12
#   --keep-yearly   3
#
# `forget` marque les snapshots à supprimer dans le DCS Restic.
# `prune` libère ensuite l'espace disque côté provider S3.
#
# IMPORTANT : prune est lourd (relire les blobs). À programmer hebdo (dim 03h),
# pas quotidien. Le script est idempotent et compatible mode dry-run.
#
# Usage :
#   bash backup-prune.sh                # Prod (forget + prune)
#   DRY_RUN=1 bash backup-prune.sh      # Affiche seulement, ne supprime rien
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

load_env
require_restic

KEEP_DAILY="${RESTIC_KEEP_DAILY:-7}"
KEEP_WEEKLY="${RESTIC_KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${RESTIC_KEEP_MONTHLY:-12}"
KEEP_YEARLY="${RESTIC_KEEP_YEARLY:-3}"
DRY_RUN="${DRY_RUN:-0}"

DRY_FLAG=""
if [ "$DRY_RUN" = "1" ]; then
  DRY_FLAG="--dry-run"
  log "DRY_RUN=1 — aucune suppression effective"
fi

log "=== Backup prune (GFS rotation) ==="
log "  daily=${KEEP_DAILY} weekly=${KEEP_WEEKLY} monthly=${KEEP_MONTHLY} yearly=${KEEP_YEARLY}"

# 1. forget — marque les snapshots à supprimer selon politique GFS
log "1/2 — restic forget"
# shellcheck disable=SC2086
restic forget \
  --keep-daily "$KEEP_DAILY" \
  --keep-weekly "$KEEP_WEEKLY" \
  --keep-monthly "$KEEP_MONTHLY" \
  --keep-yearly "$KEEP_YEARLY" \
  --group-by "host,tag" \
  $DRY_FLAG

# 2. prune — libère l'espace côté repo (lourd : peut prendre 10-30min)
log "2/2 — restic prune"
# shellcheck disable=SC2086
restic prune $DRY_FLAG

log "=== Prune OK ==="
