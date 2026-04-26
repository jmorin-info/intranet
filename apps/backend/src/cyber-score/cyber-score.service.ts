import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AccessReviewCampaignStatus,
  AuditSeverity,
  IncidentStatus,
  SignatureCampaignStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CyberScoreService — calcule un score cyber global /100 basé sur 10 domaines
 * ISO 27001:2022. Chaque domaine est noté /100 et la note globale est la
 * moyenne arithmétique (pondération égale v1).
 *
 * Domaines :
 *  1. Identités & Accès    (A.5.15, A.5.17, A.8.5)
 *  2. Sensibilisation      (A.6.3)
 *  3. Gestion docs         (A.5.12, A.5.13)
 *  4. Incidents & Veille   (A.5.7, A.5.24-27)
 *  5. Continuité           (A.5.30, A.8.13, A.8.14)
 *  6. Logs & Audit         (A.8.15, A.8.16)
 *  7. Conformité           (A.5.31, A.5.34, A.5.35)
 *  8. Crypto & Secrets     (A.8.24)
 *  9. Durcissement         (A.8.8, A.8.28)
 * 10. Fournisseurs         (A.5.19-23)
 *
 * Un snapshot est persisté dans `CyberScoreSnapshot` à chaque recompute manuel
 * et chaque dimanche 3h via le cron hebdomadaire.
 */

export interface CyberScoreSignal {
  label: string;
  value: string;
  weight: number; // 0..100 — poids de ce signal dans la note du domaine
  score: number; // 0..100 — contribution normalisée de ce signal
}

export interface CyberScoreDomain {
  key: string;
  iso: string;
  name: string;
  score: number; // 0..100
  signals: CyberScoreSignal[];
}

export interface CyberScoreResult {
  score: number;
  computedAt: string;
  domains: CyberScoreDomain[];
  trends: {
    delta7d: number | null;
    delta30d: number | null;
  };
}

@Injectable()
export class CyberScoreService {
  private readonly logger = new Logger(CyberScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron hebdomadaire — dimanche 3h du matin, persiste un snapshot.
   */
  @Cron('0 3 * * 0')
  async weeklyCron() {
    try {
      const res = await this.computeAndSnapshot({ persist: true });
      this.logger.log(`Weekly cyber-score snapshot persisted: ${res.score}/100`);
    } catch (err: any) {
      this.logger.error(
        `Weekly cyber-score snapshot failed: ${err?.message || err}`,
        err?.stack,
      );
    }
  }

  /**
   * Calcule le score courant + tendances et, si demandé, persiste un snapshot.
   */
  async computeAndSnapshot(opts: { persist: boolean }): Promise<CyberScoreResult> {
    const domains = await this.computeDomains();
    const score = Math.round(
      domains.reduce((acc, d) => acc + d.score, 0) / domains.length,
    );
    const trends = await this.computeTrends(score);
    const computedAt = new Date().toISOString();

    if (opts.persist) {
      try {
        await this.prisma.cyberScoreSnapshot.create({
          data: {
            score,
            // Prisma.JsonValue — on passe `as any` car Prisma v5 attend
            // InputJsonValue/InputJsonObject et nos domaines sont typés stricts
            // (CyberScoreDomain[]) — JSON compatible mais pas assignable direct.
            domains: domains as any,
          },
        });
      } catch (err: any) {
        this.logger.warn(
          `Persist cyber-score snapshot failed (non-fatal): ${err?.message || err}`,
        );
      }
    }

    return { score, computedAt, domains, trends };
  }

  /**
   * Retourne l'historique des `days` derniers jours (ordre chronologique).
   */
  async getHistory(days: number): Promise<Array<{ createdAt: string; score: number }>> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    try {
      const rows = await this.prisma.cyberScoreSnapshot.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, score: true },
      });
      return rows.map((r) => ({
        createdAt: r.createdAt.toISOString(),
        score: r.score,
      }));
    } catch (err: any) {
      this.logger.warn(`cyber-score history failed: ${err?.message || err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async computeTrends(
    current: number,
  ): Promise<{ delta7d: number | null; delta30d: number | null }> {
    try {
      const now = Date.now();
      const [s7, s30] = await Promise.all([
        this.prisma.cyberScoreSnapshot.findFirst({
          where: { createdAt: { lte: new Date(now - 7 * 24 * 3600 * 1000) } },
          orderBy: { createdAt: 'desc' },
          select: { score: true },
        }),
        this.prisma.cyberScoreSnapshot.findFirst({
          where: { createdAt: { lte: new Date(now - 30 * 24 * 3600 * 1000) } },
          orderBy: { createdAt: 'desc' },
          select: { score: true },
        }),
      ]);
      return {
        delta7d: s7 ? current - s7.score : null,
        delta30d: s30 ? current - s30.score : null,
      };
    } catch (err: any) {
      this.logger.warn(`cyber-score trends failed: ${err?.message || err}`);
      return { delta7d: null, delta30d: null };
    }
  }

  /**
   * Exécute toutes les queries et retourne les 10 sous-scores.
   */
  private async computeDomains(): Promise<CyberScoreDomain[]> {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const d90 = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const safe = async <T>(
      p: () => Promise<T>,
      fallback: T,
      label: string,
    ): Promise<T> => {
      try {
        return await p();
      } catch (err: any) {
        this.logger.warn(`cyber-score[${label}]: ${err?.message || err}`);
        return fallback;
      }
    };

    // Parallel fetch — chaque query est isolée par safe() afin qu'une erreur
    // isolée ne casse pas tout le calcul.
    const [
      activeUsers,
      mfaEnabledUsers,
      usersLoggedLast30d,
      orphanAccounts,
      chartesAcceptedUsers,
      quizActiveCampaigns,
      docsTotal,
      docsClassified,
      docsWithOwner,
      docsWithoutVersion,
      incidentsOpen30d,
      incidentsClosed30d,
      veilleCritical,
      veilleCriticalAcked,
      auditEventsLast30d,
      auditCriticalLast30d,
      accessReviewsOpen,
      accessReviewsOverdue,
      gdprActiveCampaigns,
      mfaRequiredFlagUsers,
      backupCount,
    ] = await Promise.all([
      safe(
        () => this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
        0,
        'activeUsers',
      ),
      safe(
        () =>
          this.prisma.user.count({
            where: { isActive: true, deletedAt: null, mfaEnabled: true },
          }),
        0,
        'mfaEnabledUsers',
      ),
      safe(
        () =>
          this.prisma.user.count({
            where: {
              isActive: true,
              deletedAt: null,
              lastLoginAt: { gte: d30 },
            },
          }),
        0,
        'usersLoggedLast30d',
      ),
      // "Comptes orphelins" = utilisateurs actifs jamais connectés depuis
      // ≥ 90 jours (heuristique simple : lastLoginAt null ET createdAt > 90j
      // ou lastLoginAt < d90).
      safe(
        () =>
          this.prisma.user.count({
            where: {
              isActive: true,
              deletedAt: null,
              OR: [
                { lastLoginAt: null, createdAt: { lt: d90 } },
                { lastLoginAt: { lt: d90 } },
              ],
            },
          }),
        0,
        'orphanAccounts',
      ),
      safe(
        () =>
          this.prisma.user.count({
            where: {
              isActive: true,
              deletedAt: null,
              chartesAcceptedAt: { not: null },
            },
          }),
        0,
        'chartesAcceptedUsers',
      ),
      safe(
        () => this.prisma.quizCampaign.count({ where: { isActive: true } }),
        0,
        'quizActiveCampaigns',
      ),
      safe(
        () => this.prisma.document.count({ where: { deletedAt: null } }),
        0,
        'docsTotal',
      ),
      safe(
        () =>
          this.prisma.document.count({
            where: {
              deletedAt: null,
              classification: { in: ['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET'] },
            },
          }),
        0,
        'docsClassified',
      ),
      safe(
        () =>
          this.prisma.document.count({
            where: { deletedAt: null, ownerId: { not: undefined } },
          }),
        0,
        'docsWithOwner',
      ),
      safe(
        () =>
          this.prisma.document.count({
            where: {
              deletedAt: null,
              currentVersionId: null,
            },
          }),
        0,
        'docsWithoutVersion',
      ),
      safe(
        () =>
          this.prisma.incident.count({
            where: {
              detectedAt: { gte: d30 },
              status: { notIn: [IncidentStatus.CLOSED, IncidentStatus.RECOVERED] },
            },
          }),
        0,
        'incidentsOpen30d',
      ),
      safe(
        () =>
          this.prisma.incident.count({
            where: {
              detectedAt: { gte: d30 },
              status: { in: [IncidentStatus.CLOSED, IncidentStatus.RECOVERED] },
            },
          }),
        0,
        'incidentsClosed30d',
      ),
      safe(
        () =>
          this.prisma.veilleItem.count({
            where: { severity: 'CRITICAL', publishedAt: { gte: d30 } },
          }),
        0,
        'veilleCritical',
      ),
      safe(
        () =>
          this.prisma.veilleItem.count({
            where: {
              severity: 'CRITICAL',
              publishedAt: { gte: d30 },
              acks: { some: {} },
            },
          }),
        0,
        'veilleCriticalAcked',
      ),
      safe(
        () =>
          this.prisma.auditLog.count({ where: { createdAt: { gte: d30 } } }),
        0,
        'auditEventsLast30d',
      ),
      safe(
        () =>
          this.prisma.auditLog.count({
            where: { createdAt: { gte: d30 }, severity: AuditSeverity.CRITICAL },
          }),
        0,
        'auditCriticalLast30d',
      ),
      safe(
        () =>
          this.prisma.accessReviewCampaign.count({
            where: {
              status: {
                in: [
                  AccessReviewCampaignStatus.ACTIVE,
                  AccessReviewCampaignStatus.DRAFT,
                ],
              },
            },
          }),
        0,
        'accessReviewsOpen',
      ),
      safe(
        () =>
          this.prisma.accessReviewCampaign.count({
            where: {
              status: {
                in: [
                  AccessReviewCampaignStatus.ACTIVE,
                  AccessReviewCampaignStatus.DRAFT,
                ],
              },
              dueDate: { lt: now },
            },
          }),
        0,
        'accessReviewsOverdue',
      ),
      // Campagnes "RGPD" = campagnes de signature actives (proxy acceptable
      // en l'absence d'une table dédiée RGPD campaign).
      safe(
        () =>
          this.prisma.signatureCampaign.count({
            where: {
              status: {
                in: [
                  SignatureCampaignStatus.SENT,
                  SignatureCampaignStatus.IN_PROGRESS,
                  SignatureCampaignStatus.DRAFT,
                ],
              },
            },
          }),
        0,
        'gdprActiveCampaigns',
      ),
      safe(
        () =>
          this.prisma.user.count({
            where: { isActive: true, deletedAt: null, mfaRequired: true },
          }),
        0,
        'mfaRequiredFlagUsers',
      ),
      // Heuristique : on compte les snapshots récents dans IT exports comme
      // preuve indirecte d'activité backup. Si 0, on descend le score.
      safe(
        () =>
          this.prisma.itExport.count({
            // ItExport.category est un String libre côté schéma (codes
            // catégorie tels que AD_AUDIT, FORTIGATE_CONFIG, BACKUP), pas un
            // enum Prisma : pas besoin de cast.
            where: { category: 'BACKUP' },
          }),
        0,
        'backupCount',
      ),
    ]);

    // -------------------------------------------------------------------
    // Construction des 10 domaines
    // -------------------------------------------------------------------

    const pct = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 100) : 0;

    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

    // 1. Identités & Accès
    const mfaPct = pct(mfaEnabledUsers, activeUsers);
    const activePct = pct(usersLoggedLast30d, activeUsers);
    const orphanPenalty = activeUsers > 0
      ? Math.max(0, 100 - Math.round((orphanAccounts / activeUsers) * 200))
      : 100;
    const identities: CyberScoreDomain = {
      key: 'identities',
      iso: 'A.5.15 / A.5.17 / A.8.5',
      name: 'Identités & Accès',
      score: clamp(mfaPct * 0.4 + activePct * 0.3 + orphanPenalty * 0.3),
      signals: [
        {
          label: 'MFA actif',
          value: `${mfaPct}%`,
          weight: 40,
          score: mfaPct,
        },
        {
          label: 'Users actifs 30j',
          value: `${activePct}%`,
          weight: 30,
          score: activePct,
        },
        {
          label: 'Comptes orphelins',
          value: String(orphanAccounts),
          weight: 30,
          score: orphanPenalty,
        },
      ],
    };

    // 2. Sensibilisation
    const chartesPct = pct(chartesAcceptedUsers, activeUsers);
    // Heuristique : pas de QuizAttempt dans le schéma — on note la présence
    // de campagnes quiz actives comme proxy (≥1 → 70, ≥3 → 100).
    const quizScore = quizActiveCampaigns >= 3 ? 100 : quizActiveCampaigns >= 1 ? 70 : 30;
    const awareness: CyberScoreDomain = {
      key: 'awareness',
      iso: 'A.6.3',
      name: 'Sensibilisation',
      score: clamp(chartesPct * 0.6 + quizScore * 0.4),
      signals: [
        {
          label: 'Chartes acceptées',
          value: `${chartesPct}%`,
          weight: 60,
          score: chartesPct,
        },
        {
          label: 'Campagnes quiz actives',
          value: String(quizActiveCampaigns),
          weight: 40,
          score: quizScore,
        },
      ],
    };

    // 3. Gestion docs
    const classifiedPct = pct(docsClassified, docsTotal);
    const ownerPct = pct(docsWithOwner, docsTotal);
    const versionPenalty = docsTotal > 0
      ? Math.max(0, 100 - Math.round((docsWithoutVersion / docsTotal) * 100))
      : 100;
    const docs: CyberScoreDomain = {
      key: 'docs',
      iso: 'A.5.12 / A.5.13',
      name: 'Gestion documentaire',
      score: clamp(classifiedPct * 0.4 + ownerPct * 0.3 + versionPenalty * 0.3),
      signals: [
        {
          label: 'Docs classifiés',
          value: `${classifiedPct}%`,
          weight: 40,
          score: classifiedPct,
        },
        {
          label: 'Docs avec owner',
          value: `${ownerPct}%`,
          weight: 30,
          score: ownerPct,
        },
        {
          label: 'Docs sans version',
          value: String(docsWithoutVersion),
          weight: 30,
          score: versionPenalty,
        },
      ],
    };

    // 4. Incidents & Veille
    const incidentsTotal = incidentsOpen30d + incidentsClosed30d;
    const incidentCloseRate = incidentsTotal > 0
      ? Math.round((incidentsClosed30d / incidentsTotal) * 100)
      : 100;
    const cveHandledRate = veilleCritical > 0
      ? Math.round((veilleCriticalAcked / veilleCritical) * 100)
      : 100;
    const incidents: CyberScoreDomain = {
      key: 'incidents',
      iso: 'A.5.7 / A.5.24-27',
      name: 'Incidents & Veille',
      score: clamp(incidentCloseRate * 0.5 + cveHandledRate * 0.5),
      signals: [
        {
          label: 'Incidents clos 30j',
          value: `${incidentsClosed30d}/${incidentsTotal}`,
          weight: 50,
          score: incidentCloseRate,
        },
        {
          label: 'CVE critiques traitées',
          value: `${veilleCriticalAcked}/${veilleCritical}`,
          weight: 50,
          score: cveHandledRate,
        },
      ],
    };

    // 5. Continuité
    // Pas de modèle Backup en DB — proxy = présence d'exports BACKUP récents
    // + variables env. RPO/RTO documenté → présent dans /config.
    // TODO: data-source to confirm — brancher sur la future table BackupRun.
    const backupScore = backupCount > 0 ? 80 : 40;
    const drillScore = 50; // TODO: data-source to confirm — pas de table drill
    const rpoRtoScore = process.env.RPO_HOURS && process.env.RTO_HOURS ? 100 : 60;
    const continuity: CyberScoreDomain = {
      key: 'continuity',
      iso: 'A.5.30 / A.8.13 / A.8.14',
      name: 'Continuité',
      score: clamp(backupScore * 0.5 + drillScore * 0.25 + rpoRtoScore * 0.25),
      signals: [
        {
          label: 'Backups récents',
          value: String(backupCount),
          weight: 50,
          score: backupScore,
        },
        {
          label: 'Dernier drill',
          value: 'n/a',
          weight: 25,
          score: drillScore,
        },
        {
          label: 'RPO/RTO documenté',
          value: process.env.RPO_HOURS && process.env.RTO_HOURS ? 'oui' : 'non',
          weight: 25,
          score: rpoRtoScore,
        },
      ],
    };

    // 6. Logs & Audit
    const volumeScore = auditEventsLast30d >= 1000 ? 100
      : auditEventsLast30d >= 100 ? 70
      : auditEventsLast30d > 0 ? 50 : 20;
    // Pas de table "investigations" — heuristique : ratio event critique
    // / volume total (plus c'est bas, mieux c'est).
    const anomalyRate = auditEventsLast30d > 0
      ? (auditCriticalLast30d / auditEventsLast30d) * 100
      : 0;
    const anomalyScore = clamp(100 - Math.round(anomalyRate * 10));
    const logs: CyberScoreDomain = {
      key: 'logs',
      iso: 'A.8.15 / A.8.16',
      name: 'Logs & Audit',
      score: clamp(volumeScore * 0.5 + anomalyScore * 0.5),
      signals: [
        {
          label: 'Volume logs 30j',
          value: String(auditEventsLast30d),
          weight: 50,
          score: volumeScore,
        },
        {
          label: 'Événements critiques',
          value: String(auditCriticalLast30d),
          weight: 50,
          score: anomalyScore,
        },
      ],
    };

    // 7. Conformité
    const accessReviewScore = accessReviewsOpen > 0
      ? Math.max(0, 100 - Math.round((accessReviewsOverdue / accessReviewsOpen) * 100))
      : 100;
    const gdprScore = gdprActiveCampaigns > 0 ? 100 : 50;
    const compliance: CyberScoreDomain = {
      key: 'compliance',
      iso: 'A.5.31 / A.5.34 / A.5.35',
      name: 'Conformité',
      score: clamp(accessReviewScore * 0.6 + gdprScore * 0.4),
      signals: [
        {
          label: 'Access-reviews dans délai',
          value: `${accessReviewsOpen - accessReviewsOverdue}/${accessReviewsOpen}`,
          weight: 60,
          score: accessReviewScore,
        },
        {
          label: 'Campagnes RGPD actives',
          value: String(gdprActiveCampaigns),
          weight: 40,
          score: gdprScore,
        },
      ],
    };

    // 8. Crypto & Secrets
    const mfaPolicyScore = mfaRequiredFlagUsers > 0 ? 100 : 50;
    const hstsScore = process.env.NODE_ENV === 'production' ? 100 : 70;
    const hmacScore = process.env.DOCUSEAL_WEBHOOK_SECRET &&
      (process.env.DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE || 'true').toLowerCase() !== 'false'
      ? 100 : 50;
    const crypto: CyberScoreDomain = {
      key: 'crypto',
      iso: 'A.8.24',
      name: 'Crypto & Secrets',
      score: clamp(mfaPolicyScore * 0.4 + hstsScore * 0.3 + hmacScore * 0.3),
      signals: [
        {
          label: 'Politique MFA imposée',
          value: mfaRequiredFlagUsers > 0 ? 'oui' : 'non',
          weight: 40,
          score: mfaPolicyScore,
        },
        {
          label: 'HSTS actif',
          value: process.env.NODE_ENV === 'production' ? 'oui' : 'dev',
          weight: 30,
          score: hstsScore,
        },
        {
          label: 'HMAC webhooks',
          value: process.env.DOCUSEAL_WEBHOOK_SECRET ? 'oui' : 'non',
          weight: 30,
          score: hmacScore,
        },
      ],
    };

    // 9. Durcissement
    const sentryScore = process.env.SENTRY_DSN ? 100 : 50;
    const rateLimitScore = process.env.THROTTLE_LIMIT ? 100 : 70;
    const cspScore = process.env.NODE_ENV === 'production' ? 100 : 70;
    const hardening: CyberScoreDomain = {
      key: 'hardening',
      iso: 'A.8.8 / A.8.28',
      name: 'Durcissement',
      score: clamp(sentryScore * 0.4 + rateLimitScore * 0.3 + cspScore * 0.3),
      signals: [
        {
          label: 'Sentry actif',
          value: process.env.SENTRY_DSN ? 'oui' : 'non',
          weight: 40,
          score: sentryScore,
        },
        {
          label: 'Rate-limit actif',
          value: process.env.THROTTLE_LIMIT ? 'oui' : 'défaut',
          weight: 30,
          score: rateLimitScore,
        },
        {
          label: 'CSP présent',
          value: process.env.NODE_ENV === 'production' ? 'oui' : 'dev',
          weight: 30,
          score: cspScore,
        },
      ],
    };

    // 10. Fournisseurs
    const docusealUp = !!process.env.DOCUSEAL_API_URL || !!process.env.DOCUSEAL_WEBHOOK_SECRET;
    const ollamaUp = !!process.env.OLLAMA_HOST || !!process.env.OLLAMA_URL;
    const ldapUp = !!process.env.LDAP_URL || !!process.env.LDAP_HOST;
    const thirdCount = [docusealUp, ollamaUp, ldapUp].filter(Boolean).length;
    const thirdScore = thirdCount === 3 ? 100 : thirdCount === 2 ? 75 : thirdCount === 1 ? 50 : 25;
    const suppliers: CyberScoreDomain = {
      key: 'suppliers',
      iso: 'A.5.19-23',
      name: 'Fournisseurs',
      score: clamp(thirdScore),
      signals: [
        {
          label: 'DocuSeal',
          value: docusealUp ? 'oui' : 'non',
          weight: 34,
          score: docusealUp ? 100 : 0,
        },
        {
          label: 'Ollama',
          value: ollamaUp ? 'oui' : 'non',
          weight: 33,
          score: ollamaUp ? 100 : 0,
        },
        {
          label: 'LDAP',
          value: ldapUp ? 'oui' : 'non',
          weight: 33,
          score: ldapUp ? 100 : 0,
        },
      ],
    };

    return [
      identities,
      awareness,
      docs,
      incidents,
      continuity,
      logs,
      compliance,
      crypto,
      hardening,
      suppliers,
    ];
  }
}
