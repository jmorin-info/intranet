#!/usr/bin/env bash
# OMNITECH Intranet — Generate VAPID keys for Web Push
# ISO 27001 A.5.13 — Communication des informations
#
# Usage:
#   ./scripts/generate-vapid.sh           # print to stdout + save vapid-keys.txt
#   ./scripts/generate-vapid.sh --quiet   # only update vapid-keys.txt, no stdout
#
# After generation, copy the three values into your .env file:
#   VAPID_PUBLIC_KEY=...
#   VAPID_PRIVATE_KEY=...
#   VAPID_SUBJECT=mailto:noc@omnitech-security.fr
# Then restart the backend.
#
# WARNING: never commit the generated keys. vapid-keys.txt is .gitignored.

set -euo pipefail

QUIET=0
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=1
fi

cd "$(dirname "$0")/.."
ROOT_DIR="$(pwd)"

if [[ ! -f "package.json" ]]; then
  echo "Error: must be run from repo root (no package.json found)" >&2
  exit 1
fi

# Generate via web-push CLI (already a backend dep).
# If web-push is missing, install it on the fly into the backend workspace.
if ! pnpm --filter @omnitech/backend exec test -d node_modules/web-push 2>/dev/null; then
  if [[ "$QUIET" -eq 0 ]]; then
    echo "Installing web-push (one-time)..."
  fi
  pnpm --filter @omnitech/backend add web-push @types/web-push >/dev/null 2>&1 || true
fi

JSON_OUTPUT="$(pnpm --filter @omnitech/backend exec npx web-push generate-vapid-keys --json 2>/dev/null | tail -n 1)"

if [[ -z "$JSON_OUTPUT" ]]; then
  echo "Error: failed to generate VAPID keys (web-push not available?)" >&2
  exit 2
fi

PUBLIC_KEY="$(echo "$JSON_OUTPUT" | sed -n 's/.*"publicKey":"\([^"]*\)".*/\1/p')"
PRIVATE_KEY="$(echo "$JSON_OUTPUT" | sed -n 's/.*"privateKey":"\([^"]*\)".*/\1/p')"

if [[ -z "$PUBLIC_KEY" ]] || [[ -z "$PRIVATE_KEY" ]]; then
  echo "Error: could not parse keys from web-push output: $JSON_OUTPUT" >&2
  exit 3
fi

cat > vapid-keys.txt <<EOF
# VAPID keys generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") — DO NOT COMMIT
# Regenerate with: ./scripts/generate-vapid.sh
# Add the three lines below to your .env file, then restart the backend.

VAPID_PUBLIC_KEY=$PUBLIC_KEY
VAPID_PRIVATE_KEY=$PRIVATE_KEY
VAPID_SUBJECT=mailto:noc@omnitech-security.fr
EOF

chmod 600 vapid-keys.txt

if [[ "$QUIET" -eq 0 ]]; then
  echo ""
  echo "VAPID keys generated and saved to: $ROOT_DIR/vapid-keys.txt"
  echo ""
  echo "Next steps:"
  echo "  1. Open vapid-keys.txt"
  echo "  2. Copy the three VAPID_* lines into your .env file"
  echo "  3. Restart the backend (pnpm -C apps/backend dev or systemctl restart omnitech-backend)"
  echo "  4. Open the frontend, allow browser notifications when prompted"
  echo ""
  echo "WARNING: rotating the keys will invalidate ALL existing browser subscriptions."
  echo "Users will be re-prompted to re-enable push notifications."
fi
