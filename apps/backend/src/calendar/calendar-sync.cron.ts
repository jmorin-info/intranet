import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { GoogleCalendarSyncService } from "./google-calendar-sync.service";
import { OutlookSyncService } from "./outlook-sync.service";

/**
 * Cron jobs de synchronisation calendaires (Wave B item 33).
 *
 * Stratégie : pull incrémental toutes les 10 min pour chaque provider.
 * Le push (intranet → distant) reste event-driven (déclenché par les
 * mutations dans CalendarService.create/update/delete) afin de garder une
 * latence minimale sur les changements faits côté intranet.
 *
 * Contrôle environnemental :
 *   - `CALENDAR_SYNC_CRON_ENABLED=false` désactive complètement les pulls
 *     (utile en dev / pendant un incident pour soulager les API tierces).
 */
@Injectable()
export class CalendarSyncCron {
  private readonly logger = new Logger(CalendarSyncCron.name);

  constructor(
    private readonly googleSync: GoogleCalendarSyncService,
    private readonly outlookSync: OutlookSyncService,
  ) {}

  private get enabled(): boolean {
    return (process.env.CALENDAR_SYNC_CRON_ENABLED || "true").toLowerCase() !==
      "false";
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async runGoogle(): Promise<void> {
    if (!this.enabled) return;
    if (!this.googleSync.isConfigured()) return;
    try {
      const res = await this.googleSync.runScheduledSyncs();
      if (res.pulled || res.errors) {
        this.logger.log(
          `Google sync: pulled=${res.pulled} errors=${res.errors}`,
        );
      }
    } catch (err) {
      this.logger.warn(`Google sync cron failed: ${(err as Error)?.message}`);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async runOutlook(): Promise<void> {
    if (!this.enabled) return;
    if (!this.outlookSync.isConfigured()) return;
    try {
      const res = await this.outlookSync.runScheduledSyncs();
      if (res.pulled || res.errors) {
        this.logger.log(
          `Outlook sync: pulled=${res.pulled} errors=${res.errors}`,
        );
      }
    } catch (err) {
      this.logger.warn(`Outlook sync cron failed: ${(err as Error)?.message}`);
    }
  }
}
