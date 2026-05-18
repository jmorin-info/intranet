#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — toggle manuel du mode maintenance
#
# Usage :
#   scripts/maintenance.sh on  ["Message libre"] ["ETA texte"]
#   scripts/maintenance.sh off
#   scripts/maintenance.sh status
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# .env contient des `&` (Prisma query string) qui cassent un sourcing direct.
# On extrait DATABASE_URL via grep et on strip la query string Prisma.
DATABASE_URL_RAW=$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2-)
if [ -z "$DATABASE_URL_RAW" ]; then
  echo "❌ DATABASE_URL absent de .env" >&2
  exit 1
fi
DB_URL="${DATABASE_URL_RAW%%\?*}"

ACTION="${1:-status}"
MSG="${2:-Maintenance manuelle}"
ETA="${3:-}"

case "$ACTION" in
  on)
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    CUID=$(date +%s%N | sha256sum | head -c 16)
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
      INSERT INTO \"AppConfig\" (id, key, value, \"updatedAt\")
      VALUES ('m1${CUID}', 'maintenance_mode', 'true', NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, \"updatedAt\"=NOW();
      INSERT INTO \"AppConfig\" (id, key, value, \"updatedAt\")
      VALUES ('m2${CUID}', 'maintenance_message', \$msg\$$MSG\$msg\$, NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, \"updatedAt\"=NOW();
      INSERT INTO \"AppConfig\" (id, key, value, \"updatedAt\")
      VALUES ('m3${CUID}', 'maintenance_started_at', '$NOW', NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, \"updatedAt\"=NOW();
    " >/dev/null
    if [ -n "$ETA" ]; then
      psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
        INSERT INTO \"AppConfig\" (id, key, value, \"updatedAt\")
        VALUES ('m4${CUID}', 'maintenance_return_time', \$eta\$$ETA\$eta\$, NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, \"updatedAt\"=NOW();
      " >/dev/null
    fi
    echo "✓ Maintenance ON : $MSG"
    ;;
  off)
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
      UPDATE \"AppConfig\" SET value='false', \"updatedAt\"=NOW() WHERE key='maintenance_mode';
      DELETE FROM \"AppConfig\" WHERE key IN ('maintenance_started_at','maintenance_return_time');
    " >/dev/null
    echo "✓ Maintenance OFF"
    ;;
  status)
    psql "$DB_URL" -t -c "
      SELECT key || ' = ' || value FROM \"AppConfig\"
      WHERE key LIKE 'maintenance_%' ORDER BY key;
    "
    ;;
  *)
    echo "Usage : scripts/maintenance.sh on|off|status [message] [eta]" >&2
    exit 2
    ;;
esac
