-- Migration : anonymisation automatique des audit logs (RGPD)
-- ----------------------------------------------------------------------
-- Contexte : Item 29 — Wave B post-launch. Le RGPD article 5(c) impose la
-- minimisation des données et l'article 17 le droit à l'effacement.
-- Pour les audit logs (table `AuditLog`), on conserve l'historique
-- d'occurrence (preuve ISO 27001 A.5.36) mais on remplace périodiquement
-- les champs PII (userId, ipAddress, userAgent, metadata) par des valeurs
-- anonymisées au-delà de la fenêtre de rétention "fullDays" (default 90j).
-- Au-delà de la fenêtre "anonymizedDays" (default 730j = 2 ans), la ligne
-- est purgée définitivement.
--
-- Cette migration ajoute :
--   1. Une colonne `anonymizedAt` (DateTime nullable) sur `AuditLog`
--      Source de vérité du statut d'anonymisation.
--      NULL = ligne brute, non-NULL = ligne PII-stripped.
--   2. Un index composite `(anonymizedAt, createdAt)` pour permettre au
--      cron de sélectionner efficacement les lignes à anonymiser
--      (`anonymizedAt IS NULL AND createdAt < cutoff`) puis les lignes
--      à purger (`anonymizedAt < cutoffPurge`).
--
-- Idempotente : utilise IF NOT EXISTS sur la colonne et l'index.

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AuditLog_anonymizedAt_createdAt_idx"
  ON "AuditLog" ("anonymizedAt", "createdAt");
