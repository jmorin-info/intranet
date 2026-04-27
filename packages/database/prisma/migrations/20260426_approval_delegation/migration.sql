-- Migration: ApprovalDelegation (manuelle + automatique) + ApprovalAuditLog
-- ----------------------------------------------------------------------------
-- Item #27 — Multi-level approvers + delegation (ISO 27001 A.5.1).
--
-- Migration purement additive : crée 2 tables et 1 enum, sans toucher aux
-- modèles existants. Compat 100% rétro avec les workflows en cours.
--
-- 1. Enum `ApprovalDelegationScope` (GLOBAL / SCOPED).
-- 2. Table `ApprovalDelegation` — délégations manuelles et auto.
-- 3. Table `ApprovalAuditLog` — trace immuable des actions sur approbations.

-- ────────────────────────────────────────────────────────────
-- 1. ApprovalDelegationScope enum
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ApprovalDelegationScope" AS ENUM ('GLOBAL', 'SCOPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. ApprovalDelegation
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ApprovalDelegation" (
  "id"          TEXT PRIMARY KEY,
  "fromUserId"  TEXT NOT NULL,
  "toUserId"    TEXT NOT NULL,
  "startDate"   TIMESTAMP(3) NOT NULL,
  "endDate"     TIMESTAMP(3) NOT NULL,
  "reason"      TEXT,
  "scope"       "ApprovalDelegationScope" NOT NULL DEFAULT 'GLOBAL',
  "categories"  "DocumentCategory"[] NOT NULL DEFAULT '{}',
  "auto"        BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "revokedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalDelegation_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ApprovalDelegation_toUserId_fkey"
    FOREIGN KEY ("toUserId")   REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ApprovalDelegation_fromUserId_isActive_dates_idx"
  ON "ApprovalDelegation" ("fromUserId", "isActive", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "ApprovalDelegation_toUserId_isActive_idx"
  ON "ApprovalDelegation" ("toUserId", "isActive");

CREATE INDEX IF NOT EXISTS "ApprovalDelegation_endDate_idx"
  ON "ApprovalDelegation" ("endDate");

-- ────────────────────────────────────────────────────────────
-- 3. ApprovalAuditLog
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ApprovalAuditLog" (
  "id"                 TEXT PRIMARY KEY,
  "actorId"            TEXT,
  "action"             TEXT NOT NULL,
  "delegationId"       TEXT,
  "approvalInstanceId" TEXT,
  "stepInstanceId"     TEXT,
  "metadata"           JSONB,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "ApprovalAuditLog_action_createdAt_idx"
  ON "ApprovalAuditLog" ("action", "createdAt");

CREATE INDEX IF NOT EXISTS "ApprovalAuditLog_delegationId_idx"
  ON "ApprovalAuditLog" ("delegationId");

CREATE INDEX IF NOT EXISTS "ApprovalAuditLog_approvalInstanceId_idx"
  ON "ApprovalAuditLog" ("approvalInstanceId");

CREATE INDEX IF NOT EXISTS "ApprovalAuditLog_stepInstanceId_idx"
  ON "ApprovalAuditLog" ("stepInstanceId");
