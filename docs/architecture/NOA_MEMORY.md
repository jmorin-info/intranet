# Mémoire conversationnelle Noa (Item 31)

> Wave D — module `noa-memory` — extraction Ollama + recall pgvector

## Objectif

Permettre à Noa (l'assistant IA de l'intranet) de **mémoriser des faits utilisateur
pertinents** entre les sessions pour personnaliser ses réponses sans qu'on doive
re-expliquer le contexte à chaque conversation.

Exemples de mémoires utiles :
- "Préfère le tutoiement"
- "Travaille sur le projet SEAL"
- "Département SI — équipe sécurité"
- "Indisponible les vendredis"

## Architecture

```
┌─────────────────────────┐
│  ChatStreamService      │
│  (chat /ask-stream)     │
└──────┬───────────┬──────┘
       │           │
   recall      extract+store
   (avant     (fire-and-forget
    RAG)       après close)
       │           │
       ▼           ▼
   ┌─────────────────────────┐
   │  NoaMemoryService       │
   │  - extract(...)         │  ← LlmService (Ollama JSON-prompted)
   │  - store(...)           │  ← EmbeddingService (pgvector 1024)
   │  - recall(...)          │  ← pgvector cosine + recency boost
   │  - forget / forgetAll   │
   │  - exportForUser        │
   └────────┬────────────────┘
            ▼
   ┌─────────────────────────┐
   │  NoaMemory (Postgres)   │
   │  + embedding vector(1024)│
   │  + ivfflat cosine index │
   └─────────────────────────┘
```

## Modèle de données

```prisma
model NoaMemory {
  id              String   @id @default(uuid())
  userId          String
  key             String   // "preference.tutoiement", "projet.actif", ...
  value           String   // phrase complète, idiomatique
  metadata        Json?    // sourceMessageId, conversationId, raw
  importanceScore Float    @default(0.5)  // 0..1
  recallCount     Int      @default(0)
  lastRecalledAt  DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  expiresAt       DateTime?  // null si importance > 0.8
  // embedding vector(1024) ajouté en raw SQL (Prisma ne gère pas pgvector)
}
```

`User.noaMemoryEnabled : Boolean default true` — opt-out par utilisateur.

## Pipeline

### 1. extract(userId, conversation)

Ollama est promté en JSON strict :

```
{ "items": [
  { "key": "snake_case_court", "value": "phrase", "importance": 0.0-1.0 }
] }
```

Le parsing est **tolérant** : si la réponse contient du texte autour du JSON,
on extrait le premier objet via regex `\{[\s\S]*\}`. Si rien de parsable →
liste vide. Si Ollama down → liste vide. **Le chat n'est jamais bloqué par
l'extraction**.

Convention `importance` :
- 0.9 : préférence explicite ("appelle-moi X", "tutoie-moi")
- 0.7 : projet/contexte récurrent
- 0.5 : mention factuelle (default)
- 0.3 : information passagère

### 2. store(userId, items)

UPSERT par `(userId, key)` : si une mémoire existe déjà sur la même clé, on
remplace sa valeur (la version la plus récente prime). L'embedding pgvector
est calculé et écrit en raw SQL (Prisma ne gère pas la colonne
`embedding vector(1024)`, voir RagChunk pour le pattern).

`expiresAt` :
- `importance > 0.8` → `null` (jamais expiré jusqu'à forget)
- sinon → +6 mois

### 3. recall(userId, query, k=5)

Top-k via pgvector cosine `<=>` opérateur :

```sql
SELECT *, 1 - (embedding <=> $vector) AS cosine_similarity
FROM "NoaMemory"
WHERE "userId" = $userId
  AND "importanceScore" >= 0.5
  AND embedding IS NOT NULL
  AND ("expiresAt" IS NULL OR "expiresAt" > now())
ORDER BY embedding <=> $vector ASC
LIMIT $k * 3;
```

On sur-sample (`k * 3`) puis on rerank avec un score combiné :

```
score = 0.5 * cosine_similarity
      + 0.3 * importanceScore
      + 0.2 * recency  // 1 - age / 6mo, clipped
```

Les top-k sont retournés et leur `recallCount` est incrémenté + `lastRecalledAt`
mis à jour (refresh du TTL implicite).

**Fallback** : si pgvector throw OU embedding service disabled → tri par
`importanceScore desc, updatedAt desc` (sans similarité).

### 4. forget / forgetAll / exportForUser

- `DELETE /api/v1/noa/memory/:id` — forget unitaire (RGPD article 17 ciblé)
- `DELETE /api/v1/noa/memory/all` — right to erasure global
- `GET /api/v1/noa/memory/export` — JSON download (RGPD article 15)

Toutes les opérations sont scoped au user courant (`req.user.id`) — **jamais
d'accès cross-user**, même pour les admins. La mémoire personnelle est privée.

Les forget/export sont audit-loggés (`NOA_MEMORY_FORGOTTEN`,
`NOA_MEMORY_FORGOTTEN_ALL`, `NOA_MEMORY_EXPORTED`) avec severity WARN/INFO.

## Intégration ChatStreamService

```typescript
// 1. Avant le retrieval RAG
const memories = await this.noaMemory.recall(user.id, query, { k: 5 });
emitter.writeEvent('memory_recall', { count, keys });

// 2. RAG normal (inchangé)
await this.ragService.answerStream(...);

// 3. Après close du stream — fire-and-forget
void (async () => {
  const items = await this.noaMemory.extract(userId, { user, assistant });
  await this.noaMemory.store(userId, items);
})();
```

Le bloc mémoire **n'est pas encore injecté dans le prompt RAG** — le retrieval
RAG actuel ne prend pas de "system memory" en paramètre. Cela passera dans
une itération suivante quand `RagService` exposera un hook
`prependSystemContext`. Les hits sont déjà trackés (`recallCount`).

`NoaMemoryService.formatForPrompt(memories)` produit le bloc à injecter le
moment venu :

```
Contexte utilisateur (mémoire persistante Noa) :
- Préfère le tutoiement
- Travaille sur SEAL
- Département SI

```

## Frontend

`/profile/noa-memory` :
- Liste paginée (key + value + importance + recallCount)
- Toggle global `noaMemoryEnabled`
- "Oublier" unitaire par mémoire
- "Tout oublier" (avec confirm window)
- "Exporter" (download JSON)

## Tests

`apps/backend/src/noa-memory/noa-memory.service.spec.ts` :
- extract : parsing JSON tolérant + clamp importance + résilience LLM down
- store : create vs upsert + no-op si toggle off + TTL null pour importance>0.8
- recall : pgvector + tri combiné, fallback DB si vector throw
- forget/forgetAll : scoping userId
- exportForUser, formatForPrompt

## RGPD

- **Right of access (art. 15)** : `GET /noa/memory/export` → JSON
- **Right to erasure (art. 17)** : `DELETE /noa/memory/:id` ou `/all`
- **Right to object (art. 21)** : `noaMemoryEnabled = false` → recall = [] et
  store = no-op. Les mémoires existantes restent jusqu'à forget explicite.
- **Cascade delete** : suppression user → `ON DELETE CASCADE` purge les
  mémoires.

## Roadmap

- Injection dans le prompt RAG (hook `prependSystemContext`)
- Promotion automatique d'importance : après N recalls, bump score
- Decay : importance baisse si jamais recall pendant >3 mois
- UI : "suggérer une mémoire" — l'utilisateur peut ajouter manuellement un fait
- Cron de purge des `expiresAt < now()` (idempotent, hebdo)
