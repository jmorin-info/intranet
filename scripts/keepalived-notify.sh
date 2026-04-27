#!/usr/bin/env bash
# =============================================================================
# keepalived-notify.sh — hook notify_{master,backup,fault} pour keepalived
# Loggue l'évènement et envoie une alerte via alerter.service (item 19/20).
# =============================================================================
set -euo pipefail

STATE="${1:-UNKNOWN}"
HOSTNAME=$(hostname -s)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

LOG_FILE="${LOG_FILE:-/var/log/keepalived/notify.log}"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$TIMESTAMP] $HOSTNAME -> $STATE" >> "$LOG_FILE"

# Forward to alerter (best-effort — ne bloque jamais keepalived)
if systemctl list-unit-files alerter@.service &>/dev/null; then
  systemctl start "alerter@keepalived-${STATE,,}.service" 2>/dev/null || true
fi

exit 0
