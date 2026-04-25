-- P1.10 — Dates métier sur Ticket + synchro calendrier individuel + abonnement iCal

-- 1. Ticket : dates métier (toutes nullables, pas de backfill)
ALTER TABLE "Ticket"
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "clientShipmentDate" TIMESTAMP(3),
  ADD COLUMN "materialReceivedDate" TIMESTAMP(3),
  ADD COLUMN "deployedAt" TIMESTAMP(3),
  ADD COLUMN "deploymentScheduledFor" TIMESTAMP(3);

-- 2. CalendarEvent : champs de synchro (userId / sourceType / sourceId)
ALTER TABLE "CalendarEvent"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT;

-- FK vers User (SET NULL si user supprimé : on garde l'event partagé)
ALTER TABLE "CalendarEvent"
  ADD CONSTRAINT "CalendarEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CalendarEvent_userId_startDate_idx" ON "CalendarEvent"("userId", "startDate");
CREATE INDEX "CalendarEvent_sourceType_sourceId_idx" ON "CalendarEvent"("sourceType", "sourceId");

-- 3. CalendarSubscriptionToken : abonnement iCal (Outlook / Google)
CREATE TABLE "CalendarSubscriptionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSubscriptionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarSubscriptionToken_token_key" ON "CalendarSubscriptionToken"("token");
CREATE INDEX "CalendarSubscriptionToken_userId_idx" ON "CalendarSubscriptionToken"("userId");
CREATE INDEX "CalendarSubscriptionToken_expiresAt_idx" ON "CalendarSubscriptionToken"("expiresAt");

ALTER TABLE "CalendarSubscriptionToken"
  ADD CONSTRAINT "CalendarSubscriptionToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
