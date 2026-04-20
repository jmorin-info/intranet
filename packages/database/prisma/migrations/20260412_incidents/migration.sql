-- Incidents & Remediations (ISO 27001 A.5.24 / A.5.25 / A.5.26 / A.5.27)
-- Information security incident management: reporting, investigation, containment,
-- remediation tracking, post-mortem (lessons learned) and GDPR/CNIL breach notification.

-- CreateEnum: IncidentSeverity
DO $$ BEGIN
    CREATE TYPE "IncidentSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: IncidentStatus
DO $$ BEGIN
    CREATE TYPE "IncidentStatus" AS ENUM (
      'DETECTED',
      'UNDER_INVESTIGATION',
      'CONTAINED',
      'ERADICATED',
      'RECOVERED',
      'CLOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: IncidentCategory
DO $$ BEGIN
    CREATE TYPE "IncidentCategory" AS ENUM (
      'MALWARE',
      'PHISHING',
      'DATA_BREACH',
      'UNAUTHORIZED_ACCESS',
      'DENIAL_OF_SERVICE',
      'PHYSICAL_SECURITY',
      'CONFIGURATION_ERROR',
      'LOST_STOLEN_DEVICE',
      'USER_ERROR',
      'THIRD_PARTY',
      'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: Incident
CREATE TABLE IF NOT EXISTS "Incident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "containedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reporterId" TEXT,
    "assignedToId" TEXT,
    "affectedSystems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affectedUsers" INTEGER NOT NULL DEFAULT 0,
    "impactSummary" TEXT,
    "rootCause" TEXT,
    "lessonsLearned" TEXT,
    "gdprNotifiable" BOOLEAN NOT NULL DEFAULT false,
    "cnilReported" BOOLEAN NOT NULL DEFAULT false,
    "cnilReportedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Incident_reference_key" ON "Incident"("reference");
CREATE INDEX IF NOT EXISTS "Incident_status_severity_idx" ON "Incident"("status", "severity");
CREATE INDEX IF NOT EXISTS "Incident_category_idx" ON "Incident"("category");
CREATE INDEX IF NOT EXISTS "Incident_detectedAt_idx" ON "Incident"("detectedAt");
CREATE INDEX IF NOT EXISTS "Incident_assignedToId_idx" ON "Incident"("assignedToId");

-- CreateTable: Remediation
CREATE TABLE IF NOT EXISTS "Remediation" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "responsibleId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remediation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Remediation_incidentId_status_idx" ON "Remediation"("incidentId", "status");
CREATE INDEX IF NOT EXISTS "Remediation_responsibleId_status_idx" ON "Remediation"("responsibleId", "status");
CREATE INDEX IF NOT EXISTS "Remediation_dueDate_idx" ON "Remediation"("dueDate");

-- CreateTable: IncidentTimelineEntry
CREATE TABLE IF NOT EXISTS "IncidentTimelineEntry" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorId" TEXT,
    "entryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentTimelineEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentTimelineEntry_incidentId_createdAt_idx" ON "IncidentTimelineEntry"("incidentId", "createdAt");

-- Foreign keys
DO $$ BEGIN
    ALTER TABLE "Incident"
      ADD CONSTRAINT "Incident_reporterId_fkey"
      FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Incident"
      ADD CONSTRAINT "Incident_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Remediation"
      ADD CONSTRAINT "Remediation_incidentId_fkey"
      FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Remediation"
      ADD CONSTRAINT "Remediation_responsibleId_fkey"
      FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "IncidentTimelineEntry"
      ADD CONSTRAINT "IncidentTimelineEntry_incidentId_fkey"
      FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "IncidentTimelineEntry"
      ADD CONSTRAINT "IncidentTimelineEntry_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
