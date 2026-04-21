import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import { statfs } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CpuInfo {
  count: number;
  loadAvg: [number, number, number];
  model: string;
}

export interface MemoryInfo {
  totalMb: number;
  freeMb: number;
  usedMb: number;
  usagePct: number;
}

export interface DiskInfo {
  totalGb: number;
  freeGb: number;
  usedGb: number;
  usagePct: number;
}

export interface UptimeInfo {
  secondsTotal: number;
  bootTime: string;
}

export interface SystemResources {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  uptime: UptimeInfo;
}

export interface HourlyBucket {
  hour: string; // ISO hour start
  count: number;
}

export interface IntranetUsage {
  apiRequests24h: number;
  activeUsers24h: number;
  documentsUploaded24h: number;
  mediaUploaded24h: number;
  hourlyRequests: HourlyBucket[];
}

export interface StoragePerUserRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  documentsBytes: number;
  mediaBytes: number;
  totalBytes: number;
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

@Injectable()
export class SystemMonitoringService {
  private readonly logger = new Logger(SystemMonitoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * CPU / RAM / disk / uptime snapshot of the host VM.
   */
  async getSystemResources(): Promise<SystemResources> {
    const cpus = os.cpus();
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;
    const totalMemMb = Math.round(totalMemBytes / 1024 / 1024);
    const freeMemMb = Math.round(freeMemBytes / 1024 / 1024);
    const usedMemMb = Math.round(usedMemBytes / 1024 / 1024);
    const memUsagePct = totalMemBytes > 0
      ? Math.round((usedMemBytes / totalMemBytes) * 1000) / 10
      : 0;

    const [la1, la5, la15] = os.loadavg();
    const cpu: CpuInfo = {
      count: cpus.length,
      loadAvg: [
        Math.round(la1 * 100) / 100,
        Math.round(la5 * 100) / 100,
        Math.round(la15 * 100) / 100,
      ],
      model: cpus[0]?.model?.trim() ?? 'unknown',
    };

    // Disk stats via statfs on /
    let disk: DiskInfo = { totalGb: 0, freeGb: 0, usedGb: 0, usagePct: 0 };
    try {
      const stats = await statfs('/');
      // bsize * blocks = total, bsize * bavail = available to non-root users
      const totalBytes = Number(stats.bsize) * Number(stats.blocks);
      const freeBytes = Number(stats.bsize) * Number(stats.bavail);
      const usedBytes = totalBytes - freeBytes;
      const totalGb = Math.round((totalBytes / 1024 / 1024 / 1024) * 100) / 100;
      const freeGb = Math.round((freeBytes / 1024 / 1024 / 1024) * 100) / 100;
      const usedGb = Math.round((usedBytes / 1024 / 1024 / 1024) * 100) / 100;
      const usagePct = totalBytes > 0
        ? Math.round((usedBytes / totalBytes) * 1000) / 10
        : 0;
      disk = { totalGb, freeGb, usedGb, usagePct };
    } catch (err) {
      this.logger.warn(`statfs('/') failed: ${(err as Error).message}`);
    }

    const uptimeSec = Math.floor(os.uptime());
    const bootTime = new Date(Date.now() - uptimeSec * 1000).toISOString();

    return {
      cpu,
      memory: {
        totalMb: totalMemMb,
        freeMb: freeMemMb,
        usedMb: usedMemMb,
        usagePct: memUsagePct,
      },
      disk,
      uptime: {
        secondsTotal: uptimeSec,
        bootTime,
      },
    };
  }

  /**
   * Intranet usage stats : API calls, uploads, active users in last 24h.
   */
  async getIntranetUsage(): Promise<IntranetUsage> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [apiRequests24h, activeUsersRows, documentsUploaded24h, mediaUploaded24h, hourlyRows] =
      await Promise.all([
        this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
        this.prisma.auditLog.findMany({
          where: { createdAt: { gte: since }, userId: { not: null } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.documentVersion.count({ where: { createdAt: { gte: since } } }),
        this.prisma.mediaItem.count({ where: { createdAt: { gte: since } } }),
        this.prisma.$queryRawUnsafe<Array<{ hour: Date; count: bigint }>>(
          `
          SELECT date_trunc('hour', "createdAt") AS hour, COUNT(*)::bigint AS count
          FROM "AuditLog"
          WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
          GROUP BY hour
          ORDER BY hour ASC
          `,
        ),
      ]);

    // Build 24 consecutive hourly buckets, fill missing with 0
    const buckets = new Map<string, number>();
    for (const row of hourlyRows) {
      buckets.set(new Date(row.hour).toISOString(), Number(row.count));
    }

    const hourlyRequests: HourlyBucket[] = [];
    const now = new Date();
    const currentHour = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
    );
    for (let i = 23; i >= 0; i--) {
      const h = new Date(currentHour.getTime() - i * 60 * 60 * 1000);
      const key = h.toISOString();
      hourlyRequests.push({ hour: key, count: buckets.get(key) ?? 0 });
    }

    return {
      apiRequests24h,
      activeUsers24h: activeUsersRows.length,
      documentsUploaded24h,
      mediaUploaded24h,
      hourlyRequests,
    };
  }

  /**
   * Storage used per user (documents + medias), Nextcloud-style table.
   * Limit caps the result to the N biggest consumers; small accounts
   * contribute to totals only. Charte signatures are negligible and ignored.
   */
  async getStoragePerUser(limit = 50): Promise<StoragePerUserRow[]> {
    const safeLimit = Math.max(1, Math.min(500, limit));

    // Two aggregate queries, grouped by owning user id.
    // Documents : sum DocumentVersion.fileSizeBytes grouped by document.ownerId.
    const docRows = await this.prisma.$queryRawUnsafe<
      Array<{ ownerId: string; bytes: bigint | null }>
    >(
      `
      SELECT d."ownerId" AS "ownerId",
             COALESCE(SUM(v."fileSizeBytes")::bigint, 0) AS bytes
      FROM "DocumentVersion" v
      JOIN "Document" d ON d.id = v."documentId"
      WHERE d."deletedAt" IS NULL
      GROUP BY d."ownerId"
      `,
    );

    // Media : sum MediaItem.fileSizeBytes grouped by uploadedById.
    const mediaRows = await this.prisma.$queryRawUnsafe<
      Array<{ uploadedById: string; bytes: bigint | null }>
    >(
      `
      SELECT "uploadedById", COALESCE(SUM("fileSizeBytes")::bigint, 0) AS bytes
      FROM "MediaItem"
      GROUP BY "uploadedById"
      `,
    );

    // Combine per user
    const combined = new Map<
      string,
      { documentsBytes: number; mediaBytes: number }
    >();
    for (const row of docRows) {
      const entry = combined.get(row.ownerId) ?? { documentsBytes: 0, mediaBytes: 0 };
      entry.documentsBytes = Number(row.bytes ?? 0n);
      combined.set(row.ownerId, entry);
    }
    for (const row of mediaRows) {
      const entry = combined.get(row.uploadedById) ?? {
        documentsBytes: 0,
        mediaBytes: 0,
      };
      entry.mediaBytes = Number(row.bytes ?? 0n);
      combined.set(row.uploadedById, entry);
    }

    if (combined.size === 0) {
      return [];
    }

    const userIds = Array.from(combined.keys());
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        department: { select: { name: true } },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows: StoragePerUserRow[] = [];
    for (const [userId, sizes] of combined.entries()) {
      const u = userMap.get(userId);
      if (!u) continue; // user deleted or missing
      rows.push({
        userId,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        department: u.department?.name ?? null,
        documentsBytes: sizes.documentsBytes,
        mediaBytes: sizes.mediaBytes,
        totalBytes: sizes.documentsBytes + sizes.mediaBytes,
      });
    }

    rows.sort((a, b) => b.totalBytes - a.totalBytes);
    return rows.slice(0, safeLimit);
  }
}
