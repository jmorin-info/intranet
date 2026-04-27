import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MeilisearchService } from './meilisearch.service';

/**
 * Cron nocturne de reindexation Meilisearch — vague A post-launch v1.1.
 *
 * Pourquoi un reindex complet alors que les hooks Prisma deja en place
 * gerent les ajouts/maj/suppressions ? Pour rattraper :
 *   - les hooks rates (Meili indispo au moment de l'ecriture)
 *   - les imports massifs hors-API (LDAP sync, scripts admin)
 *   - les drifts schema (champ ajoute, classification corrigee retroactivement)
 *
 * Tourne tous les jours a 02:00 (apres le RAG reindex de 01:00).
 * Activation : auto-enregistre via @nestjs/schedule (ScheduleModule.forRoot()
 * deja present dans AppModule). Kill-switch : MEILISEARCH_ENABLED=false.
 *
 * Declenchement manuel (admin/debug) :
 *   curl -X POST -H "Authorization: Bearer <JWT_ADMIN>" \
 *     http://localhost:3000/api/v1/search/reindex
 */
@Injectable()
export class MeiliReindexScheduler {
  private readonly logger = new Logger(MeiliReindexScheduler.name);

  constructor(private readonly meili: MeilisearchService) {}

  @Cron('0 2 * * *', {
    name: 'meili-reindex-nightly',
    timeZone: 'Europe/Paris',
  })
  async reindexNightly(): Promise<void> {
    if (!this.meili.isEnabled()) {
      this.logger.debug('meili.reindex.nightly.skipped (Meilisearch desactive)');
      return;
    }
    const start = Date.now();
    this.logger.log('meili.reindex.nightly.start');

    try {
      const result = await this.meili.reindexAll();
      const durationMs = Date.now() - start;
      this.logger.log(
        `meili.reindex.nightly.done — ${durationMs}ms, indexed=${JSON.stringify(result)}`,
      );
    } catch (err) {
      this.logger.error({
        msg: 'meili.reindex.nightly.failed',
        error: (err as Error).message,
      });
    }
  }
}
