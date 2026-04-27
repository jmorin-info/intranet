-- =============================================================================
-- Item 30 (RAG fine-tuning corpus maison) : table RagBenchmarkRun
-- =============================================================================
-- Permet de tracker dans le temps l'evolution des metriques du pipeline RAG
-- (recall@5, MRR, faithfulness, latence) pour comparer differentes
-- configurations : reranker on/off, hybrid alpha, query expansion, etc.
--
-- Cette table est ecrite par l'endpoint admin POST /rag/eval lors des runs
-- de benchmark sur le golden dataset (`apps/backend/src/rag/eval/golden-dataset.json`).
--
-- Aucune donnee utilisateur sensible n'est stockee : seules les metriques
-- agregees + la config sterilisee.

CREATE TABLE IF NOT EXISTS "RagBenchmarkRun" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "runAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "datasetVersion" TEXT NOT NULL,
  "mode"           TEXT NOT NULL,
  "recall5"        DOUBLE PRECISION NOT NULL,
  "mrr"            DOUBLE PRECISION NOT NULL,
  "faithfulness"   DOUBLE PRECISION,
  "termCoverage"   DOUBLE PRECISION,
  "latencyP50Ms"   INTEGER,
  "latencyP95Ms"   INTEGER,
  "numQueries"     INTEGER NOT NULL,
  "numChunks"      INTEGER,
  "config"         JSONB,
  "notes"          TEXT
);

CREATE INDEX IF NOT EXISTS "RagBenchmarkRun_runAt_idx"
  ON "RagBenchmarkRun" ("runAt");

CREATE INDEX IF NOT EXISTS "RagBenchmarkRun_datasetVersion_mode_idx"
  ON "RagBenchmarkRun" ("datasetVersion", "mode");
