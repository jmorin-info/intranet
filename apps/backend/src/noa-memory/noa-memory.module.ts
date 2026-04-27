import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RagModule } from "../rag/rag.module";
import { NoaMemoryService } from "./noa-memory.service";
import { NoaMemoryController } from "./noa-memory.controller";

/**
 * Wave D — Item 31 — Mémoire conversationnelle Noa.
 *
 * Importe RagModule pour réutiliser LlmService (extraction Ollama) et
 * EmbeddingService (recall pgvector cosine).
 *
 * AuditService est @Global, pas besoin de l'importer explicitement.
 */
@Module({
  imports: [PrismaModule, RagModule],
  controllers: [NoaMemoryController],
  providers: [NoaMemoryService],
  exports: [NoaMemoryService],
})
export class NoaMemoryModule {}
