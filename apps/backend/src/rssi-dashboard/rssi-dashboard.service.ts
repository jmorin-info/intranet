import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  AccessReviewCampaignStatus,
  DocumentCategory,
  DocumentLevel,
  DocumentPriority,
  DocumentStatus,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  TicketStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../common/cache/cache.service";

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

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  /**
   * Wrapper utilitaire — encapsule chaque requête pour qu'une erreur
   * isolée ne casse pas tout le dashboard.
   */
  private safe<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
    return p.catch((err) => {
      this.logger.warn(`rssi-dashboard[${label}]: ${err?.message || err}`);
      return fallback;
    });
  }

  /**
   * Retourne un snapshot complet des indicateurs clés.
   * Toutes les requêtes sont parallélisées et chaque erreur est
   * capturée individuellement pour éviter qu'une seule requête en panne
   * casse tout le dashboard.
   */
  async getSnapshot() {
    // Snapshot is heavy (~18 parallel COUNT queries across 10+ tables).
    // 5-min freshness is acceptable for a strategic dashboard ; a manual
    // refresh button on the UI can be implemented to skip the cache.
    if (this.cache) {
      return this.cache.wrap("rssi-dashboard:snapshot:global", 300, () => this.computeSnapshot());
    }
    return this.computeSnapshot();
  }

  private async computeSnapshot() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const safe = <T>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      this.safe(p, fallback, label);

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
          where: {
            status: {
              notIn: [IncidentStatus.CLOSED, IncidentStatus.RECOVERED],
            },
          },
        }),
        0,
        "openIncidents",
      ),
      safe(
        this.prisma.incident.count({
          where: {
            severity: IncidentSeverity.CRITICAL,
            status: { notIn: [IncidentStatus.CLOSED] },
          },
        }),
        0,
        "criticalIncidents",
      ),
      safe(
        this.prisma.incident.count({
          where: {
            detectedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
          },
        }),
        0,
        "incidentsThisMonth",
      ),
      safe(
        this.prisma.document.count({
          where: { status: DocumentStatus.IN_REVIEW },
        }),
        0,
        "docsInReview",
      ),
      safe(
        this.prisma.document.count({
          where: {
            status: DocumentStatus.APPROVED,
            updatedAt: { gte: thirtyDaysAgo },
          },
        }),
        0,
        "docsApprovedLast30d",
      ),
      safe(
        this.prisma.document.count({
          where: {
            status: DocumentStatus.APPROVED,
            nextReviewDate: { lte: now },
          },
        }),
        0,
        "docsDueForReview",
      ),
      safe(
        this.prisma.ticket.count({
          where: {
            status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
          },
        }),
        0,
        "openTickets",
      ),
      safe(
        (async () => {
          const recent = await this.prisma.ticket.findMany({
            where: {
              status: TicketStatus.CLOSED,
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
        "ticketsAvgResolutionHours",
      ),
      safe(
        this.prisma.veilleItem.count({
          where: { publishedAt: { gte: sevenDaysAgo } },
        }),
        0,
        "alertsLast7d",
      ),
      safe(this.prisma.veilleItem.count({ where: { severity: "CRITICAL" } }), 0, "alertsCritical"),
      safe(this.prisma.charte.count({ where: { isActive: true } }), 0, "chartesActive"),
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
        "chartesPendingSignatures",
      ),
      safe(
        this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
        0,
        "activeUsers",
      ),
      safe(
        this.prisma.user.count({
          where: { isActive: true, deletedAt: null, mfaEnabled: true },
        }),
        0,
        "mfaEnabledUsers",
      ),
      safe(
        this.prisma.accessReviewCampaign.count({
          where: {
            status: {
              in: [AccessReviewCampaignStatus.ACTIVE, AccessReviewCampaignStatus.DRAFT],
            },
          },
        }),
        0,
        "accessReviewsPending",
      ),
      safe(
        this.prisma.accessReviewCampaign.count({
          where: {
            status: {
              in: [AccessReviewCampaignStatus.ACTIVE, AccessReviewCampaignStatus.DRAFT],
            },
            dueDate: { lt: now },
          },
        }),
        0,
        "accessReviewsOverdue",
      ),
      safe(
        this.prisma.auditLog.count({
          where: {
            createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
          },
        }),
        0,
        "auditEventsLast24h",
      ),
      safe(
        this.prisma.auditLog.count({
          where: {
            createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
            // AuditLog.action est un String libre côté schéma, pas un enum.
            action: "LOGIN_FAILED",
          },
        }),
        0,
        "failedLoginsLast24h",
      ),
    ]);

    const mfaCoverage = activeUsers > 0 ? Math.round((mfaEnabledUsers / activeUsers) * 100) : 0;

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

  /**
   * État du SMSI : politiques actives, actifs critiques, risques ouverts,
   * dernière revue de direction et prochaine échéance.
   *
   * ISO 27001 A.5.1 (politiques) + A.5.35 (revue de direction).
   */
  async getSmsiState() {
    const now = new Date();
    const safe = <T>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      this.safe(p, fallback, label);

    const [activePolicies, criticalAssets, openRisks, lastReview, nextReview, activeFrameworks] =
      await Promise.all([
        // "Politiques actives" = documents catégorisés comme politiques approuvées
        safe(
          this.prisma.document.count({
            where: {
              deletedAt: null,
              status: DocumentStatus.APPROVED,
              category: {
                in: [DocumentCategory.POLICY, DocumentCategory.PROCEDURE],
              },
            },
          }),
          0,
          "activePolicies",
        ),
        // "Actifs critiques" = documents classifiés SECRET ou CONFIDENTIEL
        safe(
          this.prisma.document.count({
            where: {
              deletedAt: null,
              // Document.classification est un String libre dans le schéma
              // (PUBLIC | INTERNE | CONFIDENTIEL | SECRET).
              classification: { in: ["SECRET", "CONFIDENTIEL"] },
            },
          }),
          0,
          "criticalAssets",
        ),
        // "Risques ouverts" = incidents critiques/élevés non clôturés (proxy)
        safe(
          this.prisma.incident.count({
            where: {
              severity: {
                in: [IncidentSeverity.CRITICAL, IncidentSeverity.HIGH],
              },
              status: {
                notIn: [IncidentStatus.CLOSED, IncidentStatus.RECOVERED],
              },
            },
          }),
          0,
          "openRisks",
        ),
        // Dernière revue = dernière tâche conformité COMPLETED
        safe(
          this.prisma.complianceTask.findFirst({
            where: { status: "COMPLETED", lastCompletedAt: { not: null } },
            orderBy: { lastCompletedAt: "desc" },
            select: { lastCompletedAt: true, title: true },
          }),
          null,
          "lastReview",
        ),
        // Prochaine revue = prochaine tâche compliance non terminée
        safe(
          this.prisma.complianceTask.findFirst({
            where: {
              status: { not: "COMPLETED" },
              nextDueDate: { gte: now },
            },
            orderBy: { nextDueDate: "asc" },
            select: { nextDueDate: true, title: true },
          }),
          null,
          "nextReview",
        ),
        // Frameworks de conformité actifs
        safe(
          this.prisma.complianceFramework.count({ where: { isActive: true } }),
          0,
          "activeFrameworks",
        ),
      ]);

    return {
      generatedAt: now.toISOString(),
      activePolicies,
      criticalAssets,
      openRisks,
      lastReview: lastReview
        ? {
            date: lastReview.lastCompletedAt?.toISOString() ?? null,
            title: lastReview.title,
          }
        : null,
      nextReview: nextReview
        ? {
            date: nextReview.nextDueDate?.toISOString() ?? null,
            title: nextReview.title,
          }
        : null,
      activeFrameworks,
    };
  }

  /**
   * Tendance des incidents sur 30 jours (compteur par jour) + top 3 par sévérité.
   * Renvoie des séries simples utilisables par une sparkline SVG côté front.
   */
  async getIncidentTrend() {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const safe = <T>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      this.safe(p, fallback, label);

    const [incidents, topSeverity] = await Promise.all([
      safe(
        this.prisma.incident.findMany({
          where: { detectedAt: { gte: since } },
          select: { detectedAt: true, severity: true },
          orderBy: { detectedAt: "asc" },
        }),
        [] as Array<{ detectedAt: Date; severity: any }>,
        "incidentsTrend",
      ),
      safe(
        this.prisma.incident.findMany({
          where: {
            severity: {
              in: [IncidentSeverity.CRITICAL, IncidentSeverity.HIGH],
            },
            status: { notIn: [IncidentStatus.CLOSED] },
          },
          select: {
            id: true,
            reference: true,
            title: true,
            severity: true,
            status: true,
            detectedAt: true,
          },
          orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
          take: 3,
        }),
        [],
        "topSeverity",
      ),
    ]);

    // Bucket par jour (30 cases)
    const buckets: number[] = new Array(30).fill(0);
    const dayMs = 24 * 3600 * 1000;
    for (const inc of incidents) {
      const idx = Math.min(
        29,
        Math.max(0, Math.floor((inc.detectedAt.getTime() - since.getTime()) / dayMs)),
      );
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }

    return {
      generatedAt: now.toISOString(),
      windowDays: 30,
      total: incidents.length,
      buckets,
      top: topSeverity.map((i) => ({
        id: i.id,
        reference: i.reference,
        title: i.title,
        severity: String(i.severity),
        status: String(i.status),
        detectedAt: i.detectedAt.toISOString(),
      })),
    };
  }

  /**
   * Avancement des chantiers ISO 27001 — combine documents liés à des
   * contrôles ISO + tâches de conformité. Retourne progression globale +
   * détail par domaine A.5/A.6/A.7/A.8.
   */
  async getComplianceProgress() {
    const now = new Date();
    const safe = <T>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      this.safe(p, fallback, label);

    const [controls, tasks] = await Promise.all([
      safe(
        this.prisma.isoControl.findMany({
          select: {
            code: true,
            domain: true,
            _count: { select: { documents: true } },
          },
        }),
        [],
        "controls",
      ),
      safe(
        this.prisma.complianceTask.findMany({
          select: {
            status: true,
            nextDueDate: true,
            isoControl: true,
          },
        }),
        [],
        "tasks",
      ),
    ]);

    const totalControls = controls.length;
    const coveredControls = controls.filter((c) => (c._count?.documents ?? 0) > 0).length;
    const coveragePct = totalControls > 0 ? Math.round((coveredControls / totalControls) * 100) : 0;

    // Ventilation par domaine (A.5, A.6, A.7, A.8)
    const byDomain: Record<string, { total: number; covered: number; pct: number }> = {};
    for (const ctl of controls) {
      const dom = ctl.domain || "autre";
      if (!byDomain[dom]) byDomain[dom] = { total: 0, covered: 0, pct: 0 };
      byDomain[dom].total += 1;
      if ((ctl._count?.documents ?? 0) > 0) byDomain[dom].covered += 1;
    }
    for (const dom of Object.keys(byDomain)) {
      const v = byDomain[dom]!;
      v.pct = v.total > 0 ? Math.round((v.covered / v.total) * 100) : 0;
    }

    const tasksTotal = tasks.length;
    const tasksCompleted = tasks.filter((t) => t.status === "COMPLETED").length;
    const tasksOverdue = tasks.filter(
      (t) => t.status !== "COMPLETED" && t.nextDueDate && t.nextDueDate < now,
    ).length;

    return {
      generatedAt: now.toISOString(),
      controls: {
        total: totalControls,
        covered: coveredControls,
        pct: coveragePct,
      },
      tasks: {
        total: tasksTotal,
        completed: tasksCompleted,
        overdue: tasksOverdue,
      },
      byDomain,
    };
  }

  /**
   * Indicateurs opérationnels SOC : MTTR / MTTD / EDR / MFA.
   *
   *  - MTTR : moyenne (resolvedAt - detectedAt) sur incidents 30j
   *  - MTTD : moyenne (containedAt - detectedAt) sur incidents 30j
   *  - EDR  : taux d'incidents catégorie ENDPOINT/MALWARE détectés < 1h
   *  - MFA  : taux d'utilisateurs actifs MFA-enabled
   */
  async getOperationalIndicators() {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const safe = <T>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      this.safe(p, fallback, label);

    const [resolved, contained, edrIncidents, activeUsers, mfaUsers] = await Promise.all([
      safe(
        this.prisma.incident.findMany({
          where: { detectedAt: { gte: since }, resolvedAt: { not: null } },
          select: { detectedAt: true, resolvedAt: true },
          take: 200,
        }),
        [],
        "mttrIncidents",
      ),
      safe(
        this.prisma.incident.findMany({
          where: { detectedAt: { gte: since }, containedAt: { not: null } },
          select: { detectedAt: true, containedAt: true },
          take: 200,
        }),
        [],
        "mttdIncidents",
      ),
      safe(
        this.prisma.incident.findMany({
          where: {
            detectedAt: { gte: since },
            category: {
              in: [
                IncidentCategory.MALWARE,
                IncidentCategory.PHISHING,
                IncidentCategory.UNAUTHORIZED_ACCESS,
              ],
            },
          },
          select: { detectedAt: true, containedAt: true },
        }),
        [],
        "edrIncidents",
      ),
      safe(
        this.prisma.user.count({
          where: { isActive: true, deletedAt: null },
        }),
        0,
        "activeUsers",
      ),
      safe(
        this.prisma.user.count({
          where: { isActive: true, deletedAt: null, mfaEnabled: true },
        }),
        0,
        "mfaEnabled",
      ),
    ]);

    const avgHours = (rows: Array<{ a: Date | null; b: Date | null }>): number | null => {
      const valid = rows.filter((r) => r.a && r.b);
      if (valid.length === 0) return null;
      const totalMs = valid.reduce((acc, r) => acc + (r.b!.getTime() - r.a!.getTime()), 0);
      return Math.round((totalMs / valid.length / 3600000) * 10) / 10;
    };

    const mttrHours = avgHours(resolved.map((r) => ({ a: r.detectedAt, b: r.resolvedAt })));
    const mttdHours = avgHours(contained.map((r) => ({ a: r.detectedAt, b: r.containedAt })));

    // EDR : % incidents endpoint contenus < 1h
    const edrTotal = edrIncidents.length;
    const edrFast = edrIncidents.filter(
      (i) => i.containedAt && i.containedAt.getTime() - i.detectedAt.getTime() < 3600 * 1000,
    ).length;
    const edrPct = edrTotal > 0 ? Math.round((edrFast / edrTotal) * 100) : null;

    const mfaPct = activeUsers > 0 ? Math.round((mfaUsers / activeUsers) * 100) : 0;

    return {
      generatedAt: now.toISOString(),
      mttrHours,
      mttdHours,
      edrPct,
      edrSampleSize: edrTotal,
      mfaPct,
      mfaActiveUsers: activeUsers,
      mfaEnabledUsers: mfaUsers,
    };
  }

  /**
   * Pyramide documentaire PRO_040 §7.1 — agrege le SMSI vivant par niveau
   * (GOVERNANCE / OPERATIONAL / EVIDENCE / COMMUNICATION) avec compteurs
   * par priorite (REG_016 col. H) et indicateur de couverture (% APPROVED).
   *
   * Les documents ARCHIVED/OBSOLETE sont exclus pour ne mesurer que le
   * SMSI actif. Les documents sans `documentLevel` (cas pre-backfill) sont
   * regroupes dans la categorie UNCATEGORIZED afin d'etre visibles dans la
   * vue (signal d'alerte plutot que disparition silencieuse).
   *
   * Utilise par GET /rssi-dashboard/iso-pyramid.
   */
  async getIsoPyramid() {
    const safe = <T>(p: Promise<T>, fallback: T, label: string): Promise<T> =>
      this.safe(p, fallback, label);

    // SMSI vivant : on ignore les documents supprimes ET ceux dont le
    // status retire le doc du perimetre actif (ARCHIVED / OBSOLETE).
    const liveWhere = {
      deletedAt: null,
      status: {
        notIn: [DocumentStatus.ARCHIVED, DocumentStatus.OBSOLETE],
      },
    };

    type LevelKey = DocumentLevel | "UNCATEGORIZED";
    const LEVEL_KEYS: LevelKey[] = [
      DocumentLevel.GOVERNANCE,
      DocumentLevel.OPERATIONAL,
      DocumentLevel.EVIDENCE,
      DocumentLevel.COMMUNICATION,
      "UNCATEGORIZED",
    ];
    const PRIORITY_KEYS: DocumentPriority[] = [
      DocumentPriority.CRITICAL,
      DocumentPriority.HIGH,
      DocumentPriority.MEDIUM,
      DocumentPriority.LOW,
    ];

    // Types locaux des resultats Prisma groupBy (uniquement les champs qu'on
    // utilise). Permet de garder le `safe()` fallback simple sans avoir a
    // s'aligner sur le type complet `GetDocumentGroupByPayload` (qui inclut
    // toutes les colonnes selectionnees implicitement).
    type LevelGroupRow = {
      documentLevel: DocumentLevel | null;
      status: DocumentStatus;
      priority: DocumentPriority | null;
      _count: { _all: number } | null;
    };
    type ClassificationGroupRow = {
      classification: string;
      _count: { _all: number } | null;
    };

    const [
      groupedByLevelStatusPriorityRaw,
      totalLive,
      approvedLive,
      blockingLive,
      sharePointSyncLive,
      groupedByClassificationRaw,
    ] = await Promise.all([
      safe(
        this.prisma.document.groupBy({
          by: ["documentLevel", "status", "priority"],
          where: liveWhere,
          _count: { _all: true },
        }) as unknown as Promise<LevelGroupRow[]>,
        [] as LevelGroupRow[],
        "isoPyramid.groupByLevel",
      ),
      safe(this.prisma.document.count({ where: liveWhere }), 0, "isoPyramid.totalLive"),
      safe(
        this.prisma.document.count({
          where: { ...liveWhere, status: DocumentStatus.APPROVED },
        }),
        0,
        "isoPyramid.approvedLive",
      ),
      safe(
        this.prisma.document.count({
          where: { ...liveWhere, blocking: true },
        }),
        0,
        "isoPyramid.blockingLive",
      ),
      safe(
        this.prisma.document.count({
          where: { ...liveWhere, externalStorageProvider: { not: null } },
        }),
        0,
        "isoPyramid.sharePointSync",
      ),
      safe(
        this.prisma.document.groupBy({
          by: ["classification"],
          where: liveWhere,
          _count: { _all: true },
        }) as unknown as Promise<ClassificationGroupRow[]>,
        [] as ClassificationGroupRow[],
        "isoPyramid.classifications",
      ),
    ]);

    const groupedByLevelStatusPriority = groupedByLevelStatusPriorityRaw;
    const groupedByClassification = groupedByClassificationRaw;

    // Initialise l'accumulateur par niveau
    const levelsAcc: Record<
      LevelKey,
      {
        total: number;
        approved: number;
        byPriority: Record<DocumentPriority, number>;
      }
    > = LEVEL_KEYS.reduce(
      (acc, key) => {
        acc[key] = {
          total: 0,
          approved: 0,
          byPriority: {
            [DocumentPriority.CRITICAL]: 0,
            [DocumentPriority.HIGH]: 0,
            [DocumentPriority.MEDIUM]: 0,
            [DocumentPriority.LOW]: 0,
          },
        };
        return acc;
      },
      {} as Record<
        LevelKey,
        {
          total: number;
          approved: number;
          byPriority: Record<DocumentPriority, number>;
        }
      >,
    );

    for (const row of groupedByLevelStatusPriority) {
      const lvl: LevelKey = row.documentLevel ?? "UNCATEGORIZED";
      const n = row._count?._all ?? 0;
      const bucket = levelsAcc[lvl as LevelKey];
      if (!bucket) continue;
      bucket.total += n;
      if (row.status === DocumentStatus.APPROVED) {
        bucket.approved += n;
      }
      if (row.priority) {
        bucket.byPriority[row.priority] = (bucket.byPriority[row.priority] ?? 0) + n;
      }
    }

    const levels = LEVEL_KEYS.map((key) => {
      const v = levelsAcc[key];
      const coveragePct = v.total > 0 ? Math.round((v.approved / v.total) * 100) : 0;
      return {
        level: key,
        total: v.total,
        approved: v.approved,
        coveragePct,
        byPriority: PRIORITY_KEYS.reduce(
          (acc, p) => {
            acc[p] = v.byPriority[p] ?? 0;
            return acc;
          },
          {} as Record<DocumentPriority, number>,
        ),
      };
    });

    // Classifications POL_015 §5 (4 niveaux + autres potentiels)
    const CLASSIF_KEYS = ["SECRET", "CONFIDENTIEL", "INTERNE", "PUBLIC"];
    const classifications = CLASSIF_KEYS.reduce(
      (acc, key) => {
        acc[key] = 0;
        return acc;
      },
      {} as Record<string, number>,
    );
    for (const row of groupedByClassification) {
      const key = row.classification ?? "INTERNE";
      classifications[key] = (classifications[key] ?? 0) + (row._count?._all ?? 0);
    }

    const overallCoveragePct = totalLive > 0 ? Math.round((approvedLive / totalLive) * 100) : 0;

    return {
      generatedAt: new Date().toISOString(),
      levels,
      totals: {
        documents: totalLive,
        approved: approvedLive,
        blocking: blockingLive,
        sharePointSync: sharePointSyncLive,
        coveragePct: overallCoveragePct,
      },
      classifications,
    };
  }
}
