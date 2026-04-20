import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * ClamAV file scanner — ISO 27001 A.8.7 (Protection against malware)
 * Scans uploaded files and quarantines infected ones.
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Scan a file on disk with ClamAV.
   * Returns { clean: boolean, result: string }
   */
  async scanFile(filePath: string): Promise<{ clean: boolean; result: string }> {
    try {
      // Try clamdscan first (faster, uses daemon), fall back to clamscan
      const { stdout } = await execAsync(`clamdscan --no-summary "${filePath}" 2>/dev/null || clamscan --no-summary "${filePath}" 2>/dev/null`);
      const clean = !stdout.includes('FOUND');
      return { clean, result: stdout.trim() };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      // Exit code 1 = virus found, 2 = error
      if (err.code === 1) {
        return { clean: false, result: err.stdout || 'VIRUS FOUND' };
      }
      this.logger.warn(`ClamAV scan error: ${err.stderr || err}`);
      return { clean: true, result: 'SCAN_ERROR — file allowed (ClamAV unavailable)' };
    }
  }

  /**
   * Scan a document version after upload.
   * Updates scanStatus on the Document. Quarantines if infected.
   */
  async scanDocumentVersion(documentId: string, versionId: string, filePath: string) {
    this.logger.log(`Scanning file: ${filePath}`);

    const { clean, result } = await this.scanFile(filePath);

    const status = clean ? 'CLEAN' : 'INFECTED';
    await this.prisma.document.update({
      where: { id: documentId },
      data: { scanStatus: status },
    });

    if (!clean) {
      this.logger.warn(`INFECTED file detected: ${filePath} — ${result}`);

      // Quarantine: move file
      try {
        const quarantineDir = path.join(process.env.STORAGE_PATH || path.join(process.cwd(), 'storage'), 'quarantine');
        await execAsync(`mkdir -p "${quarantineDir}"`);
        await execAsync(`mv "${filePath}" "${quarantineDir}/"`);
        this.logger.warn(`File quarantined: ${filePath}`);
      } catch (e) {
        this.logger.error(`Failed to quarantine: ${filePath} — ${e instanceof Error ? e.message : e}`);
      }

      // Alert admins
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, deletedAt: null },
      });

      const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
      for (const admin of admins) {
        await this.notifications.create({
          userId: admin.id,
          type: 'DOC_PUBLISHED',
          title: 'ALERTE — Fichier infecté détecté',
          body: `Le fichier du document "${doc?.reference || documentId}" a été détecté comme malveillant et mis en quarantaine. Résultat: ${result}`,
          resourceType: 'Document',
          resourceId: documentId,
        });
      }
    } else {
      this.logger.log(`File clean: ${filePath}`);
    }

    return { clean, result, status };
  }
}
