-- Document inline editor: store HTML content directly for native (non-uploaded) documents
-- ISO 27001 A.5.1 — full control of policy/procedure drafting without external tools
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "content" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "isNative" BOOLEAN NOT NULL DEFAULT false;
