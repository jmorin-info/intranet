-- =============================================================================
-- Wave D — Item 28 : Règles UEBA (BehaviorRule)
-- =============================================================================
-- Persistance des règles de détection R001..R008. Permet au RSSI de toggler
-- enabled / d'ajuster threshold sans redéploiement. Initialement seedées par
-- BehaviorDetectionService.bootstrapRules() au démarrage du module.
--
-- `threshold` JSON : config par règle (ex R001 : { window: 600, minIps: 3,
-- minLogins: 10 }). Voir docs/security/UEBA_BEHAVIOR_DETECTION.md.
--
-- Idempotente.

DO $$ BEGIN
  CREATE TYPE "BehaviorAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BehaviorRule" (
  "id"          TEXT PRIMARY KEY,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity"    "BehaviorAlertSeverity" NOT NULL,
  "threshold"   JSONB NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "BehaviorRule_code_key" ON "BehaviorRule"("code");
CREATE INDEX IF NOT EXISTS "BehaviorRule_enabled_idx" ON "BehaviorRule"("enabled");
