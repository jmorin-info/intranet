import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RagService } from './rag.service';

/**
 * Cron nocturne de reindexation RAG — Mission 3 Phase 1 Etape 1.6.
 *
 * Tourne tous les jours a 01:00 (fenetre : aucun utilisateur actif).
 * Repopule metadata des chunks (notamment `classification` expose en
 * Mission 2 polish chatbot) pour que le ClassificationBadge cote UI
 * soit visible sur TOUS les documents, pas seulement les nouveaux.
 *
 * Activation : ce cron est auto-enregistre via @nestjs/schedule
 * (ScheduleModule.forRoot() deja present dans AppModule:79).
 * Il s'execute des que le backend tourne. Pour desactiver, commenter
 * le @Cron ou set une var d'env kill-switch (TODO a ajouter plus tard).
 *
 * Declenchement manuel (admin/debug) :
 *   curl -X POST -H "Authorization: Bearer <JWT_SUPER_ADMIN>" \
 *     http://localhost:3000/api/v1/rag/reindex
 */
@Injectable()
export class RagReindexScheduler {
  private readonly logger = new Logger(RagReindexScheduler.name);

  constructor(private readonly ragService: RagService) {}

  @Cron('0 1 * * *', {
    name: 'rag-reindex-nightly',
    timeZone: 'Europe/Paris',
  })
  async reindexNightly(): Promise<void> {
    const start = Date.now();
    this.logger.log('rag.reindex.nightly.start');

    try {
      const result = await this.ragService.reindexAll();
      const durationMs = Date.now() - start;
      this.logger.log(
        `rag.reindex.nightly.done — ${durationMs}ms, indexed=${JSON.stringify(result.indexed)}, errors=${result.errors.length}`,
      );
      if (result.errors.length > 0) {
        this.logger.warn(
          `rag.reindex.nightly.errors (${result.errors.length}) — first 5: ${result.errors.slice(0, 5).join(' | ')}`,
        );
      }
    } catch (err) {
      this.logger.error({
        msg: 'rag.reindex.nightly.failed',
        error: (err as Error).message,
      });
    }
  }
}
