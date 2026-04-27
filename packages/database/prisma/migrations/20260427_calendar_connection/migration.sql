-- Migration : Wave B item 33 — connexions OAuth Google / Outlook (sync bidir)
-- ----------------------------------------------------------------------
-- Contexte : Synchronisation bidirectionnelle des évènements de calendrier
-- entre l'intranet et un compte Google ou Microsoft 365 du user.
--
-- Stocke les tokens OAuth chiffrés au repos (AES-256-GCM, voir CryptoService).
-- Un user a au plus une connexion par provider (unique sur (userId, provider)).
--
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CalendarProvider') THEN
    CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'OUTLOOK');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CalendarConnection" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL,
  "provider"        "CalendarProvider" NOT NULL,
  "accessTokenEnc"  TEXT NOT NULL,
  "refreshTokenEnc" TEXT,
  "expiresAt"       TIMESTAMP(3),
  "calendarId"      TEXT,
  "syncToken"       TEXT,
  "deltaLink"       TEXT,
  "syncEnabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  "lastSyncAt"      TIMESTAMP(3),
  "syncErrorCount"  INTEGER NOT NULL DEFAULT 0,
  "lastErrorMsg"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CalendarConnection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CalendarConnection_userId_provider_key"
  ON "CalendarConnection"("userId", "provider");
CREATE INDEX IF NOT EXISTS "CalendarConnection_userId_idx" ON "CalendarConnection"("userId");
CREATE INDEX IF NOT EXISTS "CalendarConnection_provider_syncEnabled_idx"
  ON "CalendarConnection"("provider", "syncEnabled");
