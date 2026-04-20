import { Body, Controller, Get, Param, Post, Res, UseGuards, ParseUUIDPipe, BadRequestException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { RagService, RagSearchContext } from './rag.service';
import { InputGuardService } from './guardrails/input-guard.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Contrôleur RAG / AI Search.
 * Toutes les routes nécessitent une session authentifiée.
 */
@Controller('rag')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly inputGuard: InputGuardService,
    private readonly prisma: PrismaService,
  ) {}

  /** Pose une question au moteur RAG (avec filtrage RBAC ISO 27001 A.5.15 + guardrails P0.2). */
  @Post('ask')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async ask(
    @Body() body: { question: string },
    @CurrentUser() user: RequestUser,
  ) {
    const raw = (body?.question ?? '').trim();

    // Guardrails input (P0.2)
    const guard = this.inputGuard.validate(raw, user.id);
    if (!guard.allowed) {
      return { answer: guard.reason, sources: [], durationMs: 0 };
    }

    const ctx: RagSearchContext = { userId: user.id, role: user.role, departmentId: user.departmentId };
    return this.ragService.answer(guard.sanitizedQuery, user.id, ctx);
  }

  /**
   * SSE streaming version of /ask.
   * Sends `token` events as the LLM generates, then a final `done` event with sources + metadata.
   */
  @Post('ask-stream')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async askStream(
    @Body() body: { question: string },
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const raw = (body?.question ?? '').trim();

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Guardrails input (P0.2)
    const guard = this.inputGuard.validate(raw, user.id);
    if (!guard.allowed) {
      res.write(`data: ${JSON.stringify({ type: 'token', token: guard.reason })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', sources: [], retrievalConfidence: 0, durationMs: 0 })}\n\n`);
      res.end();
      return;
    }

    const question = guard.sanitizedQuery;
    const ctx: RagSearchContext = { userId: user.id, role: user.role, departmentId: user.departmentId };

    const write = (data: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      await this.ragService.answerStream(
        question,
        user.id,
        (token) => write({ type: 'token', token }),
        (meta) => write({ type: 'meta', ...meta }),
        ctx,
      );
    } catch (err) {
      write({ type: 'error', message: (err as Error).message });
    } finally {
      write({ type: 'done' });
      if (!res.writableEnded) res.end();
    }
  }

  /** Résumé IA d'un document. */
  @Get('documents/:id/ai-summary')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async documentSummary(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.ragService.summarizeDocument(id);
    } catch (err) {
      return { summary: `Erreur : ${(err as Error).message}` };
    }
  }

  /** Suggestion IA de réponse pour un ticket. */
  @Get('tickets/:id/ai-suggest')
  async ticketSuggestion(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.ragService.suggestTicketResponse(id);
    } catch (err) {
      return { suggestion: `Erreur : ${(err as Error).message}` };
    }
  }

  /** Question sur un article wiki. */
  @Post('wiki/:id/ask')
  async wikiAsk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { question: string },
  ) {
    const question = (body?.question ?? '').trim();
    if (question.length < 2) {
      return { answer: 'Veuillez saisir une question d\'au moins 2 caractères.' };
    }
    try {
      return await this.ragService.askAboutArticle(id, question);
    } catch (err) {
      return { answer: `Erreur : ${(err as Error).message}` };
    }
  }

  /** Réindexation complète (admin uniquement). */
  @Post('reindex')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reindex() {
    return this.ragService.reindexAll();
  }

  /** Statistiques (chunks par type, dernières requêtes). */
  @Get('stats')
  async stats() {
    return this.ragService.getStats();
  }

  /**
   * Submit feedback (thumbs up/down) for a RAG query.
   *
   * Feature 4 (P1.9 polish) : le champ `feedback` peut désormais contenir
   * soit un commentaire texte libre (retro-compat), soit une chaîne JSON
   * du shape `{"reason": "<categorie>", "comment": "<texte>", "v": 1}`.
   * On ne fait pas de migration Prisma — on réutilise la colonne existante
   * pour rester rétro-compatible et éviter un schema change pour 1 champ.
   *
   * Les catégories valides côté front sont standardisées
   * (cf. `apps/frontend/src/components/chatbot/feedback-validation.ts`).
   * Le backend accepte tout JSON valide, mais impose :
   *   - taille max 1000 chars (garde-fou DB + abus)
   *   - si JSON, la clé `reason` (string ≤ 64 chars) et `comment` (string ≤ 500 chars)
   */
  @Post(':id/feedback')
  async feedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { rating: number; feedback?: string },
  ) {
    const { rating, feedback } = body ?? {};

    // Validate rating
    if (rating === undefined || rating === null || ![-1, 0, 1].includes(rating)) {
      throw new BadRequestException('rating must be -1, 0, or 1');
    }

    // Validate feedback payload (text or JSON)
    if (feedback !== undefined && feedback !== null) {
      if (typeof feedback !== 'string') {
        throw new BadRequestException('feedback must be a string');
      }
      if (feedback.length > 1000) {
        throw new BadRequestException('feedback must be ≤ 1000 characters');
      }
      // If it looks like JSON, soft-validate shape
      if (feedback.startsWith('{')) {
        try {
          const parsed = JSON.parse(feedback);
          if (parsed.reason && typeof parsed.reason !== 'string') {
            throw new BadRequestException('feedback.reason must be a string');
          }
          if (parsed.reason && parsed.reason.length > 64) {
            throw new BadRequestException('feedback.reason too long');
          }
          if (parsed.comment && typeof parsed.comment !== 'string') {
            throw new BadRequestException('feedback.comment must be a string');
          }
          if (parsed.comment && parsed.comment.length > 500) {
            throw new BadRequestException('feedback.comment too long');
          }
        } catch (err) {
          if (err instanceof BadRequestException) throw err;
          // Not valid JSON — still accept as free text (retro-compat)
        }
      }
    }

    // Verify the query log exists
    const existing = await (this.prisma as any).ragQueryLog.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('RagQueryLog not found');
    }

    const updated = await (this.prisma as any).ragQueryLog.update({
      where: { id },
      data: {
        rating,
        ...(feedback !== undefined ? { feedback } : {}),
      },
    });

    return { success: true, id: updated.id, rating: updated.rating };
  }
}
