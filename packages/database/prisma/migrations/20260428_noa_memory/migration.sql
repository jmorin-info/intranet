-- =============================================================================
-- Wave D — Item 31 : Mémoire conversationnelle Noa (NoaMemory)
-- =============================================================================
-- 1 fait extrait par Ollama après chaque échange = 1 ligne. Multiples par user.
--
-- Embedding pgvector(1024) — réutilise l'extension déjà installée par la
-- migration 20260425_rag_embedding_column. Dimension 1024 = bge-m3
-- (cf. EmbeddingService).
--
-- Cascade delete sur User : RGPD-friendly (suppression user → purge mémoires).
--
-- Idempotente.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "NoaMemory" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL,
  "key"             TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "metadata"        JSONB,
  "importanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "recallCount"     INTEGER NOT NULL DEFAULT 0,
  "lastRecalledAt"  TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"       TIMESTAMP(3),

  CONSTRAINT "NoaMemory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Colonne pgvector (Prisma ne supporte pas nativement → ALTER TABLE séparé).
-- Voir RagChunk pour le pattern exact.
ALTER TABLE "NoaMemory"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1024);

-- Index principal pour le recall : top-k par user, trié par importance desc.
CREATE INDEX IF NOT EXISTS "NoaMemory_userId_importance_idx"
  ON "NoaMemory"("userId", "importanceScore" DESC);

-- Index pour l'UPSERT (userId, key) : déduplication soft des mémoires
-- du même type (ex "preference.ton" remplacé si la valeur change).
CREATE INDEX IF NOT EXISTS "NoaMemory_userId_key_idx"
  ON "NoaMemory"("userId", "key");

-- Index pour le cron de purge des mémoires expirées (TTL 6 mois par défaut).
CREATE INDEX IF NOT EXISTS "NoaMemory_expiresAt_idx"
  ON "NoaMemory"("expiresAt");

-- Index ivfflat pour la recherche cosine (memoire sémantique). Aligné avec
-- RagChunk_embedding_cosine_idx — mêmes paramètres lists=100. Sera ré-indexé
-- automatiquement au-dessus de ~10k vecteurs (rare car 100 users * 50 mems max).
CREATE INDEX IF NOT EXISTS "NoaMemory_embedding_cosine_idx"
  ON "NoaMemory"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
