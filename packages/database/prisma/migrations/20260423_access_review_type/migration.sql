-- Elargissement du module "Revue des acces" (ISO 27001 A.5.18) :
-- Ajout d'un champ `type` sur AccessReviewCampaign pour distinguer :
--  - ACCESS_RIGHTS  : revue des droits utilisateurs (historique, defaut)
--  - PASSWORDS      : revue des mots de passe (rotation / MFA absent)
--  - INACTIVE_USERS : revue des comptes inactifs (>= 90 jours sans connexion)
-- Migration idempotente : enum et colonne crees uniquement s'ils n'existent pas.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccessReviewCampaignType') THEN
    CREATE TYPE "AccessReviewCampaignType" AS ENUM ('ACCESS_RIGHTS', 'PASSWORDS', 'INACTIVE_USERS');
  END IF;
END$$;

ALTER TABLE "AccessReviewCampaign"
  ADD COLUMN IF NOT EXISTS "type" "AccessReviewCampaignType" NOT NULL DEFAULT 'ACCESS_RIGHTS';

CREATE INDEX IF NOT EXISTS "AccessReviewCampaign_type_idx" ON "AccessReviewCampaign"("type");
