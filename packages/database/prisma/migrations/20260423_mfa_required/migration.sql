-- Ajoute un flag "mfaRequired" sur User. Utilisé par la politique MFA admin
-- pour imposer l'activation MFA à des utilisateurs cibles (ISO 27001 A.8.5).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaRequired" BOOLEAN NOT NULL DEFAULT false;
