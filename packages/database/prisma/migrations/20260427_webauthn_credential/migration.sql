-- Migration : Wave D item 18 — WebAuthn FIDO2 credentials
-- ----------------------------------------------------------------------
-- Stocke les clés publiques des authentificateurs FIDO2 (YubiKey, Windows
-- Hello, Touch ID, passkeys iCloud/Google). Une clé par device, plusieurs
-- clés par utilisateur recommandées (multi-device + clé de secours).
--
-- ISO 27001 A.8.5 — phishing-resistant authentication. La clé publique
-- (COSE encoded) est stockée en BYTEA, le credentialId en TEXT (base64url
-- côté client). Le counter anti-clonage est incrémenté à chaque auth ; un
-- compteur qui régresse signale un clonage et doit invalider la clé.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS "WebAuthnCredential" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey"    BYTEA NOT NULL,
  "counter"      INTEGER NOT NULL DEFAULT 0,
  "transports"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deviceType"   TEXT,
  "backedUp"     BOOLEAN NOT NULL DEFAULT false,
  "label"        TEXT,
  "lastUsedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebAuthnCredential_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");
CREATE INDEX IF NOT EXISTS "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");
