-- Migration : Wave B item 16 — WebDAV tokens pour sync bidir Obsidian
-- ----------------------------------------------------------------------
-- Contexte : Obsidian + plugin "Remotely Save" sync les vaults via WebDAV
-- avec Basic Auth (pas de JWT). Cette table stocke un token long-lived
-- HMAC-signed (en clair sha256-hashé en DB) qui sert de mot de passe Basic.
-- Username = email du user, password = token. Révocable + expirable.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS "WebDAVToken" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "label"      TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebDAVToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebDAVToken_tokenHash_key" ON "WebDAVToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "WebDAVToken_userId_idx" ON "WebDAVToken"("userId");
CREATE INDEX IF NOT EXISTS "WebDAVToken_expiresAt_idx" ON "WebDAVToken"("expiresAt");
