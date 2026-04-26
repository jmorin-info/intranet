-- Migration: GED Permissions granulaires + Shares public token-based (ISO 27001 A.5.15 + A.5.14)
-- ----------------------------------------------------------------------------
-- Ajoute deux tables :
--   * DocumentPermission  — accord cumulatif (READ/COMMENT/EDIT/ADMIN) à UNE
--                            cible parmi {user, department, role}. Un check
--                            constraint XOR garantit qu'une et une seule cible
--                            est non-null. Un index partiel sur expiresAt
--                            permet la purge des permissions périmées.
--   * DocumentShare       — lien de partage public avec token URL-safe (256
--                            bits), expiration, mot de passe (bcrypt) et
--                            quota de téléchargements. `failedAttempts`
--                            permet d'invalider après 5 mauvais mdp.
--
-- Compatibilité : aucune colonne supprimée. Les documents sans permission
-- explicite continuent de fonctionner via classification + isPublic + owner.
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) pour pouvoir être réappliquée
-- sans casse en cas de rollback partiel.

CREATE TABLE IF NOT EXISTS "DocumentPermission" (
  "id"           TEXT PRIMARY KEY,
  "documentId"   TEXT NOT NULL,
  "userId"       TEXT,
  "departmentId" TEXT,
  "role"         TEXT,
  "level"        TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3),
  "grantedById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentPermission_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentPermission_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentPermission_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "User"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE
);

-- Check constraint XOR : exactement une cible non-null parmi (userId, departmentId, role).
-- Implémenté en comptant les NOT NULL = 1.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DocumentPermission_target_xor'
  ) THEN
    ALTER TABLE "DocumentPermission"
      ADD CONSTRAINT "DocumentPermission_target_xor" CHECK (
        ((CASE WHEN "userId" IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN "departmentId" IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN "role" IS NOT NULL THEN 1 ELSE 0 END)) = 1
      );
  END IF;
END $$;

-- Check constraint level : valeurs autorisées
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DocumentPermission_level_check'
  ) THEN
    ALTER TABLE "DocumentPermission"
      ADD CONSTRAINT "DocumentPermission_level_check" CHECK (
        "level" IN ('READ', 'COMMENT', 'EDIT', 'ADMIN')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DocumentPermission_documentId_idx"
  ON "DocumentPermission" ("documentId");
CREATE INDEX IF NOT EXISTS "DocumentPermission_userId_idx"
  ON "DocumentPermission" ("userId");
CREATE INDEX IF NOT EXISTS "DocumentPermission_departmentId_idx"
  ON "DocumentPermission" ("departmentId");
CREATE INDEX IF NOT EXISTS "DocumentPermission_expiresAt_idx"
  ON "DocumentPermission" ("expiresAt");
CREATE INDEX IF NOT EXISTS "DocumentPermission_documentId_level_idx"
  ON "DocumentPermission" ("documentId", "level");

CREATE TABLE IF NOT EXISTS "DocumentShare" (
  "id"             TEXT PRIMARY KEY,
  "documentId"     TEXT NOT NULL,
  "token"          TEXT NOT NULL,
  "passwordHash"   TEXT,
  "expiresAt"      TIMESTAMP(3),
  "maxDownloads"   INTEGER,
  "downloadCount"  INTEGER NOT NULL DEFAULT 0,
  "requiresAuth"   BOOLEAN NOT NULL DEFAULT FALSE,
  "createdById"    TEXT NOT NULL,
  "revokedAt"      TIMESTAMP(3),
  "lastAccessedAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentShare_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentShare_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentShare_token_key"
  ON "DocumentShare" ("token");
CREATE INDEX IF NOT EXISTS "DocumentShare_documentId_idx"
  ON "DocumentShare" ("documentId");
CREATE INDEX IF NOT EXISTS "DocumentShare_token_idx"
  ON "DocumentShare" ("token");
CREATE INDEX IF NOT EXISTS "DocumentShare_expiresAt_idx"
  ON "DocumentShare" ("expiresAt");
CREATE INDEX IF NOT EXISTS "DocumentShare_createdById_idx"
  ON "DocumentShare" ("createdById");
