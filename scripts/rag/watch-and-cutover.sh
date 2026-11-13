#!/usr/bin/env bash
# Surveille le backfill ; déclenche le cutover dès que c'est fini (ou très bas).
set -u
LOG=/root/watch-and-cutover.log
cd /root
echo "=== [$(date -Is)] watcher START ===" >> "$LOG"
while true; do
  if grep -q "BACKFILL COMPLETE" /root/backfill-embeddings-2.log 2>/dev/null; then
    echo "[$(date -Is)] backfill COMPLETE détecté — lancement cutover" >> "$LOG"
    bash /root/cutover-rag-hybrid.sh >> "$LOG" 2>&1
    EC=$?
    echo "[$(date -Is)] cutover exit=$EC" >> "$LOG"
    exit $EC
  fi
  # Plan B : si process backfill mort sans "COMPLETE", attente prolongée
  if ! pgrep -af "backfill-embeddings.cjs" >/dev/null 2>&1; then
    echo "[$(date -Is)] backfill process absent (probable fin/crash) — attente 30s puis re-test" >> "$LOG"
    sleep 30
    if grep -q "BACKFILL COMPLETE" /root/backfill-embeddings-2.log 2>/dev/null; then continue; fi
    # Vérifier si on peut quand même tenter (≤ 50 NULL restantes)
    DBURL=$(grep -m1 "^DATABASE_URL" /root/omnitech-intranet/.env | cut -d= -f2- | tr -d '"')
    PGURL=$(echo "$DBURL" | sed 's/?.*//')
    REMAIN=$(psql "$PGURL" -t -A -c "SELECT count(*) - count(embedding) FROM \"RagChunk\";" 2>/dev/null)
    if [ "${REMAIN:-9999}" -le 50 ]; then
      echo "[$(date -Is)] backfill ~fini ($REMAIN restants) — cutover" >> "$LOG"
      bash /root/cutover-rag-hybrid.sh >> "$LOG" 2>&1
      exit $?
    fi
    echo "[$(date -Is)] process mort mais $REMAIN restants — STOP watcher (intervention manuelle)" >> "$LOG"
    exit 3
  fi
  sleep 60
done
