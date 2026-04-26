import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditSeverity } from '../common/enums';

export interface AuditLogParams {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  severity?: 'INFO' | 'WARN' | 'CRITICAL';
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée une entrée d'audit log.
   *
   * Conformité ISO 27001 A.5.33 & A.5.28 (conservation des preuves) :
   * - Un snapshot de l'acteur (email, nom, rôle, département) est automatiquement
   *   capturé et stocké dans `metadata.actorSnapshot` pour garantir la traçabilité
   *   même en cas de suppression ultérieure du compte utilisateur.
   * - La relation `userId → User` est en `onDelete: SetNull`, donc si le user
   *   est hard-deleted, le log reste consultable avec le snapshot.
   * - La politique de rétention des audit logs est de 3 ans minimum
   *   (RETENTION_AUDIT_KEEP_DAYS=1825).
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      // Capture un snapshot de l'acteur pour préserver la preuve même si
      // le compte utilisateur est supprimé ultérieurement.
      let actorSnapshot: Record<string, unknown> | null = null;
      if (params.userId) {
        try {
          const actor = await this.prisma.user.findUnique({
            where: { id: params.userId },
            select: {
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              departmentId: true,
              department: { select: { name: true, code: true } },
            },
          });
          if (actor) {
            actorSnapshot = {
              email: actor.email,
              firstName: actor.firstName,
              lastName: actor.lastName,
              role: actor.role,
              departmentId: actor.departmentId,
              departmentName: actor.department?.name || null,
              departmentCode: actor.department?.code || null,
              capturedAt: new Date().toISOString(),
            };
          }
        } catch {
          // Échec du snapshot — on poursuit sans, pour ne pas bloquer l'audit
        }
      }

      const mergedMetadata = {
        ...(params.metadata || {}),
        ...(actorSnapshot ? { actorSnapshot } : {}),
      };

      await this.prisma.auditLog.create({
        data: {
          userId: params.userId || null,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId || null,
          // Prisma.InputJsonValue ne tolère pas notre Record<string, unknown> :
          // on cast localement vers JsonValue (legitimate JSON escape hatch).
          metadata: mergedMetadata as Prisma.InputJsonValue,
          severity: params.severity || 'INFO',
        },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to create audit log: ${err.message}`, err.stack);
    }
  }

  async findAll(filters?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    severity?: string;
    bulk?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters?.resourceType) where.resourceType = filters.resourceType;
    if (filters?.severity) {
      const validSeverities = Object.values(AuditSeverity) as string[];
      if (validSeverities.includes(filters.severity)) {
        where.severity = filters.severity;
      }
    }

    // Filtre bulk=true : toutes les opérations en masse estampillent
    // `metadata.bulk = true` + `metadata.batchSize` (voir tickets/documents
    // bulk services). Permet aux admins de retrouver rapidement les actions
    // groupées dans le journal ISO 27001 A.5.36.
    if (filters?.bulk) {
      where.metadata = { path: ['bulk'], equals: true };
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }

    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 100);

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
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

  /**
   * Statistiques d'audit pour le rapport trimestriel.
   * ISO 27001 A.5.36 — Surveillance et revue du journal d'audit.
   *
   * Renvoie :
   *  - `total` : nombre total d'événements sur la période
   *  - `bySeverity` : répartition INFO / WARN / CRITICAL
   *  - `topActions` : top 5 des actions les plus fréquentes
   *  - `criticalEvents` : liste complète des événements CRITICAL (max 100)
   *  - `failedLogins` : nombre de tentatives `LOGIN_FAILED`
   *  - `topFailedLoginIps` : top 10 IPs sur les échecs de connexion (via metadata)
   */
  async getStats(from: Date, to: Date) {
    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: from, lte: to },
    };

    const [total, severityGroups, actionGroups, criticalEvents, failedLogins, failedLoginLogs] =
      await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.groupBy({
          by: ['severity'],
          where,
          _count: { _all: true },
        }),
        this.prisma.auditLog.groupBy({
          by: ['action'],
          where,
          _count: { _all: true },
          orderBy: { _count: { action: 'desc' } },
          take: 5,
        }),
        this.prisma.auditLog.findMany({
          where: { ...where, severity: AuditSeverity.CRITICAL },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.auditLog.count({
          where: { ...where, action: { contains: 'LOGIN_FAILED', mode: 'insensitive' } },
        }),
        this.prisma.auditLog.findMany({
          where: { ...where, action: { contains: 'LOGIN_FAILED', mode: 'insensitive' } },
          select: { ipAddress: true, metadata: true },
          take: 1000,
        }),
      ]);

    // Agrégat top 10 IPs sur les échecs de login (ipAddress ou metadata.ip)
    const ipCounts = new Map<string, number>();
    for (const row of failedLoginLogs) {
      const metaIp =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as any).ip || (row.metadata as any).ipAddress
          : null;
      const ip = row.ipAddress || metaIp || 'inconnue';
      ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    }
    const topFailedLoginIps = Array.from(ipCounts.entries())
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const bySeverity = { INFO: 0, WARN: 0, CRITICAL: 0 } as Record<string, number>;
    for (const g of severityGroups) {
      bySeverity[g.severity as string] = g._count._all;
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      total,
      bySeverity,
      topActions: actionGroups.map((g) => ({ action: g.action, count: g._count._all })),
      criticalEvents,
      failedLogins,
      topFailedLoginIps,
    };
  }

  async findByResource(resourceType: string, resourceId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        resourceType,
        resourceId,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
