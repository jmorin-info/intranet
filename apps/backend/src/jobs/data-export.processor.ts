import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

interface DataExportJobData {
  userId: string;
  exportRequestId: string;
}

@Processor('data-export')
export class DataExportProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExportProcessor.name);
  private readonly exportBasePath: string;

  constructor(private readonly prisma: PrismaService) {
    super();
    this.exportBasePath = process.env.STORAGE_PATH
      ? path.join(process.env.STORAGE_PATH, 'exports')
      : path.join(process.cwd(), 'storage', 'exports');

    if (!fs.existsSync(this.exportBasePath)) {
      fs.mkdirSync(this.exportBasePath, { recursive: true });
    }
  }

  async process(job: Job<DataExportJobData>): Promise<any> {
    const { userId, exportRequestId } = job.data;
    this.logger.log(`Processing data export for user ${userId}`);

    try {
      // Gather all user data
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
          gdprConsentAt: true,
        },
      });

      const documents = await this.prisma.document.findMany({
        where: { ownerId: userId, deletedAt: null },
        select: {
          id: true,
          title: true,
          reference: true,
          category: true,
          status: true,
          createdAt: true,
        },
      });

      const acknowledgments = await this.prisma.documentAcknowledgment.findMany(
        {
          where: { userId },
          include: {
            document: {
              select: { id: true, title: true, reference: true },
            },
          },
        },
      );

      const auditLogs = await this.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          action: true,
          resourceType: true,
          resourceId: true,
          createdAt: true,
          ipAddress: true,
        },
      });

      const notifications = await this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          type: true,
          title: true,
          body: true,
          isRead: true,
          createdAt: true,
        },
      });

      const exportData = {
        exportDate: new Date().toISOString(),
        user,
        documents,
        acknowledgments,
        auditLogs,
        notifications,
      };

      // Write to file
      const fileName = `export-${userId}-${Date.now()}.json`;
      const filePath = path.join(this.exportBasePath, fileName);
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');

      const downloadUrl = `/storage/exports/${fileName}`;

      // Update export request
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

      await this.prisma.dataExportRequest.update({
        where: { id: exportRequestId },
        data: {
          processedAt: new Date(),
          downloadUrl,
          expiresAt,
        },
      });

      this.logger.log(
        `Data export completed for user ${userId}: ${downloadUrl}`,
      );

      return { downloadUrl };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Data export failed for user ${userId}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }
}
