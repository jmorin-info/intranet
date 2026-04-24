-- Tour guide de premiere connexion + widget "Demarrage rapide" (onboarding v2).
-- Ajoute deux colonnes nullables sur User :
--   * onboardingCompletedAt      — timestamp de fin du tour guide modal.
--   * welcomeChecklistDismissedAt — timestamp de dismissal explicite de la
--                                    checklist "Demarrage rapide" du dashboard.
-- Migration idempotente (IF NOT EXISTS) : safe a rejouer. Pas de backfill
-- necessaire, les NULL represention fidelement "tour jamais vu" / "checklist
-- non masquee" pour les comptes existants — ils verront donc le tour a leur
-- prochaine connexion SI leur compte a < 7 jours, sinon le front n'affiche rien.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "welcomeChecklistDismissedAt" TIMESTAMP;
