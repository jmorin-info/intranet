-- =============================================================================
-- Migration: 20260409_veille_sources
-- Add VeilleSource model + performance indexes
-- =============================================================================

-- CreateTable: VeilleSource
CREATE TABLE "VeilleSource" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "url"       TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VeilleSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique URL
CREATE UNIQUE INDEX "VeilleSource_url_key" ON "VeilleSource"("url");

-- CreateIndex: isActive lookup
CREATE INDEX "VeilleSource_isActive_idx" ON "VeilleSource"("isActive");

-- CreateIndex: VeilleItem composite index (severity + isProcessed)
CREATE INDEX "VeilleItem_severity_isProcessed_idx" ON "VeilleItem"("severity", "isProcessed");

-- CreateIndex: Ticket createdAt
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- CreateIndex: AuditLog severity
CREATE INDEX "AuditLog_severity_idx" ON "AuditLog"("severity");
