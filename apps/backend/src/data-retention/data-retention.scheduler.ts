import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataRetentionService } from './data-retention.service';

/**
 * DataRetentionScheduler — runs the ISO 27001 A.5.33 retention policy nightly.
 *
 * Runs every day at 03:00 server time. The policy is dry-run unless
 * RETENTION_AUTO_APPLY=true is set in the environment. The audit log cleanup
 * is always safe to automate; document archival and hard-delete remain
 * behind the same flag so an operator can review dry-run reports first.
 */
@Injectable()
export class DataRetentionScheduler {
  private readonly logger = new Logger(DataRetentionScheduler.name);

  constructor(private readonly service: DataRetentionService) {}

  // Every day at 03:00 (server time)
  @Cron('0 3 * * *')
  async runDailyRetention() {
    this.logger.log('Daily retention policy run (ISO 27001 A.5.33)');
    try {
      const stats = await this.service.getStats();
      this.logger.log(`Retention stats: ${JSON.stringify(stats)}`);

      const apply = process.env.RETENTION_AUTO_APPLY === 'true';

      // Always compute dry-run previews so logs capture actionable numbers
      const archiveDryRun = await this.service.runArchivePolicy(false);
      const auditDryRun = await this.service.runAuditLogCleanup(false);
      this.logger.log(
        `Dry-run: archive=${archiveDryRun.candidates}, ` +
          `auditCleanup=${auditDryRun.candidates}`,
      );

      if (apply) {
        this.logger.log('RETENTION_AUTO_APPLY=true — applying policies');
        const archiveResult = await this.service.runArchivePolicy(true);
        const auditResult = await this.service.runAuditLogCleanup(true);
        this.logger.log(
          `Applied: archived=${archiveResult.processed.length}, ` +
            `auditDeleted=${auditResult.deleted}`,
        );
      } else {
        this.logger.log('RETENTION_AUTO_APPLY!=true — skipping mutations');
      }
    } catch (err) {
      this.logger.error(
        `Retention run failed: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
