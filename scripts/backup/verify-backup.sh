#!/usr/bin/env bash
# =============================================================================
# verify-backup.sh — Vérification d'intégrité du repo Restic
# -----------------------------------------------------------------------------
# Wave D item 20 — Test mensuel de l'intégrité offsite.
#
# `restic check` valide la structure du repo (manifests, index).
# `--read-data-subset=1G` lit et déchiffre 1GB aléatoire pour s'assurer
# qu'il n'y a pas de bit-rot ou de corruption silencieuse.
#
# Schedule : timer mensuel (1er du mois 04h).
# Si échec : alerte critique → restore complet à reconstruire.
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

load_env
require_restic

CHECK_SUBSET="${RESTIC_CHECK_SUBSET:-1G}"

log "=== Vérification intégrité Restic ==="
log "  Repo   : ${RESTIC_REPOSITORY}"
log "  Subset : ${CHECK_SUBSET} (échantillon aléatoire de données)"

# 1. Structure (rapide, ~1min)
log "1/2 — restic check (structure index/manifests)"
restic check

# 2. Échantillon de données (lourd selon subset, mais ne bloque pas la prod)
log "2/2 — restic check --read-data-subset=${CHECK_SUBSET}"
restic check --read-data-subset="$CHECK_SUBSET"

log "=== Verify OK : aucune corruption détectée ==="
