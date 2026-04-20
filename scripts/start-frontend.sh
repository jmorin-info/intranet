#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: "${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL is required}"

exec pnpm --filter @omnitech/frontend dev
