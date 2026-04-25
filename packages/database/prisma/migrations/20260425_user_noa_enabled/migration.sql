-- Mode humour "Noa" (persona stagiaire IA sarcastique) — opt-in par utilisateur.
-- Quand actif (combine avec le feature flag global feature.humor.noa), Noa
-- réécrit certains messages d'UI (erreurs Zod, loaders, toasts succès) avec
-- second-degré bureau. Exclusions dures côté frontend : /auth/*, /mfa/*,
-- /profile/security, /admin/audit-logs, /admin/incidents, /trust, /legal/*,
-- emails sortants, logs Sentry, rapports ISO.
-- Migration idempotente.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "noaEnabled" BOOLEAN NOT NULL DEFAULT false;
