import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RagService } from './rag.service';

/** Disabled by default. Semantic indexing requires a second explicit opt-in. */
@Injectable()
export class RagReindexScheduler {
  private readonly logger = new Logger(RagReindexScheduler.name);
  constructor(private readonly ragService: RagService) {}

  @Cron('0 1 * * *', { name: 'rag-reindex-nightly', timeZone: 'Europe/Paris', waitForCompletion: true })
  async reindexNightly(): Promise<void> {
    if (process.env.RAG_REINDEX_ENABLED !== 'true' || process.env.RAG_MAINTENANCE_MODE === 'true' || !this.ragService.isEnabled()) {
      this.logger.log('rag.reindex.nightly.disabled');
      return;
    }
    const start = Date.now();
    try {
      const result = await this.ragService.reindexAll();
      this.logger.log(`rag.reindex.nightly.done durationMs=${Date.now() - start}, indexed=${JSON.stringify(result.indexed)}, errors=${result.errors.length}`);
    } catch (err) {
      this.logger.warn(`rag.reindex.nightly.stopped: ${(err as Error).message}`);
    }
  }
}
