-- =============================================================================
-- Wave D — Item 28 : UEBA BehaviorAlert
-- =============================================================================
-- Alertes comportementales émises par BehaviorDetectionService (cron 5 min,
-- fenêtre glissante 1h). Chaque alerte référence une rule code (R001..R008)
-- et embarque ses preuves (auditLogIds, IPs, timestamps) en JSON pour rester
-- consultable même après l'anonymisation RGPD des AuditLog liés.
--
-- Workflow triage RSSI : NEW → ACKNOWLEDGED → RESOLVED | FALSE_POSITIVE.
-- Voir docs/security/UEBA_BEHAVIOR_DETECTION.md.
--
-- Idempotente — l'enum BehaviorAlertSeverity est créé par
-- 20260428_behavior_rule/migration.sql, on duplique l'ENUM ici (idempotent).

DO $$ BEGIN
  CREATE TYPE "BehaviorAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BehaviorAlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BehaviorAlert" (
  "id"               TEXT PRIMARY KEY,
  "userId"           TEXT,
  "ruleCode"         TEXT NOT NULL,
  "severity"         "BehaviorAlertSeverity" NOT NULL,
  "score"            DOUBLE PRECISION NOT NULL,
  "title"            TEXT NOT NULL,
  "description"      TEXT NOT NULL,
  "evidence"         JSONB NOT NULL,
  "status"           "BehaviorAlertStatus" NOT NULL DEFAULT 'NEW',
  "acknowledgedById" TEXT,
  "acknowledgedAt"   TIMESTAMP(3),
  "resolvedById"     TEXT,
  "resolvedAt"       TIMESTAMP(3),
  "resolutionNote"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BehaviorAlert_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BehaviorAlert_acknowledgedById_fkey"
    FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BehaviorAlert_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Index principal pour la liste filtrée du dashboard RSSI (status, severity).
CREATE INDEX IF NOT EXISTS "BehaviorAlert_status_severity_createdAt_idx"
  ON "BehaviorAlert"("status", "severity", "createdAt" DESC);
-- Index per-user (drill-down depuis la page user, ou détection des récidivistes).
CREATE INDEX IF NOT EXISTS "BehaviorAlert_userId_createdAt_idx"
  ON "BehaviorAlert"("userId", "createdAt" DESC);
-- Index per-rule (analyse par règle : laquelle génère le plus de bruit).
CREATE INDEX IF NOT EXISTS "BehaviorAlert_ruleCode_createdAt_idx"
  ON "BehaviorAlert"("ruleCode", "createdAt" DESC);
-- Index "alertes ouvertes par sévérité" (badge dashboard).
CREATE INDEX IF NOT EXISTS "BehaviorAlert_severity_status_idx"
  ON "BehaviorAlert"("severity", "status");
