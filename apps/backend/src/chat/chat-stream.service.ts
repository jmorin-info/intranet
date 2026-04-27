import { Injectable, Logger } from '@nestjs/common';
import { ChatSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RagService, RagSearchContext } from '../rag/rag.service';
import { RequestUser } from '../common/interfaces';
import { SessionService } from './session.service';
import { AskStreamDto } from './dto/ask-stream.dto';

export interface StreamEmitter {
  writeToken: (token: string) => void;
  writeEvent: (eventName: string, data: Record<string, unknown>) => void;
  close: () => void;
}

/**
 * Orchestrator du flux /chat/ask-stream : délègue le retrieval + génération
 * à RagService.answerStream, et enrobe avec persistance ChatSession /
 * ChatMessage pour la cohérence de l'historique.
 *
 * Tant que le feature flag CHATBOT_UNIFIED_ENABLED est à false, ce service
 * n'est jamais appelé (guard amont).
 */
@Injectable()
export class ChatStreamService {
  private readonly logger = new Logger(ChatStreamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Point d'entrée unique pour le streaming d'une question.
   * - Crée/récupère la session
   * - Log le message USER
   * - Appelle RagService.answerStream (pipeline RAG existant inchangé)
   * - Log le message ASSISTANT à la fin
   * - Touche session.lastMessageAt
   */
  async run(
    user: RequestUser,
    dto: AskStreamDto,
    emitter: StreamEmitter,
  ): Promise<void> {
    const start = Date.now();
    const session = await this.ensureSession(user.id, dto);
    emitter.writeEvent('session', { id: session.id });

    // Log USER message
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'USER',
        content: dto.query.trim(),
      },
    });
    emitter.writeEvent('user_message', { id: userMessage.id });

    let fullAnswer = '';
    let firstTokenAt: number | null = null;
    let citations: unknown = [];
    let retrievalConfidence: number | null = null;
    let retrievedChunkIds: string[] = [];

    const ctx: RagSearchContext = {
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };

    try {
      await this.ragService.answerStream(
        dto.query.trim(),
        user.id,
        (token) => {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          fullAnswer += token;
          emitter.writeToken(token);
        },
        (meta) => {
          citations = meta.sources;
          retrievalConfidence = meta.retrievalConfidence;
          retrievedChunkIds = meta.sources.map((s) => `${s.sourceType}:${s.sourceId}`);
          emitter.writeEvent('sources', {
            sources: meta.sources,
            retrievalConfidence: meta.retrievalConfidence,
          });
        },
        ctx,
      );
    } catch (err) {
      this.logger.error({
        msg: 'chat.stream.error',
        sessionId: session.id,
        userId: user.id,
        error: (err as Error).message,
      });
      emitter.writeEvent('error', { message: 'Une erreur est survenue côté serveur.' });
      // Persist la réponse partielle pour trace
    }

    const totalLatencyMs = Date.now() - start;
    const timeToFirstTokenMs = firstTokenAt ? firstTokenAt - start : null;

    // Log ASSISTANT message
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: fullAnswer,
        citations: citations as Parameters<typeof this.prisma.chatMessage.create>[0]['data']['citations'],
        retrievalConfidence: retrievalConfidence ?? undefined,
        retrievedChunkIds,
        // Nom du modèle LLM actif (via env). Laisse null si non configuré.
        modelUsed: process.env.OLLAMA_MODEL || null,
        totalLatencyMs,
        timeToFirstTokenMs: timeToFirstTokenMs ?? undefined,
      },
    });

    await this.sessionService.touch(session.id);

    emitter.writeEvent('done', {
      messageId: assistantMessage.id,
      sessionId: session.id,
      totalLatencyMs,
      timeToFirstTokenMs,
    });
    emitter.close();
  }

  /**
   * Regenerate an assistant message : efface l'ancien, relance le stream avec
   * la même question user + incrémente regenerateCount sur le nouveau message.
   */
  async regenerate(
    user: RequestUser,
    assistantMessageId: string,
    emitter: StreamEmitter,
  ): Promise<void> {
    const assistant = await this.prisma.chatMessage.findUnique({
      where: { id: assistantMessageId },
      include: { session: true },
    });
    if (!assistant || assistant.role !== 'ASSISTANT') {
      emitter.writeEvent('error', { message: 'Message introuvable ou non régénérable.' });
      emitter.close();
      return;
    }
    if (assistant.session.userId !== user.id) {
      emitter.writeEvent('error', { message: 'Accès refusé.' });
      emitter.close();
      return;
    }

    // Get the preceding USER message (last USER before this assistant)
    const previousUser = await this.prisma.chatMessage.findFirst({
      where: {
        sessionId: assistant.sessionId,
        role: 'USER',
        createdAt: { lt: assistant.createdAt },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!previousUser) {
      emitter.writeEvent('error', { message: 'Question originale introuvable.' });
      emitter.close();
      return;
    }

    const prevCount = assistant.regenerateCount;
    // Soft-delete by replacing the assistant message content and bumping count
    await this.prisma.chatMessage.update({
      where: { id: assistant.id },
      data: { regenerateCount: prevCount + 1 },
    });

    await this.run(
      user,
      {
        query: previousUser.content,
        sessionId: assistant.sessionId,
        surface: assistant.session.surface,
      },
      emitter,
    );
  }

  private async ensureSession(userId: string, dto: AskStreamDto): Promise<ChatSession> {
    if (dto.sessionId) {
      const session = await this.prisma.chatSession.findUnique({
        where: { id: dto.sessionId },
      });
      if (session && session.userId === userId) {
        return session;
      }
      // If sessionId provided but invalid, fall through and create a new one
    }
    return this.sessionService.create(userId, {
      surface: dto.surface,
      context: dto.context,
    });
  }
}
