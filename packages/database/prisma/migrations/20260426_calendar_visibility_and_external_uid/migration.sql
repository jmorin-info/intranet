-- =============================================================================
-- Calendar multi-team + iCal subscription enhancements (2026-04-26)
-- =============================================================================
-- 1. CalendarEvent.visibility : portée multi-équipe
--    Valeurs : PRIVATE | TEAM | INTERNAL (default) | PUBLIC
--    Default 'INTERNAL' rétro-compatible (events existants visibles par tous
--    les utilisateurs authentifiés, ce qui était le comportement implicite).
-- 2. CalendarEvent.externalUid : idempotence import iCal (UID RFC 5545)
--    Unique pour empêcher les doublons lors d'un import/sync iCal.
-- 3. CalendarSubscriptionToken.lastUsedAt : audit tokens dormants
-- 4. Index CalendarEvent (visibility, startDate) pour queries du calendrier
--    filtré par portée.

-- 1. Visibility column
ALTER TABLE "CalendarEvent"
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'INTERNAL';

-- 2. External UID column (nullable, unique when present)
ALTER TABLE "CalendarEvent"
  ADD COLUMN IF NOT EXISTS "externalUid" TEXT;

-- Unique index on externalUid (only enforces uniqueness on non-NULL values
-- in PostgreSQL — NULL values are not considered equal).
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEvent_externalUid_key"
  ON "CalendarEvent"("externalUid");

-- 3. Last-used timestamp on subscription tokens
ALTER TABLE "CalendarSubscriptionToken"
  ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

-- 4. Index for visibility queries (calendar.findAll filters)
CREATE INDEX IF NOT EXISTS "CalendarEvent_visibility_startDate_idx"
  ON "CalendarEvent"("visibility", "startDate");
