#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — wrapper de déploiement avec mode maintenance
#
# Usage :
#   scripts/deploy.sh [backend|frontend|all] [--skip-build]
#
# Étapes :
#   1. Active le mode maintenance (AppConfig.maintenance_mode = "true")
#   2. Build (pnpm --filter selon target) — sauf si --skip-build
#   3. systemctl restart du service ciblé
#   4. Health-check : attend que /api/v1/health renvoie 200 (max 30s)
#   5. Désactive le mode maintenance
#
# Si l'une des étapes échoue, le mode maintenance reste ON pour signaler
# le problème — il faudra le retirer manuellement (`scripts/maintenance.sh off`)
# après diagnostic.
#
# Résilience : la connexion DB est lue depuis .env. Si la DB est elle-même
# en panne, le toggle échoue mais le déploiement continue (best-effort).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-all}"
SKIP_BUILD=0
for arg in "$@"; do
  if [ "$arg" = "--skip-build" ]; then SKIP_BUILD=1; fi
done

# .env contient des `&` (Prisma query string) qui cassent un sourcing direct.
# On extrait DATABASE_URL via grep et on strip la query string Prisma.
if [ ! -f .env ]; then
  echo "❌ /root/omnitech-intranet/.env introuvable" >&2
  exit 1
fi
DATABASE_URL_RAW=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
if [ -z "$DATABASE_URL_RAW" ]; then
  echo "❌ DATABASE_URL absent de .env" >&2
  exit 1
fi
DB_URL="${DATABASE_URL_RAW%%\?*}"

log()    { printf '\e[1;36m▸\e[0m %s\n' "$*"; }
ok()     { printf '\e[1;32m✓\e[0m %s\n' "$*"; }
warn()   { printf '\e[1;33m⚠\e[0m %s\n' "$*"; }
fail()   { printf '\e[1;31m✗\e[0m %s\n' "$*" >&2; }

set_maintenance() {
  local enabled="$1"
  local message="${2:-Déploiement en cours, retour dans quelques instants.}"
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local cuid; cuid=$(date +%s%N | sha256sum | head -c 16)
  if [ "$enabled" = "true" ]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
      INSERT INTO \"AppConfig\" (id, key, value, \"updatedAt\")
      VALUES ('m1${cuid}', 'maintenance_mode', 'true', NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, \"updatedAt\" = NOW();
      INSERT INTO \"AppConfig\" (id, key, value, \"updatedAt\")
      VALUES ('m2${cuid}', 'maintenance_message', \$msg\$$message\$msg\$, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, \"updatedAt\" = NOW();
      INSERT INTO \"AppConfig\" (id, key, value, \"updatedAt\")
      VALUES ('m3${cuid}', 'maintenance_started_at', '$now', NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, \"updatedAt\" = NOW();
    " >/dev/null
    ok "Maintenance ON ($message)"
  else
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
      UPDATE \"AppConfig\" SET value='false', \"updatedAt\"=NOW() WHERE key='maintenance_mode';
      DELETE FROM \"AppConfig\" WHERE key IN ('maintenance_started_at','maintenance_return_time');
    " >/dev/null
    ok "Maintenance OFF"
  fi
}

build_target() {
  if [ "$SKIP_BUILD" = "1" ]; then
    warn "Build sauté (--skip-build)"
    return
  fi
  case "$TARGET" in
    backend)  log "Build backend";  pnpm --filter @omnitech/backend  build ;;
    frontend) log "Build frontend"; pnpm --filter @omnitech/frontend build ;;
    all)      log "Build backend + frontend"
              pnpm --filter @omnitech/backend  build
              pnpm --filter @omnitech/frontend build ;;
    *) fail "Cible inconnue : $TARGET (attendu : backend|frontend|all)"; exit 2 ;;
  esac
  ok "Build terminé"
}

restart_target() {
  case "$TARGET" in
    backend)  log "Restart omnitech-backend";  systemctl restart omnitech-backend  ;;
    frontend) log "Restart omnitech-frontend"; systemctl restart omnitech-frontend ;;
    all)      log "Restart backend + frontend"
              systemctl restart omnitech-backend
              systemctl restart omnitech-frontend ;;
  esac
}

wait_healthy() {
  log "Attente du retour à 200 sur /api/v1/health (timeout 30s)…"
  local i=0
  while [ "$i" -lt 30 ]; do
    if curl -sk -o /dev/null -w '%{http_code}' "https://intranet.omnitech-security.fr/api/v1/health" 2>/dev/null | grep -q '^200$'; then
      ok "Backend en bonne santé"
      return 0
    fi
    sleep 1
    i=$((i+1))
  done
  fail "Backend n'a pas répondu 200 après 30s — maintenance reste ON"
  return 1
}

# === Pipeline ===
log "Cible : $TARGET"
set_maintenance "true" "Déploiement automatique en cours"
trap 'fail "Échec — maintenance reste ON, fixer puis : scripts/maintenance.sh off"' ERR

build_target
restart_target
sleep 3
if wait_healthy; then
  set_maintenance "false"
  trap - ERR
  ok "Déploiement terminé sans interruption visible côté users."
else
  exit 1
fi
