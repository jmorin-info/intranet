-- Migration : Wave D item 25 — Templates de documents avec variables dynamiques
-- ----------------------------------------------------------------------
-- Contexte : aujourd'hui chaque document est créé from-scratch. Le module
-- Templates introduit un pré-format Markdown avec variables {{var}} pour
-- standardiser les politiques, procédures, etc. Lien Document.fromTemplateId
-- → DocumentTemplate.id (onDelete SetNull pour conserver l'historique).
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS "DocumentTemplate" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "description"    TEXT,
  "category"       "DocumentCategory" NOT NULL,
  "content"        TEXT NOT NULL,
  "variables"      JSONB NOT NULL,
  "classification" TEXT NOT NULL DEFAULT 'INTERNE',
  "createdById"    TEXT NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DocumentTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTemplate_slug_key" ON "DocumentTemplate"("slug");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_category_deletedAt_idx" ON "DocumentTemplate"("category", "deletedAt");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_slug_idx" ON "DocumentTemplate"("slug");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_createdById_idx" ON "DocumentTemplate"("createdById");

-- Document.fromTemplateId — colonne additive nullable + FK SetNull
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fromTemplateId" TEXT;

-- Note : ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS n'existe pas en
-- Postgres < 16. On utilise un DO block pour rester compatible.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Document_fromTemplateId_fkey'
      AND table_name = 'Document'
  ) THEN
    ALTER TABLE "Document"
      ADD CONSTRAINT "Document_fromTemplateId_fkey"
      FOREIGN KEY ("fromTemplateId") REFERENCES "DocumentTemplate"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Document_fromTemplateId_idx" ON "Document"("fromTemplateId");
