-- Migration : ajout de la colonne `digestFrequency` (enum) sur User
-- ----------------------------------------------------------------------
-- Contexte : Vague A v1.1 — digest de notifications. La fréquence de
-- réception du digest email était auparavant stockée uniquement dans la
-- colonne JSON `notificationPreferences.email.digest` (valeurs libres
-- 'off'|'daily'|'weekly'), ce qui empêche les requêtes SQL efficaces et
-- les contraintes d'intégrité.
--
-- Cette migration ajoute :
--   1. Un enum Postgres typé `DigestFrequency` (NONE / DAILY / WEEKLY)
--   2. Une colonne `digestFrequency` sur User, NOT NULL, DEFAULT 'DAILY'
--      (rétrocompat : nouveaux users → daily, comme les défauts JSON)
--   3. Backfill depuis l'ancien JSON pour les users existants ayant une
--      préférence explicite ('off' → NONE, 'weekly' → WEEKLY, sinon DAILY)
--
-- Source de vérité : la colonne typée `digestFrequency` devient la source
-- canonique. Le JSON `notificationPreferences.email.digest` est conservé
-- pour rétrocompat applicative et resté synchronisé par le service.
--
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DigestFrequency') THEN
    CREATE TYPE "DigestFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'DAILY';

-- Backfill depuis l'ancien JSON `notificationPreferences.email.digest`.
-- Limité aux users dont la valeur a explicitement été modifiée (sinon le
-- DEFAULT 'DAILY' est correct).
UPDATE "User"
SET "digestFrequency" = CASE
  WHEN "notificationPreferences"::jsonb #>> '{email,digest}' = 'off'    THEN 'NONE'::"DigestFrequency"
  WHEN "notificationPreferences"::jsonb #>> '{email,digest}' = 'weekly' THEN 'WEEKLY'::"DigestFrequency"
  ELSE 'DAILY'::"DigestFrequency"
END
WHERE "notificationPreferences" IS NOT NULL
  AND "notificationPreferences"::jsonb #>> '{email,digest}' IS NOT NULL;

-- Index utile pour le cron qui scanne uniquement les users non-NONE.
CREATE INDEX IF NOT EXISTS "User_digestFrequency_idx" ON "User"("digestFrequency");
