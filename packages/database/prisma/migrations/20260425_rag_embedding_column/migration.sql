-- =============================================================================
-- RAG : ajout de la colonne `embedding vector(1024)` sur RagChunk
-- =============================================================================
-- Le RagService (`apps/backend/src/rag/rag.service.ts:559`) fait du vector
-- search via `embedding <=> $1::vector`. Tant que la colonne n'existe pas,
-- la query échoue silencieusement (try/catch) et retourne [], ce qui force
-- retrievalConfidence=0, belowThreshold=true → le chatbot répond "Je n'ai pas
-- trouvé d'information" pour TOUTES les questions, peu importe le contenu
-- indexé. Le commentaire `schema.prisma` documentait cette TODO depuis le
-- début ("À activer après: ALTER TABLE ... ADD COLUMN embedding vector(1024)").
--
-- Dimension : 1024 — cohérent avec OLLAMA_EMBEDDING_MODEL=bge-m3 (vérifié
-- via `curl /api/embeddings`). Si on bascule sur Mistral Embed plus tard
-- (autre dim), il faudra une nouvelle migration.
--
-- Index : ivfflat avec 100 listes (recommandé jusqu'à 1M vecteurs).
-- Pour HNSW (mieux qualité, plus mémoire), bump à pgvector 0.5+.
-- Notre version est 0.8.2 → HNSW dispo. On garde ivfflat pour simplicité ;
-- on basculera HNSW si on observe latence > 100ms sur le k-NN.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "RagChunk"
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- Index IVFFlat sur la distance cosine (cohérent avec l'opérateur `<=>` utilisé
-- dans rag.service.ts). Doit être créé APRÈS qu'on ait au moins quelques
-- vecteurs (sinon `lists=100` est trop large pour la table vide). Mais Postgres
-- n'autorise pas la création différée — on crée maintenant avec lists=100,
-- pgvector tolère le cas table vide (warning seulement).
--
-- NOTE prod : si la table grossit fortement, REINDEX peut être nécessaire.
-- Documenté dans docs/runbooks/MONITORING_ALERTING.md.
CREATE INDEX IF NOT EXISTS "RagChunk_embedding_cosine_idx"
  ON "RagChunk"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
