import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RagModule } from '../rag/rag.module';
import { NoaMemoryModule } from '../noa-memory/noa-memory.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SessionService } from './session.service';
import { FeedbackService } from './feedback.service';
import { ChatStreamService } from './chat-stream.service';

/**
 * Mission 3 Phase 1 — Unified chatbot backend.
 *
 * Gated globally by CHATBOT_UNIFIED_ENABLED (default false). When the flag
 * is off, all /chat/* endpoints return 404.
 *
 * Coexists with the existing /rag/* endpoints — no changes there.
 */
@Module({
  imports: [PrismaModule, RagModule, NoaMemoryModule],
  controllers: [ChatController],
  providers: [ChatService, SessionService, FeedbackService, ChatStreamService],
  exports: [ChatService, SessionService],
})
export class ChatModule {}
