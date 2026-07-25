import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  CampaignSignatureStatus,
  SignatureCampaignStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignsService } from "./campaigns.service";

/**
 * Cron des campagnes de signature — tous les jours a 9h.
 *
 * Trois responsabilites :
 *  1. RETRY DU DISPATCH : re-tente la creation des submissions DocuSeal
 *     individuelles des cibles restees PENDING sans docusealSubmissionId
 *     (DocuSeal indisponible au moment du launch, template renseigne apres
 *     coup, signataires ajoutes hors ligne...). C'est ce qui garantit
 *     qu'aucune cible ne reste orpheline sans intervention manuelle.
 *  2. Rappels J-7 / J-1 / J.
 *  3. Marquage EXPIRED des campagnes en retard.
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

  @Cron("0 9 * * *")
  async dailyReminderSweep() {
    this.logger.log("Cron signature campaigns — debut");
    try {
      const campaigns = await this.prisma.signatureCampaign.findMany({
        where: {
          status: {
            in: [
              SignatureCampaignStatus.SENT,
              SignatureCampaignStatus.IN_PROGRESS,
            ],
          },
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
    // 1. Retry du dispatch DocuSeal — independant de dueAt : une campagne
    //    sans echeance peut tout autant avoir des cibles non dispatchees.
    try {
      const res = await this.campaigns.dispatchPendingSubmissions(campaign.id);
      if (res.dispatched > 0 || res.failed > 0) {
        this.logger.log(
          `Retry dispatch campagne ${campaign.id}: ${res.dispatched} creee(s), ${res.failed} echec(s), ${res.skipped} ignoree(s)`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Retry dispatch a echoue pour ${campaign.id}: ${err?.message || err}`,
      );
    }

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
      await this.prisma.campaignSignature.updateMany({
        where: {
          campaignId,
          status: {
            in: [
              CampaignSignatureStatus.PENDING,
              CampaignSignatureStatus.OPENED,
            ],
          },
        },
        data: { status: CampaignSignatureStatus.EXPIRED },
      });
      await this.prisma.signatureCampaign.update({
        where: { id: campaignId },
        data: { status: SignatureCampaignStatus.EXPIRED },
      });
      this.logger.warn(`Campagne ${campaignId} marquee EXPIRED`);
    } catch (err: any) {
      this.logger.error(
        `Impossible de marquer EXPIRED ${campaignId}: ${err?.message || err}`,
      );
    }
  }
}
