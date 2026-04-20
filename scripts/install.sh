#!/usr/bin/env bash
# ============================================
# OMNITECH Intranet — Installation Script
# Target: Debian 12 (Bookworm)
# ============================================
set -euo pipefail

# ---------------------
# Colors
# ---------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------------------
# Root check
# ---------------------
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root."
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_info "Project directory: ${PROJECT_DIR}"

echo ""
echo "============================================"
echo "  OMNITECH Intranet — Installation"
echo "============================================"
echo ""

# ---------------------
# System update
# ---------------------
log_info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg2 lsb-release ca-certificates \
    apt-transport-https software-properties-common build-essential \
    openssl jq unzip
log_ok "System packages updated."

# ---------------------
# Node.js 20 LTS (NodeSource)
# ---------------------
log_info "Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null || [[ "$(node -v)" != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
    log_ok "Node.js $(node -v) installed."
else
    log_ok "Node.js $(node -v) already installed."
fi

# ---------------------
# pnpm
# ---------------------
log_info "Installing pnpm..."
if ! command -v pnpm &> /dev/null; then
    corepack enable
    corepack prepare pnpm@latest --activate
    log_ok "pnpm $(pnpm -v) installed."
else
    log_ok "pnpm $(pnpm -v) already installed."
fi

# ---------------------
# PostgreSQL 16 client libraries
# ---------------------
log_info "Installing PostgreSQL 16 client libraries..."
if ! command -v psql &> /dev/null; then
    echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
    apt-get update -qq
    apt-get install -y -qq postgresql-client-16 libpq-dev
    log_ok "PostgreSQL 16 client installed."
else
    log_ok "PostgreSQL client already installed."
fi

# ---------------------
# Redis tools
# ---------------------
log_info "Installing Redis tools..."
if ! command -v redis-cli &> /dev/null; then
    apt-get install -y -qq redis-tools
    log_ok "Redis tools installed."
else
    log_ok "Redis tools already installed."
fi

# ---------------------
# Docker Engine
# ---------------------
log_info "Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    log_ok "Docker $(docker --version) installed."
else
    log_ok "Docker already installed."
fi

# ---------------------
# Create system user
# ---------------------
log_info "Creating system user 'omnitech'..."
if ! id "omnitech" &>/dev/null; then
    useradd --system --create-home --shell /bin/bash --groups docker omnitech
    log_ok "User 'omnitech' created."
else
    log_ok "User 'omnitech' already exists."
    usermod -aG docker omnitech 2>/dev/null || true
fi

# ---------------------
# Generate secrets and create .env
# ---------------------
log_info "Generating secrets and creating .env..."

generate_secret() {
    openssl rand -base64 "$1" | tr -d '\n/+=' | head -c "$1"
}

ENV_FILE="${PROJECT_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
    log_warn ".env file already exists. Backing up to .env.backup"
    cp "${ENV_FILE}" "${ENV_FILE}.backup.$(date +%Y%m%d%H%M%S)"
fi

DB_PASSWORD="$(generate_secret 32)"
REDIS_PASSWORD="$(generate_secret 32)"
JWT_ACCESS="$(generate_secret 64)"
JWT_REFRESH="$(generate_secret 64)"
DOCUSEAL_WEBHOOK="$(generate_secret 48)"

cp "${PROJECT_DIR}/.env.example" "${ENV_FILE}"

# Replace placeholder values with generated secrets
sed -i "s|CHANGE_ME_DB_PASSWORD|${DB_PASSWORD}|g" "${ENV_FILE}"
sed -i "s|CHANGE_ME_REDIS_PASSWORD|${REDIS_PASSWORD}|g" "${ENV_FILE}"
sed -i "s|CHANGE_ME_ACCESS_SECRET_MIN_64_CHARS|${JWT_ACCESS}|g" "${ENV_FILE}"
sed -i "s|CHANGE_ME_REFRESH_SECRET_MIN_64_CHARS|${JWT_REFRESH}|g" "${ENV_FILE}"
sed -i "s|CHANGE_ME_WEBHOOK_SECRET|${DOCUSEAL_WEBHOOK}|g" "${ENV_FILE}"

# Secure the file
chmod 600 "${ENV_FILE}"
chown omnitech:omnitech "${ENV_FILE}"

log_ok ".env file created with generated secrets."

# ---------------------
# Install project dependencies
# ---------------------
log_info "Installing project dependencies..."
cd "${PROJECT_DIR}"
pnpm install
log_ok "Dependencies installed."

# ---------------------
# Prisma: generate, migrate, seed
# ---------------------
log_info "Setting up database..."

# Start PostgreSQL and Redis containers for setup
docker compose -f docker-compose.dev.yml up -d postgres redis

log_info "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U omnitech -d omnitech_intranet 2>/dev/null || [[ ${RETRIES} -eq 0 ]]; do
    RETRIES=$((RETRIES - 1))
    sleep 1
done

if [[ ${RETRIES} -eq 0 ]]; then
    log_error "PostgreSQL failed to start. Please check Docker logs."
    exit 1
fi

log_info "Running Prisma generate..."
pnpm --filter backend exec prisma generate

log_info "Running Prisma migrations..."
pnpm --filter backend exec prisma migrate deploy

log_info "Seeding database..."
pnpm --filter backend exec prisma db seed

log_ok "Database setup complete."

# ---------------------
# Set ownership
# ---------------------
chown -R omnitech:omnitech "${PROJECT_DIR}"

# ---------------------
# Summary
# ---------------------
echo ""
echo "============================================"
echo -e "${GREEN}  Installation Complete!${NC}"
echo "============================================"
echo ""
echo "  Project directory:  ${PROJECT_DIR}"
echo "  System user:        omnitech"
echo "  .env file:          ${ENV_FILE}"
echo ""
echo "  Generated secrets have been written to .env."
echo "  IMPORTANT: You still need to configure:"
echo "    - SMTP_PASSWORD (Microsoft 365)"
echo "    - DOCUSEAL_API_KEY"
echo "    - SSL certificates (Let's Encrypt)"
echo ""
echo "  Next steps:"
echo "    1. Review and edit .env as needed"
echo "    2. For development:  ./scripts/dev.sh"
echo "    3. For production:   ./scripts/prod.sh"
echo ""
echo "============================================"
