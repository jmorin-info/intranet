-- Preservation des preuves d'audit (ISO 27001 A.5.28 et A.5.33)
-- Les acknowledgments et audit logs doivent rester consultables 3 ans minimum
-- même si l'utilisateur est supprimé de la base.

-- 1) DocumentAcknowledgment : rendre userId optionnel + snapshot identité
ALTER TABLE "DocumentAcknowledgment"
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "DocumentAcknowledgment"
  ADD COLUMN IF NOT EXISTS "userEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "userFirstName" TEXT,
  ADD COLUMN IF NOT EXISTS "userLastName" TEXT,
  ADD COLUMN IF NOT EXISTS "userRole" TEXT;

-- 2) Drop et recrée la FK avec ON DELETE SET NULL (idempotent)
DO $$
BEGIN
  ALTER TABLE "DocumentAcknowledgment"
    DROP CONSTRAINT IF EXISTS "DocumentAcknowledgment_userId_fkey";

  ALTER TABLE "DocumentAcknowledgment"
    ADD CONSTRAINT "DocumentAcknowledgment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'DocumentAcknowledgment FK recreation: %', SQLERRM;
END $$;

-- 3) AuditLog : la relation user est déjà en SetNull dans le schema Prisma.
-- On vérifie que la FK a bien ON DELETE SET NULL (au cas où)
DO $$
BEGIN
  ALTER TABLE "AuditLog"
    DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";

  ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'AuditLog FK recreation: %', SQLERRM;
END $$;
