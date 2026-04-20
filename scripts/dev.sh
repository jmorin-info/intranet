#!/usr/bin/env bash
# ============================================
# OMNITECH Intranet — Start Development
# ============================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

echo "============================================"
echo "  OMNITECH Intranet — Development Mode"
echo "============================================"
echo ""

# Start infrastructure services
echo "[1/5] Starting PostgreSQL and Redis..."
docker compose -f docker-compose.dev.yml up -d postgres redis

# Wait for PostgreSQL
echo "[2/5] Waiting for PostgreSQL..."
RETRIES=30
until docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U "${POSTGRES_USER:-omnitech}" -d "${POSTGRES_DB:-omnitech_intranet}" 2>/dev/null || [[ ${RETRIES} -eq 0 ]]; do
    RETRIES=$((RETRIES - 1))
    sleep 1
done

if [[ ${RETRIES} -eq 0 ]]; then
    echo "[ERROR] PostgreSQL failed to start. Check: docker compose -f docker-compose.dev.yml logs postgres"
    exit 1
fi

echo "[3/5] Generating Prisma client..."
pnpm db:generate

echo "[4/5] Pushing database schema..."
pnpm db:push

echo "[5/5] Seeding database..."
pnpm db:seed || echo "[WARN] Seeding skipped or already seeded."

echo ""
echo "Starting development servers..."
echo "  Backend:  http://localhost:3000"
echo "  Frontend: http://localhost:3001"
echo ""

pnpm dev
