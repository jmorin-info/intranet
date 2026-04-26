import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CacheService } from "../common/cache/cache.service";
import { ISO_CONTROLS_FR } from "../iso-controls/iso-controls-fr.map";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import {
  SignedPdfService,
  SignedPdfResult,
} from "../exports/signed-pdf.service";
import { IsoAnalyzerService } from "../iso-analyzer/iso-analyzer.service";
import * as ExcelJS from "exceljs";

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly cacheService: CacheService,
    private readonly signedPdfService: SignedPdfService,
    private readonly isoAnalyzerService: IsoAnalyzerService,
  ) {}

  async generateDocumentRegistry(): Promise<Buffer> {
    const documents = await this.prisma.document.findMany({
      where: { deletedAt: null, status: "APPROVED" },
      include: {
        owner: {
          select: { firstName: true, lastName: true, email: true },
        },
        reviewer: {
          select: { firstName: true, lastName: true },
        },
        approver: {
          select: { firstName: true, lastName: true },
        },
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { versionNumber: true, createdAt: true },
        },
        isoControls: {
          include: { isoControl: { select: { code: true, title: true } } },
        },
      },
      orderBy: { reference: "asc" },
    });

    const rows = documents.map((doc) => ({
      Reference: doc.reference,
      Title: doc.title,
      Category: doc.category,
      Status: doc.status,
      Owner: `${doc.owner.firstName} ${doc.owner.lastName}`,
      "Owner Email": doc.owner.email,
      Réviseur: doc.reviewer
        ? `${doc.reviewer.firstName} ${doc.reviewer.lastName}`
        : "",
      Approver: doc.approver
        ? `${doc.approver.firstName} ${doc.approver.lastName}`
        : "",
      "Current Version": doc.versions[0]?.versionNumber || "N/A",
      "ISO Controls": doc.isoControls
        .map(
          (ic) =>
            `${ic.isoControl.code} - ${ISO_CONTROLS_FR[ic.isoControl.code] || ic.isoControl.title}`,
        )
        .join("; "),
      "Next Review Date": doc.nextReviewDate
        ? doc.nextReviewDate.toISOString().split("T")[0]
        : "",
      "Created At": doc.createdAt.toISOString().split("T")[0],
      "Updated At": doc.updatedAt.toISOString().split("T")[0],
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Document Registry");

    if (rows.length > 0) {
      worksheet.columns = Object.keys(rows[0]).map((key, i) => ({
        header: key,
        key,
        width: [20, 40, 12, 12, 25, 30, 25, 25, 15, 50, 15, 12, 12][i] || 15,
      }));
      rows.forEach((row) => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateAcknowledgmentReport(): Promise<Buffer> {
    const documents = await this.prisma.document.findMany({
      where: { deletedAt: null, status: "APPROVED" },
      include: {
        _count: { select: { acknowledgments: true } },
        owner: { select: { firstName: true, lastName: true } },
      },
      orderBy: { reference: "asc" },
    });

    const totalUsers = await this.prisma.user.count({
      where: { isActive: true, deletedAt: null },
    });

    const rows = documents.map((doc) => ({
      Reference: doc.reference,
      Title: doc.title,
      Category: doc.category,
      Owner: `${doc.owner.firstName} ${doc.owner.lastName}`,
      "Total Active Users": totalUsers,
      Acknowledgments: doc._count.acknowledgments,
      Percentage:
        totalUsers > 0
          ? `${Math.round((doc._count.acknowledgments / totalUsers) * 100)}%`
          : "0%",
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Acknowledgment Stats");

    if (rows.length > 0) {
      worksheet.columns = Object.keys(rows[0]).map((key, i) => ({
        header: key,
        key,
        width: [20, 40, 12, 25, 18, 18, 12][i] || 15,
      }));
      rows.forEach((row) => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateAuditTrailReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
    action?: string;
    userId?: string;
  }): Promise<Buffer> {
    const where: any = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action)
      where.action = { contains: filters.action, mode: "insensitive" };
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10000, // Cap to prevent memory issues
    });

    const rows = logs.map((log) => ({
      Timestamp: log.createdAt.toISOString(),
      User: log.user ? `${log.user.firstName} ${log.user.lastName}` : "System",
      Email: log.user?.email || "",
      Action: log.action,
      "Resource Type": log.resourceType,
      "Resource ID": log.resourceId || "",
      Severity: log.severity,
      "IP Address": log.ipAddress || "",
      "User Agent": log.userAgent || "",
      Metadata: log.metadata ? JSON.stringify(log.metadata) : "",
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Audit Trail");

    if (rows.length > 0) {
      worksheet.columns = Object.keys(rows[0]).map((key, i) => ({
        header: key,
        key,
        width: [22, 25, 30, 30, 18, 38, 10, 18, 40, 50][i] || 15,
      }));
      rows.forEach((row) => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate monthly SMSI audit report (ISO 27001 A.5.35)
   * Called by cron or on-demand
   */
  async generateMonthlyReport(): Promise<Buffer> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthLabel = now.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });

    const [
      docsCreated,
      docsApproved,
      incidents,
      logins,
      veilleProcessed,
      ticketsResolved,
      totalControls,
      coveredControls,
    ] = await Promise.all([
      this.prisma.document.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
          deletedAt: null,
        },
      }),
      this.prisma.document.count({
        where: {
          status: "APPROVED",
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          severity: "CRITICAL",
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: { contains: "login" },
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.veilleItem.count({
        where: {
          isProcessed: true,
          fetchedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: { in: ["RESOLVED", "CLOSED"] },
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.isoControl.count(),
      this.prisma.isoControl.count({
        where: {
          documents: {
            some: { document: { status: "APPROVED", deletedAt: null } },
          },
        },
      }),
    ]);

    const rows = [
      { Indicateur: "Période", Valeur: monthLabel },
      { Indicateur: "Documents créés", Valeur: String(docsCreated) },
      { Indicateur: "Documents approuvés", Valeur: String(docsApproved) },
      { Indicateur: "Incidents critiques", Valeur: String(incidents) },
      { Indicateur: "Connexions", Valeur: String(logins) },
      {
        Indicateur: "Alertes veille traitées",
        Valeur: String(veilleProcessed),
      },
      { Indicateur: "Tickets résolus", Valeur: String(ticketsResolved) },
      {
        Indicateur: "Contrôles ISO couverts",
        Valeur: `${coveredControls}/${totalControls} (${Math.round((coveredControls / totalControls) * 100)}%)`,
      },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Rapport SMSI ${monthLabel}`);

    if (rows.length > 0) {
      worksheet.columns = Object.keys(rows[0]).map((key, i) => ({
        header: key,
        key,
        width: [30, 25][i] || 15,
      }));
      rows.forEach((row) => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Génère un rapport PDF RSSI structuré et signé cryptographiquement
   * (SHA-256 + UUID + timestamp ISO) pour la revue périodique du SMSI.
   *
   * Contenu (ISO 27001 A.5.35 / A.5.36) :
   *  - Bandeau OMNITECH, date de génération, SHA-256
   *  - Bloc conformité ISO 27001 (globale + par domaine A.5/A.6/A.7/A.8)
   *  - Bloc indicateurs SMSI (MFA, chartes, alertes, incidents)
   *  - Bloc documents & tickets (totaux, en retard, en attente)
   *  - Bloc veille cybersécurité
   *  - Bloc signature cryptographique + disclaimer "confidentiel RSSI"
   */
  async generateRssiPdf(user: RequestUser): Promise<SignedPdfResult> {
    // Charge toutes les données en parallèle — tolère les erreurs partielles.
    const [
      complianceSummary,
      dashboardStats,
      smsiIndicators,
      totalDocuments,
      approvedDocs,
      overdueDocs,
      pendingReviewDocs,
      pendingApprovalDocs,
      openTickets,
      resolvedTicketsMonth,
      veilleProcessed,
      veilleUnprocessed,
      veilleRecent,
      bulletinRecent,
      activeAlerts,
      criticalIncidentsMonth,
      mfaEnabled,
      mfaTotal,
      chartesSigned,
      chartesTotal,
    ] = await Promise.all([
      this.isoAnalyzerService.getComplianceSummary().catch(() => ({
        total: 0,
        covered: 0,
        partial: 0,
        uncovered: 0,
        coveragePercent: 0,
        byDomain: {} as Record<
          string,
          {
            total: number;
            covered: number;
            partial: number;
            uncovered: number;
          }
        >,
      })),
      this.getDashboardStats().catch(() => null),
      this.getSmsiIndicators(user).catch(() => null),
      this.prisma.document.count({ where: { deletedAt: null } }).catch(() => 0),
      this.prisma.document
        .count({ where: { deletedAt: null, status: "APPROVED" } })
        .catch(() => 0),
      this.prisma.document
        .count({
          where: {
            deletedAt: null,
            status: "APPROVED",
            nextReviewDate: { lt: new Date() },
          },
        })
        .catch(() => 0),
      this.prisma.document
        .count({ where: { deletedAt: null, status: "IN_REVIEW" } })
        .catch(() => 0),
      this.prisma.document
        .count({ where: { deletedAt: null, status: "PENDING_APPROVAL" } })
        .catch(() => 0),
      this.prisma.ticket
        .count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } })
        .catch(() => 0),
      this.prisma.ticket
        .count({
          where: {
            status: { in: ["RESOLVED", "CLOSED"] },
            updatedAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        })
        .catch(() => 0),
      this.prisma.veilleItem
        .count({ where: { isProcessed: true } })
        .catch(() => 0),
      this.prisma.veilleItem
        .count({ where: { isProcessed: false } })
        .catch(() => 0),
      this.prisma.veilleItem
        .findMany({
          where: {},
          orderBy: { fetchedAt: "desc" },
          take: 5,
          select: {
            title: true,
            sourceName: true,
            severity: true,
            fetchedAt: true,
          },
        })
        .catch(
          () =>
            [] as Array<{
              title: string;
              sourceName: string;
              severity: string | null;
              fetchedAt: Date;
            }>,
        ),
      this.prisma.veilleBulletin
        .findMany({
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { title: true, createdAt: true },
        })
        .catch(() => [] as Array<{ title: string; createdAt: Date }>),
      // Alerts: "VeilleItem" treated as ad-hoc alerts when unprocessed CRITICAL/HIGH
      this.prisma.veilleItem
        .count({
          where: { isProcessed: false, severity: { in: ["CRITICAL", "HIGH"] } },
        })
        .catch(() => 0),
      this.prisma.auditLog
        .count({
          where: {
            severity: "CRITICAL",
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        })
        .catch(() => 0),
      this.prisma.user
        .count({ where: { isActive: true, deletedAt: null, mfaEnabled: true } })
        .catch(() => 0),
      this.prisma.user
        .count({ where: { isActive: true, deletedAt: null } })
        .catch(() => 0),
      this.prisma.user
        .count({
          where: {
            isActive: true,
            deletedAt: null,
            chartesAcceptedAt: { not: null },
          },
        })
        .catch(() => 0),
      this.prisma.user
        .count({ where: { isActive: true, deletedAt: null } })
        .catch(() => 0),
    ]);

    const now = new Date();
    const monthLabel = now.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    const timestampIso = now.toISOString();
    const mfaPct = mfaTotal > 0 ? Math.round((mfaEnabled / mfaTotal) * 100) : 0;
    const chartesPct =
      chartesTotal > 0 ? Math.round((chartesSigned / chartesTotal) * 100) : 0;

    // Construction des sections texte (plain text — pdf-lib n'interprète pas de Markdown)
    const sections: Array<{ heading?: string; paragraphs: string[] }> = [];

    // -- Synthèse exécutive --
    sections.push({
      heading: "1. Synthèse exécutive",
      paragraphs: [
        `Ce rapport présente l'état du système de management de la sécurité de l'information (SMSI) d'OMNITECH SECURITY au ${now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} à ${now.toLocaleTimeString("fr-FR")}.`,
        `Période de référence: ${monthLabel}. Ce document est destiné à la revue RSSI et à l'audit interne conformément à l'article A.5.35 de la norme ISO/IEC 27001:2022.`,
        `Statut global de la conformité: ${complianceSummary.coveragePercent}% (${complianceSummary.covered}/${complianceSummary.total} contrôles couverts, ${complianceSummary.partial} partiels, ${complianceSummary.uncovered} non couverts).`,
      ],
    });

    // -- Conformité ISO 27001 --
    const byDomainEntries = Object.entries(
      complianceSummary.byDomain || {},
    ).sort(([a], [b]) => a.localeCompare(b));
    const domainLines = byDomainEntries.map(([domain, stats]) => {
      const pct =
        stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0;
      return `  • ${domain}: ${stats.covered}/${stats.total} couverts (${pct}%) — ${stats.partial} partiel(s), ${stats.uncovered} non couvert(s)`;
    });
    sections.push({
      heading: "2. Conformité ISO 27001 — couverture par domaine",
      paragraphs: [
        `Couverture globale: ${complianceSummary.coveragePercent}% (objectif 90%).`,
        `Total contrôles SoA: ${complianceSummary.total}. Couverts: ${complianceSummary.covered}. Partiellement couverts: ${complianceSummary.partial}. Non couverts: ${complianceSummary.uncovered}.`,
        "Décomposition par famille de contrôles:",
        ...(domainLines.length > 0
          ? domainLines
          : ["  (aucune donnée de domaine disponible)"]),
      ],
    });

    // -- Indicateurs SMSI --
    const smsiLines: string[] = [
      `Adoption MFA (A.5.17): ${mfaPct}% (${mfaEnabled}/${mfaTotal} utilisateurs actifs) — cible 95%.`,
      `Chartes signées (A.5.10 / A.6.2): ${chartesPct}% (${chartesSigned}/${chartesTotal}).`,
      `Alertes sécurité actives: ${activeAlerts ?? 0}.`,
      `Incidents critiques ce mois (AuditLog severity=CRITICAL): ${criticalIncidentsMonth}.`,
    ];
    const smsiInd = smsiIndicators as
      | { openTicketsByPriority?: Record<string, number> }
      | null
      | undefined;
    if (smsiInd?.openTicketsByPriority) {
      const p = smsiInd.openTicketsByPriority;
      smsiLines.push(
        `Tickets ouverts par priorité: CRITICAL=${p.CRITICAL ?? 0} · HIGH=${p.HIGH ?? 0} · MEDIUM=${p.MEDIUM ?? 0} · LOW=${p.LOW ?? 0}.`,
      );
    }
    sections.push({
      heading: "3. Indicateurs SMSI (ISO 27001 A.5.36)",
      paragraphs: smsiLines,
    });

    // -- Documents & tickets --
    sections.push({
      heading: "4. Documents et tickets",
      paragraphs: [
        `Documents actifs: ${totalDocuments} — approuvés: ${approvedDocs}.`,
        `Documents en retard de révision (nextReviewDate < aujourd'hui): ${overdueDocs}.`,
        `En attente de revue: ${pendingReviewDocs} · En attente d'approbation: ${pendingApprovalDocs}.`,
        `Tickets ouverts (OPEN + IN_PROGRESS): ${openTickets}.`,
        `Tickets résolus ce mois: ${resolvedTicketsMonth}.`,
        dashboardStats
          ? (() => {
              const ds = dashboardStats as {
                pendingSignatures?: number;
                pendingAcknowledgments?: number;
              };
              return `Signatures en attente: ${ds.pendingSignatures ?? 0} · Acquittements en attente: ${ds.pendingAcknowledgments ?? 0}.`;
            })()
          : "",
      ].filter(Boolean),
    });

    // -- Veille cybersécurité --
    const veilleLines: string[] = [
      `Items de veille: ${veilleProcessed + veilleUnprocessed} au total — ${veilleProcessed} traités, ${veilleUnprocessed} non traités.`,
    ];
    if (Array.isArray(bulletinRecent) && bulletinRecent.length > 0) {
      veilleLines.push("Bulletins récents:");
      for (const b of bulletinRecent) {
        veilleLines.push(
          `  • ${b.createdAt.toISOString().split("T")[0]} — ${b.title}`,
        );
      }
    }
    if (Array.isArray(veilleRecent) && veilleRecent.length > 0) {
      veilleLines.push("Derniers items notables:");
      for (const v of veilleRecent) {
        veilleLines.push(
          `  • [${v.severity ?? "INFO"}] ${v.title} — ${v.sourceName} (${v.fetchedAt.toISOString().split("T")[0]})`,
        );
      }
    }
    sections.push({
      heading: "5. Veille cybersécurité",
      paragraphs: veilleLines,
    });

    // -- Signatures cryptographiques + disclaimer --
    sections.push({
      heading: "6. Intégrité, traçabilité & confidentialité",
      paragraphs: [
        `Horodatage ISO 8601: ${timestampIso}.`,
        "La signature cryptographique SHA-256 de ce document figure en pied de chaque page. Toute altération du contenu rend cette signature invalide.",
        "Pour vérifier manuellement: sauvegardez le fichier reçu et exécutez `sha256sum <rapport-rssi.pdf>`; comparez avec l'en-tête X-Export-Hash fourni par l'endpoint.",
        "CONFIDENTIALITÉ — Ce document est strictement réservé à la fonction RSSI, à la Direction et aux auditeurs habilités (ISO 27001 A.5.12 / A.5.13). Toute diffusion non autorisée expose à des sanctions disciplinaires et pénales (CP art. 226-13, RGPD art. 32).",
        "Référence normative: ISO/IEC 27001:2022 A.5.35 (revue indépendante) · A.5.36 (conformité aux politiques) · A.8.15 (journalisation).",
      ],
    });

    const authorName =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;

    const result = await this.signedPdfService.generate({
      title: "Rapport RSSI — Tableau de bord SMSI",
      subtitle: `OMNITECH SECURITY — ${monthLabel} — généré le ${now.toLocaleDateString("fr-FR")}`,
      sections,
      metadata: {
        author: authorName,
        authorEmail: user.email,
        reference: `RSSI-${now.toISOString().split("T")[0]}`,
        context: "Revue RSSI — ISO 27001 A.5.35/A.5.36 — Confidentiel RSSI",
      },
    });

    this.logger.log(
      `[RSSI-PDF] generated by=${user.email} hash=${result.hash.slice(0, 16)} sections=${sections.length}`,
    );

    return result;
  }

  async generateExternalAccessReport(): Promise<Buffer> {
    const entries = await this.prisma.externalAccess.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { accessGrantedAt: "desc" },
    });

    const now = new Date();
    const rows = entries.map((entry) => ({
      "Nom utilisateur": `${entry.user.firstName} ${entry.user.lastName}`,
      Email: entry.user.email,
      Entreprise: entry.companyName,
      "Référence contrat": entry.contractRef || "",
      Statut: entry.isActive ? "Actif" : "Inactif",
      "Accès accordé le": entry.accessGrantedAt.toISOString().split("T")[0],
      Expiration: entry.accessExpiresAt
        ? entry.accessExpiresAt.toISOString().split("T")[0]
        : "Illimité",
      "Révision requise":
        entry.accessExpiresAt && entry.accessExpiresAt < now ? "OUI" : "Non",
      "Dernière révision": entry.lastReviewedAt
        ? entry.lastReviewedAt.toISOString().split("T")[0]
        : "",
      "Délai session (min)": Math.round(entry.sessionTimeout / 60),
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Accès prestataires");

    if (rows.length > 0) {
      worksheet.columns = Object.keys(rows[0]).map((key, i) => ({
        header: key,
        key,
        width: [25, 30, 20, 20, 10, 15, 12, 16, 15, 20][i] || 15,
      }));
      rows.forEach((row) => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateQuizStatsReport(): Promise<Buffer> {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: { contains: "quiz" }, resourceType: "Quiz" },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const rows = logs.map((log) => {
      // Prisma.JsonValue dynamique — extraction défensive
      const meta = (log.metadata as Record<string, unknown> | null) ?? {};
      return {
        Date: log.createdAt.toISOString().split("T")[0],
        Utilisateur: log.user
          ? `${log.user.firstName} ${log.user.lastName}`
          : "Inconnu",
        Email: log.user?.email || "",
        Quiz: (meta.campaignTitle as string) || "Quiz Sécurité OMNITECH",
        Score: meta.score != null ? `${meta.score}/${meta.total}` : "",
        Pourcentage: meta.percentage != null ? `${meta.percentage}%` : "",
        Résultat:
          meta.percentage != null
            ? typeof meta.percentage === "number" && meta.percentage >= 70
              ? "Réussi"
              : "Échoué"
            : "",
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Quiz Sécurité");

    if (rows.length > 0) {
      worksheet.columns = Object.keys(rows[0]).map((key, i) => ({
        header: key,
        key,
        width: [12, 25, 30, 30, 10, 12, 10][i] || 15,
      }));
      rows.forEach((row) => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Aggregated SMSI (ISO 27001) KPI indicators for the RSSI dashboard widget.
   *
   * All sub-queries are wrapped in try/catch so a missing field or model
   * never breaks the whole endpoint — absent metrics fall back to zero.
   * Cached 5 min via Redis (best-effort).
   *
   * Role-based filtering (ISO 27001 A.5.15):
   *  - SUPER_ADMIN / ADMIN / DIRECTION: full dashboard
   *  - REVIEWER / AUDITEUR:             no incidents, no tickets
   *  - COLLABORATEUR / PRESTATAIRE:     only docs compliance + charter adoption
   */
  async getSmsiIndicators(user?: RequestUser) {
    const role = (user?.role || "").toUpperCase() as UserRole;
    const isFullScope =
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN ||
      role === UserRole.DIRECTION;
    const isMidScope = role === UserRole.REVIEWER || role === UserRole.AUDITEUR;
    // everything else (COLLABORATEUR / PRESTATAIRE / unknown) = minimal scope
    const scopeKey = isFullScope ? "full" : isMidScope ? "mid" : "min";
    const cacheKey = `stats:smsi-indicators:${scopeKey}`;
    return this.cacheService.wrap(cacheKey, 300, async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

      // 1) MFA adoption
      let totalUsers = 0;
      let mfaEnabledUsers = 0;
      try {
        [totalUsers, mfaEnabledUsers] = await Promise.all([
          this.prisma.user.count({
            where: { isActive: true, deletedAt: null },
          }),
          this.prisma.user.count({
            where: { isActive: true, deletedAt: null, mfaEnabled: true },
          }),
        ]);
      } catch (err) {
        this.logger.warn(
          `SMSI: MFA count failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      const mfaValue =
        totalUsers > 0 ? Math.round((mfaEnabledUsers / totalUsers) * 100) : 0;
      const mfaTarget = 95;
      const mfaStatus: "success" | "warning" | "danger" =
        mfaValue >= mfaTarget
          ? "success"
          : mfaValue >= 80
            ? "warning"
            : "danger";

      // 2) Monthly critical incidents (AuditLog severity CRITICAL this month)
      let monthlyIncidents = 0;
      let previousMonthIncidents = 0;
      try {
        [monthlyIncidents, previousMonthIncidents] = await Promise.all([
          this.prisma.auditLog.count({
            where: {
              severity: "CRITICAL",
              createdAt: { gte: monthStart, lt: now },
            },
          }),
          this.prisma.auditLog.count({
            where: {
              severity: "CRITICAL",
              createdAt: { gte: prevMonthStart, lt: prevMonthEnd },
            },
          }),
        ]);
      } catch (err) {
        this.logger.warn(
          `SMSI: incident count failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      const incidentTrend: "up" | "down" | "flat" =
        monthlyIncidents > previousMonthIncidents
          ? "up"
          : monthlyIncidents < previousMonthIncidents
            ? "down"
            : "flat";

      // 3) Document compliance: approved / total (non-deleted)
      let totalDocuments = 0;
      let approvedDocuments = 0;
      try {
        [totalDocuments, approvedDocuments] = await Promise.all([
          this.prisma.document.count({ where: { deletedAt: null } }),
          this.prisma.document.count({
            where: { deletedAt: null, status: "APPROVED" },
          }),
        ]);
      } catch (err) {
        this.logger.warn(
          `SMSI: document count failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      const documentComplianceValue =
        totalDocuments > 0
          ? Math.round((approvedDocuments / totalDocuments) * 100)
          : 0;

      // 4) ISO coverage: controls with at least one APPROVED non-deleted document as evidence
      let totalControls = 0;
      let controlsWithEvidence = 0;
      try {
        [totalControls, controlsWithEvidence] = await Promise.all([
          this.prisma.isoControl.count(),
          this.prisma.isoControl.count({
            where: {
              documents: {
                some: {
                  document: { status: "APPROVED", deletedAt: null },
                },
              },
            },
          }),
        ]);
      } catch (err) {
        this.logger.warn(
          `SMSI: ISO coverage failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      const isoCoverageValue =
        totalControls > 0
          ? Math.round((controlsWithEvidence / totalControls) * 100)
          : 0;
      const isoTarget = 90;

      // 5) Charter adoption: % active users with chartesAcceptedAt set
      let charterSigned = 0;
      try {
        charterSigned = await this.prisma.user.count({
          where: {
            isActive: true,
            deletedAt: null,
            chartesAcceptedAt: { not: null },
          },
        });
      } catch (err) {
        this.logger.warn(
          `SMSI: charter count failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      const charterValue =
        totalUsers > 0 ? Math.round((charterSigned / totalUsers) * 100) : 0;

      // 6) Open tickets grouped by priority
      const openTicketsByPriority: {
        CRITICAL: number;
        HIGH: number;
        MEDIUM: number;
        LOW: number;
      } = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      try {
        const grouped = await this.prisma.ticket.groupBy({
          by: ["priority"],
          where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          _count: { _all: true },
        });
        for (const row of grouped) {
          const key = row.priority as keyof typeof openTicketsByPriority;
          if (key in openTicketsByPriority) {
            openTicketsByPriority[key] = row._count._all;
          }
        }
      } catch (err) {
        this.logger.warn(
          `SMSI: ticket groupBy failed: ${err instanceof Error ? err.message : err}`,
        );
      }

      const mfaAdoption = {
        value: mfaValue,
        target: mfaTarget,
        status: mfaStatus,
        total: totalUsers,
        mfaEnabled: mfaEnabledUsers,
      };
      const monthlyIncidentsKpi = {
        value: monthlyIncidents,
        trend: incidentTrend,
        previousMonth: previousMonthIncidents,
      };
      const documentCompliance = {
        value: documentComplianceValue,
        total: totalDocuments,
        approved: approvedDocuments,
      };
      const isoCoverage = {
        value: isoCoverageValue,
        target: isoTarget,
        totalControls,
        withEvidence: controlsWithEvidence,
      };
      const charterAdoption = {
        value: charterValue,
        total: totalUsers,
        signed: charterSigned,
      };

      // Full scope (RSSI / ADMIN / DIRECTION) — everything
      if (isFullScope) {
        return {
          scope: "full" as const,
          mfaAdoption,
          monthlyIncidents: monthlyIncidentsKpi,
          documentCompliance,
          isoCoverage,
          charterAdoption,
          openTicketsByPriority,
        };
      }

      // Mid scope (REVIEWER / AUDITEUR) — no sensitive incidents / tickets
      if (isMidScope) {
        return {
          scope: "mid" as const,
          mfaAdoption,
          documentCompliance,
          isoCoverage,
          charterAdoption,
        };
      }

      // Minimal scope (COLLABORATEUR / PRESTATAIRE) — collective view only
      return {
        scope: "min" as const,
        documentCompliance,
        charterAdoption,
      };
    });
  }

  async getDashboardStats() {
    return this.cacheService.wrap("stats:dashboard:global", 60, async () => {
      const [
        totalDocuments,
        approvedDocuments,
        pendingReview,
        pendingApproval,
        overdueRevision,
        totalAcks,
        pendingSignatures,
        recentNews,
      ] = await Promise.all([
        this.prisma.document.count({ where: { deletedAt: null } }),

        this.prisma.document.count({
          where: { deletedAt: null, status: "APPROVED" },
        }),

        this.prisma.document.count({
          where: { deletedAt: null, status: "IN_REVIEW" },
        }),

        this.prisma.document.count({
          where: { deletedAt: null, status: "PENDING_APPROVAL" },
        }),

        this.prisma.document.count({
          where: {
            deletedAt: null,
            status: "APPROVED",
            nextReviewDate: { lt: new Date() },
          },
        }),

        this.prisma.documentAcknowledgment.count(),

        this.prisma.signatureRequest.count({
          where: { status: "PENDING" },
        }),

        this.prisma.newsPost.count({
          where: { deletedAt: null, isPublished: true },
        }),
      ]);

      const [totalUsers, mfaEnabled, unprocessedVeille, openTickets] =
        await Promise.all([
          this.prisma.user.count({
            where: { isActive: true, deletedAt: null },
          }),
          this.prisma.user.count({
            where: { isActive: true, deletedAt: null, mfaEnabled: true },
          }),
          this.prisma.veilleItem
            .count({ where: { isProcessed: false } })
            .catch(() => 0),
          this.prisma.ticket.count({
            where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          }),
        ]);

      const pendingAcknowledgments =
        approvedDocuments > 0 && totalUsers > 0
          ? approvedDocuments * totalUsers - totalAcks
          : 0;

      return {
        totalDocuments,
        approvedDocuments,
        pendingReview,
        pendingApproval,
        overdueRevision,
        pendingSignatures,
        pendingAcknowledgments: Math.max(0, pendingAcknowledgments),
        recentNews,
        totalUsers,
        mfaAdoption:
          totalUsers > 0 ? Math.round((mfaEnabled / totalUsers) * 100) : 0,
        unprocessedVeille,
        openTickets,
      };
    });
  }

  /**
   * Send weekly report summary to admins every Monday at 7:00 AM
   */
  @Cron("0 7 * * 1")
  async sendWeeklyReportEmail() {
    this.logger.log("Generating weekly report email...");
    try {
      const stats = await this.getDashboardStats();
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
        select: { id: true, email: true, firstName: true },
      });

      // Enrich with ticket and veille stats
      const openTickets = await this.prisma.ticket.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      });
      const unprocessedVeille = await this.prisma.veilleItem
        .count({ where: { isProcessed: false } })
        .catch(() => 0);

      for (const admin of admins) {
        await this.notificationsService.create({
          userId: admin.id,
          type: "DOC_PUBLISHED",
          title: "Rapport hebdomadaire",
          body: `Résumé de la semaine :\n• ${stats.totalDocuments} documents (${stats.approvedDocuments} approuvés)\n• ${stats.pendingReview} en revue, ${stats.pendingApproval} en approbation\n• ${stats.overdueRevision} revues en retard\n• ${stats.pendingSignatures} signatures en attente\n• ${openTickets} tickets IT ouverts\n• ${unprocessedVeille} alertes veille non traitées`,
          resourceType: "Report",
        });
      }
      this.logger.log(`Weekly report sent to ${admins.length} admins`);
    } catch (err) {
      this.logger.error(
        `Weekly report failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Send monthly RSSI compliance report on 1st of each month at 8:00 AM
   */
  @Cron("0 8 1 * *")
  async sendMonthlyComplianceEmail() {
    this.logger.log("Generating monthly compliance report...");
    try {
      const stats = await this.getDashboardStats();
      const rssis = await this.prisma.user.findMany({
        where: { role: "SUPER_ADMIN", isActive: true },
        select: { id: true },
      });

      for (const rssi of rssis) {
        await this.notificationsService.create({
          userId: rssi.id,
          type: "DOC_PUBLISHED",
          title: "Rapport mensuel de conformité SMSI",
          body: `Rapport de conformité ISO 27001 — ${new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}\n\n• Documents totaux : ${stats.totalDocuments}\n• Approuvés : ${stats.approvedDocuments}\n• Revues en retard : ${stats.overdueRevision}\n• Signatures en attente : ${stats.pendingSignatures}`,
          resourceType: "Report",
        });
      }
      this.logger.log(
        `Monthly compliance report sent to ${rssis.length} RSSI(s)`,
      );
    } catch (err) {
      this.logger.error(
        `Monthly report failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
