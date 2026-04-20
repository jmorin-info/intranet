#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Secure .env loading (no eval)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Validate required vars
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${JWT_ACCESS_SECRET:?JWT_ACCESS_SECRET is required}"

exec pnpm --filter @omnitech/backend dev
