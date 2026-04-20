import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredRefreshTokens() {
    this.logger.log('Cleaning up expired refresh tokens...');

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired/revoked refresh tokens`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async checkDocumentReviewDates() {
    this.logger.log('Checking document review dates...');

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const documentsNeedingReview = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: 'APPROVED',
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
        type: 'REVIEW_OVERDUE',
        title: 'Document Review Due',
        body: `Document "${doc.title}" (${doc.reference}) is due for review by ${doc.nextReviewDate?.toISOString().split('T')[0]}.`,
        resourceType: 'Document',
        resourceId: doc.id,
      });
    }

    this.logger.log(
      `Found ${documentsNeedingReview.length} documents needing review`,
    );
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldAuditLogs() {
    this.logger.log('Cleaning up old audit logs...');

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        severity: 'INFO',
        createdAt: { lt: ninetyDaysAgo },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old INFO audit logs`);
  }

  /**
   * Daily digest: notify users with pending actions (8:30 AM)
   */
  @Cron('30 8 * * *')
  async sendPendingTasksDigest() {
    this.logger.log('Sending pending tasks digest...');

    try {
      // Find users with pending signatures
      const pendingSigs = await this.prisma.signatureRequest.findMany({
        where: { status: 'PENDING' },
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
        const docList = sigs.map(s => `• ${s.documentVersion.document.title} (${s.documentVersion.document.reference})`).join('\n');
        await this.notificationsService.create({
          userId: signerId,
          type: 'SIGNATURE_NEEDED',
          title: `Rappel : ${sigs.length} signature(s) en attente`,
          body: `Vous avez ${sigs.length} document(s) en attente de signature :\n\n${docList}\n\nMerci de les traiter dans les meilleurs délais.`,
          resourceType: 'Signature',
        });
      }

      // Find documents with overdue reviews
      const overdueReviews = await this.prisma.document.findMany({
        where: {
          nextReviewDate: { lt: new Date() },
          status: 'APPROVED',
          deletedAt: null,
        },
        include: { owner: { select: { id: true, firstName: true } } },
      });

      for (const doc of overdueReviews) {
        await this.notificationsService.create({
          userId: doc.ownerId,
          type: 'REVIEW_OVERDUE',
          title: `Document en retard de revue : ${doc.title}`,
          body: `Le document "${doc.title}" (${doc.reference}) devait être révisé avant le ${doc.nextReviewDate?.toLocaleDateString('fr-FR')}. Merci de planifier sa revue.`,
          resourceType: 'Document',
          resourceId: doc.id,
        });
      }

      this.logger.log(`Digest sent: ${sigsBySigner.size} signature reminders, ${overdueReviews.length} review reminders`);
    } catch (err) {
      this.logger.error(`Pending tasks digest failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
