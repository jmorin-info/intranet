-- PCA / Plan de continuité d'activité — ISO 27001:2022 A.5.30
-- Historique des runs de tests de continuité (drill backup, restore dry-run,
-- simulations de panne service…). Le catalogue des scénarios est statique
-- côté backend (apps/backend/src/pca/pca-scenarios.ts). Les logs bruts sont
-- stockés dans la colonne `logs` (TEXT), et le résumé structuré dans `result`
-- (JSON : { summary, metrics, artifacts? }).

CREATE TABLE IF NOT EXISTS "PcaRun" (
    "id"          TEXT NOT NULL,
    "scenarioId"  TEXT NOT NULL,
    "status"      TEXT NOT NULL,
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration"    INTEGER,
    "result"      JSONB,
    "logs"        TEXT,
    "triggeredBy" TEXT NOT NULL,

    CONSTRAINT "PcaRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PcaRun_scenarioId_startedAt_idx"
    ON "PcaRun"("scenarioId", "startedAt");
CREATE INDEX IF NOT EXISTS "PcaRun_status_idx"
    ON "PcaRun"("status");
CREATE INDEX IF NOT EXISTS "PcaRun_triggeredBy_idx"
    ON "PcaRun"("triggeredBy");

ALTER TABLE "PcaRun"
    ADD CONSTRAINT "PcaRun_triggeredBy_fkey"
    FOREIGN KEY ("triggeredBy") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
