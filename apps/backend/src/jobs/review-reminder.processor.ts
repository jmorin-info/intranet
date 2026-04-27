import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Processor('review-reminders')
export class ReviewReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue('review-reminders') private readonly reviewQueue: Queue,
  ) {
    super();
  }

  @Cron('0 8 * * *') // Daily at 8:00 AM
  async scheduleReviewReminders() {
    this.logger.log('Scheduling review reminder check');
    await this.reviewQueue.add('check-reviews', {});
  }

  async process(_job: Job): Promise<any> {
    this.logger.log('Processing review reminders');

    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    // Documents due today
    const dueToday = await this.findDocumentsDueOn(now);
    for (const doc of dueToday) {
      if (await this.alreadyNotifiedToday(doc)) continue;
      await this.sendReviewReminder(doc, "aujourd'hui");
    }

    // Documents due in 7 days
    const dueIn7 = await this.findDocumentsDueOn(in7Days);
    for (const doc of dueIn7) {
      if (await this.alreadyNotifiedToday(doc)) continue;
      await this.sendReviewReminder(doc, 'dans 7 jours');
    }

    // Documents due in 30 days
    const dueIn30 = await this.findDocumentsDueOn(in30Days);
    for (const doc of dueIn30) {
      if (await this.alreadyNotifiedToday(doc)) continue;
      await this.sendReviewReminder(doc, 'dans 30 jours');
    }

    this.logger.log(
      `Review reminders sent: ${dueToday.length} today, ${dueIn7.length} in 7 days, ${dueIn30.length} in 30 days`,
    );
  }

  private async alreadyNotifiedToday(doc: { id: string; ownerId: string }): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingNotif = await this.prisma.notification.findFirst({
      where: {
        userId: doc.ownerId,
        resourceType: 'Document',
        resourceId: doc.id,
        type: 'REVIEW_OVERDUE',
        createdAt: { gte: today },
      },
    });
    return !!existingNotif;
  }

  private async sendReviewReminder(doc: { id: string; title: string; reference: string; ownerId: string }, reminderType: string) {
    await this.notificationsService.create({
      userId: doc.ownerId,
      type: 'REVIEW_OVERDUE',
      title: `Revue documentaire ${reminderType}`,
      body: `Le document "${doc.title}" (${doc.reference}) nécessite une revue.`,
      resourceType: 'Document',
      resourceId: doc.id,
    });
  }

  private async findDocumentsDueOn(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: 'APPROVED',
        nextReviewDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        id: true,
        title: true,
        reference: true,
        ownerId: true,
      },
    });
  }
}
