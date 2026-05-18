-- Exemption nominative d'une charte mandatory pour un utilisateur.
-- Ajoutée pour permettre à un ADMIN de retirer l'obligation de signature
-- à une personne sans toucher au statut "mandatory" de la charte ni aux
-- autres signataires. Trace complète exigée par ISO 27001 (audit).

CREATE TABLE "CharteExemption" (
    "id" TEXT NOT NULL,
    "charteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "exemptedById" TEXT NOT NULL,
    "exemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "CharteExemption_pkey" PRIMARY KEY ("id")
);

-- Une seule exemption active par (charte, user) — la contrainte d'unicité
-- inclut `revokedAt` (NULL si encore active) pour autoriser l'historique
-- d'exemptions successives sur la même paire.
CREATE UNIQUE INDEX "CharteExemption_charteId_userId_revokedAt_key"
    ON "CharteExemption"("charteId", "userId", "revokedAt");

CREATE INDEX "CharteExemption_charteId_idx"
    ON "CharteExemption"("charteId");

CREATE INDEX "CharteExemption_userId_revokedAt_idx"
    ON "CharteExemption"("userId", "revokedAt");

ALTER TABLE "CharteExemption" ADD CONSTRAINT "CharteExemption_charteId_fkey"
    FOREIGN KEY ("charteId") REFERENCES "Charte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CharteExemption" ADD CONSTRAINT "CharteExemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CharteExemption" ADD CONSTRAINT "CharteExemption_exemptedById_fkey"
    FOREIGN KEY ("exemptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
