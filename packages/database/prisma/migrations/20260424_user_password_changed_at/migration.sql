-- Suivi de la rotation des mots de passe (ISO 27001 A.5.17 / A.5.18) :
-- Ajout d'une colonne `passwordChangedAt` sur User pour permettre aux campagnes
-- AccessReview de type PASSWORDS de cibler les mots de passe non renouveles
-- depuis plus de N mois (au lieu du fallback createdAt).
-- Migration idempotente : la colonne et le backfill sont safe a re-jouer.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP;

-- Initialise au createdAt pour les users existants (proxy raisonnable :
-- on suppose que le mot de passe initial date de la creation du compte).
UPDATE "User"
   SET "passwordChangedAt" = "createdAt"
 WHERE "passwordChangedAt" IS NULL;
