-- Migration : Wave D item 26 — Signature evidence eIDAS-conforme (AES)
-- ----------------------------------------------------------------------
-- Contexte : la signature DocuSeal actuelle stocke status + signedAt mais
-- pas les preuves nécessaires à la conformité eIDAS niveau AES :
--   - Identité du signataire (email, IP, UA)
--   - Lien temporel (signedAt en UTC + timestamp RFC 3161 optionnel)
--   - Intégrité (hash SHA-256 du PDF signé)
--   - Chaîne de certificats (uniquement QES via PSC qualifié)
--
-- 1:1 avec SignatureRequest, créée à la complétion du webhook DocuSeal.
-- Sert de base pour générer le PDF "Preuve de signature" exporté.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS "SignatureEvidence" (
  "id"                  TEXT PRIMARY KEY,
  "signatureRequestId"  TEXT NOT NULL,
  "signedAt"            TIMESTAMP(3) NOT NULL,
  "signerEmail"         TEXT NOT NULL,
  "signerIpAddress"     TEXT,
  "signerUserAgent"     TEXT,
  "documentHashSha256"  TEXT NOT NULL,
  "certificateChain"    TEXT,
  "tsa"                 TEXT,
  "evidence"            JSONB NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SignatureEvidence_signatureRequestId_fkey"
    FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SignatureEvidence_signatureRequestId_key" ON "SignatureEvidence"("signatureRequestId");
CREATE INDEX IF NOT EXISTS "SignatureEvidence_signedAt_idx" ON "SignatureEvidence"("signedAt");
