# Chatbot Suggestions — Stratégie v1 / v2

**v1 (livrée Phase 1)** : suggestions **hardcodées** par `contextType`.
**v2 (Phase 2)** : suggestions **LLM-generated** avec cache Redis.

## v1 — hardcoded par contextType

Endpoint : `GET /api/v1/chat/suggestions?contextType={type}&entityId={id}`.

Source : `apps/backend/src/chat/chat.service.ts:getSuggestions()`.

Mapping :

| `contextType` | Nb suggestions | Ton |
|---|---:|---|
| `wiki_article` | 4 | "Résume-moi", "Actions recommandées", "À qui destiné", "Prérequis" |
| `runbook` | 4 | "Étapes", "Points vigilance", "Rollback", "Personne escalade" |
| `document` | 4 | "Résumé 3 points", "Risques", "Classification ISO", "Destinataires" |
| `ticket` | 4 | "Résumé + statut", "Résolution similaire", "Assignee + ancienneté", "Runbook applicable" |
| `generic` (default) | 6 | Questions universelles onboarding / chartes / helpdesk |

`entityId` et `userDepartmentId` sont passés au service mais **non utilisés** en v1.

## v2 — LLM-generated (à implémenter Phase 2)

Objectif : suggestions pertinentes pour l'entité exacte (ex: pour la wiki
page "Setup VPN", proposer "Quel port Wireguard faut-il ouvrir ?" plutôt
que la question générique "Résume-moi cet article").

### Design proposé

```
                          /chat/suggestions
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │ SuggestionService               │
                │ ┌─────────────────────────────┐ │
                │ │ Redis cache                 │ │
                │ │ key: ctxType:entityId:dept  │ │
                │ │ TTL: 3600s                  │ │
                │ └────────────┬────────────────┘ │
                │              │ miss             │
                │              ▼                  │
                │ ┌─────────────────────────────┐ │
                │ │ Ollama prompt               │ │
                │ │ "Tu es un assistant RAG     │ │
                │ │  Propose 4 questions        │ │
                │ │  pertinentes sur :          │ │
                │ │  [chunk 1][chunk 2]..."     │ │
                │ └────────────┬────────────────┘ │
                │              ▼                  │
                │         parse JSON              │
                │              │                  │
                │              ▼                  │
                │      cache SET + return         │
                └─────────────────────────────────┘
```

### Prompt template (brouillon)

```
Tu aides un utilisateur à formuler une question pertinente sur le contenu
suivant. Propose 4 questions courtes (≤ 15 mots chacune) qui appellent des
réponses ancrées dans ce document. Évite les questions "oui/non". Évite
les questions qui nécessitent des informations externes.

Contenu (extrait des 3 premiers chunks) :
{{CHUNKS}}

Format de réponse JSON (rien d'autre) :
{ "suggestions": ["...", "...", "...", "..."] }
```

### Cache key strategy

```
sugg:v2:{contextType}:{entityId}:{userDepartmentId ?? 'none'}
```

- TTL 3600s (1h) : équilibre fraîcheur vs coût LLM
- Invalidation explicite quand l'entité est modifiée (hook Prisma middleware
  sur update wiki/document/ticket — à créer)

### Estimation coût

- ~300 tokens in / 150 tokens out par miss cache
- Mistral 7B local : ~3s latence, coût monétaire nul
- ~100 entités distinctes × 10 departments = 1000 keys max en cache permanent
- Memory Redis : ~500 bytes/key → 500 KB total = négligeable

### Fallback

Si LLM fail (timeout, JSON invalide) : retombe sur les suggestions hardcodées
de v1 pour ne pas laisser l'utilisateur sans orientation.

## Métriques à suivre

Ajouter en Phase 2 :

- `chat_suggestions_cache_hit_total` / `chat_suggestions_cache_miss_total` (Prometheus-like counter)
- `chat_suggestions_generation_duration_ms` (histogramme)
- `chat_suggestion_clicked_total{contextType,suggestion_index}` (quelles suggestions marchent)

Les métriques click-through permettront d'affiner le prompt template v2.1.

## Références

- Architecture globale : `docs/chat/ARCHITECTURE.md`
- Endpoint : `apps/backend/src/chat/chat.controller.ts:suggestions()`
- v1 implémentation : `apps/backend/src/chat/chat.service.ts:getSuggestions()`
