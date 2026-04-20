import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dashboard consolidé pour le RSSI : agrège les KPI de tous les modules
 * de l'intranet en un seul endpoint optimisé.
 *
 * Utilisé par la page /admin/rssi-dashboard et par des écrans muraux
 * internes (différent du mode /kiosk qui est public et sanitisé).
 *
 * ISO 27001 A.5.35 / A.5.36 (revue de direction, indicateurs).
 */
@Injectable()
export class RssiDashboardService {
  private readonly logger = new Logger(RssiDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retourne un snapshot complet des indicateurs clés.
   * Toutes les requêtes sont parallélisées et chaque erreur est
   * capturée individuellement pour éviter qu'une seule requête en panne
   * casse tout le dashboard.
   */
  async getSnapshot() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const safe = <T>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      p.catch((err) => {
        this.logger.warn(`rssi-dashboard[${label}]: ${err?.message || err}`);
        return fallback;
      });

    const [
      // Incidents
      openIncidents,
      criticalIncidents,
      incidentsThisMonth,
      // Documents
      docsInReview,
      docsApprovedLast30d,
      docsDueForReview,
      // Tickets
      openTickets,
      ticketsAvgResolutionHours,
      // Veille
      alertsLast7d,
      alertsCritical,
      // Chartes
      chartesActive,
      chartesPendingSignatures,
      // Utilisateurs
      activeUsers,
      mfaEnabledUsers,
      // Access reviews
      accessReviewsPending,
      accessReviewsOverdue,
      // Audit
      auditEventsLast24h,
      failedLoginsLast24h,
    ] = await Promise.all([
      safe(
        this.prisma.incident.count({
          where: { status: { notIn: ['CLOSED', 'RECOVERED'] as any } },
        }),
        0,
        'openIncidents',
      ),
      safe(
        this.prisma.incident.count({
          where: { severity: 'CRITICAL' as any, status: { notIn: ['CLOSED'] as any } },
        }),
        0,
        'criticalIncidents',
      ),
      safe(
        this.prisma.incident.count({
          where: {
            detectedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
          },
        }),
        0,
        'incidentsThisMonth',
      ),
      safe(
        this.prisma.document.count({ where: { status: 'IN_REVIEW' as any } }),
        0,
        'docsInReview',
      ),
      safe(
        this.prisma.document.count({
          where: {
            status: 'APPROVED' as any,
            updatedAt: { gte: thirtyDaysAgo },
          },
        }),
        0,
        'docsApprovedLast30d',
      ),
      safe(
        this.prisma.document.count({
          where: {
            status: 'APPROVED' as any,
            nextReviewDate: { lte: now },
          },
        }),
        0,
        'docsDueForReview',
      ),
      safe(
        this.prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] as any } } }),
        0,
        'openTickets',
      ),
      safe(
        (async () => {
          const recent = await this.prisma.ticket.findMany({
            where: {
              status: 'CLOSED' as any,
              updatedAt: { gte: thirtyDaysAgo },
            },
            select: { createdAt: true, updatedAt: true },
            take: 100,
          });
          if (recent.length === 0) return 0;
          const totalMs = recent.reduce(
            (acc, t) => acc + (t.updatedAt.getTime() - t.createdAt.getTime()),
            0,
          );
          return Math.round(totalMs / recent.length / 3600000);
        })(),
        0,
        'ticketsAvgResolutionHours',
      ),
      safe(
        this.prisma.veilleItem.count({ where: { publishedAt: { gte: sevenDaysAgo } } }),
        0,
        'alertsLast7d',
      ),
      safe(
        this.prisma.veilleItem.count({ where: { severity: 'CRITICAL' } }),
        0,
        'alertsCritical',
      ),
      safe(this.prisma.charte.count({ where: { isActive: true } }), 0, 'chartesActive'),
      safe(
        (async () => {
          // On ne compte que les chartes actives qui ont au moins une version publiée,
          // sinon le KPI se gonfle artificiellement quand un catalogue de chartes
          // existe sans contenu.
          const chartesWithVersion = await this.prisma.charte.count({
            where: { isActive: true, versions: { some: {} } },
          });
          if (chartesWithVersion === 0) return 0;
          const totalActiveUsers = await this.prisma.user.count({
            where: { isActive: true, deletedAt: null },
          });
          const signatures = await this.prisma.charteSignature.count();
          return Math.max(0, chartesWithVersion * totalActiveUsers - signatures);
        })(),
        0,
        'chartesPendingSignatures',
      ),
      safe(
        this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
        0,
        'activeUsers',
      ),
      safe(
        this.prisma.user.count({
          where: { isActive: true, deletedAt: null, mfaEnabled: true },
        }),
        0,
        'mfaEnabledUsers',
      ),
      safe(
        this.prisma.accessReviewCampaign.count({
          where: { status: { in: ['IN_PROGRESS', 'DRAFT'] as any } },
        }),
        0,
        'accessReviewsPending',
      ),
      safe(
        this.prisma.accessReviewCampaign.count({
          where: {
            status: { in: ['IN_PROGRESS', 'DRAFT'] as any },
            dueDate: { lt: now },
          },
        }),
        0,
        'accessReviewsOverdue',
      ),
      safe(
        this.prisma.auditLog.count({
          where: { createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
        }),
        0,
        'auditEventsLast24h',
      ),
      safe(
        this.prisma.auditLog.count({
          where: {
            createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
            action: 'LOGIN_FAILED' as any,
          },
        }),
        0,
        'failedLoginsLast24h',
      ),
    ]);

    const mfaCoverage =
      activeUsers > 0 ? Math.round((mfaEnabledUsers / activeUsers) * 100) : 0;

    return {
      generatedAt: now.toISOString(),
      incidents: {
        open: openIncidents,
        critical: criticalIncidents,
        thisMonth: incidentsThisMonth,
      },
      documents: {
        inReview: docsInReview,
        approvedLast30d: docsApprovedLast30d,
        dueForReview: docsDueForReview,
      },
      tickets: {
        open: openTickets,
        avgResolutionHours: ticketsAvgResolutionHours,
      },
      veille: {
        alertsLast7d,
        critical: alertsCritical,
      },
      chartes: {
        active: chartesActive,
        pendingSignatures: chartesPendingSignatures,
      },
      users: {
        active: activeUsers,
        mfaEnabled: mfaEnabledUsers,
        mfaCoveragePct: mfaCoverage,
      },
      accessReviews: {
        pending: accessReviewsPending,
        overdue: accessReviewsOverdue,
      },
      audit: {
        eventsLast24h: auditEventsLast24h,
        failedLoginsLast24h,
      },
    };
  }
}
