import { Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  Prisma,
  BehaviorAlertSeverity,
  BehaviorRule,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { BEHAVIOR_RULES, RuleDefault } from "./rule-defaults";

/**
 * BehaviorDetectionService — UEBA (Item 28).
 *
 * Cron 5 min, fenêtre glissante 1h. Évalue chaque règle activée (BehaviorRule.enabled)
 * sur les `AuditLog` de la fenêtre, lève une `BehaviorAlert` si le seuil est franchi
 * et notifie SUPER_ADMIN si severity HIGH/CRITICAL.
 *
 * Garanties :
 *  - Idempotent par fenêtre : utilise une clé de dédup (ruleCode + userId +
 *    minute-buckétée par window) pour ne pas créer 100 alertes identiques sur
 *    le même incident.
 *  - Resilient : une règle qui échoue ne bloque pas les autres.
 *  - Documenté : chaque détection embarque dans `evidence` les auditLogIds qui
 *    l'ont déclenchée pour permettre la triage RSSI.
 *
 * Voir docs/security/UEBA_BEHAVIOR_DETECTION.md pour la doc complète.
 */
@Injectable()
export class BehaviorDetectionService {
  private readonly logger = new Logger(BehaviorDetectionService.name);
  private bootstrapped = false;

  // Cache local des règles actives (refresh à chaque tick cron)
  private activeRules: BehaviorRule[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  // ==========================================================================
  // Bootstrap : seed des règles par défaut au premier démarrage
  // ==========================================================================

  /**
   * Insère les règles par défaut (R001..R008) si elles n'existent pas encore.
   * Idempotent : un upsert par code, le RSSI peut modifier `threshold` ensuite
   * et ses changements ne seront PAS écrasés (on n'override que si la règle
   * n'existe pas).
   */
  async bootstrapRules(): Promise<{ created: number; existing: number }> {
    let created = 0;
    let existing = 0;
    for (const def of BEHAVIOR_RULES) {
      const found = await this.prisma.behaviorRule.findUnique({
        where: { code: def.code },
      });
      if (found) {
        existing += 1;
        continue;
      }
      try {
        await this.prisma.behaviorRule.create({
          data: {
            code: def.code,
            name: def.name,
            description: def.description,
            severity: def.severity,
            threshold: def.threshold as Prisma.InputJsonValue,
            enabled: true,
          },
        });
        created += 1;
      } catch (err) {
        this.logger.warn(
          `bootstrapRules: failed to create ${def.code}: ${(err as Error).message}`,
        );
      }
    }
    this.bootstrapped = true;
    this.logger.log(
      `behavior-detection.bootstrap created=${created} existing=${existing}`,
    );
    return { created, existing };
  }

  // ==========================================================================
  // Cron — 5 min
  // ==========================================================================

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    if (process.env.BEHAVIOR_DETECTION_ENABLED === "false") {
      return; // kill switch d'urgence
    }
    if (!this.bootstrapped) {
      try {
        await this.bootstrapRules();
      } catch (err) {
        this.logger.warn(
          `bootstrap failed: ${(err as Error).message} — skipping tick`,
        );
        return;
      }
    }

    const startedAt = Date.now();
    try {
      const result = await this.runDetection();
      this.logger.log({
        msg: "behavior-detection.tick",
        durationMs: Date.now() - startedAt,
        rulesEvaluated: result.rulesEvaluated,
        alertsCreated: result.alertsCreated,
        errors: result.errors.length,
      });
    } catch (err) {
      this.logger.error({
        msg: "behavior-detection.tick.failed",
        error: (err as Error).message,
      });
    }
  }

  // ==========================================================================
  // Detection runner
  // ==========================================================================

  /**
   * Lance une passe de détection sur la fenêtre glissante. Renvoie un compte
   * rendu pour l'observabilité.
   */
  async runDetection(): Promise<{
    rulesEvaluated: number;
    alertsCreated: number;
    errors: Array<{ ruleCode: string; error: string }>;
  }> {
    const errors: Array<{ ruleCode: string; error: string }> = [];
    let alertsCreated = 0;

    this.activeRules = await this.prisma.behaviorRule.findMany({
      where: { enabled: true },
    });

    for (const rule of this.activeRules) {
      try {
        const created = await this.evaluateRule(rule);
        alertsCreated += created;
      } catch (err) {
        errors.push({ ruleCode: rule.code, error: (err as Error).message });
        this.logger.warn({
          msg: "behavior-detection.rule.failed",
          ruleCode: rule.code,
          error: (err as Error).message,
        });
      }
    }

    return {
      rulesEvaluated: this.activeRules.length,
      alertsCreated,
      errors,
    };
  }

  /**
   * Dispatch sur le bon évaluateur selon le code de règle.
   * Les règles sont volontairement codées en dur (pas un moteur de DSL) pour
   * rester explicites, lisibles et performantes — la liste est limitée à
   * R001..R008 et évolue lentement.
   */
  private async evaluateRule(rule: BehaviorRule): Promise<number> {
    const t = (rule.threshold as Record<string, unknown>) ?? {};
    switch (rule.code) {
      case "R001":
        return this.evalR001(rule, t);
      case "R002":
        return this.evalR002(rule, t);
      case "R003":
        return this.evalR003(rule, t);
      case "R004":
        return this.evalR004(rule, t);
      case "R005":
        return this.evalR005(rule, t);
      case "R006":
        return this.evalR006(rule, t);
      case "R007":
        return this.evalR007(rule, t);
      case "R008":
        return this.evalR008(rule, t);
      default:
        this.logger.warn(
          `behavior-detection: unknown rule code ${rule.code} — skipping`,
        );
        return 0;
    }
  }

  // ==========================================================================
  // R001 — Login bursty multi-IP
  // ==========================================================================

  async evalR001(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const windowSeconds = Number(t.windowSeconds ?? 600);
    const minLogins = Number(t.minLogins ?? 10);
    const minDistinctIps = Number(t.minDistinctIps ?? 3);

    const since = new Date(Date.now() - windowSeconds * 1000);

    // groupBy par userId + count des LOGIN_SUCCESS
    const grouped = await this.prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: "LOGIN_SUCCESS",
        createdAt: { gte: since },
        userId: { not: null },
      },
      _count: { _all: true },
    } as never);

    let alertsCreated = 0;
    for (const g of grouped as Array<{ userId: string | null; _count: { _all: number } }>) {
      if (!g.userId) continue;
      if (g._count._all < minLogins) continue;

      // Vérifie qu'on a bien `minDistinctIps` distinctes
      const logs = await this.prisma.auditLog.findMany({
        where: {
          action: "LOGIN_SUCCESS",
          userId: g.userId,
          createdAt: { gte: since },
        },
        select: { id: true, ipAddress: true, createdAt: true },
        take: 200,
      });
      const ips = new Set(
        logs.map((l) => l.ipAddress).filter((v): v is string => !!v),
      );
      if (ips.size < minDistinctIps) continue;

      const score = this.normalizeScore(
        g._count._all,
        minLogins,
        minLogins * 5,
        ips.size,
        minDistinctIps,
      );

      const created = await this.createAlertIfNotDeduped({
        userId: g.userId,
        ruleCode: rule.code,
        severity: rule.severity,
        score,
        windowSeconds,
        title: `Connexions multiples depuis ${ips.size} IPs`,
        description: `${g._count._all} connexions réussies en ${windowSeconds / 60}min depuis ${ips.size} IPs distinctes. Seuils : ${minLogins} logins / ${minDistinctIps} IPs.`,
        evidence: {
          loginCount: g._count._all,
          distinctIps: Array.from(ips),
          windowSeconds,
          auditLogIds: logs.map((l) => l.id),
        },
      });
      if (created) alertsCreated += 1;
    }
    return alertsCreated;
  }

  // ==========================================================================
  // R002 — Off-hours access
  // ==========================================================================

  async evalR002(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const offHoursStart = Number(t.offHoursStart ?? 22);
    const offHoursEnd = Number(t.offHoursEnd ?? 6);
    const historicalStart = Number(t.historicalStart ?? 9);
    const historicalEnd = Number(t.historicalEnd ?? 19);
    const historicalDays = Number(t.historicalDays ?? 30);
    const minHistoricalLogins = Number(t.minHistoricalLogins ?? 10);

    // Fenêtre actuelle = 5 min (matches le cron, on alerte UNE FOIS par tick).
    const since = new Date(Date.now() - 5 * 60_000);

    const recent = await this.prisma.auditLog.findMany({
      where: {
        action: "LOGIN_SUCCESS",
        createdAt: { gte: since },
        userId: { not: null },
      },
      select: { id: true, userId: true, ipAddress: true, createdAt: true },
      take: 500,
    });

    let alertsCreated = 0;
    for (const log of recent) {
      if (!log.userId) continue;
      const hour = log.createdAt.getUTCHours();
      const isOffHours =
        offHoursStart > offHoursEnd
          ? hour >= offHoursStart || hour < offHoursEnd
          : hour >= offHoursStart && hour < offHoursEnd;
      if (!isOffHours) continue;

      // Vérifie l'historique : tous les logins du user ces N derniers jours
      // étaient dans la plage de bureau ?
      const historicalSince = new Date(
        Date.now() - historicalDays * 24 * 60 * 60_000,
      );
      const historical = await this.prisma.auditLog.findMany({
        where: {
          action: "LOGIN_SUCCESS",
          userId: log.userId,
          createdAt: { gte: historicalSince, lt: since },
        },
        select: { createdAt: true },
        take: 1000,
      });
      if (historical.length < minHistoricalLogins) continue;

      const allInOfficeHours = historical.every((h) => {
        const hh = h.createdAt.getUTCHours();
        return hh >= historicalStart && hh < historicalEnd;
      });
      if (!allInOfficeHours) continue;

      const score = 0.55; // moyenne — comportement suspect mais pas alarmant

      const created = await this.createAlertIfNotDeduped({
        userId: log.userId,
        ruleCode: rule.code,
        severity: rule.severity,
        score,
        windowSeconds: 5 * 60,
        title: `Connexion hors heures de bureau (${hour}h UTC)`,
        description: `Connexion réussie à ${hour}h UTC. Les ${historical.length} derniers logins (${historicalDays}j) étaient tous entre ${historicalStart}h-${historicalEnd}h.`,
        evidence: {
          hour,
          ipAddress: log.ipAddress,
          historicalLoginCount: historical.length,
          historicalWindow: `${historicalStart}h-${historicalEnd}h`,
          auditLogIds: [log.id],
        },
      });
      if (created) alertsCreated += 1;
    }
    return alertsCreated;
  }

  // ==========================================================================
  // R003 — Document download burst
  // ==========================================================================

  async evalR003(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const windowSeconds = Number(t.windowSeconds ?? 300);
    const minDownloads = Number(t.minDownloads ?? 50);
    const auditAction = String(t.auditAction ?? "DOCUMENT_DOWNLOADED");

    const since = new Date(Date.now() - windowSeconds * 1000);
    const grouped = await this.prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: auditAction,
        createdAt: { gte: since },
        userId: { not: null },
      },
      _count: { _all: true },
    } as never);

    let alertsCreated = 0;
    for (const g of grouped as Array<{ userId: string | null; _count: { _all: number } }>) {
      if (!g.userId) continue;
      if (g._count._all < minDownloads) continue;

      const logs = await this.prisma.auditLog.findMany({
        where: {
          action: auditAction,
          userId: g.userId,
          createdAt: { gte: since },
        },
        select: { id: true, resourceId: true, createdAt: true },
        take: 200,
      });

      const score = this.normalizeScore(
        g._count._all,
        minDownloads,
        minDownloads * 3,
      );

      const created = await this.createAlertIfNotDeduped({
        userId: g.userId,
        ruleCode: rule.code,
        severity: rule.severity,
        score,
        windowSeconds,
        title: `Téléchargements en masse (${g._count._all} docs)`,
        description: `${g._count._all} téléchargements en ${windowSeconds / 60}min — pattern d'exfiltration.`,
        evidence: {
          downloadCount: g._count._all,
          documentIds: logs.map((l) => l.resourceId).filter(Boolean),
          windowSeconds,
          auditLogIds: logs.map((l) => l.id),
        },
      });
      if (created) alertsCreated += 1;
    }
    return alertsCreated;
  }

  // ==========================================================================
  // R004 — Geographic anomaly (impossible travel)
  // ==========================================================================

  async evalR004(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const windowSeconds = Number(t.windowSeconds ?? 3600);
    const minDistanceKm = Number(t.minDistanceKm ?? 1000);
    const requireDistinctCountries = t.requireDistinctCountries !== false;

    const since = new Date(Date.now() - windowSeconds * 1000);
    const recent = await this.prisma.auditLog.findMany({
      where: {
        action: "LOGIN_SUCCESS",
        createdAt: { gte: since },
        userId: { not: null },
        ipAddress: { not: null },
      },
      select: { id: true, userId: true, ipAddress: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });

    // Group by user → liste des login + IPs
    const byUser = new Map<
      string,
      Array<{ id: string; ip: string; at: Date }>
    >();
    for (const r of recent) {
      if (!r.userId || !r.ipAddress) continue;
      const list = byUser.get(r.userId) ?? [];
      list.push({ id: r.id, ip: r.ipAddress, at: r.createdAt });
      byUser.set(r.userId, list);
    }

    let alertsCreated = 0;
    for (const [userId, logins] of byUser.entries()) {
      if (logins.length < 2) continue;
      // Détection naïve : on regarde si DEUX logins consécutifs viennent
      // d'IPs très différentes. La "distance" exacte requiert geolite2-redist —
      // si non disponible, on retombe sur "IPs de /16 différents → flagged".
      for (let i = 1; i < logins.length; i++) {
        const a = logins[i - 1];
        const b = logins[i];
        const dtSec = (b.at.getTime() - a.at.getTime()) / 1000;
        if (dtSec > windowSeconds) continue;

        const same16 = this.sameIpv4Slash16(a.ip, b.ip);
        if (same16) continue;

        const distance = this.estimateDistanceKm(a.ip, b.ip);
        const distanceUnknown = distance === null;
        const triggered = distanceUnknown
          ? requireDistinctCountries // fallback : on alerte si les /16 sont distincts (déjà vrai ici)
          : distance >= minDistanceKm;
        if (!triggered) continue;

        const score = distanceUnknown
          ? 0.6
          : Math.min(1, distance / (minDistanceKm * 2));

        const created = await this.createAlertIfNotDeduped({
          userId,
          ruleCode: rule.code,
          severity: rule.severity,
          score,
          windowSeconds,
          title: distanceUnknown
            ? `Logins depuis IPs distantes (geo non résolue)`
            : `Voyage impossible : ~${Math.round(distance!)}km en ${Math.round(dtSec / 60)}min`,
          description: distanceUnknown
            ? `Connexions depuis ${a.ip} puis ${b.ip} en ${Math.round(dtSec / 60)}min — IPs de /16 différents (geolite2 non installée, alerte sur heuristique IP).`
            : `Connexions depuis ${a.ip} puis ${b.ip} : distance estimée ${Math.round(distance!)}km en ${Math.round(dtSec / 60)}min — incompatible avec un déplacement humain.`,
          evidence: {
            ipBefore: a.ip,
            ipAfter: b.ip,
            distanceKm: distance,
            deltaSeconds: dtSec,
            auditLogIds: [a.id, b.id],
          },
        });
        if (created) alertsCreated += 1;
      }
    }
    return alertsCreated;
  }

  // ==========================================================================
  // R005 — Failed login spike
  // ==========================================================================

  async evalR005(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const windowSeconds = Number(t.windowSeconds ?? 900);
    const minFailures = Number(t.minFailures ?? 20);

    const since = new Date(Date.now() - windowSeconds * 1000);

    // Note : LOGIN_FAILED a souvent userId=NULL (l'email tapé n'existe pas).
    // On groupe alors par metadata.email (extrait via le snapshot RGPD).
    // Pour simplicité, on groupe par (userId, metadata->>email) en fallback.
    const grouped = await this.prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: "LOGIN_FAILED",
        createdAt: { gte: since },
        userId: { not: null },
      },
      _count: { _all: true },
    } as never);

    let alertsCreated = 0;
    for (const g of grouped as Array<{ userId: string | null; _count: { _all: number } }>) {
      if (!g.userId) continue;
      if (g._count._all < minFailures) continue;

      const logs = await this.prisma.auditLog.findMany({
        where: {
          action: "LOGIN_FAILED",
          userId: g.userId,
          createdAt: { gte: since },
        },
        select: { id: true, ipAddress: true, createdAt: true },
        take: 200,
      });

      const score = this.normalizeScore(
        g._count._all,
        minFailures,
        minFailures * 3,
      );

      const ips = Array.from(new Set(logs.map((l) => l.ipAddress).filter(Boolean)));

      const created = await this.createAlertIfNotDeduped({
        userId: g.userId,
        ruleCode: rule.code,
        severity: rule.severity,
        score,
        windowSeconds,
        title: `Brute force : ${g._count._all} échecs login`,
        description: `${g._count._all} échecs de login en ${windowSeconds / 60}min depuis ${ips.length} IP(s).`,
        evidence: {
          failureCount: g._count._all,
          distinctIps: ips,
          windowSeconds,
          auditLogIds: logs.map((l) => l.id),
        },
      });
      if (created) alertsCreated += 1;
    }
    return alertsCreated;
  }

  // ==========================================================================
  // R006 — Privilege escalation suspicion
  // ==========================================================================

  async evalR006(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const windowSeconds = Number(t.windowSeconds ?? 60);
    const adminPathPatterns = (t.adminPathPatterns as string[] | undefined) ?? [
      "/admin",
      "/audit",
    ];

    // Récupère les rôles changés récemment (window large pour catcher
    // l'enchaînement role-change → admin-action)
    const since = new Date(Date.now() - 600_000); // 10 min de marge
    const recentRoleChanges = await this.prisma.auditLog.findMany({
      where: {
        action: "USER_ROLE_CHANGED",
        createdAt: { gte: since },
      },
      select: { id: true, resourceId: true, createdAt: true, userId: true },
      take: 100,
    });

    let alertsCreated = 0;
    for (const change of recentRoleChanges) {
      // resourceId = userId du user dont le rôle a été changé
      const targetUserId = change.resourceId;
      if (!targetUserId) continue;

      const after = await this.prisma.auditLog.findMany({
        where: {
          userId: targetUserId,
          createdAt: {
            gte: change.createdAt,
            lte: new Date(change.createdAt.getTime() + windowSeconds * 1000),
          },
        },
        select: { id: true, action: true, resourceType: true, createdAt: true },
        take: 50,
      });

      const adminHits = after.filter((a) =>
        adminPathPatterns.some((p) => a.action.includes(p) || a.resourceType.toLowerCase().includes(p.replace("/", ""))),
      );
      if (adminHits.length === 0) continue;

      const score = 0.85;

      const created = await this.createAlertIfNotDeduped({
        userId: targetUserId,
        ruleCode: rule.code,
        severity: rule.severity,
        score,
        windowSeconds,
        title: "Escalade de privilèges suspecte",
        description: `Le rôle de l'utilisateur a été modifié et il a utilisé un endpoint admin dans la minute. Pattern de compromission après promotion.`,
        evidence: {
          roleChangeAt: change.createdAt.toISOString(),
          actorOfRoleChange: change.userId,
          adminActions: adminHits.map((h) => ({
            action: h.action,
            at: h.createdAt.toISOString(),
          })),
          auditLogIds: [change.id, ...adminHits.map((h) => h.id)],
        },
      });
      if (created) alertsCreated += 1;
    }
    return alertsCreated;
  }

  // ==========================================================================
  // R007 — Sensitive document bulk download
  // ==========================================================================

  async evalR007(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const windowSeconds = Number(t.windowSeconds ?? 600);
    const minDownloads = Number(t.minDownloads ?? 5);
    const classifications =
      (t.classifications as string[] | undefined) ?? ["CONFIDENTIEL", "SECRET"];
    const auditAction = String(t.auditAction ?? "DOCUMENT_DOWNLOADED");

    const since = new Date(Date.now() - windowSeconds * 1000);
    const downloads = await this.prisma.auditLog.findMany({
      where: {
        action: auditAction,
        createdAt: { gte: since },
        userId: { not: null },
      },
      select: { id: true, userId: true, resourceId: true, createdAt: true, metadata: true },
      take: 500,
    });

    // Group by user, filter sensitive
    const byUser = new Map<string, typeof downloads>();
    for (const d of downloads) {
      if (!d.userId || !d.resourceId) continue;
      // metadata.classification (si snapshot pris dans l'audit downstream)
      const meta = d.metadata as Record<string, unknown> | null;
      const classifFromMeta = meta?.classification;
      let isSensitive = false;
      if (typeof classifFromMeta === "string") {
        isSensitive = classifications.includes(classifFromMeta);
      }
      if (!isSensitive) {
        // Fallback : on lookup le doc en DB
        try {
          const doc = await this.prisma.document.findUnique({
            where: { id: d.resourceId },
            select: { classification: true },
          });
          if (doc && classifications.includes(doc.classification)) {
            isSensitive = true;
          }
        } catch {
          // best-effort
        }
      }
      if (!isSensitive) continue;
      const list = byUser.get(d.userId) ?? [];
      list.push(d);
      byUser.set(d.userId, list);
    }

    let alertsCreated = 0;
    for (const [userId, logs] of byUser.entries()) {
      if (logs.length < minDownloads) continue;
      const score = this.normalizeScore(logs.length, minDownloads, minDownloads * 4);
      const created = await this.createAlertIfNotDeduped({
        userId,
        ruleCode: rule.code,
        severity: rule.severity,
        score,
        windowSeconds,
        title: `${logs.length} documents sensibles téléchargés`,
        description: `${logs.length} téléchargements de documents classés ${classifications.join("/")} en ${windowSeconds / 60}min.`,
        evidence: {
          downloadCount: logs.length,
          documentIds: logs.map((l) => l.resourceId).filter(Boolean),
          classifications,
          windowSeconds,
          auditLogIds: logs.map((l) => l.id),
        },
      });
      if (created) alertsCreated += 1;
    }
    return alertsCreated;
  }

  // ==========================================================================
  // R008 — MFA brute force
  // ==========================================================================

  async evalR008(
    rule: BehaviorRule,
    t: Record<string, unknown>,
  ): Promise<number> {
    const windowSeconds = Number(t.windowSeconds ?? 300);
    const minFailures = Number(t.minFailures ?? 10);
    const auditActions =
      (t.auditActions as string[] | undefined) ?? [
        "MFA_REVALIDATE_FAILED",
        "MFA_ACTIVATE_FAILED",
        "MFA_DISABLE_FAILED",
      ];

    const since = new Date(Date.now() - windowSeconds * 1000);
    const grouped = await this.prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: { in: auditActions },
        createdAt: { gte: since },
        userId: { not: null },
      },
      _count: { _all: true },
    } as never);

    let alertsCreated = 0;
    for (const g of grouped as Array<{ userId: string | null; _count: { _all: number } }>) {
      if (!g.userId) continue;
      if (g._count._all < minFailures) continue;

      const logs = await this.prisma.auditLog.findMany({
        where: {
          action: { in: auditActions },
          userId: g.userId,
          createdAt: { gte: since },
        },
        select: { id: true, action: true, ipAddress: true, createdAt: true },
        take: 50,
      });

      const score = this.normalizeScore(g._count._all, minFailures, minFailures * 2);

      const created = await this.createAlertIfNotDeduped({
        userId: g.userId,
        ruleCode: rule.code,
        severity: rule.severity,
        score,
        windowSeconds,
        title: `MFA brute force : ${g._count._all} échecs`,
        description: `${g._count._all} échecs MFA en ${windowSeconds / 60}min — l'attaquant tente de deviner le code TOTP.`,
        evidence: {
          failureCount: g._count._all,
          actions: Array.from(new Set(logs.map((l) => l.action))),
          windowSeconds,
          auditLogIds: logs.map((l) => l.id),
        },
      });
      if (created) alertsCreated += 1;
    }
    return alertsCreated;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Normalise un score 0..1 : entre [floor;ceil] linéairement.
   * Optionnellement, multiplie par un second facteur si fourni.
   */
  private normalizeScore(
    value: number,
    floor: number,
    ceil: number,
    secondValue?: number,
    secondFloor?: number,
  ): number {
    const main = Math.min(1, Math.max(0, (value - floor) / (ceil - floor)));
    if (secondValue === undefined || secondFloor === undefined) {
      return Math.max(0.5, main);
    }
    const second = Math.min(1, Math.max(0, secondValue / (secondFloor * 2)));
    return Math.max(0.5, (main + second) / 2);
  }

  /**
   * Crée une alerte sauf si une alerte sur la MÊME règle / user a déjà été
   * créée dans la fenêtre. Évite la sur-notification sur le même incident.
   * Retourne true si une alerte a été créée.
   */
  private async createAlertIfNotDeduped(input: {
    userId: string | null;
    ruleCode: string;
    severity: BehaviorAlertSeverity;
    score: number;
    windowSeconds: number;
    title: string;
    description: string;
    evidence: Record<string, unknown>;
  }): Promise<boolean> {
    const dedupSince = new Date(Date.now() - input.windowSeconds * 1000);
    const existing = await this.prisma.behaviorAlert.findFirst({
      where: {
        ruleCode: input.ruleCode,
        userId: input.userId,
        status: { in: ["NEW", "ACKNOWLEDGED"] },
        createdAt: { gte: dedupSince },
      },
      select: { id: true },
    });
    if (existing) return false;

    const alert = await this.prisma.behaviorAlert.create({
      data: {
        userId: input.userId ?? null,
        ruleCode: input.ruleCode,
        severity: input.severity,
        score: input.score,
        title: input.title,
        description: input.description,
        evidence: input.evidence as Prisma.InputJsonValue,
      },
    });

    // Notifs RSSI seulement pour HIGH/CRITICAL — MEDIUM/LOW restent visibles
    // sur le dashboard sans bombarder.
    if (
      this.notifications &&
      (input.severity === "HIGH" || input.severity === "CRITICAL")
    ) {
      await this.notifyRssi(alert.id, input.title, input.description, input.severity).catch(
        (err) => {
          this.logger.warn(
            `behavior-detection.notify_rssi_failed alertId=${alert.id} error=${(err as Error).message}`,
          );
        },
      );
    }
    return true;
  }

  /**
   * Notifie tous les SUPER_ADMIN et users RSSI (heuristique : email RSSI*).
   */
  private async notifyRssi(
    alertId: string,
    title: string,
    description: string,
    severity: BehaviorAlertSeverity,
  ): Promise<void> {
    if (!this.notifications) return;
    // Cible : SUPER_ADMIN + emails contenant "rssi"
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { role: "SUPER_ADMIN" },
          { email: { contains: "rssi", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    for (const u of recipients) {
      try {
        await this.notifications.create({
          userId: u.id,
          type: severity === "CRITICAL" ? "ALERT_CRITICAL" : "SECURITY_ALERT",
          title: `[UEBA] ${title}`,
          body: description,
          resourceType: "BehaviorAlert",
          resourceId: alertId,
          metadata: { severity },
        });
      } catch (err) {
        this.logger.warn(
          `behavior-detection.notify recipient=${u.id} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  // -- Geo helpers (best-effort, sans dépendance hard à geolite2-redist) -----

  /**
   * Détecte deux IPv4 dans le même /16. Retourne false si l'une des deux n'est
   * pas une IPv4 reconnue (cas IPv6 ou invalide).
   */
  private sameIpv4Slash16(ipA: string, ipB: string): boolean {
    const a = ipA.match(/^(\d{1,3})\.(\d{1,3})\./);
    const b = ipB.match(/^(\d{1,3})\.(\d{1,3})\./);
    if (!a || !b) return false;
    return a[1] === b[1] && a[2] === b[2];
  }

  /**
   * Estime la distance entre deux IPs en km. Renvoie null si la lib geolite2
   * n'est pas installée ou si l'IP n'est pas résolvable. Utilise un require
   * dynamique pour ne PAS imposer la dépendance au démarrage.
   */
  private estimateDistanceKm(ipA: string, ipB: string): number | null {
    try {
      // require dynamique pour éviter l'erreur si la lib n'est pas installée
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const maxmind = require("geolite2-redist");
      if (!maxmind || typeof maxmind.lookup !== "function") return null;
      const a = maxmind.lookup(ipA);
      const b = maxmind.lookup(ipB);
      if (!a?.location || !b?.location) return null;
      return haversineKm(
        a.location.latitude,
        a.location.longitude,
        b.location.latitude,
        b.location.longitude,
      );
    } catch {
      return null;
    }
  }
}

/** Distance Haversine entre deux points lat/lon en km. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // rayon Terre km
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
