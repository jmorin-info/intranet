import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const BACKUP_DIR = '/var/backups/omnitech';

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
  type: 'db' | 'storage' | 'unknown';
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Liste les fichiers de backup dans /var/backups/omnitech/
   */
  async listBackups(): Promise<BackupFile[]> {
    try {
      await fs.promises.access(BACKUP_DIR, fs.constants.R_OK);
    } catch {
      this.logger.warn(`Backup directory ${BACKUP_DIR} does not exist or is not readable`);
      return [];
    }

    const entries = await fs.promises.readdir(BACKUP_DIR);
    const backups: BackupFile[] = [];

    for (const entry of entries) {
      const fullPath = path.join(BACKUP_DIR, entry);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile()) continue;

        backups.push({
          filename: entry,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          type: this.detectType(entry),
        });
      } catch {
        // skip unreadable files
      }
    }

    return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Lance un backup immédiat via le script backup.sh
   */
  async exportBackup(userId: string, ipAddress?: string): Promise<{ success: boolean; message: string }> {
    const scriptPath = path.resolve(__dirname, '../../../../scripts/backup.sh');

    try {
      const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`, {
        timeout: 300_000, // 5 min max
        env: { ...process.env },
      });

      this.logger.log(`Backup export completed: ${stdout}`);
      if (stderr) this.logger.warn(`Backup stderr: ${stderr}`);

      await this.auditService.log({
        userId,
        ipAddress,
        action: 'BACKUP_EXPORT',
        resourceType: 'BACKUP',
        severity: 'INFO',
        metadata: { stdout: stdout.slice(0, 500) },
      });

      return { success: true, message: 'Backup completed successfully' };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Backup export failed: ${err.message}`, err.stack);

      await this.auditService.log({
        userId,
        ipAddress,
        action: 'BACKUP_EXPORT_FAILED',
        resourceType: 'BACKUP',
        severity: 'CRITICAL',
        metadata: { error: err.message },
      });

      return { success: false, message: `Backup failed: ${err.message}` };
    }
  }

  /**
   * Retourne le chemin complet d'un fichier backup (validé)
   */
  getBackupFilePath(filename: string): string {
    // Sanitize: empêcher path traversal
    const sanitized = path.basename(filename);
    const fullPath = path.join(BACKUP_DIR, sanitized);

    if (!fs.existsSync(fullPath)) {
      throw new BadRequestException(`Backup file not found: ${sanitized}`);
    }

    return fullPath;
  }

  /**
   * Restore un fichier backup uploadé
   */
  async restoreBackup(
    file: Express.Multer.File,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const filename = file.originalname;

    // Audit AVANT la restauration (action critique)
    await this.auditService.log({
      userId,
      ipAddress,
      userAgent,
      action: 'BACKUP_RESTORE_STARTED',
      resourceType: 'BACKUP',
      severity: 'CRITICAL',
      metadata: { filename, size: file.size },
    });

    try {
      if (filename.endsWith('.sql.gz')) {
        await this.restoreDatabase(file);
      } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
        await this.restoreStorage(file);
      } else {
        throw new BadRequestException(
          'Unsupported file format. Expected .sql.gz or .tar.gz',
        );
      }

      await this.auditService.log({
        userId,
        ipAddress,
        userAgent,
        action: 'BACKUP_RESTORE_COMPLETED',
        resourceType: 'BACKUP',
        severity: 'CRITICAL',
        metadata: { filename, size: file.size },
      });

      return { success: true, message: `Restore completed: ${filename}` };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Restore failed: ${err.message}`, err.stack);

      await this.auditService.log({
        userId,
        ipAddress,
        userAgent,
        action: 'BACKUP_RESTORE_FAILED',
        resourceType: 'BACKUP',
        severity: 'CRITICAL',
        metadata: { filename, error: err.message },
      });

      // Pas de err.message dans la reponse HTTP : la cause est loggee + auditee
      // ci-dessus. Eviter de fuir des chemins / noms de table / details internes
      // au client (best practice, surtout si un jour ce endpoint sort de l'admin).
      throw new BadRequestException(
        'La restauration a échoué. Consultez les logs serveur pour le détail.',
      );
    }
  }

  /**
   * Supprime un fichier de backup
   */
  async deleteBackup(
    filename: string,
    userId: string,
    ipAddress?: string,
  ): Promise<void> {
    const fullPath = this.getBackupFilePath(filename);
    await fs.promises.unlink(fullPath);

    await this.auditService.log({
      userId,
      ipAddress,
      action: 'BACKUP_DELETE',
      resourceType: 'BACKUP',
      resourceId: filename,
      severity: 'WARN',
      metadata: { filename },
    });
  }

  /**
   * Lance un backup complet (projet + DB + storage) et le copie sur le partage réseau.
   */
  async exportFullToNetwork(userId: string, ipAddress?: string): Promise<{ success: boolean; message: string }> {
    const scriptPath = path.resolve(__dirname, '../../../../scripts/backup-full.sh');

    try {
      const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`, {
        timeout: 600_000,
        env: { ...process.env },
      });

      this.logger.log(`Full backup completed: ${stdout}`);
      if (stderr) this.logger.warn(`Full backup stderr: ${stderr}`);

      await this.auditService.log({
        userId,
        ipAddress,
        action: 'BACKUP_FULL_NETWORK',
        resourceType: 'BACKUP',
        severity: 'INFO',
        metadata: { stdout: stdout.slice(-500) },
      });

      return { success: true, message: 'Sauvegarde complète envoyée sur le partage réseau' };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Full backup failed: ${err.message}`, err.stack);
      return { success: false, message: `Échec : ${err.message}` };
    }
  }

  /**
   * Crée une archive tar.gz du projet complet (code + DB + storage) et retourne le chemin.
   */
  async createDownloadableArchive(userId: string, ipAddress?: string): Promise<string> {
    const projectDir = path.resolve(__dirname, '../../../..');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archivePath = path.join('/tmp', `omnitech-download-${timestamp}.tar.gz`);

    try {
      // DB dump
      const dbDumpPath = path.join('/tmp', `dl-db-${timestamp}.sql.gz`);
      const dbUrl = process.env.DATABASE_URL || '';
      await execAsync(
        `pg_dump "${dbUrl}" --no-owner --no-acl --clean --if-exists | gzip > "${dbDumpPath}"`,
        { timeout: 120_000 },
      );

      // Archive: code + DB + storage + .env + RESTORE.md
      const excludes = [
        '--exclude=node_modules',
        '--exclude=.next',
        '--exclude=dist',
        '--exclude=.turbo',
        '--exclude=*.log',
      ].join(' ');

      await execAsync(
        `tar -czf "${archivePath}" ${excludes} -C "$(dirname "${projectDir}")" "$(basename "${projectDir}")" -C /tmp "$(basename "${dbDumpPath}")"`,
        { timeout: 300_000 },
      );

      // Cleanup temp DB dump
      await fs.promises.unlink(dbDumpPath).catch(() => {});

      await this.auditService.log({
        userId,
        ipAddress,
        action: 'BACKUP_DOWNLOAD_CREATED',
        resourceType: 'BACKUP',
        severity: 'INFO',
        metadata: { archivePath },
      });

      return archivePath;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Download archive creation failed: ${err.message}`);
      // Cf. note ci-dessus : pas de details internes dans la reponse HTTP.
      throw new BadRequestException(
        "Impossible de créer l'archive. Consultez les logs serveur pour le détail.",
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private detectType(filename: string): 'db' | 'storage' | 'unknown' {
    if (filename.includes('sql') || filename.includes('db') || filename.includes('postgres')) {
      return 'db';
    }
    if (filename.includes('storage') || filename.includes('files') || filename.includes('uploads')) {
      return 'storage';
    }
    return 'unknown';
  }

  private async restoreDatabase(file: Express.Multer.File): Promise<void> {
    // Write uploaded file to temp location
    const tmpPath = path.join('/tmp', `restore-${Date.now()}.sql.gz`);
    await fs.promises.writeFile(tmpPath, file.buffer);

    try {
      const dbUrl = process.env.DATABASE_URL || '';
      // pg_restore for compressed SQL dumps
      await execAsync(
        `gunzip -c "${tmpPath}" | psql "${dbUrl}"`,
        { timeout: 600_000 },
      );
    } finally {
      // Cleanup temp file
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  private async restoreStorage(file: Express.Multer.File): Promise<void> {
    const tmpPath = path.join('/tmp', `restore-${Date.now()}.tar.gz`);
    await fs.promises.writeFile(tmpPath, file.buffer);

    const storageDir = process.env.STORAGE_DIR || '/root/omnitech-intranet/storage';

    try {
      await execAsync(
        `tar -xzf "${tmpPath}" -C "${storageDir}"`,
        { timeout: 600_000 },
      );
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }
}
