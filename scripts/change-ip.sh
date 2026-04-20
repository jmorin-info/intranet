#!/usr/bin/env bash
# ============================================================================
# OMNITECH Intranet — Change IP of the host machine
# ----------------------------------------------------------------------------
# Replaces every hardcoded IP reference in the project so the intranet can be
# moved to a different IP without breaking backend/frontend/OnlyOffice/E2E.
#
# Usage:
#   ./scripts/change-ip.sh <NEW_IP>           # interactive, asks confirmation
#   ./scripts/change-ip.sh <NEW_IP> --yes     # non-interactive
#   ./scripts/change-ip.sh <NEW_IP> --restart # restart docker compose after
#
# The script:
#   1. Detects the CURRENT IP by reading APP_URL in .env
#   2. Shows a dry-run diff of every file that will change
#   3. Asks for confirmation (unless --yes)
#   4. Creates a .bak backup next to every modified file
#   5. Applies the replacement
#   6. Optionally restarts docker compose + rebuilds frontend (--restart)
# ============================================================================

set -euo pipefail

# ---------- args ----------
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <NEW_IP> [--yes] [--restart]" >&2
  exit 1
fi

NEW_IP="$1"
shift || true
AUTO_YES=0
DO_RESTART=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=1 ;;
    --restart|-r) DO_RESTART=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ---------- validate IP format (loose, accept DNS too) ----------
if ! [[ "$NEW_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ || "$NEW_IP" =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo "ERROR: '$NEW_IP' does not look like a valid IPv4 or hostname" >&2
  exit 1
fi

# ---------- resolve project root ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# ---------- detect current IP from APP_URL ----------
# APP_URL format: http://<ip>:3001
CURRENT_IP="$(grep -E '^APP_URL=' "$ENV_FILE" | head -n1 | sed -E 's|^APP_URL=https?://([^:/]+).*|\1|')"
if [[ -z "$CURRENT_IP" ]]; then
  echo "ERROR: could not detect current IP from APP_URL in $ENV_FILE" >&2
  exit 1
fi

if [[ "$CURRENT_IP" == "$NEW_IP" ]]; then
  echo "Current IP is already $NEW_IP — nothing to do."
  exit 0
fi

# ---------- files to patch ----------
# Each entry: "absolute_path|description"
FILES=(
  "$ROOT_DIR/.env|Env (backend + frontend NEXT_PUBLIC_*)"
  "$ROOT_DIR/playwright.config.ts|E2E tests baseURL"
  "$ROOT_DIR/apps/frontend/src/app/(app)/admin/ad-audit/page.tsx|AD audit help text"
  "$ROOT_DIR/apps/backend/src/helpdesk/helpdesk.service.ts|Helpdesk KB FAQ text"
)

# ---------- helpers ----------
color() { printf "\033[%sm%s\033[0m" "$1" "$2"; }
GREEN=$(color "32" "")
RED=$(color "31" "")
YEL=$(color "33" "")
BOLD=$(color "1" "")
NORM=$(color "0" "")

echo ""
echo "${BOLD}OMNITECH Intranet — IP migration${NORM}"
echo "  From: ${RED}$CURRENT_IP${NORM}"
echo "  To:   ${GREEN}$NEW_IP${NORM}"
echo ""

# ---------- dry-run scan ----------
TOTAL_MATCHES=0
declare -a CHANGES=()
for entry in "${FILES[@]}"; do
  IFS='|' read -r file desc <<< "$entry"
  if [[ ! -f "$file" ]]; then
    echo "  ${YEL}skip${NORM} (not found): $file"
    continue
  fi
  count=$(grep -c -F "$CURRENT_IP" "$file" || true)
  if [[ "$count" -gt 0 ]]; then
    TOTAL_MATCHES=$((TOTAL_MATCHES + count))
    CHANGES+=("$file|$desc|$count")
    printf "  %s %s (%d occurrence(s)) — %s\n" "${GREEN}will patch${NORM}" "$(realpath --relative-to "$ROOT_DIR" "$file")" "$count" "$desc"
  else
    printf "  %s %s — %s\n" "${YEL}no match${NORM}" "$(realpath --relative-to "$ROOT_DIR" "$file")" "$desc"
  fi
done

if [[ "$TOTAL_MATCHES" -eq 0 ]]; then
  echo ""
  echo "No occurrences of $CURRENT_IP found in tracked files. Nothing to do."
  exit 0
fi

echo ""
echo "Total replacements: ${BOLD}$TOTAL_MATCHES${NORM}"
echo ""

# ---------- confirm ----------
if [[ "$AUTO_YES" -eq 0 ]]; then
  read -r -p "Apply these changes? [y/N] " answer
  if [[ ! "$answer" =~ ^[yY]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ---------- apply ----------
TS="$(date +%Y%m%d-%H%M%S)"
for change in "${CHANGES[@]}"; do
  IFS='|' read -r file desc count <<< "$change"
  bak="${file}.bak-${TS}"
  cp -p "$file" "$bak"
  # Use | as sed delimiter because URLs contain /
  sed -i "s|${CURRENT_IP}|${NEW_IP}|g" "$file"
  echo "  ${GREEN}✓${NORM} $(realpath --relative-to "$ROOT_DIR" "$file") (backup: $(basename "$bak"))"
done

echo ""
echo "${GREEN}Done.${NORM} IP changed from $CURRENT_IP to $NEW_IP."
echo ""

# ---------- restart ----------
if [[ "$DO_RESTART" -eq 1 ]]; then
  COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "${YEL}Warning:${NORM} $COMPOSE_FILE not found, skipping restart."
  else
    echo "${BOLD}Restarting docker compose stack...${NORM}"
    docker compose -f "$COMPOSE_FILE" down
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate
    echo ""
    echo "${GREEN}Stack restarted.${NORM}"
    echo ""
    echo "${YEL}Reminder:${NORM} if you run the frontend in dev mode outside docker,"
    echo "kill your 'pnpm dev' process and restart it — Next.js bakes NEXT_PUBLIC_*"
    echo "variables at startup, so they are NOT picked up by HMR."
  fi
else
  echo "${YEL}Next steps:${NORM}"
  echo "  1. Restart docker compose:"
  echo "     docker compose -f docker-compose.dev.yml down && docker compose -f docker-compose.dev.yml up -d --force-recreate"
  echo "  2. Restart frontend dev server (Ctrl+C then):"
  echo "     pnpm --filter @omnitech/frontend dev"
  echo "  3. (Prod only) rebuild frontend: pnpm --filter @omnitech/frontend build"
  echo "  4. Clear browser cache OR hard refresh (Ctrl+Shift+R)"
fi

echo ""
echo "${BOLD}Rollback:${NORM} cd $ROOT_DIR && find . -name '*.bak-${TS}' -exec sh -c 'mv \"\$1\" \"\${1%.bak-${TS}}\"' _ {} \\;"
echo ""
