#!/usr/bin/env bash
# =============================================================================
# Item 32 — Deploy static assets to CDN (Bunny.net / Cloudflare)
# =============================================================================
# Synchronise `apps/frontend/.next/static/*` + `apps/frontend/public/*` vers
# le CDN après un `pnpm --filter frontend build`. Idempotent — peut tourner
# sur chaque déploiement sans ré-uploader les fichiers déjà à jour (Bunny
# storage déduplique sur l'URL : un PUT sur un objet existant remplace).
#
# Usage:
#   NEXT_PUBLIC_CDN_URL=https://cdn.intranet.omnitech-security.fr \
#   BUNNY_STORAGE_ZONE=omnitech-intranet \
#   BUNNY_STORAGE_PASSWORD=xxx \
#   CDN_PURGE_TOKEN=xxx \
#   ./scripts/deploy-cdn-assets.sh
#
# Variables requises :
#   NEXT_PUBLIC_CDN_URL    — URL du CDN (utilisée pour le check post-deploy)
#   CDN_PROVIDER           — `bunny` (defaut) ou `cloudflare`
# Bunny :
#   BUNNY_STORAGE_ZONE     — nom de la Storage Zone Bunny
#   BUNNY_STORAGE_PASSWORD — clé d'écriture de la Storage Zone (write key)
#   BUNNY_STORAGE_ENDPOINT — `storage.bunnycdn.com` (Slovénie) par defaut
#   BUNNY_PULL_ZONE_ID     — id de la Pull Zone (pour purge)
#   CDN_PURGE_TOKEN        — Account API Key Bunny (pour purge)
# Cloudflare R2 (alt) :
#   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_BUCKET,
#   CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY,
#   CLOUDFLARE_ZONE_ID, CDN_PURGE_TOKEN
#
# Exit codes:
#   0 — succès (ou no-op si NEXT_PUBLIC_CDN_URL vide)
#   1 — variables manquantes
#   2 — build absent
#   3 — upload échec
#   4 — purge échec (warning, pas bloquant)
#
# Pas de dépendance NPM ajoutée — utilise `curl` + `find` + `bash`.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/apps/frontend"
STATIC_DIR="${FRONTEND_DIR}/.next/static"
PUBLIC_DIR="${FRONTEND_DIR}/public"

log() { echo "[deploy-cdn] $*"; }
warn() { echo "[deploy-cdn][WARN] $*" >&2; }
err() { echo "[deploy-cdn][ERROR] $*" >&2; }

# -----------------------------------------------------------------------------
# 1. Validation
# -----------------------------------------------------------------------------
if [ -z "${NEXT_PUBLIC_CDN_URL:-}" ]; then
  log "NEXT_PUBLIC_CDN_URL is empty — CDN disabled, skipping upload."
  exit 0
fi

CDN_PROVIDER="${CDN_PROVIDER:-bunny}"

if [ ! -d "${STATIC_DIR}" ]; then
  err "Build artefacts missing at ${STATIC_DIR}. Run 'pnpm --filter frontend build' first."
  exit 2
fi

# -----------------------------------------------------------------------------
# 2. Build a witness file (`check.txt`) for /api/v1/health/cdn
#    Le backend curl-ra ce fichier pour vérifier que le CDN propage.
# -----------------------------------------------------------------------------
COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
DEPLOY_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WITNESS_FILE="${STATIC_DIR}/check.txt"
printf 'commit=%s\ndeployedAt=%s\n' "${COMMIT_SHA}" "${DEPLOY_TS}" > "${WITNESS_FILE}"
log "Witness file written: ${WITNESS_FILE} (commit=${COMMIT_SHA})"

# -----------------------------------------------------------------------------
# 3. Upload — Bunny
# -----------------------------------------------------------------------------
upload_bunny() {
  : "${BUNNY_STORAGE_ZONE:?BUNNY_STORAGE_ZONE required for bunny provider}"
  : "${BUNNY_STORAGE_PASSWORD:?BUNNY_STORAGE_PASSWORD required for bunny provider}"
  local endpoint="${BUNNY_STORAGE_ENDPOINT:-storage.bunnycdn.com}"
  local base_url="https://${endpoint}/${BUNNY_STORAGE_ZONE}"

  local count=0
  local fail=0

  upload_one() {
    local local_path="$1"
    local remote_path="$2"
    local content_type
    case "${local_path##*.}" in
      js|mjs)   content_type="application/javascript; charset=utf-8" ;;
      css)      content_type="text/css; charset=utf-8" ;;
      json)     content_type="application/json; charset=utf-8" ;;
      svg)      content_type="image/svg+xml" ;;
      woff)     content_type="font/woff" ;;
      woff2)    content_type="font/woff2" ;;
      png|jpg|jpeg|webp|avif|gif|ico)
                content_type="image/${local_path##*.}" ;;
      txt|map)  content_type="text/plain; charset=utf-8" ;;
      *)        content_type="application/octet-stream" ;;
    esac

    if curl -fsS \
        -X PUT \
        -H "AccessKey: ${BUNNY_STORAGE_PASSWORD}" \
        -H "Content-Type: ${content_type}" \
        --data-binary "@${local_path}" \
        "${base_url}/${remote_path}" >/dev/null; then
      count=$((count + 1))
    else
      warn "Failed to upload ${remote_path}"
      fail=$((fail + 1))
    fi
  }

  log "Uploading _next/static/* to Bunny zone=${BUNNY_STORAGE_ZONE}…"
  while IFS= read -r -d '' file; do
    rel="${file#${STATIC_DIR}/}"
    upload_one "${file}" "_next/static/${rel}"
  done < <(find "${STATIC_DIR}" -type f -print0)

  if [ -d "${PUBLIC_DIR}" ]; then
    log "Uploading public/* to Bunny zone=${BUNNY_STORAGE_ZONE}…"
    while IFS= read -r -d '' file; do
      rel="${file#${PUBLIC_DIR}/}"
      upload_one "${file}" "${rel}"
    done < <(find "${PUBLIC_DIR}" -type f -print0)
  fi

  log "Bunny upload done: ${count} files OK, ${fail} failed."
  if [ "${fail}" -gt 0 ]; then
    return 3
  fi
}

# -----------------------------------------------------------------------------
# 4. Upload — Cloudflare R2 (via aws s3 CLI compatible)
# -----------------------------------------------------------------------------
upload_cloudflare() {
  : "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID required for cloudflare provider}"
  : "${CLOUDFLARE_R2_BUCKET:?CLOUDFLARE_R2_BUCKET required}"
  : "${CLOUDFLARE_R2_ACCESS_KEY_ID:?CLOUDFLARE_R2_ACCESS_KEY_ID required}"
  : "${CLOUDFLARE_R2_SECRET_ACCESS_KEY:?CLOUDFLARE_R2_SECRET_ACCESS_KEY required}"

  if ! command -v aws >/dev/null 2>&1; then
    err "Cloudflare R2 upload requires 'aws' CLI (S3-compatible). Install: pip install awscli"
    return 3
  fi

  local endpoint="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"

  AWS_ACCESS_KEY_ID="${CLOUDFLARE_R2_ACCESS_KEY_ID}" \
  AWS_SECRET_ACCESS_KEY="${CLOUDFLARE_R2_SECRET_ACCESS_KEY}" \
  aws s3 sync \
    --endpoint-url "${endpoint}" \
    --cache-control "public, max-age=31536000, immutable" \
    "${STATIC_DIR}" "s3://${CLOUDFLARE_R2_BUCKET}/_next/static/" || return 3

  if [ -d "${PUBLIC_DIR}" ]; then
    AWS_ACCESS_KEY_ID="${CLOUDFLARE_R2_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${CLOUDFLARE_R2_SECRET_ACCESS_KEY}" \
    aws s3 sync \
      --endpoint-url "${endpoint}" \
      "${PUBLIC_DIR}" "s3://${CLOUDFLARE_R2_BUCKET}/" || return 3
  fi
  log "Cloudflare R2 sync done."
}

# -----------------------------------------------------------------------------
# 5. Purge cache CDN (Pull Zone) — best effort, non-bloquant
# -----------------------------------------------------------------------------
purge_bunny() {
  if [ -z "${CDN_PURGE_TOKEN:-}" ] || [ -z "${BUNNY_PULL_ZONE_ID:-}" ]; then
    warn "BUNNY_PULL_ZONE_ID or CDN_PURGE_TOKEN missing — skipping cache purge."
    return 0
  fi
  log "Purging Bunny pull zone ${BUNNY_PULL_ZONE_ID}…"
  if ! curl -fsS \
      -X POST \
      -H "AccessKey: ${CDN_PURGE_TOKEN}" \
      "https://api.bunny.net/pullzone/${BUNNY_PULL_ZONE_ID}/purgeCache" \
      >/dev/null; then
    warn "Bunny purge failed — assets may serve stale until TTL expires."
    return 4
  fi
  log "Bunny purge OK."
}

purge_cloudflare() {
  if [ -z "${CDN_PURGE_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
    warn "CLOUDFLARE_ZONE_ID or CDN_PURGE_TOKEN missing — skipping purge."
    return 0
  fi
  log "Purging Cloudflare zone ${CLOUDFLARE_ZONE_ID}…"
  if ! curl -fsS \
      -X POST \
      -H "Authorization: Bearer ${CDN_PURGE_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}' \
      "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
      >/dev/null; then
    warn "Cloudflare purge failed."
    return 4
  fi
  log "Cloudflare purge OK."
}

# -----------------------------------------------------------------------------
# 6. Smoke check — vérifie que le witness file est servi par le CDN
# -----------------------------------------------------------------------------
verify_cdn() {
  local url="${NEXT_PUBLIC_CDN_URL%/}/_next/static/check.txt"
  log "Verifying CDN witness file at ${url}…"
  # Petit retry car la propagation Pull Zone peut prendre 5-10s
  for attempt in 1 2 3 4 5; do
    if curl -fsS --max-time 10 "${url}" 2>/dev/null | grep -q "commit=${COMMIT_SHA}"; then
      log "CDN check OK on attempt ${attempt}."
      return 0
    fi
    log "CDN witness not yet propagated (attempt ${attempt}/5)…"
    sleep $((attempt * 2))
  done
  warn "CDN witness file did not propagate within 30s. Origin fallback recommended."
  return 0  # non-bloquant
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
case "${CDN_PROVIDER}" in
  bunny)
    upload_bunny || exit 3
    purge_bunny || true
    ;;
  cloudflare)
    upload_cloudflare || exit 3
    purge_cloudflare || true
    ;;
  *)
    err "Unknown CDN_PROVIDER='${CDN_PROVIDER}' (expected: bunny|cloudflare)"
    exit 1
    ;;
esac

verify_cdn

log "Deploy CDN done."
