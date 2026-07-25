#!/bin/bash
# =============================================================================
# Déploiement de la vague GED (OnlyOffice / workflow / signatures / veille / IA)
# VM de PRODUCTION — exécuter en root depuis /root/omnitech-intranet
#
# Ordre critique : migration DB → prisma generate → .env → BUILD → RESTART.
# Le client Prisma et le build ne sont régénérés qu'APRÈS que les colonnes
# existent en base, pour ne jamais servir un client désaligné.
#
# Backup DB déjà pris : /root/backups/omnitech_intranet_pre-ged-deploy_20260725_200713.dump
# Rollback build : `git checkout <commit-precedent>` puis re-build+restart.
# =============================================================================
set -euo pipefail
cd /root/omnitech-intranet
export $(grep -E '^NODE_ENV=' .env | xargs) 2>/dev/null || true

log(){ echo -e "\n\033[1;36m=== $* ===\033[0m"; }

log "0. Garde-fou : on est bien sur main, arbre propre"
git rev-parse --abbrev-ref HEAD
git status --short | grep -v node_modules && { echo "ARBRE SALE — stop"; exit 1; } || echo "arbre propre"

log "1. Migration Prisma (additive) → PROD"
RAW=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
DATABASE_URL="$RAW" pnpm --filter @omnitech/database exec prisma migrate deploy

log "2. Régénération du client Prisma (colonnes désormais présentes)"
pnpm --filter @omnitech/database exec prisma generate

log "3. Ajout des variables .env (idempotent)"
add_env(){ grep -qE "^$1=" .env || echo "$2" >> .env; }
add_env OLLAMA_TIMEOUT_MS        'OLLAMA_TIMEOUT_MS=240000'
add_env RAG_ANSWER_TIMEOUT_MS    'RAG_ANSWER_TIMEOUT_MS=180000'
add_env RAG_ANSWER_MAX_TOKENS    'RAG_ANSWER_MAX_TOKENS=256'
add_env OLLAMA_TTFT_TIMEOUT_MS   'OLLAMA_TTFT_TIMEOUT_MS=120000'
add_env OLLAMA_IDLE_TIMEOUT_MS   'OLLAMA_IDLE_TIMEOUT_MS=30000'
add_env CHATBOT_UNIFIED_ENABLED  'CHATBOT_UNIFIED_ENABLED=false'
add_env SIGNATURES_ALLOW_DIRECT  'SIGNATURES_ALLOW_DIRECT=false'
add_env ONLYOFFICE_INTERNAL_DS_URL 'ONLYOFFICE_INTERNAL_DS_URL=http://localhost:8082'
echo "  .env à jour"

log "4. Build backend (nest build → dist/)"
pnpm --filter @omnitech/backend build

log "5. Build frontend (next build → .next/) — restart immédiat après"
pnpm --filter @omnitech/frontend build

log "6. Restart des services systemd"
systemctl restart omnitech-backend
systemctl restart omnitech-frontend

log "7. Attente santé backend"
for i in $(seq 1 30); do
  if curl -sf --max-time 3 http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "  backend OK"; break; fi
  sleep 2
  [ "$i" = 30 ] && { echo "  BACKEND KO — voir journalctl -u omnitech-backend"; exit 1; }
done
curl -s http://localhost:3000/api/health | head -c 400; echo

log "8. Attente santé frontend"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:3001/ 2>/dev/null || echo 000)
  [ "$code" != "000" ] && { echo "  frontend répond ($code)"; break; }
  sleep 2
  [ "$i" = 30 ] && { echo "  FRONTEND KO — voir journalctl -u omnitech-frontend"; exit 1; }
done

log "DÉPLOIEMENT CODE TERMINÉ — services relancés et sains"
echo "Étapes suivantes (manuelles, pilotées ensuite) :"
echo "  - scripts de données maintenance/ en dry-run puis --apply"
echo "  - reconfig webhook DocuSeal → POST /api/v1/signatures/webhook"
echo "  - E2E GED + durcissement JWT OnlyOffice (phase 2)"
