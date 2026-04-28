-- Migration : F3 — partage de filtres sauvegardés (priorité user #6, 2026-04-28)
-- ---------------------------------------------------------------------------
-- Contexte : aujourd'hui les SavedFilter sont privés (par userId).
-- On ajoute un mécanisme de partage configurable : un filtre peut rester
-- PRIVATE (default, comportement existant), être partagé avec un département
-- (DEPARTMENT + sharedWithDepartmentId), avec un rôle (ROLE + sharedWithRole),
-- ou globalement (PUBLIC).
--
-- Migration ADDITIVE : aucun champ existant n'est modifié. Toutes les lignes
-- existantes prennent la valeur PRIVATE par défaut, donc le comportement
-- pré-migration est strictement préservé.
--
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SavedFilterVisibility') THEN
    CREATE TYPE "SavedFilterVisibility" AS ENUM ('PRIVATE', 'DEPARTMENT', 'ROLE', 'PUBLIC');
  END IF;
END $$;

ALTER TABLE "SavedFilter"
  ADD COLUMN IF NOT EXISTS "visibility" "SavedFilterVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS "sharedWithDepartmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "sharedWithRole" "UserRole",
  ADD COLUMN IF NOT EXISTS "sharedById" TEXT;

CREATE INDEX IF NOT EXISTS "SavedFilter_visibility_module_idx"
  ON "SavedFilter"("visibility", "module");

CREATE INDEX IF NOT EXISTS "SavedFilter_sharedWithDepartmentId_module_idx"
  ON "SavedFilter"("sharedWithDepartmentId", "module");

CREATE INDEX IF NOT EXISTS "SavedFilter_sharedWithRole_module_idx"
  ON "SavedFilter"("sharedWithRole", "module");
