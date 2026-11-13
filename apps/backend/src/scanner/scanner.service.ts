import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

export type ScanStatus = 'CLEAN' | 'INFECTED' | 'ERROR';
export interface ScanResult { clean: boolean; result: string; status: ScanStatus }

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A daemon failure is not evidence that a file is safe. */
  async scanFile(filePath: string): Promise<ScanResult> {
    return new Promise((resolve) => {
      execFile('clamdscan', ['--no-summary', '--', filePath], {
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      }, (error, stdout) => {
        const output = String(stdout || '').trim();
        if (!error) {
          resolve({ clean: true, result: output || 'OK', status: 'CLEAN' });
        } else if (error.code === 1 && !error.killed) {
          resolve({ clean: false, result: output || 'VIRUS FOUND', status: 'INFECTED' });
        } else {
          this.logger.warn('ClamAV unavailable or scan incomplete; file remains unverified');
          resolve({ clean: false, result: 'SCAN_ERROR — contrôle antivirus non terminé', status: 'ERROR' });
        }
      });
    });
  }

  async scanDocumentVersion(documentId: string, versionId: string, filePath: string) {
    const result = await this.scanFile(filePath);
    // An older scan must never mark a more recent upload CLEAN.
    await this.prisma.document.updateMany({
      where: { id: documentId, currentVersionId: versionId, deletedAt: null },
      data: { scanStatus: result.status },
    });

    if (result.status === 'INFECTED') {
      const quarantineDir = path.join(
        process.env.STORAGE_PATH || path.join(process.cwd(), 'storage'), 'quarantine',
      );
      try {
        await fs.mkdir(quarantineDir, { recursive: true });
        await fs.rename(filePath, path.join(quarantineDir, `${versionId}-${path.basename(filePath)}`));
      } catch {
        // The document is still INFECTED even when filesystem quarantine fails.
        this.logger.error('Unable to move infected attachment to quarantine');
      }
      const [admins, document] = await Promise.all([
        this.prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, deletedAt: null },
          select: { id: true },
        }),
        this.prisma.document.findUnique({ where: { id: documentId }, select: { reference: true } }),
      ]);
      for (const admin of admins) {
        await this.notifications.create({
          userId: admin.id,
          type: 'SECURITY_ALERT',
          title: 'Fichier infecté détecté',
          body: `Le contrôle antivirus du document « ${document?.reference || documentId} » a détecté un fichier infecté. Vérifiez sa mise en quarantaine.`,
          resourceType: 'Document', resourceId: documentId,
        });
      }
    }
    return result;
  }
}
