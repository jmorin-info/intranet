-- Migration : POL_015 / PRO_040 / REG_016 alignment
-- Date : 2026-06-13
-- Auteur : Alignement GED intranet sur Politique de classification POL_015,
--          Procédure d'informations documentées PRO_040 (pyramide §7.1) et
--          Registre Documentaire SMSI REG_016 (colonnes B, C, D, H, I, N, Q).
--
-- *** STRICTEMENT ADDITIVE *** — aucune colonne renommée ni supprimée, aucun
-- DEFAULT modifié sur un champ existant. Reversible.
--
-- Pre-requis : pgvector deja installe (RAG embeddings, migration anterieure).

-- ─── 1. Etendre DocumentCategory (additif, non-bloquant) ─────────────────────
-- ALTER TYPE ... ADD VALUE doit etre execute en dehors d'une transaction ;
-- on les liste ici, prisma migrate deploy les applique correctement.

ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'ORGANIZATION';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'INSTRUCTION';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'STANDARD';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'REGISTRY';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'CHARTER';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'COMMUNICATION';

-- ─── 2. Nouveaux enums (PRO_040 §7.1 pyramide + REG_016 priorite) ───────────

DO $$ BEGIN
  CREATE TYPE "DocumentLevel" AS ENUM ('GOVERNANCE', 'OPERATIONAL', 'EVIDENCE', 'COMMUNICATION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ─── 3. Nouvelles colonnes Document — alignement REG_016 / PRO_040 ──────────
-- Toutes nullable (ou DEFAULT non-bloquant) : pas de rewrite massif.

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "parentReference"        TEXT,
  ADD COLUMN IF NOT EXISTS "documentLevel"          "DocumentLevel",
  ADD COLUMN IF NOT EXISTS "priority"               "DocumentPriority",
  ADD COLUMN IF NOT EXISTS "blocking"               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewPeriodicity"      TEXT;

-- ─── 4. Synchronisation GED externe (SharePoint / OneDrive / Graph) ────────
-- Tous nullable, feature-flagged cote backend (GED_SHAREPOINT_SYNC_ENABLED).

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "externalStorageProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "externalStorageUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "externalStorageItemId"   TEXT,
  ADD COLUMN IF NOT EXISTS "externalStoragePath"     TEXT,
  ADD COLUMN IF NOT EXISTS "externalLastSyncAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "externalEtag"            TEXT;

-- ─── 5. Index utiles ───────────────────────────────────────────────────────

-- Recherche des enfants d'un document parent (POL_015 -> POL_015_POL_013).
CREATE INDEX IF NOT EXISTS "Document_parentReference_idx"
  ON "Document" ("parentReference");

-- Filtre tableau de bord par niveau pyramide (PRO_040 §7.1).
CREATE INDEX IF NOT EXISTS "Document_documentLevel_idx"
  ON "Document" ("documentLevel");

-- Recherche par identifiant externe lors d'un pull SharePoint
-- (WHERE externalStorageItemId = ? — index unique par-provider).
CREATE UNIQUE INDEX IF NOT EXISTS "Document_external_unique_idx"
  ON "Document" ("externalStorageProvider", "externalStorageItemId")
  WHERE "externalStorageItemId" IS NOT NULL;
