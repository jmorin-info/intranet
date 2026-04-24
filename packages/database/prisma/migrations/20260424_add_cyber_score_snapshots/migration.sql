-- Cyber Score Snapshots (ISO 27001:2022)
-- Historise les calculs du score cyber global /100 et des 10 sous-scores
-- afin d'afficher les tendances 7j / 30j / 90j sur /admin/cyber-score.
-- Migration idempotente : safe to re-run.

CREATE TABLE IF NOT EXISTS "CyberScoreSnapshot" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "domains" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CyberScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CyberScoreSnapshot_createdAt_idx"
    ON "CyberScoreSnapshot"("createdAt");
