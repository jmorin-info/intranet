#!/usr/bin/env bash
# =============================================================================
# OMNITECH Intranet — Release packager
#
# Produit un tarball `.tar.gz` versionné contenant :
#   - git archive HEAD (sources de la branche release)
#   - pnpm-lock.yaml (épinglage des deps)
#   - migrations Prisma compilées
#   - infra/systemd/*.service
#   - infra/nginx-bunkerweb-snippet.conf
#   - docs/INSTALL_FROM_SCRATCH.md + docs/RELEASE_PROCESS.md
#   - .env.example
#   - release-manifest.json (versions runtime cibles : Postgres / Redis / Node /
#     Ollama + tags Docker images tierces)
#   - SHA256SUMS
#
# Usage :
#   ./scripts/release-package.sh v3.2.0
#   ./scripts/release-package.sh v3.2.0 --out=/var/releases
#   ./scripts/release-package.sh v3.2.0 --push-smb       # lit SMB_BACKUP_* du .env
#
# Idempotent : un re-run sur la même version réécrit l'archive proprement.
# =============================================================================
set -euo pipefail

# ---- Args -------------------------------------------------------------------
VERSION="${1:-}"
shift || true
OUT_DIR="/var/releases/omnitech"
PUSH_SMB=0

for arg in "$@"; do
  case "$arg" in
    --out=*)     OUT_DIR="${arg#--out=}" ;;
    --push-smb)  PUSH_SMB=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [--out=DIR] [--push-smb]" >&2
  echo "Example: $0 v3.2.0 --push-smb" >&2
  exit 2
fi

# ---- Locate repo root -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: $REPO_ROOT is not a git repository" >&2
  exit 1
fi

GIT_SHA="$(git rev-parse --short=12 HEAD)"
BUILD_TS="$(date -u +%Y%m%dT%H%M%SZ)"
SAFE_VER="${VERSION//\//_}"
PKG_NAME="omnitech-intranet-${SAFE_VER}-${GIT_SHA}"
WORK_DIR="$(mktemp -d -t omnitech-rel-XXXXXX)"
STAGE="${WORK_DIR}/${PKG_NAME}"
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$STAGE" "$OUT_DIR"

echo "==> Packaging ${PKG_NAME}"
echo "    repo root : $REPO_ROOT"
echo "    output    : $OUT_DIR"

# ---- 1. git archive HEAD ----------------------------------------------------
echo "==> 1/5 git archive HEAD"
git archive --format=tar --prefix="${PKG_NAME}/" HEAD | tar -x -C "$WORK_DIR"

# ---- 2. Inject runtime artefacts not tracked by git archive -----------------
echo "==> 2/5 injecting lockfile + infra + docs"
# pnpm-lock.yaml IS tracked, but we re-copy it to be safe (guarantees presence)
cp -f pnpm-lock.yaml          "$STAGE/pnpm-lock.yaml"
cp -f .env.example            "$STAGE/.env.example"

# Infra (already in git archive, but we make sure systemd/ subtree is there)
mkdir -p "$STAGE/infra/systemd"
cp -f infra/systemd/omnitech-backend.service  "$STAGE/infra/systemd/" 2>/dev/null || true
cp -f infra/systemd/omnitech-frontend.service "$STAGE/infra/systemd/" 2>/dev/null || true
cp -f infra/nginx-bunkerweb-snippet.conf      "$STAGE/infra/" 2>/dev/null || true

# Prisma migrations (in case some are gitignored, pin them)
if [[ -d packages/database/prisma/migrations ]]; then
  mkdir -p "$STAGE/packages/database/prisma"
  cp -a packages/database/prisma/migrations "$STAGE/packages/database/prisma/"
  cp -f packages/database/prisma/schema.prisma "$STAGE/packages/database/prisma/" 2>/dev/null || true
fi

# Docs critical for DR
mkdir -p "$STAGE/docs"
cp -f docs/INSTALL_FROM_SCRATCH.md "$STAGE/docs/" 2>/dev/null || true
cp -f docs/RELEASE_PROCESS.md      "$STAGE/docs/" 2>/dev/null || true
cp -f RESTORE.md                   "$STAGE/" 2>/dev/null || true
cp -f CHANGELOG.md                 "$STAGE/" 2>/dev/null || true

# ---- 3. Manifest ------------------------------------------------------------
echo "==> 3/5 release-manifest.json"

detect_cmd_version() {
  # $1 = command, $2 = arg, $3 = grep pattern (optional)
  if command -v "$1" >/dev/null 2>&1; then
    if [[ -n "${3:-}" ]]; then
      "$1" "$2" 2>&1 | grep -oE "$3" | head -1 || echo "unknown"
    else
      "$1" "$2" 2>&1 | head -1
    fi
  else
    echo "not-installed"
  fi
}

NODE_V="$(detect_cmd_version node --version)"
PNPM_V="$(detect_cmd_version pnpm --version)"
PG_V="$(detect_cmd_version psql --version '[0-9]+\.[0-9]+')"
REDIS_V="$(detect_cmd_version redis-server --version '[0-9]+\.[0-9]+\.[0-9]+')"
OLLAMA_V="$(detect_cmd_version ollama --version '[0-9]+\.[0-9]+\.[0-9]+')"
DOCKER_V="$(detect_cmd_version docker --version '[0-9]+\.[0-9]+\.[0-9]+')"

# Docker images currently running (for traceability of tierce stack)
DOCKER_IMAGES_JSON="[]"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER_IMAGES_JSON="$(docker ps --format '{"name":"{{.Names}}","image":"{{.Image}}"}' \
    | paste -sd, - | sed 's/^/[/' | sed 's/$/]/')"
  [[ "$DOCKER_IMAGES_JSON" == "[]" || -z "$DOCKER_IMAGES_JSON" ]] && DOCKER_IMAGES_JSON="[]"
fi

cat > "$STAGE/release-manifest.json" <<EOF
{
  "name": "omnitech-intranet",
  "version": "${VERSION}",
  "git_sha": "${GIT_SHA}",
  "git_ref": "$(git rev-parse HEAD)",
  "branch": "$(git rev-parse --abbrev-ref HEAD)",
  "built_at": "${BUILD_TS}",
  "built_on": "$(hostname -f 2>/dev/null || hostname)",
  "runtime_targets": {
    "node":     "${NODE_V}",
    "pnpm":     "${PNPM_V}",
    "postgres": "${PG_V}",
    "pgvector": "0.8.2",
    "redis":    "${REDIS_V}",
    "ollama":   "${OLLAMA_V}",
    "docker":   "${DOCKER_V}"
  },
  "ollama_models": ["mistral", "bge-m3", "phi3:mini", "qwen2:0.5b"],
  "docker_third_party_running": ${DOCKER_IMAGES_JSON}
}
EOF

# ---- 4. Tarball + checksum --------------------------------------------------
echo "==> 4/5 tar + gzip + sha256"
TARBALL="${OUT_DIR}/${PKG_NAME}.tar.gz"
tar -C "$WORK_DIR" -czf "$TARBALL" "${PKG_NAME}"
( cd "$OUT_DIR" && sha256sum "${PKG_NAME}.tar.gz" > "${PKG_NAME}.tar.gz.sha256" )

SIZE_HUMAN="$(du -h "$TARBALL" | awk '{print $1}')"
echo "    artifact : $TARBALL ($SIZE_HUMAN)"
echo "    sha256   : $(awk '{print $1}' "${TARBALL}.sha256")"

# ---- 5. Optional SMB push ---------------------------------------------------
if [[ "$PUSH_SMB" == "1" ]]; then
  echo "==> 5/5 push to SMB"
  if [[ -f "${REPO_ROOT}/.env" ]]; then
    set -a; source "${REPO_ROOT}/.env"; set +a
  fi
  : "${SMB_BACKUP_SHARE:?SMB_BACKUP_SHARE required (e.g. //filer.example/intranet-backup)}"
  : "${SMB_BACKUP_USER:?SMB_BACKUP_USER required}"
  : "${SMB_BACKUP_PASSWORD:?SMB_BACKUP_PASSWORD required}"
  SMB_BACKUP_DOMAIN="${SMB_BACKUP_DOMAIN:-omnitech.security}"
  SMB_MOUNT="${SMB_BACKUP_MOUNT:-/mnt/intranet-backup}"

  if ! mountpoint -q "$SMB_MOUNT"; then
    mkdir -p "$SMB_MOUNT"
    mount -t cifs "$SMB_BACKUP_SHARE" "$SMB_MOUNT" \
      -o "username=${SMB_BACKUP_USER},password=${SMB_BACKUP_PASSWORD},domain=${SMB_BACKUP_DOMAIN},vers=3.0,iocharset=utf8,uid=0,gid=0,file_mode=0640,dir_mode=0750"
    UMOUNT_AFTER=1
  fi
  REMOTE_DIR="$SMB_MOUNT/releases"
  mkdir -p "$REMOTE_DIR"
  cp -v "$TARBALL"        "$REMOTE_DIR/"
  cp -v "${TARBALL}.sha256" "$REMOTE_DIR/"
  ls -lh "$REMOTE_DIR" | tail -10
  if [[ "${UMOUNT_AFTER:-0}" == "1" ]]; then umount "$SMB_MOUNT"; fi
else
  echo "==> 5/5 SMB push skipped (use --push-smb to enable)"
fi

echo ""
echo "Release ready : $TARBALL"
