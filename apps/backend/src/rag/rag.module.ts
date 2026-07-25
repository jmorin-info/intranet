import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RagController } from "./rag.controller";
import { RagService } from "./rag.service";
import { TextExtractorService } from "./text-extractor.service";
import { InputGuardService } from "./guardrails/input-guard.service";
import { EmbeddingService } from "./embedding/embedding.service";
import { HybridSearchService } from "./embedding/hybrid-search.service";
import { RerankerService } from "./embedding/reranker.service";
import { QueryExpansionService } from "./embedding/query-expansion.service";
import { LlmService } from "./llm/llm.service";
import { LlmWarmupService } from "./llm/llm-warmup.service";
import { PiiSanitizerService } from "./ingestion/pii-sanitizer.service";
import { SemanticChunkerService } from "./ingestion/semantic-chunker.service";
import { RagReindexScheduler } from "./rag-reindex.scheduler";
import { RagEvalService } from "./eval/rag-eval.service";

/**
 * Module RAG / AI Search.
 * P-1.1 : RBAC retrieval | P0.2 : guardrails input | P1 : embeddings sémantiques + hybrid search
 * P1.8 : LlmService avec fallback chain + templates par modèle | PII sanitizer pour ingestion.
 * Mission 3 P1 : RagReindexScheduler — cron nocturne 01h00 Europe/Paris.
 * Item 30 : HybridSearchService (BM25 + vector), RerankerService (cross-encoder),
 *           QueryExpansionService (LLM), SemanticChunkerService (structure-aware),
 *           RagEvalService (golden dataset benchmark).
 */
@Module({
  imports: [PrismaModule],
  controllers: [RagController],
  providers: [
    RagService,
    TextExtractorService,
    InputGuardService,
    EmbeddingService,
    HybridSearchService,
    RerankerService,
    QueryExpansionService,
    LlmService,
    LlmWarmupService,
    PiiSanitizerService,
    SemanticChunkerService,
    RagReindexScheduler,
    RagEvalService,
  ],
  exports: [
    RagService,
    InputGuardService,
    EmbeddingService,
    LlmService,
    PiiSanitizerService,
    HybridSearchService,
    RerankerService,
    QueryExpansionService,
    SemanticChunkerService,
  ],
})
export class RagModule {}
