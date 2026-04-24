-- Chatbot share link (Feature 10 du polish 2026-04-24)
-- Cree un lien public ephemere (token UUID) vers une conversation snapshot
-- read-only. Expire automatiquement apres N jours (default 7 cote service).
-- Pas de PII stocke en clair en dehors du payload (snapshot des messages).

CREATE TABLE IF NOT EXISTS "ChatbotShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatbotShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatbotShareLink_token_key" ON "ChatbotShareLink"("token");
CREATE INDEX IF NOT EXISTS "ChatbotShareLink_ownerId_createdAt_idx" ON "ChatbotShareLink"("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatbotShareLink_expiresAt_idx" ON "ChatbotShareLink"("expiresAt");

ALTER TABLE "ChatbotShareLink"
  ADD CONSTRAINT "ChatbotShareLink_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
