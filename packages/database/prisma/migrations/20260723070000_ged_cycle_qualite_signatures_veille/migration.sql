-- Migration consolidée 2026-07-23 — 100 % additive (aucune suppression, aucun
-- changement de colonne existante). Sûre à appliquer sur une base en service.
--
--  1. Veille cyber : types de notification dédiés (opt-out ciblé, affichage correct)
--  2. Cycle qualité GED : vérificateur distinct du relecteur + décideur réel tracé
--  3. Chartes : validation direction tracée (qui/quand/quelle version) + snapshot identité
--  4. Signatures : rattachement des demandes individuelles à une campagne

-- 1. Types de notification veille
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VEILLE_CRITICAL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VEILLE_BULLETIN';

-- 2a. Étape VERIFICATION du cycle qualité
ALTER TYPE "ValidationStepType" ADD VALUE IF NOT EXISTS 'VERIFICATION';

-- 2b. Document.verifierId (vérificateur)
ALTER TABLE "Document" ADD COLUMN "verifierId" TEXT;
ALTER TABLE "Document" ADD CONSTRAINT "Document_verifierId_fkey"
  FOREIGN KEY ("verifierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Document_verifierId_idx" ON "Document"("verifierId");

-- 2c. ValidationStep.decidedById (décideur réel, peut différer de l'assigné)
ALTER TABLE "ValidationStep" ADD COLUMN "decidedById" TEXT;
ALTER TABLE "ValidationStep" ADD CONSTRAINT "ValidationStep_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3a. Charte : validation direction tracée
ALTER TABLE "Charte" ADD COLUMN "directionValidatedById" TEXT;
ALTER TABLE "Charte" ADD COLUMN "directionValidatedAt" TIMESTAMP(3);
ALTER TABLE "Charte" ADD COLUMN "directionValidatedVersionId" TEXT;
ALTER TABLE "Charte" ADD CONSTRAINT "Charte_directionValidatedById_fkey"
  FOREIGN KEY ("directionValidatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3b. CharteSignature : snapshot identité (preuve post-suppression, A.5.28)
ALTER TABLE "CharteSignature" ADD COLUMN "userEmail" TEXT;
ALTER TABLE "CharteSignature" ADD COLUMN "userFirstName" TEXT;
ALTER TABLE "CharteSignature" ADD COLUMN "userLastName" TEXT;
ALTER TABLE "CharteSignature" ADD COLUMN "userRole" TEXT;

-- 4. SignatureRequest.campaignId
ALTER TABLE "SignatureRequest" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "SignatureCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SignatureRequest_campaignId_idx" ON "SignatureRequest"("campaignId");
