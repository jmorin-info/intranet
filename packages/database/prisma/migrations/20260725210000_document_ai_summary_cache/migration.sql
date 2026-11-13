-- Cache persistant des résumés IA (2026-07-25). Additif, table nouvelle.
CREATE TABLE "DocumentAiSummary" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'mistral',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentAiSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentAiSummary_documentId_key" ON "DocumentAiSummary"("documentId");
CREATE INDEX "DocumentAiSummary_documentId_idx" ON "DocumentAiSummary"("documentId");
