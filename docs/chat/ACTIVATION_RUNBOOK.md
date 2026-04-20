# Runbook — Activation du chatbot unifié

**Statut Phase 1** : infrastructure en place, **flag désactivé par défaut**.
**Activation prod** : à faire après validation Phase 2 (frontend FAB refondu).

## Prérequis

Avant d'activer `CHATBOT_UNIFIED_ENABLED=true` en prod :

- [ ] Phase 2 backend tests verts (tests E2E ask-stream, feedback, sessions)
- [ ] Phase 2 frontend prêt : `ai-chatbot.tsx` refondu pour appeler `/chat/*`
- [ ] Cron nocturne a tourné au moins 1 fois sans erreur (voir `RAG_REINDEX_NIGHTLY.md`)
- [ ] Backup DB frais < 24h (`ls -lah /var/backups/omnitech/db_*.sql.gz | tail -3`)
- [ ] Plan de comm équipe : qui tester, sur quelles pages, pendant combien de temps

## Activation

### Environnement systemd (production)

```bash
# 1. Activer le flag via drop-in file (pratique pour rollback rapide)
sudo mkdir -p /etc/systemd/system/omnitech-backend.service.d
sudo tee /etc/systemd/system/omnitech-backend.service.d/chatbot-unified.conf <<'EOF'
[Service]
Environment="CHATBOT_UNIFIED_ENABLED=true"
EOF

# 2. Reload + restart backend
sudo systemctl daemon-reload
sudo systemctl restart omnitech-backend

# 3. Vérifier
sleep 3
curl -s -o /dev/null -w "chat endpoint: %{http_code}\n" \
  -H "Authorization: Bearer <JWT_VALIDE>" \
  http://localhost:3000/api/v1/chat/sessions
# Attendu : 200 (JSON vide avec data:[])
```

### Alternative : mettre dans `.env`

```bash
echo "CHATBOT_UNIFIED_ENABLED=true" >> /root/omnitech-intranet/.env
systemctl restart omnitech-backend
```

Préférer la **drop-in systemd** en prod : plus explicite, plus facile à auditer
(grep du dossier `/etc/systemd/system/*.d/`).

## Vérifications post-activation

```bash
# 1. Flag actif
grep -i "CHATBOT_UNIFIED" /etc/systemd/system/omnitech-backend.service.d/*.conf

# 2. Endpoint répond
curl -sI -H "Authorization: Bearer <JWT>" \
  http://localhost:3000/api/v1/chat/sessions
# Doit renvoyer : HTTP/2 200 (pas 404)

# 3. Créer une session test
curl -s -X POST http://localhost:3000/api/v1/chat/sessions \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"surface":"MODAL"}' | jq '.id'

# 4. Lister sessions
curl -s http://localhost:3000/api/v1/chat/sessions \
  -H "Authorization: Bearer <JWT>" | jq '.total'

# 5. Suggestions
curl -s "http://localhost:3000/api/v1/chat/suggestions?contextType=wiki_article" \
  -H "Authorization: Bearer <JWT>" | jq '.suggestions | length'
# Attendu : 4
```

## Rollback

### Désactivation rapide (même sans rollback DB)

```bash
sudo rm /etc/systemd/system/omnitech-backend.service.d/chatbot-unified.conf
sudo rmdir /etc/systemd/system/omnitech-backend.service.d 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl restart omnitech-backend

# Vérifier retour au 404
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <JWT>" \
  http://localhost:3000/api/v1/chat/sessions
# Attendu : 404
```

Les **sessions + messages créés restent en DB** (non détruits par un simple
désactivation). Ça permet de réactiver plus tard sans perte d'historique.

### Rollback complet (supprimer aussi les tables)

Dernier recours si la DB elle-même est corrompue par un bug Phase 1 :

```bash
# 1. Stopper backend
systemctl stop omnitech-backend

# 2. Rollback SQL ciblé
export PGPASSWORD="<POSTGRES_PASSWORD>"
psql -U omnitech -h localhost -d omnitech_intranet \
  -f /root/omnitech-intranet/packages/database/prisma/migrations/20260420_add_chat_unified_models/rollback.sql

# 3. Marquer la migration comme rolled-back côté Prisma
cd /root/omnitech-intranet/packages/database
pnpm prisma migrate resolve --rolled-back 20260420_add_chat_unified_models

# 4. Régénérer le client Prisma (retire les types Chat*)
pnpm prisma generate

# 5. Rebuild backend + restart
cd /root/omnitech-intranet/apps/backend
pnpm build
systemctl start omnitech-backend
```

### Rollback de dernier recours (restore backup complet)

Si la DB entière doit revenir à l'état d'avant Mission 3 :

```bash
# Commandes dans docs/remediation/MISSION_3_PHASE_1_BACKUP.md §"Commande de restauration complète"
```

Le backup est dans `/var/backups/omnitech/db_pre_mission3_20260420_215821.sql.gz`.

## Monitoring post-activation

Surveiller pendant les **3 premières heures** :

```bash
# Erreurs backend
journalctl -u omnitech-backend --since "5 min ago" | grep -iE "error|exception|chat"

# Latence SSE (time-to-first-token, total)
# → lire ChatMessage.timeToFirstTokenMs et .totalLatencyMs
psql -U omnitech -d omnitech_intranet -c \
  "SELECT AVG(\"timeToFirstTokenMs\"), AVG(\"totalLatencyMs\"), COUNT(*)
   FROM \"ChatMessage\"
   WHERE role='ASSISTANT' AND \"createdAt\" > NOW() - INTERVAL '1 hour';"

# Volumétrie sessions
psql -U omnitech -d omnitech_intranet -c \
  "SELECT surface, COUNT(*) FROM \"ChatSession\"
   WHERE \"startedAt\" > NOW() - INTERVAL '1 hour'
   GROUP BY surface;"
```

Seuils d'alerte (premiers tests — à affiner) :
- `timeToFirstTokenMs` moyen > **5s** : problème Ollama / retrieval
- `totalLatencyMs` moyen > **30s** : probablement timeout Ollama
- `rating = 'NOT_HELPFUL'` > 40% sur la journée : qualité RAG dégradée

## Contacts

| Rôle | Contact | Action |
|---|---|---|
| RSSI | jmorin@omnitech-security.fr | Validation prod, incidents sécurité |
| Dev lead | (à définir) | Bug triage, rollback |
| Ollama admin | (serveur local) | `systemctl restart ollama` si LLM unresponsive |
