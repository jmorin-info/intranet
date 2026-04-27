-- Migration: Visual workflow editor (DAG) — moteur d'exécution
-- ----------------------------------------------------------------------------
-- Item #24 — éditeur visuel des règles N+1.
--
-- Migration purement additive — toutes les colonnes nouvelles sont nullables
-- ou ont un default sûr ; les workflows existants restent valides (le moteur
-- retombe sur l'ordre `order` quand `nextStepIds` est vide).
--
-- 1. Enum `WorkflowStepType` — type du noeud dans le graphe.
-- 2. Enrichit `WorkflowStep` avec : type, positionX/Y, condition JSONB,
--    nextStepIds (string[]), minApprovers.

-- ────────────────────────────────────────────────────────────
-- 1. Enum WorkflowStepType
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "WorkflowStepType" AS ENUM (
    'START',
    'APPROVAL',
    'BRANCH',
    'PARALLEL_ALL',
    'PARALLEL_ANY',
    'DELEGATE',
    'END'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. WorkflowStep — colonnes additives
-- ────────────────────────────────────────────────────────────
ALTER TABLE "WorkflowStep"
  ADD COLUMN IF NOT EXISTS "type" "WorkflowStepType" NOT NULL DEFAULT 'APPROVAL';

ALTER TABLE "WorkflowStep"
  ADD COLUMN IF NOT EXISTS "positionX" INTEGER;

ALTER TABLE "WorkflowStep"
  ADD COLUMN IF NOT EXISTS "positionY" INTEGER;

ALTER TABLE "WorkflowStep"
  ADD COLUMN IF NOT EXISTS "condition" JSONB;

ALTER TABLE "WorkflowStep"
  ADD COLUMN IF NOT EXISTS "nextStepIds" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "WorkflowStep"
  ADD COLUMN IF NOT EXISTS "minApprovers" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "WorkflowStep_type_idx" ON "WorkflowStep" ("type");
