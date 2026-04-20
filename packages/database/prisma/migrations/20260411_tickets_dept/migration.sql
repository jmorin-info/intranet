-- Tickets per department + SpaceAccessConfig (module scoping)
-- Idempotent ALTERs: safe to re-run in dev environments.

-- 1) Ticket: add departmentId column + FK + index
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

DO $$ BEGIN
    ALTER TABLE "Ticket"
      ADD CONSTRAINT "Ticket_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_foreign_key THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "Ticket_departmentId_idx" ON "Ticket"("departmentId");

-- 2) SpaceAccessConfig — module access rules by scope
CREATE TABLE IF NOT EXISTS "SpaceAccessConfig" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeValue" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceAccessConfig_pkey" PRIMARY KEY ("id")
);

-- Unique triplet (module, scopeType, scopeValue) — allows NULL scopeValue for GLOBAL
CREATE UNIQUE INDEX IF NOT EXISTS "SpaceAccessConfig_module_scopeType_scopeValue_key"
  ON "SpaceAccessConfig"("module", "scopeType", "scopeValue");

CREATE INDEX IF NOT EXISTS "SpaceAccessConfig_module_idx" ON "SpaceAccessConfig"("module");
