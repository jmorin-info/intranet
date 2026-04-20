#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Build & Deploy (Bare Metal)
# Usage: ./scripts/prod.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

echo "============================================"
echo "  OMNITECH Intranet — Production Deploy"
echo "============================================"
echo ""

# --- Pre-flight checks ---
echo "[1/7] Pre-flight checks..."
if [ ! -f .env ]; then
  echo "FATAL: .env file not found. Copy .env.example to .env and configure."
  exit 1
fi

source .env

for var in DATABASE_URL JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  if [ -z "${!var:-}" ]; then
    echo "FATAL: $var is not set in .env"
    exit 1
  fi
done

# Check services
systemctl is-active --quiet postgresql || { echo "FATAL: PostgreSQL not running"; exit 1; }
systemctl is-active --quiet redis-server || { echo "FATAL: Redis not running"; exit 1; }

echo "  PostgreSQL: OK"
echo "  Redis: OK"
echo "  Env vars: OK"

# --- Install dependencies ---
echo ""
echo "[2/7] Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -3

# --- Generate Prisma client ---
echo ""
echo "[3/7] Generating Prisma client..."
pnpm --filter @omnitech/database exec prisma generate 2>&1 | tail -1

# --- Run migrations ---
echo ""
echo "[4/7] Running database migrations..."
pnpm --filter @omnitech/database exec prisma db push --accept-data-loss 2>&1 | tail -3

# --- Build ---
echo ""
echo "[5/7] Building backend..."
pnpm --filter @omnitech/backend exec nest build 2>&1 | tail -1
echo "  Backend: $(ls -la apps/backend/dist/main.js | awk '{print $5}') bytes"

echo ""
echo "[6/7] Building frontend..."
pnpm --filter @omnitech/frontend exec next build 2>&1 | grep -E "✓ Generating" | tail -1
echo "  Frontend: $(ls -la apps/frontend/.next/BUILD_ID | awk '{print $5}') bytes BUILD_ID"

# --- Start services via systemd ---
echo ""
echo "[7/7] Starting services..."

# Stop any running dev processes
pkill -f "nest start --watch" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 2

# Reload and restart systemd services
systemctl daemon-reload
systemctl restart omnitech-backend
sleep 5
systemctl restart omnitech-frontend
sleep 5

# Verify
BACKEND_STATUS=$(systemctl is-active omnitech-backend 2>&1)
FRONTEND_STATUS=$(systemctl is-active omnitech-frontend 2>&1)

echo ""
echo "============================================"
echo "  Deployment Complete"
echo "============================================"
echo ""
echo "  Backend:  ${BACKEND_STATUS}"
echo "  Frontend: ${FRONTEND_STATUS}"
echo ""

if [ "$BACKEND_STATUS" = "active" ] && [ "$FRONTEND_STATUS" = "active" ]; then
  echo "  Frontend: http://$(hostname -I | awk '{print $1}'):3001"
  echo "  API:      http://$(hostname -I | awk '{print $1}'):3000/api"
  echo "  Swagger:  http://$(hostname -I | awk '{print $1}'):3000/api/docs"
  echo "  Metrics:  http://$(hostname -I | awk '{print $1}'):3000/api/health/metrics"
else
  echo "  WARNING: One or more services failed to start."
  echo "  Check logs:"
  echo "    journalctl -u omnitech-backend -n 50"
  echo "    journalctl -u omnitech-frontend -n 50"
fi
echo ""
