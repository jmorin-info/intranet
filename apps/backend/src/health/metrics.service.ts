import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  private metricsCache: { data: string; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<string> {
    if (this.metricsCache && Date.now() < this.metricsCache.expiresAt) {
      return this.metricsCache.data;
    }

    const [
      userCount, activeUsers, documentCount, ticketCount,
      openTickets, veilleCount, unprocessedVeille,
      notificationCount, auditLogCount, charteCount,
      externalAccessCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.document.count({ where: { deletedAt: null } }),
      this.prisma.ticket.count(),
      this.prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.veilleItem.count(),
      this.prisma.veilleItem.count({ where: { isProcessed: false } }),
      this.prisma.notification.count(),
      this.prisma.auditLog.count(),
      this.prisma.charte.count({ where: { isActive: true } }),
      this.prisma.externalAccess.count({ where: { isActive: true } }),
    ]);

    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    const result = [
      '# HELP omnitech_users_total Total number of users',
      '# TYPE omnitech_users_total gauge',
      `omnitech_users_total ${userCount}`,
      `omnitech_users_active ${activeUsers}`,
      '',
      '# HELP omnitech_documents_total Total documents',
      '# TYPE omnitech_documents_total gauge',
      `omnitech_documents_total ${documentCount}`,
      '',
      '# HELP omnitech_tickets_total Total tickets',
      '# TYPE omnitech_tickets_total gauge',
      `omnitech_tickets_total ${ticketCount}`,
      `omnitech_tickets_open ${openTickets}`,
      '',
      '# HELP omnitech_veille_total Veille cybersecurity items',
      '# TYPE omnitech_veille_total gauge',
      `omnitech_veille_total ${veilleCount}`,
      `omnitech_veille_unprocessed ${unprocessedVeille}`,
      '',
      '# HELP omnitech_chartes_active Active mandatory chartes',
      '# TYPE omnitech_chartes_active gauge',
      `omnitech_chartes_active ${charteCount}`,
      '',
      '# HELP omnitech_external_access_active Active external accesses',
      '# TYPE omnitech_external_access_active gauge',
      `omnitech_external_access_active ${externalAccessCount}`,
      '',
      '# HELP omnitech_notifications_total Total notifications',
      '# TYPE omnitech_notifications_total gauge',
      `omnitech_notifications_total ${notificationCount}`,
      '',
      '# HELP omnitech_audit_logs_total Total audit log entries',
      '# TYPE omnitech_audit_logs_total gauge',
      `omnitech_audit_logs_total ${auditLogCount}`,
      '',
      '# HELP process_uptime_seconds Process uptime',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${Math.floor(uptime)}`,
      '',
      '# HELP process_memory_rss_bytes Resident memory',
      '# TYPE process_memory_rss_bytes gauge',
      `process_memory_rss_bytes ${memUsage.rss}`,
      `process_memory_heap_used_bytes ${memUsage.heapUsed}`,
      `process_memory_heap_total_bytes ${memUsage.heapTotal}`,
    ].join('\n');

    this.metricsCache = { data: result, expiresAt: Date.now() + 120000 }; // 2 min
    return result;
  }
}
