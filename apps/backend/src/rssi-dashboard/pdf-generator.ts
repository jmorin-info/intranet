import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, degrees } from 'pdf-lib';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CyberScoreService } from '../cyber-score/cyber-score.service';
import { RssiDashboardService } from './rssi-dashboard.service';

export interface SmsiPdfResult {
  buffer: Buffer;
  hash: string;
  exportId: string;
  generatedAt: string;
  fileName: string;
}

export interface SmsiPdfOptions {
  author: string;
  authorEmail?: string;
  version?: string;
}

/**
 * Générateur PDF du rapport SMSI ISO 27001 — structuré en 9 chapitres
 * conformes à la norme (4. Contexte → 10. Amélioration).
 *
 * - Page de garde + filigrane CONFIDENTIEL sur toutes les pages
 * - SHA-256 du payload imprimé en pied de page (intégrité)
 * - Données live : incidents, conformité, cyber-score, revue de direction
 *
 * Utilise uniquement pdf-lib (pas de dépendance externe).
 */
@Injectable()
export class RssiSmsiPdfGenerator {
  private readonly logger = new Logger(RssiSmsiPdfGenerator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cyberScore: CyberScoreService,
    private readonly dashboard: RssiDashboardService,
  ) {}

  // ===========================================================================
  // ENTRY POINT
  // ===========================================================================

  async generate(opts: SmsiPdfOptions): Promise<SmsiPdfResult> {
    const exportId = crypto.randomUUID();
    const generatedAt = new Date();
    const version = opts.version || `1.${generatedAt.getFullYear()}.${generatedAt.getMonth() + 1}`;

    // Données métier — chaque appel est encapsulé pour ne pas casser le PDF
    // si une source est en panne (la section affichera "Non renseigné").
    const safe = async <T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> => {
      try {
        return await fn();
      } catch (err: any) {
        this.logger.warn(`[smsi-pdf] ${label}: ${err?.message || err}`);
        return fallback;
      }
    };

    const [
      cyber,
      smsiState,
      compliance,
      indicators,
      incidentTrend,
      snapshot,
      activeFrameworks,
    ] = await Promise.all([
      safe(() => this.cyberScore.computeAndSnapshot({ persist: false }), null as any, 'cyber'),
      safe(() => this.dashboard.getSmsiState(), null as any, 'smsi'),
      safe(() => this.dashboard.getComplianceProgress(), null as any, 'compliance'),
      safe(() => this.dashboard.getOperationalIndicators(), null as any, 'indicators'),
      safe(() => this.dashboard.getIncidentTrend(), null as any, 'trend'),
      safe(() => this.dashboard.getSnapshot(), null as any, 'snapshot'),
      safe(
        () =>
          this.prisma.complianceFramework.findMany({
            where: { isActive: true },
            select: { name: true, version: true },
          }),
        [],
        'frameworks',
      ),
    ]);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const ctx: RenderCtx = {
      pdfDoc,
      font,
      fontBold,
      fontMono,
      fontItalic,
      colorNavy: rgb(0, 68 / 255, 105 / 255),
      colorOrange: rgb(246 / 255, 141 / 255, 46 / 255),
      colorText: rgb(0.15, 0.15, 0.2),
      colorMuted: rgb(0.45, 0.45, 0.5),
      colorRed: rgb(0.84, 0.18, 0.18),
      colorGreen: rgb(0.2, 0.65, 0.32),
      colorAmber: rgb(0.9, 0.6, 0.05),
      pageW: 595.28,
      pageH: 841.89,
      marginX: 50,
      marginTop: 90,
      marginBottom: 70,
      currentPage: null as any,
      y: 0,
      classification: 'CONFIDENTIEL',
      usableW: 0,
    };
    ctx.usableW = ctx.pageW - ctx.marginX * 2;

    // ─── PAGE DE GARDE ────────────────────────────────────────────────────
    this.renderCoverPage(ctx, {
      version,
      generatedAt,
      author: opts.author,
      cyberScore: cyber?.score ?? null,
    });

    // ─── CHAPITRE: Synthèse direction ─────────────────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, 'Synthèse direction');
    this.paragraph(
      ctx,
      "Cette synthèse présente les cinq indicateurs majeurs du Système de Management de la Sécurité de l'Information (SMSI) sur la dernière période. Elle vise une lecture en moins d'une minute par la direction.",
    );
    this.kpiGrid(ctx, [
      {
        label: 'Cyber-score',
        value: cyber?.score != null ? `${cyber.score}/100` : 'Non renseigné',
        caption: cyber?.trends
          ? `Δ7j ${this.formatDelta(cyber.trends.delta7d)} • Δ30j ${this.formatDelta(cyber.trends.delta30d)}`
          : '—',
      },
      {
        label: 'Conformité ISO 27001',
        value: compliance ? `${compliance.controls.pct}%` : 'Non renseigné',
        caption: compliance
          ? `${compliance.controls.covered}/${compliance.controls.total} contrôles`
          : '—',
      },
      {
        label: 'Incidents 30j',
        value: incidentTrend ? String(incidentTrend.total) : '0',
        caption: incidentTrend
          ? `${incidentTrend.top.length} critiques/élevés actifs`
          : '—',
      },
      {
        label: 'MTTR / MTTD',
        value:
          indicators?.mttrHours != null
            ? `${indicators.mttrHours}h / ${indicators.mttdHours ?? '—'}h`
            : 'Non renseigné',
        caption: 'moyenne 30j',
      },
      {
        label: 'Couverture MFA',
        value: indicators?.mfaPct != null ? `${indicators.mfaPct}%` : 'Non renseigné',
        caption: indicators
          ? `${indicators.mfaEnabledUsers}/${indicators.mfaActiveUsers} utilisateurs`
          : '—',
      },
    ]);

    // ─── CHAPITRE 4 — Contexte ────────────────────────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, '4. Contexte de l\'organisation');
    this.h2(ctx, '4.1 Compréhension de l\'organisation et de son contexte');
    this.paragraph(
      ctx,
      'OMNITECH SECURITY opère dans le secteur de la sécurité physique et numérique. Le périmètre du SMSI couvre l\'ensemble des systèmes d\'information internes (intranet, GED, messagerie, postes de travail) ainsi que les services exposés aux clients et prestataires.',
    );
    this.h2(ctx, '4.2 Compréhension des besoins et attentes des parties intéressées');
    this.paragraph(
      ctx,
      `Parties intéressées identifiées : direction, collaborateurs (${snapshot?.users?.active ?? '—'} utilisateurs actifs), clients, fournisseurs (DocuSeal, LDAP, hébergeur), autorités (CNIL, ANSSI). Leurs exigences sont collectées via revues de direction trimestrielles et analyses contractuelles.`,
    );
    this.h2(ctx, '4.3 Détermination du périmètre du SMSI');
    this.paragraph(
      ctx,
      `Le SMSI couvre ${activeFrameworks.length > 0 ? activeFrameworks.map((f: { name: string; version: string }) => `${f.name} v${f.version}`).join(', ') : 'le référentiel ISO 27001:2022'}. Les actifs critiques sont au nombre de ${smsiState?.criticalAssets ?? 'Non renseigné — voir page Documents'} (documents classifiés CONFIDENTIEL/SECRET).`,
    );

    // ─── CHAPITRE 5 — Leadership ──────────────────────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, '5. Leadership');
    this.h2(ctx, '5.1 Leadership et engagement');
    this.paragraph(
      ctx,
      `La direction d\'OMNITECH SECURITY s\'engage formellement dans la mise en œuvre, le maintien et l\'amélioration continue du SMSI. ${smsiState?.lastReview ? `Dernière revue de direction réalisée le ${this.formatDate(smsiState.lastReview.date)} (« ${smsiState.lastReview.title} »).` : 'Dernière revue de direction : Non renseigné — voir page Conformité.'}`,
    );
    this.paragraph(
      ctx,
      `Prochaine revue planifiée : ${smsiState?.nextReview ? `${this.formatDate(smsiState.nextReview.date)} — ${smsiState.nextReview.title}` : 'Non renseigné — voir page Conformité.'}`,
    );
    this.h2(ctx, '5.2 Politique');
    this.paragraph(
      ctx,
      `Le SMSI repose sur ${smsiState?.activePolicies ?? 'Non renseigné — voir page Documents'} politiques et procédures approuvées et publiées. Elles couvrent le contrôle d\'accès, la classification des informations, la gestion des incidents et la continuité.`,
    );

    // ─── CHAPITRE 6 — Planification ──────────────────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, '6. Planification');
    this.h2(ctx, '6.1 Actions face aux risques et opportunités');
    this.paragraph(
      ctx,
      `Risques opérationnels ouverts (incidents critiques/élevés non clôturés) : ${smsiState?.openRisks ?? 'Non renseigné'}. Tâches de conformité en retard : ${compliance?.tasks.overdue ?? 'Non renseigné'} sur ${compliance?.tasks.total ?? 0}.`,
    );
    if (incidentTrend?.top && incidentTrend.top.length > 0) {
      this.paragraph(ctx, 'Top 3 incidents prioritaires :');
      for (const inc of incidentTrend.top) {
        this.bullet(
          ctx,
          `${inc.reference} — ${inc.title} [${inc.severity}/${inc.status}] détecté le ${this.formatDate(inc.detectedAt)}`,
        );
      }
    }
    this.h2(ctx, '6.2 Objectifs de sécurité de l\'information et plans pour les atteindre');
    this.paragraph(
      ctx,
      `Objectif global de conformité ISO 27001 : ${compliance ? `${compliance.controls.pct}% atteint sur ${compliance.controls.total} contrôles` : 'Non renseigné'}. Objectif MFA : ${indicators?.mfaPct ?? 'Non renseigné'}% (cible 100%).`,
    );

    // ─── CHAPITRE 7 — Support ────────────────────────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, '7. Support');
    this.h2(ctx, '7.1 Ressources');
    this.paragraph(
      ctx,
      `Effectif actif : ${snapshot?.users?.active ?? 'Non renseigné'} collaborateurs. Tickets ouverts (charge actuelle) : ${snapshot?.tickets?.open ?? 'Non renseigné'} avec une résolution moyenne de ${snapshot?.tickets?.avgResolutionHours ?? '—'}h.`,
    );
    this.h2(ctx, '7.2 Compétences');
    this.paragraph(
      ctx,
      'La sensibilisation des collaborateurs est assurée par la signature des chartes (politique d\'usage, charte informatique) et les campagnes de quiz/phishing simulé.',
    );
    if (snapshot?.chartes) {
      this.paragraph(
        ctx,
        `Chartes actives : ${snapshot.chartes.active}. Signatures restantes : ${snapshot.chartes.pendingSignatures}.`,
      );
    }

    // ─── CHAPITRE 8 — Fonctionnement ─────────────────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, '8. Fonctionnement');
    this.h2(ctx, '8.1 Planification et maîtrise opérationnelles');
    this.paragraph(
      ctx,
      `Les processus opérationnels du SMSI sont supervisés via les indicateurs MTTR (Mean Time To Resolve) et MTTD (Mean Time To Detect) : MTTR = ${indicators?.mttrHours ?? '—'}h, MTTD = ${indicators?.mttdHours ?? '—'}h sur 30 jours.`,
    );
    this.h2(ctx, '8.2 Appréciation des risques');
    this.paragraph(
      ctx,
      'L\'appréciation des risques est conduite à partir des incidents historiques, du flux de veille (CVE critiques) et des résultats de campagnes d\'access-review.',
    );
    if (snapshot?.accessReviews) {
      this.paragraph(
        ctx,
        `Access-reviews : ${snapshot.accessReviews.pending} en cours, dont ${snapshot.accessReviews.overdue} en retard.`,
      );
    }
    this.h2(ctx, '8.3 Traitement des risques');
    this.paragraph(
      ctx,
      'Le traitement des risques est documenté via les remédiations attachées à chaque incident (modèle Remediation) et via les tâches de conformité (modèle ComplianceTask).',
    );

    // ─── CHAPITRE 9 — Évaluation des performances ────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, '9. Évaluation des performances');
    this.h2(ctx, '9.1 Surveillance, mesure, analyse et évaluation');
    this.paragraph(
      ctx,
      'Les indicateurs sont produits en continu par l\'intranet OMNITECH (cyber-score quotidien, snapshots hebdomadaires, dashboard RSSI temps réel).',
    );
    if (cyber?.domains) {
      this.paragraph(ctx, 'Détail par domaine ISO 27001 (cyber-score) :');
      for (const dom of cyber.domains) {
        this.bullet(ctx, `${dom.name} (${dom.iso}) — ${dom.score}/100`);
      }
    }
    this.h2(ctx, '9.2 Audit interne');
    this.paragraph(
      ctx,
      `Sur la période, ${snapshot?.audit?.eventsLast24h ?? 'Non renseigné'} événements d\'audit ont été enregistrés (24h glissantes). Connexions échouées : ${snapshot?.audit?.failedLoginsLast24h ?? '—'}.`,
    );
    this.h2(ctx, '9.3 Revue de direction');
    this.paragraph(
      ctx,
      smsiState?.lastReview
        ? `Dernière revue : ${this.formatDate(smsiState.lastReview.date)} — « ${smsiState.lastReview.title} ». Prochaine revue : ${smsiState?.nextReview ? this.formatDate(smsiState.nextReview.date) : 'à planifier'}.`
        : 'Aucune revue de direction enregistrée. Non renseigné — voir page Conformité.',
    );

    // ─── CHAPITRE 10 — Amélioration ──────────────────────────────────────
    this.startContentPage(ctx);
    this.h1(ctx, '10. Amélioration');
    this.h2(ctx, '10.1 Non-conformités et actions correctives');
    this.paragraph(
      ctx,
      `Tâches de conformité en retard : ${compliance?.tasks.overdue ?? 'Non renseigné'}. Documents en retard de revue : ${snapshot?.documents?.dueForReview ?? '—'}.`,
    );
    if (compliance?.byDomain) {
      this.paragraph(ctx, 'Couverture par domaine de l\'Annexe A :');
      for (const [dom, v] of Object.entries(compliance.byDomain)) {
        const dv = v as { covered: number; total: number; pct: number };
        this.bullet(ctx, `${dom} — ${dv.covered}/${dv.total} (${dv.pct}%)`);
      }
    }
    this.h2(ctx, '10.2 Amélioration continue');
    this.paragraph(
      ctx,
      'Le SMSI est révisé en boucle PDCA : revues de direction trimestrielles, mises à jour mensuelles du cyber-score, ajustement continu du registre des risques en fonction des incidents et de la veille.',
    );

    // ─── FINALISATION ────────────────────────────────────────────────────

    // Hash sur un payload canonique (déterministe : on n'inclut PAS la date pour un hash reproductible si on regenere — cependant on inclut exportId pour le distinguer)
    const canonicalPayload = JSON.stringify({
      title: 'Rapport SMSI ISO 27001:2022',
      version,
      author: opts.author,
      exportId,
      cyberScore: cyber?.score ?? null,
      compliancePct: compliance?.controls.pct ?? null,
      mfaPct: indicators?.mfaPct ?? null,
    });
    const hash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

    pdfDoc.setTitle('Rapport SMSI ISO 27001:2022 — OMNITECH SECURITY');
    pdfDoc.setAuthor(opts.author);
    pdfDoc.setSubject('Rapport SMSI structuré ISO 27001:2022');
    pdfDoc.setCreator('OMNITECH Intranet');
    pdfDoc.setProducer(`OMNITECH Intranet (pdf-lib) — export ${exportId}`);
    pdfDoc.setCreationDate(generatedAt);
    pdfDoc.setKeywords(['OMNITECH', 'SMSI', 'ISO27001', 'CONFIDENTIEL', `sha256:${hash}`]);

    // Filigrane + footer sur toutes les pages
    const pages = pdfDoc.getPages();
    pages.forEach((page, idx) => {
      this.drawWatermark(ctx, page);
      this.drawFooter(ctx, page, hash, idx + 1, pages.length, exportId, opts.author, generatedAt);
    });

    const bytes = await pdfDoc.save();
    const fileName = `omnitech-smsi-iso27001-${generatedAt.toISOString().split('T')[0]}-${exportId.slice(0, 8)}.pdf`;

    this.logger.log(
      `[smsi-pdf] generated export=${exportId} by=${opts.author} hash=${hash.slice(0, 16)}... pages=${pages.length}`,
    );

    return {
      buffer: Buffer.from(bytes),
      hash,
      exportId,
      generatedAt: generatedAt.toISOString(),
      fileName,
    };
  }

  // ===========================================================================
  // RENDER PRIMITIVES
  // ===========================================================================

  private renderCoverPage(
    ctx: RenderCtx,
    info: {
      version: string;
      generatedAt: Date;
      author: string;
      cyberScore: number | null;
    },
  ) {
    const page = ctx.pdfDoc.addPage([ctx.pageW, ctx.pageH]);
    ctx.currentPage = page;

    // Fond navy plein haut
    page.drawRectangle({
      x: 0,
      y: ctx.pageH - 280,
      width: ctx.pageW,
      height: 280,
      color: ctx.colorNavy,
    });
    // Bande orange
    page.drawRectangle({
      x: 0,
      y: ctx.pageH - 285,
      width: ctx.pageW,
      height: 5,
      color: ctx.colorOrange,
    });

    page.drawText('OMNITECH SECURITY', {
      x: ctx.marginX,
      y: ctx.pageH - 110,
      size: 26,
      font: ctx.fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('Rapport SMSI', {
      x: ctx.marginX,
      y: ctx.pageH - 170,
      size: 36,
      font: ctx.fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('ISO/IEC 27001:2022', {
      x: ctx.marginX,
      y: ctx.pageH - 210,
      size: 18,
      font: ctx.font,
      color: rgb(0.85, 0.9, 0.95),
    });
    page.drawText('Système de Management de la Sécurité de l\'Information', {
      x: ctx.marginX,
      y: ctx.pageH - 240,
      size: 11,
      font: ctx.fontItalic,
      color: rgb(0.85, 0.9, 0.95),
    });

    // Cartouche d'identification
    const boxY = 280;
    page.drawRectangle({
      x: ctx.marginX,
      y: boxY,
      width: ctx.usableW,
      height: 200,
      borderColor: ctx.colorNavy,
      borderWidth: 1.5,
      color: rgb(0.97, 0.97, 0.99),
    });

    const lines: Array<[string, string]> = [
      ['Période', this.formatDate(info.generatedAt.toISOString())],
      ['Version', info.version],
      ['Auteur', info.author],
      ['Classification', ctx.classification],
      ['Cyber-score', info.cyberScore != null ? `${info.cyberScore}/100` : 'Non renseigné'],
    ];
    let cy = boxY + 165;
    for (const [k, v] of lines) {
      page.drawText(k, {
        x: ctx.marginX + 20,
        y: cy,
        size: 10,
        font: ctx.fontBold,
        color: ctx.colorMuted,
      });
      page.drawText(v, {
        x: ctx.marginX + 130,
        y: cy,
        size: 11,
        font: ctx.font,
        color: ctx.colorText,
      });
      cy -= 28;
    }

    // Mention CONFIDENTIEL
    page.drawText('DOCUMENT CONFIDENTIEL', {
      x: ctx.marginX,
      y: 200,
      size: 14,
      font: ctx.fontBold,
      color: ctx.colorRed,
    });
    page.drawText(
      'Diffusion restreinte — Direction et fonctions sécurité — Ne pas reproduire sans autorisation.',
      {
        x: ctx.marginX,
        y: 180,
        size: 9,
        font: ctx.fontItalic,
        color: ctx.colorMuted,
      },
    );
  }

  private startContentPage(ctx: RenderCtx) {
    ctx.currentPage = ctx.pdfDoc.addPage([ctx.pageW, ctx.pageH]);
    this.drawHeader(ctx, ctx.currentPage);
    ctx.y = ctx.pageH - ctx.marginTop;
  }

  private drawHeader(ctx: RenderCtx, page: PDFPage) {
    page.drawRectangle({
      x: 0,
      y: ctx.pageH - 50,
      width: ctx.pageW,
      height: 50,
      color: ctx.colorNavy,
    });
    page.drawRectangle({
      x: 0,
      y: ctx.pageH - 52,
      width: ctx.pageW,
      height: 2,
      color: ctx.colorOrange,
    });
    page.drawText('OMNITECH SECURITY — Rapport SMSI ISO 27001:2022', {
      x: ctx.marginX,
      y: ctx.pageH - 32,
      size: 11,
      font: ctx.fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText(ctx.classification, {
      x: ctx.pageW - ctx.marginX - 80,
      y: ctx.pageH - 32,
      size: 9,
      font: ctx.fontBold,
      color: rgb(1, 0.9, 0.5),
    });
  }

  private drawFooter(
    ctx: RenderCtx,
    page: PDFPage,
    hash: string,
    pageNum: number,
    pageCount: number,
    exportId: string,
    author: string,
    generatedAt: Date,
  ) {
    page.drawLine({
      start: { x: ctx.marginX, y: 55 },
      end: { x: ctx.pageW - ctx.marginX, y: 55 },
      thickness: 0.5,
      color: ctx.colorMuted,
    });
    page.drawText(
      `Export #${exportId.slice(0, 8)} • ${generatedAt.toISOString()} • ${author}`,
      { x: ctx.marginX, y: 40, size: 7, font: ctx.font, color: ctx.colorMuted },
    );
    page.drawText(`SHA-256: ${hash}`, {
      x: ctx.marginX,
      y: 28,
      size: 6.5,
      font: ctx.fontMono,
      color: ctx.colorMuted,
    });
    page.drawText(`Page ${pageNum} / ${pageCount}`, {
      x: ctx.pageW - ctx.marginX - 60,
      y: 40,
      size: 7,
      font: ctx.font,
      color: ctx.colorMuted,
    });
  }

  /**
   * Filigrane diagonal "CONFIDENTIEL" en gris très clair.
   */
  private drawWatermark(ctx: RenderCtx, page: PDFPage) {
    const text = ctx.classification;
    const size = 70;
    const tw = ctx.fontBold.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (ctx.pageW - tw * 0.7) / 2,
      y: ctx.pageH / 2 - 50,
      size,
      font: ctx.fontBold,
      color: rgb(0.92, 0.92, 0.94),
      rotate: degrees(-30),
      opacity: 0.5,
    });
  }

  private h1(ctx: RenderCtx, text: string) {
    this.ensureSpace(ctx, 40);
    ctx.currentPage.drawText(text, {
      x: ctx.marginX,
      y: ctx.y,
      size: 18,
      font: ctx.fontBold,
      color: ctx.colorNavy,
    });
    ctx.y -= 8;
    ctx.currentPage.drawLine({
      start: { x: ctx.marginX, y: ctx.y },
      end: { x: ctx.marginX + 60, y: ctx.y },
      thickness: 2,
      color: ctx.colorOrange,
    });
    ctx.y -= 18;
  }

  private h2(ctx: RenderCtx, text: string) {
    this.ensureSpace(ctx, 25);
    ctx.currentPage.drawText(text, {
      x: ctx.marginX,
      y: ctx.y,
      size: 12,
      font: ctx.fontBold,
      color: ctx.colorNavy,
    });
    ctx.y -= 16;
  }

  private paragraph(ctx: RenderCtx, text: string) {
    const lines = this.wrapText(text, ctx.usableW, ctx.font, 10);
    for (const line of lines) {
      this.ensureSpace(ctx, 14);
      ctx.currentPage.drawText(line, {
        x: ctx.marginX,
        y: ctx.y,
        size: 10,
        font: ctx.font,
        color: ctx.colorText,
      });
      ctx.y -= 13;
    }
    ctx.y -= 6;
  }

  private bullet(ctx: RenderCtx, text: string) {
    const lines = this.wrapText(text, ctx.usableW - 14, ctx.font, 10);
    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(ctx, 14);
      if (i === 0) {
        ctx.currentPage.drawText('•', {
          x: ctx.marginX,
          y: ctx.y,
          size: 11,
          font: ctx.fontBold,
          color: ctx.colorOrange,
        });
      }
      ctx.currentPage.drawText(lines[i]!, {
        x: ctx.marginX + 14,
        y: ctx.y,
        size: 10,
        font: ctx.font,
        color: ctx.colorText,
      });
      ctx.y -= 13;
    }
    ctx.y -= 2;
  }

  private kpiGrid(
    ctx: RenderCtx,
    items: Array<{ label: string; value: string; caption: string }>,
  ) {
    // 5 KPI sur 1 colonne pour rester simple/lisible
    for (const it of items) {
      this.ensureSpace(ctx, 50);
      const boxY = ctx.y - 40;
      ctx.currentPage.drawRectangle({
        x: ctx.marginX,
        y: boxY,
        width: ctx.usableW,
        height: 40,
        color: rgb(0.97, 0.97, 0.99),
        borderColor: ctx.colorNavy,
        borderWidth: 0.5,
      });
      // Bande verticale orange à gauche
      ctx.currentPage.drawRectangle({
        x: ctx.marginX,
        y: boxY,
        width: 4,
        height: 40,
        color: ctx.colorOrange,
      });
      ctx.currentPage.drawText(it.label, {
        x: ctx.marginX + 15,
        y: boxY + 25,
        size: 9,
        font: ctx.fontBold,
        color: ctx.colorMuted,
      });
      ctx.currentPage.drawText(it.value, {
        x: ctx.marginX + 15,
        y: boxY + 8,
        size: 14,
        font: ctx.fontBold,
        color: ctx.colorNavy,
      });
      ctx.currentPage.drawText(it.caption, {
        x: ctx.marginX + 200,
        y: boxY + 14,
        size: 9,
        font: ctx.fontItalic,
        color: ctx.colorMuted,
      });
      ctx.y = boxY - 8;
    }
  }

  private ensureSpace(ctx: RenderCtx, requiredHeight: number) {
    if (ctx.y - requiredHeight < ctx.marginBottom) {
      this.startContentPage(ctx);
    }
  }

  private wrapText(
    text: string,
    maxW: number,
    fontRef: PDFFont,
    size: number,
  ): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (fontRef.widthOfTextAtSize(test, size) > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private formatDate(iso: string | null): string {
    if (!iso) return 'Non renseigné';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  private formatDelta(delta: number | null): string {
    if (delta == null) return 'n/a';
    if (delta > 0) return `+${delta}`;
    return String(delta);
  }
}

interface RenderCtx {
  pdfDoc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  fontMono: PDFFont;
  fontItalic: PDFFont;
  colorNavy: ReturnType<typeof rgb>;
  colorOrange: ReturnType<typeof rgb>;
  colorText: ReturnType<typeof rgb>;
  colorMuted: ReturnType<typeof rgb>;
  colorRed: ReturnType<typeof rgb>;
  colorGreen: ReturnType<typeof rgb>;
  colorAmber: ReturnType<typeof rgb>;
  pageW: number;
  pageH: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  usableW: number;
  currentPage: PDFPage;
  y: number;
  classification: string;
}
