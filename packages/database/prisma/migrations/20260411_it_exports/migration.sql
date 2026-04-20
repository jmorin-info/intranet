-- IT Exports (ISO 27001 evidence deposit)
-- Allows the RSSI to upload IT / compliance exports (AD audits, Fortigate backups,
-- Veeam reports, vuln scans, etc.) grouped by category for audit evidence.

-- CreateTable: ItExport
CREATE TABLE IF NOT EXISTS "ItExport" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT,
    "description" TEXT,
    "uploadedById" TEXT NOT NULL,
    "reportPeriod" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ItExport
CREATE INDEX IF NOT EXISTS "ItExport_category_createdAt_idx" ON "ItExport"("category", "createdAt");
CREATE INDEX IF NOT EXISTS "ItExport_uploadedById_idx" ON "ItExport"("uploadedById");
CREATE INDEX IF NOT EXISTS "ItExport_deletedAt_idx" ON "ItExport"("deletedAt");

-- AddForeignKey: ItExport -> User
DO $$ BEGIN
    ALTER TABLE "ItExport"
      ADD CONSTRAINT "ItExport_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
