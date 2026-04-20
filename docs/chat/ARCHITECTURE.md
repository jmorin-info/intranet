# Chatbot unifié — Architecture "1 cerveau, 2 surfaces"

**Statut** : Phase 1 backend livrée (2026-04-20). Phases 2 (frontend FAB refactor) et 3 (migration data `RagQueryLog`) à venir.

## Vision

Deux surfaces UI distinctes, **un seul backend** :

```
┌──────────────────────────────────────────────────────────────┐
│                        Utilisateur                           │
└──────────┬────────────────────────────────┬─────────────────┘
           │                                │
    Ctrl+Shift+K                      Bouton FAB
    (modale plein écran)          (drawer contextuel)
           │                                │
           ▼                                ▼
    ┌──────────┐                    ┌──────────┐
    │ AskSearch│                    │ChatFAB    │
    │ Modal    │                    │Widget     │
    │(existant)│                    │(Phase 2)  │
    └─────┬────┘                    └─────┬────┘
          │                                │
          │     POST /chat/ask-stream      │
          │     surface: 'MODAL'           │
          │     (ou 'FAB')                 │
          └──────────────┬─────────────────┘
                         ▼
           ┌─────────────────────────────┐
           │   ChatController (unified)  │
           │   + ChatbotUnifiedGuard     │
           └──────────────┬──────────────┘
                          │
                          ▼
      ┌──────────────────────────────────────────┐
      │      ChatStreamService                   │
      │  - ensureSession(surface, context)       │
      │  - log USER message                      │
      │  - RagService.answerStream (RAG pipeline)│
      │  - log ASSISTANT message + metadata      │
      │  - emit SSE (token, sources, done)       │
      └──────────────────────────────────────────┘
                          │
                          ▼
     ┌──────────┐ ┌──────────┐ ┌─────────────────────┐
     │  RAG     │ │ Prisma   │ │ ChatSession          │
     │ pipeline │ │ writes   │ │ ChatMessage          │
     │ (Mistral │ │ (cascade)│ │ ChatMessageFeedback  │
     │ + bge-m3)│ │          │ │                      │
     └──────────┘ └──────────┘ └─────────────────────┘
```

## Différenciation fonctionnelle

### Modale `Ctrl+Shift+K` — assistant complet

- Démarche **active** de recherche : l'user ouvre la modale pour poser une question précise
- Full-screen ou grande fenêtre centrée
- Historique conversationnel multi-turn visible
- Pas de présomption de contexte (champ `surface: 'MODAL'`)
- Raccourci clavier universel, accessible depuis n'importe quelle page

### Widget FAB — assistant contextuel de page (Phase 2)

- Bouton flottant permanent en bas à droite
- Drawer latéral de taille moyenne (~380px)
- **Context-aware** : envoie `surface: 'FAB'` + `context: { url, contextType, entityId, title }`
- Suggestions contextuelles pré-remplies selon `contextType` (wiki_article, ticket, document, runbook, generic)
- Lien "Ouvrir en grand" → navigue vers la modale avec `sessionId` → reprise transparente
- Plus aucune heuristique locale : tous les appels passent par le backend RAG unifié

## Phase 1 — livrée (ce commit)

### Nouveau backend `apps/backend/src/chat/`

| Fichier | Rôle |
|---|---|
| `chat.module.ts` | Déclaration du module NestJS (importe PrismaModule + RagModule) |
| `chat.controller.ts` | 8 endpoints REST (sessions, stream, feedback, regenerate, suggestions) |
| `session.service.ts` | CRUD + pagination des `ChatSession` |
| `chat-stream.service.ts` | Orchestration SSE : crée session, log messages, délègue à `RagService.answerStream` |
| `feedback.service.ts` | Upsert `ChatMessageFeedback` (1:1 avec `ChatMessage`, ownership check) |
| `chat.service.ts` | Helpers (suggestions hardcodées v1 par `contextType`) |
| `guards/chatbot-unified.guard.ts` | Gate global via `CHATBOT_UNIFIED_ENABLED` (404 si off) |
| `guards/session-owner.guard.ts` | Ownership check `ChatSession` (SUPER_ADMIN bypass) |
| `dto/*.ts` | Validation class-validator (create-session, update-session, ask-stream, feedback, list-sessions) |

### Nouveaux modèles Prisma

| Modèle | Rôle |
|---|---|
| `ChatSession` | Une conversation (titre, surface, contexte de démarrage, timestamps) |
| `ChatMessage` | Un message (user/assistant, content, citations, tokens, latence, regenerateCount) |
| `ChatMessageFeedback` | Feedback thumbs up/down + reason + comment (1:1 avec message assistant) |

### Enums Prisma

`ChatSurface` (MODAL / FAB / AUTO), `ChatMessageRole` (USER / ASSISTANT),
`ChatFeedbackRating` (HELPFUL / NOT_HELPFUL),
`ChatFeedbackReason` (WRONG_ANSWER / MISSING_INFO / OFF_TOPIC / TOO_LONG / TOO_SHORT / HALLUCINATION / OTHER).

### Cron nocturne

`apps/backend/src/rag/rag-reindex.scheduler.ts` — `@Cron('0 1 * * *', 'Europe/Paris')` → `RagService.reindexAll()`. But : propager le champ `classification` ajouté en Mission 2 sur tout le corpus existant.

## Cohabitation avec le RAG existant

Pendant la coexistence (Phase 1 → Phase 3) :

| Endpoint | Rôle | Statut |
|---|---|---|
| `POST /api/v1/rag/ask-stream` | RAG direct, écrit dans `RagQueryLog` | **Inchangé** — utilisé par modale existante `ai-search-modal.tsx` |
| `POST /api/v1/rag/:id/feedback` | Feedback v1 (rating + texte JSON) | **Inchangé** — utilisé par modale existante |
| `POST /api/v1/chat/ask-stream` | Nouvel endpoint unifié, écrit dans `ChatSession/ChatMessage` | **Inactif** (flag off) |
| `/chat/sessions/*` | Historique sessions unifié | **Inactif** (flag off) |
| `/chat/messages/:id/feedback` | Feedback v2 (rating + reason + comment séparés) | **Inactif** (flag off) |

`RagQueryLog` est conservé pour 3 mois minimum. La migration éventuelle `RagQueryLog` → `ChatMessage` est Phase 3 (script idempotent documenté plus tard).

## Points d'extension Phase 2

- **Widget FAB `apps/frontend/src/components/ai/ai-chatbot.tsx`** : refondre pour appeler `POST /api/v1/chat/ask-stream` avec `surface: 'FAB'` + contexte de page (hook `usePageContext()` à créer)
- **Modale `ai-search-modal.tsx`** : migration progressive vers `/chat/ask-stream` avec `surface: 'MODAL'` (feature flag côté client permet rollback)
- **Pont historique** : lien "Ouvrir en grand" dans FAB → nav `/?chatSession=<id>` + modale lit le query param

## Sécurité

- Guard `ChatbotUnifiedGuard` : 404 si flag off (évite disclosure)
- Guard `JwtAuthGuard` : auth obligatoire sur tous les endpoints `/chat/*`
- Guard `SessionOwnerGuard` : SUPER_ADMIN bypass pour audit, sinon 404 si pas propriétaire
- RBAC retrieval : délégué à `RagService` (filtrage ISO 27001 A.5.15 appliqué automatiquement via `RagSearchContext`)
- Rate limiting : `@Throttle` 10/min sur `ask-stream`, 5/min sur `regenerate`

## Audit & compliance

Chaque action notable (création session, message, feedback) est tracée en DB
via les modèles Prisma (timestamps `startedAt`, `createdAt`, `decidedAt`).
Les métadonnées de génération (modèle utilisé, latence, tokens, chunks
retrieved) sont loggées dans `ChatMessage` pour analyse post-mortem RGPD /
ISO 27001 A.8.15.

## Références

- Rapport exécution : `docs/remediation/MISSION_3_PHASE_1_REPORT.md`
- Préflight + baseline : `docs/remediation/MISSION_3_PHASE_1_PREFLIGHT.md` + `MISSION_3_PHASE_1_BASELINE.md`
- Backup pre-mission : `docs/remediation/MISSION_3_PHASE_1_BACKUP.md`
- Runbook cron reindex : `docs/runbooks/RAG_REINDEX_NIGHTLY.md`
- Runbook activation flag : `docs/chat/ACTIVATION_RUNBOOK.md`
