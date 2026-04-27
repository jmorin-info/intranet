-- Migration : étendre DataExportRequest avec status + filePath + completedAt
-- ----------------------------------------------------------------------
-- Contexte : le processor BullMQ `data-export.processor.ts` écrit déjà
-- des fichiers JSON dans `STORAGE_PATH/exports/`, mais la table
-- `DataExportRequest` ne possède ni colonne `status` (PENDING/PROCESSING/
-- COMPLETED/FAILED), ni `filePath` pour conserver le chemin disque, ni
-- `completedAt` distinct de `processedAt`. Cette migration les ajoute en
-- conservant la compatibilité avec les enregistrements historiques
-- (`processedAt`, `downloadUrl` restent inchangés).
--
-- L'enum `DataExportStatus` est créé idempotemment.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'DataExportStatus'
  ) THEN
    CREATE TYPE "DataExportStatus" AS ENUM (
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED'
    );
  END IF;
END
$$;

ALTER TABLE "DataExportRequest"
  ADD COLUMN IF NOT EXISTS "status" "DataExportStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "DataExportRequest"
  ADD COLUMN IF NOT EXISTS "filePath" TEXT;

ALTER TABLE "DataExportRequest"
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

ALTER TABLE "DataExportRequest"
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- Backfill : tout enregistrement avec processedAt non-null est considéré
-- COMPLETED (les anciens exports synchrones sont terminés au moment du
-- update). Sinon, ils restent PENDING.
UPDATE "DataExportRequest"
SET "status" = 'COMPLETED',
    "completedAt" = "processedAt"
WHERE "processedAt" IS NOT NULL AND "status" = 'PENDING';

-- Index sur status pour requêter rapidement les exports en attente.
CREATE INDEX IF NOT EXISTS "DataExportRequest_status_idx" ON "DataExportRequest"("status");
