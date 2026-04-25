-- Traçabilité de la politique MFA per-user (ISO 27001 A.5.36) :
-- enregistrer qui a imposé la politique mfaRequired et quand. Utilisé par
-- l'audit RSSI pour démontrer la mise en conformité.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mfaEnforcedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaEnforcedById" TEXT;

-- Persistance du timestamp de validation MFA sur les sessions actives
-- (RefreshToken) — nécessaire pour que `FreshMfaGuard` ne réclame pas une
-- re-validation à chaque rotation d'access token (toutes les 15 min).
ALTER TABLE "RefreshToken"
  ADD COLUMN IF NOT EXISTS "mfaValidatedAt" TIMESTAMP(3);
