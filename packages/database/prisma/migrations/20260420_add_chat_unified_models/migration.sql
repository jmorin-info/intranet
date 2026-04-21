-- Mission 3 Phase 1 — Chat Unified Architecture
--
-- Ajoute 3 tables (ChatSession, ChatMessage, ChatMessageFeedback) + 4 enums
-- pour le backend unifié du chatbot (modale Ctrl+Shift+K + widget FAB).
-- Gated par le feature flag CHATBOT_UNIFIED_ENABLED (default false).
-- Coexiste avec RagQueryLog jusqu'à Phase 3 (migration data).
--
-- IMPORTANT : le SQL proposé par `prisma migrate diff` contenait 2
-- opérations destructives non voulues sur RagChunk :
--   DROP INDEX "rag_chunk_embedding_hnsw_idx";
--   ALTER TABLE "RagChunk" DROP COLUMN "embedding";
-- Ces opérations ont été **volontairement retirées** : la colonne
-- `embedding` (vecteur pgvector 1024 dims) et l'index HNSW sont gérés
-- manuellement hors Prisma (cf. commentaire dans schema.prisma:1595-1597)
-- car Prisma ne supporte pas nativement pgvector. Le schéma Prisma les
-- déclare absents volontairement ; les drop dans la migration casserait
-- la recherche sémantique RAG.

-- CreateEnum
CREATE TYPE "ChatSurface" AS ENUM ('MODAL', 'FAB', 'AUTO');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "ChatFeedbackRating" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- CreateEnum
CREATE TYPE "ChatFeedbackReason" AS ENUM ('WRONG_ANSWER', 'MISSING_INFO', 'OFF_TOPIC', 'TOO_LONG', 'TOO_SHORT', 'HALLUCINATION', 'OTHER');

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "surface" "ChatSurface" NOT NULL,
    "contextUrl" TEXT,
    "contextType" TEXT,
    "contextEntityId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "retrievalConfidence" DOUBLE PRECISION,
    "retrievedChunkIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelUsed" TEXT,
    "modeUsed" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "timeToFirstTokenMs" INTEGER,
    "totalLatencyMs" INTEGER,
    "regenerateCount" INTEGER NOT NULL DEFAULT 0,
    "wasAborted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageFeedback" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "ChatFeedbackRating" NOT NULL,
    "reason" "ChatFeedbackReason",
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatSession_userId_lastMessageAt_idx" ON "ChatSession"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatSession_userId_archivedAt_idx" ON "ChatSession"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "ChatSession_surface_startedAt_idx" ON "ChatSession"("surface", "startedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageFeedback_messageId_key" ON "ChatMessageFeedback"("messageId");

-- CreateIndex
CREATE INDEX "ChatMessageFeedback_rating_createdAt_idx" ON "ChatMessageFeedback"("rating", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageFeedback" ADD CONSTRAINT "ChatMessageFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageFeedback" ADD CONSTRAINT "ChatMessageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
