#!/usr/bin/env bash
# =============================================================================
# check-patroni-leader.sh
# -----------------------------------------------------------------------------
# Script de check pour keepalived (vrrp_script chk_patroni_leader).
#
#   Exit 0 → ce nœud est LEADER Patroni → keepalived peut prendre la VIP
#   Exit 1 → ce nœud est REPLICA / DOWN  → keepalived libère la VIP
#
# Patroni expose son état sur l'API REST locale en :
#   GET http://localhost:8008/leader  → 200 si leader, 503 sinon
#   GET http://localhost:8008/health  → 200 si Postgres OK
#
# Référence : https://patroni.readthedocs.io/en/latest/rest_api.html
# =============================================================================
set -euo pipefail

PATRONI_HOST="${PATRONI_HOST:-127.0.0.1}"
PATRONI_PORT="${PATRONI_PORT:-8008}"
TIMEOUT="${TIMEOUT:-3}"

# Petit log local rotation gérée par logrotate (cf. infra/logrotate-omnitech-backup)
LOG_FILE="${LOG_FILE:-/var/log/keepalived/check-patroni-leader.log}"
log() {
  # On évite de spammer le log en mode "leader OK" (1 ligne / 60 bascules)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE" 2>/dev/null || true
}

# === Appel API Patroni ===
# /leader retourne 200 strict si leader, sinon 503 — pas besoin de parser JSON
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" \
  "http://${PATRONI_HOST}:${PATRONI_PORT}/leader" 2>/dev/null || echo "000")

case "$HTTP_CODE" in
  200)
    # Leader confirmé
    exit 0
    ;;
  503)
    # Replica ou en cours de bascule — pas leader
    exit 1
    ;;
  000)
    # API Patroni injoignable (Patroni down ou réseau coupé)
    log "ERROR: Patroni API unreachable on ${PATRONI_HOST}:${PATRONI_PORT}"
    exit 1
    ;;
  *)
    log "ERROR: unexpected HTTP code from Patroni: $HTTP_CODE"
    exit 1
    ;;
esac
