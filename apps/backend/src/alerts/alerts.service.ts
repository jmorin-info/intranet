import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(activeOnly = true) {
    const where: any = {};
    if (activeOnly) {
      where.isActive = true;
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }
    return this.prisma.securityAlert.findMany({
      where,
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { reads: true } },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findActive(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    const [data, total] = await Promise.all([
      this.prisma.securityAlert.findMany({
        where,
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { reads: true } },
        },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.securityAlert.count({ where }),
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

  async create(data: { title: string; content: string; severity: string; expiresAt?: string }, authorId: string) {
    const alert = await this.prisma.securityAlert.create({
      data: {
        title: data.title,
        content: data.content,
        severity: data.severity || 'P3',
        authorId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });

    // Notify all active users
    const users = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });

    for (const user of users) {
      await this.notifications.create({
        userId: user.id,
        type: 'DOC_PUBLISHED',
        title: `[${data.severity}] ${data.title}`,
        body: data.content.substring(0, 200),
        resourceType: 'SecurityAlert',
        resourceId: alert.id,
      });
    }

    return alert;
  }

  async markRead(alertId: string, userId: string) {
    return this.prisma.securityAlertRead.upsert({
      where: { alertId_userId: { alertId, userId } },
      create: { alertId, userId },
      update: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const active = await this.prisma.securityAlert.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });

    const alreadyRead = await this.prisma.securityAlertRead.findMany({
      where: { userId, alertId: { in: active.map(a => a.id) } },
      select: { alertId: true },
    });

    const readIds = new Set(alreadyRead.map(r => r.alertId));
    const unreadIds = active.filter(a => !readIds.has(a.id)).map(a => a.id);

    if (unreadIds.length === 0) return { markedCount: 0 };

    await this.prisma.securityAlertRead.createMany({
      data: unreadIds.map(alertId => ({ alertId, userId })),
      skipDuplicates: true,
    });

    return { markedCount: unreadIds.length };
  }

  async getStats() {
    const where: any = {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    const alerts = await this.prisma.securityAlert.findMany({
      where,
      select: { severity: true, id: true },
    });

    const bySeverity: Record<string, number> = {};
    for (const alert of alerts) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
    }

    const totalActive = alerts.length;
    const totalAll = await this.prisma.securityAlert.count();

    // Read rate: total unique readers across all active alerts / total active users
    const totalActiveUsers = await this.prisma.user.count({
      where: { isActive: true, deletedAt: null },
    });

    const activeAlertIds = alerts.map(a => a.id);
    const uniqueReaders = activeAlertIds.length > 0
      ? await this.prisma.securityAlertRead.groupBy({
          by: ['userId'],
          where: { alertId: { in: activeAlertIds } },
        })
      : [];

    const readRatePercent = totalActiveUsers > 0
      ? Math.round((uniqueReaders.length / totalActiveUsers) * 100)
      : 0;

    // Users who haven't read the latest critical (P1) alert
    const latestCritical = await this.prisma.securityAlert.findFirst({
      where: { severity: 'P1', isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true },
    });

    let nonReadersOfCritical: Array<{ id: string; firstName: string; lastName: string; email: string }> = [];
    if (latestCritical) {
      const readers = await this.prisma.securityAlertRead.findMany({
        where: { alertId: latestCritical.id },
        select: { userId: true },
      });
      const readerIds = readers.map(r => r.userId);

      nonReadersOfCritical = await this.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          id: { notIn: readerIds.length > 0 ? readerIds : ['__none__'] },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: { lastName: 'asc' },
      });
    }

    return {
      totalActive,
      totalAll,
      bySeverity,
      readRatePercent,
      totalActiveUsers,
      totalReaders: uniqueReaders.length,
      latestCriticalAlert: latestCritical || null,
      nonReadersOfCritical,
    };
  }

  async getUnreadForUser(userId: string) {
    const active = await this.prisma.securityAlert.findMany({
      where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { id: true },
    });

    const read = await this.prisma.securityAlertRead.findMany({
      where: { userId, alertId: { in: active.map(a => a.id) } },
      select: { alertId: true },
    });

    const readIds = new Set(read.map(r => r.alertId));
    const unreadIds = active.filter(a => !readIds.has(a.id)).map(a => a.id);

    return this.prisma.securityAlert.findMany({
      where: { id: { in: unreadIds } },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
