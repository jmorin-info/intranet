import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from './campaigns.service';

/**
 * Cron des campagnes de signature — tous les jours a 9h.
 * Envoie des rappels J-7 / J-1 / J et marque les retards EXPIRED.
 *
 * Regle absolue : NE JAMAIS throw depuis un cron — on log et on continue.
 */
@Injectable()
export class CampaignsCron {
  private readonly logger = new Logger(CampaignsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Cron('0 9 * * *')
  async dailyReminderSweep() {
    this.logger.log('Cron signature campaigns — debut');
    try {
      const campaigns = await (this.prisma as any).signatureCampaign.findMany({
        where: {
          status: { in: ['SENT', 'IN_PROGRESS'] },
        },
      });

      const now = new Date();
      for (const c of campaigns) {
        try {
          await this.processCampaign(c, now);
        } catch (err: any) {
          this.logger.error(
            `Erreur traitement campagne ${c.id}: ${err?.message || err}`,
          );
        }
      }
      this.logger.log(
        `Cron signature campaigns — fin (${campaigns.length} campagnes)`,
      );
    } catch (err: any) {
      this.logger.error(
        `Erreur cron signature campaigns: ${err?.message || err}`,
      );
    }
  }

  private async processCampaign(campaign: any, now: Date) {
    if (!campaign.dueAt) return;

    const due = new Date(campaign.dueAt);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.floor(
      (due.getTime() - now.getTime()) / msPerDay,
    );

    // Retard : marquer EXPIRED
    if (daysRemaining < 0) {
      await this.markExpired(campaign.id);
      return;
    }

    // Palier J-7 / J-1 / J — 1 rappel par palier
    let shouldRemind = false;
    const reminders = campaign.remindersSent ?? 0;

    if (daysRemaining <= 0 && reminders < 3) {
      shouldRemind = true; // jour J
    } else if (daysRemaining === 1 && reminders < 2) {
      shouldRemind = true; // J-1
    } else if (daysRemaining <= 7 && reminders < 1) {
      shouldRemind = true; // J-7
    }

    if (shouldRemind) {
      try {
        const res = await this.campaigns.sendReminders(campaign.id);
        this.logger.log(
          `Rappel J-${daysRemaining} envoye pour ${campaign.id}: ${res.sent}/${res.total}`,
        );
      } catch (err: any) {
        this.logger.error(
          `sendReminders a echoue pour ${campaign.id}: ${err?.message || err}`,
        );
      }
    }
  }

  private async markExpired(campaignId: string) {
    try {
      await (this.prisma as any).campaignSignature.updateMany({
        where: {
          campaignId,
          status: { in: ['PENDING', 'OPENED'] },
        },
        data: { status: 'EXPIRED' },
      });
      await (this.prisma as any).signatureCampaign.update({
        where: { id: campaignId },
        data: { status: 'EXPIRED' },
      });
      this.logger.warn(`Campagne ${campaignId} marquee EXPIRED`);
    } catch (err: any) {
      this.logger.error(
        `Impossible de marquer EXPIRED ${campaignId}: ${err?.message || err}`,
      );
    }
  }
}
