-- Migration: Workflow N+1 dynamic rules engine (ISO 27001 A.5.1)
-- ----------------------------------------------------------------------------
-- Ajoute deux tables :
--   * WorkflowRule          — règle de routage dynamique (priorité + condition
--                             JSONB matchée à la création d'un document, et
--                             steps JSONB décrivant les paliers d'approbation
--                             à instancier).
--   * WorkflowRuleAuditLog  — trace immuable des mutations sur les règles
--                             (création, mise à jour, suppression, dry-run).
--
-- Enrichit aussi ApprovalStepInstance avec :
--   * level             — palier hiérarchique (N+1, N+2, …) ;
--   * parallelGroupId   — identifiant de groupe pour les paliers parallèles ;
--   * deadlineAt        — deadline absolue calculée à partir des
--                         deadlineHours fournies dans la règle.
--
-- Migration purement additive — aucune colonne supprimée, tout est nullable
-- avec des valeurs par défaut sûres pour ne pas casser les instances en cours.

CREATE TABLE IF NOT EXISTS "WorkflowRule" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "condition" JSONB NOT NULL,
  "steps" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WorkflowRule_priority_isActive_idx"
  ON "WorkflowRule" ("priority", "isActive");

CREATE TABLE IF NOT EXISTS "WorkflowRuleAuditLog" (
  "id" TEXT PRIMARY KEY,
  "ruleId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WorkflowRuleAuditLog_ruleId_createdAt_idx"
  ON "WorkflowRuleAuditLog" ("ruleId", "createdAt");

-- Enrichissements ApprovalStepInstance — additif & idempotent.
ALTER TABLE "ApprovalStepInstance"
  ADD COLUMN IF NOT EXISTS "level" INTEGER DEFAULT 1;

ALTER TABLE "ApprovalStepInstance"
  ADD COLUMN IF NOT EXISTS "parallelGroupId" TEXT;

ALTER TABLE "ApprovalStepInstance"
  ADD COLUMN IF NOT EXISTS "deadlineAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ApprovalStepInstance_level_idx"
  ON "ApprovalStepInstance" ("level");

CREATE INDEX IF NOT EXISTS "ApprovalStepInstance_parallelGroupId_idx"
  ON "ApprovalStepInstance" ("parallelGroupId");

CREATE INDEX IF NOT EXISTS "ApprovalStepInstance_deadlineAt_idx"
  ON "ApprovalStepInstance" ("deadlineAt");
