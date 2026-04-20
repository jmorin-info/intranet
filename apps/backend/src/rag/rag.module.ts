import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { TextExtractorService } from './text-extractor.service';
import { InputGuardService } from './guardrails/input-guard.service';
import { EmbeddingService } from './embedding/embedding.service';
import { LlmService } from './llm/llm.service';
import { PiiSanitizerService } from './ingestion/pii-sanitizer.service';
import { RagReindexScheduler } from './rag-reindex.scheduler';

/**
 * Module RAG / AI Search.
 * P-1.1 : RBAC retrieval | P0.2 : guardrails input | P1 : embeddings sémantiques + hybrid search
 * P1.8 : LlmService avec fallback chain + templates par modèle | PII sanitizer pour ingestion.
 * Mission 3 P1 : RagReindexScheduler — cron nocturne 01h00 Europe/Paris.
 */
@Module({
  imports: [PrismaModule],
  controllers: [RagController],
  providers: [
    RagService,
    TextExtractorService,
    InputGuardService,
    EmbeddingService,
    LlmService,
    PiiSanitizerService,
    RagReindexScheduler,
  ],
  exports: [RagService, InputGuardService, EmbeddingService, LlmService, PiiSanitizerService],
})
export class RagModule {}
