import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { RequestUser } from '../common/interfaces';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';
import { UploadItExportDto } from './dto/upload-it-export.dto';
import {
  ALLOWED_IT_EXPORT_EXTENSIONS,
  IT_EXPORT_CATEGORIES,
  isItExportCategory,
} from './it-export-categories.constants';

interface FindAllFilters {
  category?: string;
  period?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ItExportsService {
  private readonly logger = new Logger(ItExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Return the predefined list of IT export categories.
   * This is a static list — frontend uses it to render the grid.
   */
  getCategories() {
    return IT_EXPORT_CATEGORIES;
  }

  /**
   * Paginated list of IT exports (non-deleted).
   * Supports filtering by category, report period and free-text search
   * across file name, original name, description and tags.
   */
  async findAll(filters: FindAllFilters = {}) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));

    const where: any = { deletedAt: null };

    if (filters.category && isItExportCategory(filters.category)) {
      where.category = filters.category;
    }
    if (filters.period) {
      where.reportPeriod = filters.period;
    }
    if (filters.search && filters.search.trim().length > 0) {
      const q = filters.search.trim();
      where.OR = [
        { fileName: { contains: q, mode: 'insensitive' } },
        { originalName: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.itExport.findMany({
        where,
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.itExport.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const exportRecord = await this.prisma.itExport.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!exportRecord || exportRecord.deletedAt) {
      throw new NotFoundException('IT export not found');
    }

    return exportRecord;
  }

  /**
   * Persist an uploaded file on disk + DB record.
   * Files live under `it-exports/{category}/{year}/{uuid}.ext`.
   */
  async upload(
    file: Express.Multer.File,
    dto: UploadItExportDto,
    userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate category (double-check in case validation pipe was skipped)
    if (!isItExportCategory(dto.category)) {
      throw new BadRequestException(`Invalid category: ${dto.category}`);
    }

    // Whitelist file extension
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
    if (!ALLOWED_IT_EXPORT_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `File extension ".${ext}" is not allowed. Allowed: ${ALLOWED_IT_EXPORT_EXTENSIONS.join(', ')}`,
      );
    }

    // Organize storage: it-exports/{category}/{year}
    const year = new Date().getFullYear();
    const directory = `it-exports/${dto.category}/${year}`;

    const { filePath, fileUrl } = await this.storage.upload(file, directory);
    const fileName = path.basename(fileUrl);

    const created = await this.prisma.itExport.create({
      data: {
        category: dto.category,
        fileName,
        originalName: file.originalname,
        filePath: fileUrl, // keep the logical storage URL for downloads
        fileSize: file.size,
        mimeType: file.mimetype || null,
        description: dto.description || null,
        uploadedById: userId,
        reportPeriod: dto.reportPeriod || null,
        tags: dto.tags && dto.tags.length > 0 ? dto.tags : [],
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await this.audit.log({
      userId,
      action: 'IT_EXPORT_UPLOADED',
      resourceType: 'ItExport',
      resourceId: created.id,
      metadata: {
        category: dto.category,
        fileName,
        originalName: file.originalname,
        fileSize: file.size,
        reportPeriod: dto.reportPeriod || null,
        physicalPath: filePath,
      },
      severity: 'INFO',
    });

    this.logger.log(
      `IT export uploaded: ${created.id} (${dto.category}, ${file.size} bytes) by ${userId}`,
    );

    return created;
  }

  /**
   * Return a readable stream + metadata for an existing export.
   * Logs a download audit entry for ISO 27001 traceability (A.8.15).
   */
  async download(id: string, user: RequestUser) {
    const exportRecord = await this.findById(id);

    // findById already throws if deleted/not found
    const stream = this.storage.getFileStream(exportRecord.filePath);

    await this.audit.log({
      userId: user.id,
      action: 'IT_EXPORT_DOWNLOADED',
      resourceType: 'ItExport',
      resourceId: exportRecord.id,
      metadata: {
        category: exportRecord.category,
        fileName: exportRecord.fileName,
        originalName: exportRecord.originalName,
      },
      severity: 'INFO',
    });

    return {
      stream,
      record: exportRecord,
    };
  }

  /**
   * Soft-delete: mark as deleted but keep the row for audit.
   * Only SUPER_ADMIN or the uploader (if still admin) may delete.
   */
  async softDelete(id: string, user: RequestUser) {
    const exportRecord = await this.prisma.itExport.findUnique({
      where: { id },
    });
    if (!exportRecord || exportRecord.deletedAt) {
      throw new NotFoundException('IT export not found');
    }

    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    if (userLevel < ROLE_HIERARCHY[UserRole.SUPER_ADMIN]) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can delete IT exports',
      );
    }

    const deleted = await this.prisma.itExport.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      action: 'IT_EXPORT_DELETED',
      resourceType: 'ItExport',
      resourceId: id,
      metadata: {
        category: exportRecord.category,
        originalName: exportRecord.originalName,
        fileName: exportRecord.fileName,
      },
      severity: 'WARN',
    });

    return deleted;
  }

  /**
   * Aggregated statistics for the dashboard:
   *  - count per category
   *  - last upload date per category
   *  - total size per category + global
   */
  async getStats() {
    const all = await this.prisma.itExport.findMany({
      where: { deletedAt: null },
      select: {
        category: true,
        fileSize: true,
        createdAt: true,
      },
    });

    const byCategory: Record<
      string,
      { count: number; totalSize: number; lastUploadAt: Date | null }
    > = {};

    for (const cat of IT_EXPORT_CATEGORIES) {
      byCategory[cat.code] = { count: 0, totalSize: 0, lastUploadAt: null };
    }

    let totalCount = 0;
    let totalSize = 0;
    let globalLastUpload: Date | null = null;

    for (const row of all) {
      const bucket =
        byCategory[row.category] ||
        (byCategory[row.category] = {
          count: 0,
          totalSize: 0,
          lastUploadAt: null,
        });
      bucket.count += 1;
      bucket.totalSize += row.fileSize || 0;
      if (!bucket.lastUploadAt || row.createdAt > bucket.lastUploadAt) {
        bucket.lastUploadAt = row.createdAt;
      }
      totalCount += 1;
      totalSize += row.fileSize || 0;
      if (!globalLastUpload || row.createdAt > globalLastUpload) {
        globalLastUpload = row.createdAt;
      }
    }

    return {
      totals: {
        count: totalCount,
        totalSize,
        lastUploadAt: globalLastUpload,
      },
      byCategory,
    };
  }

  /**
   * Utility used by the controller to verify that a physical file exists
   * before streaming it — avoids a half-written response on missing files.
   */
  physicalFileExists(fileUrl: string): boolean {
    try {
      const abs = this.storage.getFilePath(fileUrl);
      return fs.existsSync(abs);
    } catch {
      return false;
    }
  }

  /**
   * Parse a Veeam JSON report to extract KPIs.
   * Returns the parsed report of the latest month available, or null
   * if no VEEAM_BACKUP JSON export has been uploaded yet.
   *
   * Used by the "Dernier rapport Veeam" widget on the IT exports page.
   * ISO 27001: A.8.13 (Information backup) / A.5.30 (ICT readiness).
   */
  async getVeeamLatestReport() {
    const latest = await this.prisma.itExport.findFirst({
      where: {
        category: 'VEEAM_BACKUP',
        deletedAt: null,
        OR: [
          { fileName: { endsWith: '.json' } },
          { originalName: { endsWith: '.json' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!latest) return null;

    try {
      const filePath = this.storage.getFilePath(latest.filePath);
      if (!fs.existsSync(filePath)) {
        this.logger.warn(
          `Veeam report ${latest.id} physical file missing: ${filePath}`,
        );
        return null;
      }
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      return {
        reportId: latest.id,
        reportPeriod: data.reportPeriod || latest.reportPeriod || null,
        generatedAt: data.generatedAt || null,
        generatedBy: data.generatedBy || null,
        generatedOn: data.generatedOn || null,
        uploadedAt: latest.createdAt,
        uploadedBy: latest.uploadedBy,
        originalName: latest.originalName,
        fileSize: latest.fileSize,
        summary: data.summary || null,
        jobsCount: Array.isArray(data.jobs) ? data.jobs.length : 0,
        jobs: Array.isArray(data.jobs) ? data.jobs.slice(0, 50) : [],
        alerts: Array.isArray(data.alerts) ? data.alerts : [],
        restoreTests: Array.isArray(data.restoreTests) ? data.restoreTests : [],
        iso27001Compliance: data.iso27001Compliance || null,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to parse Veeam report ${latest.id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return {
        reportId: latest.id,
        reportPeriod: latest.reportPeriod,
        uploadedAt: latest.createdAt,
        uploadedBy: latest.uploadedBy,
        originalName: latest.originalName,
        fileSize: latest.fileSize,
        parseError: true,
        summary: null,
        jobsCount: 0,
        jobs: [],
        alerts: [],
        restoreTests: [],
        iso27001Compliance: null,
      };
    }
  }
}
