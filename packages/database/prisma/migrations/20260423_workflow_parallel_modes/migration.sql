-- Modes workflow PARALLEL_ALL / PARALLEL_ANY (ISO 27001 A.5.1)
-- -------------------------------------------------------------------
-- Ajoute un champ `assignedToId` sur ApprovalStepInstance permettant de
-- pré-assigner un approbateur spécifique à une step-instance — nécessaire
-- pour les modes parallèles où l'on materialise une ligne par approbateur
-- attendu au lieu d'une seule ligne "rôle" ambiguë.
--
-- Nullable : compatible avec les step-instances SINGLE existantes qui se
-- basent uniquement sur approverRole / approverDeptId du template.
--
-- Idempotent : IF NOT EXISTS sur ADD COLUMN, et garde-fous sur contraintes.

ALTER TABLE "ApprovalStepInstance"
  ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;

-- Index pour getPendingForUser (recherche rapide par assignedToId)
CREATE INDEX IF NOT EXISTS "ApprovalStepInstance_assignedToId_idx"
  ON "ApprovalStepInstance" ("assignedToId");

-- FK vers User (SET NULL si l'utilisateur est supprimé : la step garde sa
-- trace mais perd son assignation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ApprovalStepInstance_assignedToId_fkey'
  ) THEN
    ALTER TABLE "ApprovalStepInstance"
      ADD CONSTRAINT "ApprovalStepInstance_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
