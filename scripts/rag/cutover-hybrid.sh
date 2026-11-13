#!/usr/bin/env bash
# Cutover automatique : merge final branche → main, build, bascule lexical → hybrid,
# restart backend (+ frontend si besoin), vérification end-to-end.
# Réversible : sauvegarde du .env d'origine + commande de rollback affichée.
set -euo pipefail
cd /root/omnitech-intranet

LOG=/root/cutover-rag-hybrid.log
exec > >(tee -a "$LOG") 2>&1

echo "=== [$(date -Is)] CUTOVER RAG hybrid — START ==="

# 1. Vérifier que le backfill est bien fini
DBURL=$(grep -m1 "^DATABASE_URL" .env | cut -d= -f2- | tr -d '"'); PGURL=$(echo "$DBURL" | sed 's/?.*//')
REMAIN=$(psql "$PGURL" -t -A -c "SELECT count(*) - count(embedding) FROM \"RagChunk\";")
echo "[chunks sans embedding restants] $REMAIN"
if [ "${REMAIN:-1}" -gt 50 ]; then
  echo "ABORT — backfill encore en cours ($REMAIN à embedder). Relancer plus tard."; exit 2
fi

# 2. Merge branch -> main (fast-forward) si nécessaire
if git merge-base --is-ancestor feature/content-enrichment HEAD; then
  echo "[merge] déjà à jour"
else
  echo "[merge] fast-forward feature/content-enrichment"
  git merge --ff-only feature/content-enrichment
fi

# 3a. Install si package.json a bougé (axios/next bumps de la branche).
# Sans --frozen-lockfile pour permettre la regen du lockfile sur ces bumps.
if git diff --name-only HEAD~5..HEAD 2>/dev/null | grep -qE "package\.json$"; then
  echo "[install] package.json modifie -> pnpm install"
  pnpm install --no-frozen-lockfile
else
  echo "[install] aucun package.json change recent -> skip"
fi

# 3b. Build frontend (next) + backend (nest) — sequentiel pour eviter OOM
echo "[build frontend]"; env -u DEV_API_PROXY -u NEXT_PUBLIC_API_URL NODE_ENV=production pnpm --filter @omnitech/frontend build
echo "[build backend]"; pnpm --filter @omnitech/backend build

# 4. Sauvegarde .env + bascule mode hybrid
cp .env .env.bak.cutover.$(date +%s)
if grep -q "^RAG_HYBRID_MODE=lexical" .env; then
  sed -i 's/^RAG_HYBRID_MODE=lexical/RAG_HYBRID_MODE=hybrid/' .env
  echo "[mode] lexical -> hybrid"
else
  echo "[mode] inchangé (déjà $(grep '^RAG_HYBRID_MODE' .env))"
fi

# 5. Restart services
systemctl restart omnitech-backend.service
sleep 3
systemctl restart omnitech-frontend.service
sleep 3

# 6. Vérifications
echo "[health] backend $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health)"
echo "[health] frontend $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/login)"
echo "[BUILD_ID] $(cat apps/frontend/.next/BUILD_ID)"
echo "[mode actif] $(grep '^RAG_HYBRID_MODE' .env)"
echo "[embeddings finaux] $(psql "$PGURL" -t -A -c 'SELECT count(embedding) || "/" || count(*) FROM "RagChunk";')"

echo
echo "=== ROLLBACK (si problème) ==="
echo "  sed -i 's/^RAG_HYBRID_MODE=hybrid/RAG_HYBRID_MODE=lexical/' /root/omnitech-intranet/.env"
echo "  systemctl restart omnitech-backend.service"
echo
echo "=== [$(date -Is)] CUTOVER OK ==="
