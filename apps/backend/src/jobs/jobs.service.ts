import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredRefreshTokens() {
    this.logger.log("Cleaning up expired refresh tokens...");

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired/revoked refresh tokens`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async checkDocumentReviewDates() {
    this.logger.log("Checking document review dates...");

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const documentsNeedingReview = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: "APPROVED",
        nextReviewDate: {
          lte: sevenDaysFromNow,
          gte: new Date(),
        },
      },
      include: {
        owner: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    for (const doc of documentsNeedingReview) {
      await this.notificationsService.create({
        userId: doc.ownerId,
        type: "REVIEW_OVERDUE",
        title: "Document Review Due",
        body: `Document "${doc.title}" (${doc.reference}) is due for review by ${doc.nextReviewDate?.toISOString().split("T")[0]}.`,
        resourceType: "Document",
        resourceId: doc.id,
      });
    }

    this.logger.log(`Found ${documentsNeedingReview.length} documents needing review`);
  }

  /**
   * Relance du workflow documentaire — jours ouvrés à 9h.
   *
   * Notifie l'assigné d'une étape de validation PENDING (vérification / revue /
   * approbation) inactive depuis plus de 5 jours. Throttle : au plus une relance
   * tous les 3 jours par document (le registre d'audit sert de journal). Après
   * 10 jours, un rappel escaladé est aussi envoyé au rédacteur (owner).
   */
  @Cron("0 9 * * 1-5")
  async remindStaleWorkflowSteps() {
    this.logger.log("Relance des étapes de validation en souffrance...");
    const nowMs = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const fiveDaysAgo = new Date(nowMs - 5 * DAY_MS);
    const threeDaysAgo = new Date(nowMs - 3 * DAY_MS);
    const TEN_DAYS_MS = 10 * DAY_MS;

    const staleSteps = await this.prisma.validationStep.findMany({
      where: {
        action: null,
        createdAt: { lt: fiveDaysAgo },
        request: { status: "PENDING" },
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        request: {
          select: {
            currentStep: true,
            document: {
              select: {
                id: true,
                title: true,
                reference: true,
                ownerId: true,
                deletedAt: true,
                status: true,
              },
            },
          },
        },
      },
    });

    let sent = 0;
    let skipped = 0;
    let escalated = 0;
    for (const step of staleSteps) {
      const doc = step.request?.document;
      if (!doc || doc.deletedAt) continue;

      // Throttle : une relance a-t-elle déjà été envoyée dans les 3 derniers
      // jours pour ce document ? (audit = journal des relances).
      const recentReminder = await this.prisma.auditLog.findFirst({
        where: {
          action: "DOCUMENT_WORKFLOW_REMINDER",
          resourceId: doc.id,
          createdAt: { gte: threeDaysAgo },
        },
        select: { id: true },
      });
      if (recentReminder) {
        skipped++;
        continue;
      }

      const ageMs = nowMs - new Date(step.createdAt).getTime();
      const ageDays = Math.floor(ageMs / DAY_MS);
      const stepLabel =
        step.stepType === "APPROVAL"
          ? "approbation"
          : step.stepType === "VERIFICATION"
            ? "vérification"
            : "revue";
      const notifType = step.stepType === "APPROVAL" ? "DOC_APPROVAL_NEEDED" : "DOC_REVIEW_NEEDED";

      await this.notificationsService.create({
        userId: step.assignedToId,
        type: notifType,
        title: `Relance : ${stepLabel} en attente depuis ${ageDays} jours`,
        body: `Le document "${doc.title}" (${doc.reference}) attend votre ${stepLabel} depuis ${ageDays} jours. Merci de traiter cette étape du workflow.`,
        resourceType: "Document",
        resourceId: doc.id,
      });
      sent++;

      // Escalade au rédacteur après 10 jours (s'il n'est pas déjà l'assigné).
      const doEscalate = ageMs > TEN_DAYS_MS && doc.ownerId !== step.assignedToId;
      if (doEscalate) {
        await this.notificationsService.create({
          userId: doc.ownerId,
          type: notifType,
          title: `Blocage workflow : ${doc.reference} en attente depuis ${ageDays} jours`,
          body: `L'étape de ${stepLabel} du document "${doc.title}" (${doc.reference}) est assignée à ${step.assignedTo.firstName} ${step.assignedTo.lastName} et sans réponse depuis ${ageDays} jours. Une relance directe ou une réassignation (via « Modifier ») peut être nécessaire.`,
          resourceType: "Document",
          resourceId: doc.id,
        });
        escalated++;
      }

      await this.prisma.auditLog.create({
        data: {
          action: "DOCUMENT_WORKFLOW_REMINDER",
          resourceType: "Document",
          resourceId: doc.id,
          severity: "INFO",
          metadata: {
            stepId: step.id,
            stepType: step.stepType,
            assignedToId: step.assignedToId,
            ageDays,
            escalated: doEscalate,
          },
        },
      });
    }

    this.logger.log(
      `Relances workflow : ${sent} envoyées, ${escalated} escaladées, ${skipped} throttlées (${staleSteps.length} étapes > 5 j).`,
    );
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldAuditLogs() {
    this.logger.log("Cleaning up old audit logs...");

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        severity: "INFO",
        createdAt: { lt: ninetyDaysAgo },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old INFO audit logs`);
  }

  /**
   * Daily digest: notify users with pending actions (8:30 AM)
   */
  @Cron("30 8 * * *")
  async sendPendingTasksDigest() {
    this.logger.log("Sending pending tasks digest...");

    try {
      // Find users with pending signatures
      const pendingSigs = await this.prisma.signatureRequest.findMany({
        where: { status: "PENDING" },
        include: {
          signer: { select: { id: true, email: true, firstName: true } },
          documentVersion: { include: { document: { select: { title: true, reference: true } } } },
        },
      });

      // Group by signer
      const sigsBySigner = new Map<string, typeof pendingSigs>();
      for (const sig of pendingSigs) {
        const list = sigsBySigner.get(sig.signerId) || [];
        list.push(sig);
        sigsBySigner.set(sig.signerId, list);
      }

      // Send digest to each signer
      for (const [signerId, sigs] of sigsBySigner) {
        const docList = sigs
          .map(
            (s) =>
              `• ${s.documentVersion.document.title} (${s.documentVersion.document.reference})`,
          )
          .join("\n");
        await this.notificationsService.create({
          userId: signerId,
          type: "SIGNATURE_NEEDED",
          title: `Rappel : ${sigs.length} signature(s) en attente`,
          body: `Vous avez ${sigs.length} document(s) en attente de signature :\n\n${docList}\n\nMerci de les traiter dans les meilleurs délais.`,
          resourceType: "Signature",
        });
      }

      // Find documents with overdue reviews
      const overdueReviews = await this.prisma.document.findMany({
        where: {
          nextReviewDate: { lt: new Date() },
          status: "APPROVED",
          deletedAt: null,
        },
        include: { owner: { select: { id: true, firstName: true } } },
      });

      for (const doc of overdueReviews) {
        await this.notificationsService.create({
          userId: doc.ownerId,
          type: "REVIEW_OVERDUE",
          title: `Document en retard de revue : ${doc.title}`,
          body: `Le document "${doc.title}" (${doc.reference}) devait être révisé avant le ${doc.nextReviewDate?.toLocaleDateString("fr-FR")}. Merci de planifier sa revue.`,
          resourceType: "Document",
          resourceId: doc.id,
        });
      }

      this.logger.log(
        `Digest sent: ${sigsBySigner.size} signature reminders, ${overdueReviews.length} review reminders`,
      );
    } catch (err) {
      this.logger.error(`Pending tasks digest failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
