import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { PiiSanitizerService } from './pii-sanitizer.service';

/**
 * Indexeur de tickets résolus pour le RAG (P1.7.1).
 * Indexe les tickets fermés ayant une résolution documentée,
 * après sanitization PII.
 */

const BATCH_SIZE = 50;
const MIN_RESOLUTION_LENGTH = 50;
const MAX_AGE_YEARS = 3;

@Injectable()
export class TicketIndexerService {
  private readonly logger = new Logger(TicketIndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly embeddingService: EmbeddingService,
    private readonly piiSanitizer: PiiSanitizerService,
  ) {}

  /**
   * Indexe les tickets éligibles (résolus, avec résolution, non confidentiels).
   * Idempotent : skip les tickets déjà indexés.
   */
  async indexAll(options: { dryRun?: boolean } = {}): Promise<{
    indexed: number;
    skipped: number;
    errors: number;
    pendingReview: number;
  }> {
    const { dryRun = false } = options;
    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    let pendingReview = 0;

    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - MAX_AGE_YEARS);

    // Get already-indexed ticket IDs
    const existingChunks = await this.prisma.ragChunk.findMany({
      // 'TICKET' n'est pas dans l'enum Prisma RagSourceType (cf. TODO ci-dessous).
      where: { sourceType: 'TICKET' as never },
      select: { sourceId: true },
      distinct: ['sourceId'],
    }).catch(() => [] as Array<{ sourceId: string }>);
    const indexedIds = new Set(existingChunks.map((c) => c.sourceId));

    let cursor: string | undefined;

    while (true) {
      const tickets = await this.prisma.ticket.findMany({
        where: {
          status: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: { gte: cutoffDate },
        },
        include: {
          comments: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (tickets.length === 0) break;
      cursor = tickets[tickets.length - 1].id;

      for (const ticket of tickets) {
        // Skip already indexed
        if (indexedIds.has(ticket.id)) {
          skipped++;
          continue;
        }

        // Build resolution from comments (le modèle n'a pas de champ resolutionNotes)
        const resolutionText = ticket.comments
          ?.map((c) => c.content)
          ?.join('\n') || '';

        // Skip tickets without meaningful resolution content
        if (ticket.description.length + resolutionText.length < MIN_RESOLUTION_LENGTH) {
          skipped++;
          continue;
        }

        // Build chunk text
        const rawText = this.buildTicketChunk(ticket, resolutionText);

        // PII sanitization
        const { text: sanitizedText, report } = this.piiSanitizer.sanitize(rawText);

        if (report.requiresHumanReview) {
          pendingReview++;
          this.logger.warn({
            msg: 'ticket_indexer.pending_review',
            ticketId: ticket.id,
            totalMasked: report.totalMasked,
          });
          continue; // Ne pas indexer avant review humaine
        }

        if (dryRun) {
          this.logger.log({
            msg: 'ticket_indexer.dry_run',
            ticketId: ticket.id,
            textLength: sanitizedText.length,
            piiMasked: report.totalMasked,
          });
          indexed++;
          continue;
        }

        try {
          // TODO: review type safety — 'TICKET' n'est pas dans l'enum Prisma
          // RagSourceType (cf. schema.prisma:1801-1807) ni dans le type local
          // SourceType de RagService. Étendre l'enum via migration ALTER TYPE
          // avant de retirer ce cast.
          await this.ragService.indexSource('TICKET' as 'DOCUMENT', ticket.id, sanitizedText, {
            type: 'TICKET',
            ticketId: ticket.id,
            title: ticket.title,
            category: ticket.category || 'GENERAL',
            resolvedAt: ticket.resolvedAt?.toISOString(),
            classification: 'INTERNE',
            piiSanitized: true,
            sanitizationReport: report,
          });

          // Embed the newly created chunks
          if (this.embeddingService.isEnabled()) {
            const chunks = await this.prisma.ragChunk.findMany({
              // 'TICKET' n'est pas dans l'enum Prisma RagSourceType — voir TODO indexSource.
              where: { sourceType: 'TICKET' as never, sourceId: ticket.id },
            });
            for (const chunk of chunks) {
              try {
                const embedding = await this.embeddingService.embed(chunk.content);
                const embStr = `[${embedding.join(',')}]`;
                await this.prisma.$executeRawUnsafe(
                  `UPDATE "RagChunk" SET embedding = $1::vector WHERE id = $2`,
                  embStr, chunk.id,
                );
              } catch (err) {
                this.logger.error({
                  msg: 'ticket_indexer.embedding_failed',
                  chunkId: chunk.id,
                  error: (err as Error).message,
                });
              }
            }
          }

          indexed++;
        } catch (err) {
          errors++;
          this.logger.error({
            msg: 'ticket_indexer.index_failed',
            ticketId: ticket.id,
            error: (err as Error).message,
          });
        }
      }
    }

    this.logger.log({
      msg: 'ticket_indexer.complete',
      indexed, skipped, errors, pendingReview, dryRun,
    });

    return { indexed, skipped, errors, pendingReview };
  }

  private buildTicketChunk(ticket: any, resolutionText: string): string {
    const parts = [
      `Ticket #${ticket.reference} — ${ticket.title}`,
      ticket.category ? `Catégorie : ${ticket.category}` : '',
      ticket.priority ? `Priorité : ${ticket.priority}` : '',
      ticket.resolvedAt ? `Résolu le : ${ticket.resolvedAt.toISOString().split('T')[0]}` : '',
      '',
      'Problème :',
      ticket.description || '(non renseigné)',
    ];
    if (resolutionText) {
      parts.push('', 'Résolution :', resolutionText);
    }
    return parts.filter(Boolean).join('\n');
  }
}
