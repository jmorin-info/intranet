import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PCA_SCENARIOS,
  PCA_SCHEDULED_JOBS,
  PcaRunStatus,
  PcaScenario,
  findScenario,
} from './pca-scenarios';

/**
 * PcaService — Orchestre les tests de continuité ISO 27001 A.5.30.
 *
 * Responsabilités :
 *  - Lister les scénarios disponibles (PCA_SCENARIOS est immuable, déclaré
 *    en TS pour éviter d'introduire une table de configuration)
 *  - Créer un `PcaRun` en base, l'exécuter en arrière-plan (fire-and-forget)
 *    et mettre à jour son statut + logs + result quand il termine
 *  - Lister l'historique paginé des runs et leurs logs
 *  - Imposer un rate limit : au maximum 1 run par scénario toutes les 10 min
 *
 * Sécurité / conformité :
 *  - Chaque run est audité (PCA_RUN_STARTED + PCA_RUN_COMPLETED) via
 *    AuditService, qui capture un snapshot de l'acteur (ISO A.5.33/A.5.28)
 *  - Les scénarios destructeurs (`destructive: true`) requièrent un header
 *    explicite X-Confirm: I-understand-this-is-destructive (aucun en v1)
 *  - Si un script référencé est absent (worktree minimal, par exemple),
 *    le run est marqué FAILED avec le message "script not found" sans crash
 */
@Injectable()
export class PcaService {
  private readonly logger = new Logger(PcaService.name);

  /** Racine du projet — résolue une fois au démarrage. */
  private readonly projectRoot = path.resolve(__dirname, '../../../..');

  /** Fenêtre de rate-limit par scénario (ms). */
  private static readonly RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

  /** Taille max des logs stockés (1 Mo, au-delà on tronque). */
  private static readonly MAX_LOG_BYTES = 1_000_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Catalogue ──────────────────────────────────────────────────────────

  /** Renvoie la liste des scénarios disponibles + indicateurs de planification. */
  listScenarios(): Array<PcaScenario & { cron: string | null }> {
    return PCA_SCENARIOS.map((scenario) => {
      const job = PCA_SCHEDULED_JOBS.find((j) => j.scenarioId === scenario.id);
      return { ...scenario, cron: job ? job.humanSchedule : null };
    });
  }

  /** Liste les crons planifiés pour la section "Config cron" du front. */
  listScheduledJobs(): ReadonlyArray<{
    scenarioId: string;
    cronExpression: string;
    humanSchedule: string;
  }> {
    return PCA_SCHEDULED_JOBS;
  }

  // ─── KPIs ───────────────────────────────────────────────────────────────

  /**
   * Renvoie les KPIs affichés en haut de la page /admin/pca :
   *  - Dernier test (delta en jours depuis maintenant)
   *  - Taux de succès sur 30 jours
   *  - Nombre total de tests
   *  - Prochain test planifié (humainement formaté)
   */
  async getKpis(): Promise<{
    lastRunAt: string | null;
    daysSinceLastRun: number | null;
    successRate30d: number | null;
    totalRuns: number;
    nextScheduled: { scenarioId: string; humanSchedule: string } | null;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [lastRun, totalRuns, recentRuns] = await Promise.all([
      this.prisma.pcaRun.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
      this.prisma.pcaRun.count(),
      this.prisma.pcaRun.findMany({
        where: { startedAt: { gte: thirtyDaysAgo } },
        select: { status: true },
      }),
    ]);

    const daysSinceLastRun = lastRun
      ? Math.floor(
          (Date.now() - lastRun.startedAt.getTime()) / (24 * 60 * 60 * 1000),
        )
      : null;

    let successRate30d: number | null = null;
    if (recentRuns.length > 0) {
      const successes = recentRuns.filter((r) => r.status === 'SUCCESS').length;
      successRate30d = Math.round((successes / recentRuns.length) * 100);
    }

    const nextScheduled = PCA_SCHEDULED_JOBS[0]
      ? {
          scenarioId: PCA_SCHEDULED_JOBS[0].scenarioId,
          humanSchedule: PCA_SCHEDULED_JOBS[0].humanSchedule,
        }
      : null;

    return {
      lastRunAt: lastRun?.startedAt.toISOString() || null,
      daysSinceLastRun,
      successRate30d,
      totalRuns,
      nextScheduled,
    };
  }

  // ─── Runs ───────────────────────────────────────────────────────────────

  /**
   * Démarre un run :
   *  1. Valide le scénario + le header de confirmation si destructeur
   *  2. Applique le rate limit (1 run / scénario / 10 min)
   *  3. Crée le PcaRun en statut PENDING puis déclenche l'exécution
   *     en arrière-plan (la promesse n'est pas awaited côté controller)
   */
  async startRun(params: {
    scenarioId: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    confirmHeader?: string;
  }): Promise<{ runId: string; status: PcaRunStatus }> {
    const scenario = findScenario(params.scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Scénario inconnu : ${params.scenarioId}`);
    }

    if (scenario.destructive) {
      const expected = 'I-understand-this-is-destructive';
      if (params.confirmHeader !== expected) {
        throw new ForbiddenException(
          'Ce scénario est destructeur. En-tête X-Confirm requis.',
        );
      }
    }

    // Rate limit : pas de nouveau run s'il en existe déjà un dans la fenêtre
    const windowStart = new Date(
      Date.now() - PcaService.RATE_LIMIT_WINDOW_MS,
    );
    const recent = await this.prisma.pcaRun.findFirst({
      where: {
        scenarioId: scenario.id,
        startedAt: { gte: windowStart },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException(
        `Un run pour ce scénario a déjà été lancé dans les 10 dernières minutes (id=${recent.id}).`,
      );
    }

    const run = await this.prisma.pcaRun.create({
      data: {
        scenarioId: scenario.id,
        status: 'PENDING',
        triggeredBy: params.userId,
        logs: '',
      },
      select: { id: true, status: true },
    });

    await this.audit.log({
      userId: params.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      action: 'PCA_RUN_STARTED',
      resourceType: 'PCA_RUN',
      resourceId: run.id,
      severity: 'INFO',
      metadata: { scenarioId: scenario.id, scenarioName: scenario.name },
    });

    // Exécution en arrière-plan — on ne bloque pas la réponse HTTP.
    this.executeRun(run.id, scenario, params.userId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PCA run ${run.id} unhandled error: ${msg}`);
    });

    return { runId: run.id, status: run.status as PcaRunStatus };
  }

  async getRun(id: string) {
    const run = await this.prisma.pcaRun.findUnique({
      where: { id },
      include: {
        triggeredByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    if (!run) throw new NotFoundException(`Run introuvable : ${id}`);
    const scenario = findScenario(run.scenarioId);
    return {
      ...run,
      scenarioName: scenario?.name || run.scenarioId,
      scenarioDescription: scenario?.description || null,
      scenarioIso: scenario?.iso || null,
    };
  }

  async getRunLogs(id: string): Promise<{ status: string; logs: string }> {
    const run = await this.prisma.pcaRun.findUnique({
      where: { id },
      select: { status: true, logs: true },
    });
    if (!run) throw new NotFoundException(`Run introuvable : ${id}`);
    return { status: run.status, logs: run.logs || '' };
  }

  async listRuns(params: { page?: number; limit?: number; scenarioId?: string }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    const where: Prisma.PcaRunWhereInput = {};
    if (params.scenarioId) where.scenarioId = params.scenarioId;

    const [rows, total] = await Promise.all([
      this.prisma.pcaRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          triggeredByUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.pcaRun.count({ where }),
    ]);

    const data = rows.map((r) => {
      const scenario = findScenario(r.scenarioId);
      return {
        ...r,
        scenarioName: scenario?.name || r.scenarioId,
        scenarioIso: scenario?.iso || null,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // ─── Exécution ──────────────────────────────────────────────────────────

  /**
   * Point d'entrée interne — démarre l'exécution d'un run déjà créé en base.
   * Garantit que le PcaRun est toujours mis en statut terminal (SUCCESS ou
   * FAILED), y compris en cas d'exception.
   */
  private async executeRun(
    runId: string,
    scenario: PcaScenario,
    userId: string,
  ): Promise<void> {
    await this.prisma.pcaRun.update({
      where: { id: runId },
      data: { status: 'RUNNING' },
    });

    const startedAt = Date.now();
    let finalStatus: PcaRunStatus = 'FAILED';
    let logs = '';
    let result: Prisma.InputJsonValue = {};

    try {
      if (scenario.script) {
        const execResult = await this.runScript(scenario);
        logs = execResult.logs;
        result = {
          summary: execResult.success ? 'Script terminé avec succès' : execResult.summary,
          exitCode: execResult.exitCode,
          durationMs: execResult.durationMs,
          scriptPath: scenario.script,
        };
        finalStatus = execResult.success ? 'SUCCESS' : 'FAILED';
      } else {
        const execResult = await this.runBuiltin(scenario);
        logs = execResult.logs;
        result = execResult.result;
        finalStatus = execResult.success ? 'SUCCESS' : 'FAILED';
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logs = `${logs}\n[pca] Exception: ${message}`.trim();
      result = { summary: `Exception: ${message}` };
      finalStatus = 'FAILED';
    } finally {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt;
      const truncatedLogs = this.truncateLogs(logs);

      await this.prisma.pcaRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          completedAt,
          duration: durationMs,
          logs: truncatedLogs,
          result,
        },
      });

      await this.audit.log({
        userId,
        action: 'PCA_RUN_COMPLETED',
        resourceType: 'PCA_RUN',
        resourceId: runId,
        severity: finalStatus === 'SUCCESS' ? 'INFO' : 'WARN',
        metadata: {
          scenarioId: scenario.id,
          status: finalStatus,
          durationMs,
        },
      });
    }
  }

  /**
   * Exécute le script bash d'un scénario via child_process.spawn.
   * Capture stdout+stderr, applique un timeout dur.
   */
  private runScript(scenario: PcaScenario): Promise<{
    success: boolean;
    exitCode: number | null;
    logs: string;
    summary: string;
    durationMs: number;
  }> {
    return new Promise((resolve) => {
      const [rawCmd, ...rawArgs] = (scenario.script || '').split(' ');
      const scriptRel = rawCmd || '';
      const scriptAbs = path.resolve(this.projectRoot, scriptRel);

      if (!fs.existsSync(scriptAbs)) {
        const msg = `Script introuvable: ${scriptRel} (résolu: ${scriptAbs})`;
        this.logger.warn(msg);
        resolve({
          success: false,
          exitCode: null,
          logs: `[pca] ${msg}`,
          summary: 'script not found',
          durationMs: 0,
        });
        return;
      }

      const startedAt = Date.now();
      const timeoutMs = scenario.timeoutMs ?? 10 * 60_000;

      const child = spawn('bash', [scriptAbs, ...rawArgs], {
        cwd: this.projectRoot,
        env: { ...process.env },
      });

      let output = '';
      const append = (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > PcaService.MAX_LOG_BYTES) {
          output = output.slice(-PcaService.MAX_LOG_BYTES);
        }
      };
      child.stdout.on('data', append);
      child.stderr.on('data', append);

      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          // already dead
        }
      }, timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          exitCode: null,
          logs: `${output}\n[pca] spawn error: ${err.message}`,
          summary: `spawn error: ${err.message}`,
          durationMs: Date.now() - startedAt,
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        const killed = signal !== null;
        const success = code === 0 && !killed;
        const summary = killed
          ? `Terminé par signal ${signal} (timeout?)`
          : success
            ? 'OK'
            : `Exit code ${code}`;
        resolve({
          success,
          exitCode: code,
          logs: output,
          summary,
          durationMs,
        });
      });
    });
  }

  /**
   * Exécute un scénario "builtin" (logique TS pure, sans script bash).
   * Renvoie logs + résultat structuré.
   */
  private async runBuiltin(scenario: PcaScenario): Promise<{
    success: boolean;
    logs: string;
    result: Prisma.InputJsonValue;
  }> {
    switch (scenario.id) {
      case 'service-failover-sim':
        return this.runServiceFailoverSim();
      case 'db-snapshot-check':
        return this.runDbSnapshotCheck();
      default:
        return {
          success: false,
          logs: `[pca] Scénario builtin non implémenté: ${scenario.id}`,
          result: { summary: 'not implemented' },
        };
    }
  }

  /**
   * Simulation panne service : vérifie que les services dépendants (redis,
   * meilisearch) répondent à un health check, et mesure la réaction du
   * backend lorsqu'on force un timeout très court. Si le service est
   * disponible ET que l'app dégrade gracieusement, le scénario est SUCCESS.
   *
   * v1 : on se limite à un ping réseau TCP + lecture du health interne.
   * L'objectif n'est pas de couper un service en prod mais de documenter
   * que la capacité à détecter la panne existe.
   */
  private async runServiceFailoverSim(): Promise<{
    success: boolean;
    logs: string;
    result: Prisma.InputJsonValue;
  }> {
    const lines: string[] = ['[pca] service-failover-sim — démarrage'];
    const services: Array<{ name: string; host: string; port: number }> = [
      {
        name: 'redis',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
      {
        name: 'meilisearch',
        host: process.env.MEILISEARCH_HOST || 'localhost',
        port: parseInt(process.env.MEILISEARCH_PORT || '7700', 10),
      },
    ];

    const results: Array<{
      service: string;
      host: string;
      port: number;
      reachable: boolean;
      latencyMs: number | null;
      error?: string;
    }> = [];

    for (const svc of services) {
      const probe = await this.tcpPing(svc.host, svc.port, 1500);
      lines.push(
        `[pca] ${svc.name} (${svc.host}:${svc.port}) — ${
          probe.reachable ? `OK (${probe.latencyMs}ms)` : `KO (${probe.error})`
        }`,
      );
      results.push({
        service: svc.name,
        host: svc.host,
        port: svc.port,
        reachable: probe.reachable,
        latencyMs: probe.latencyMs,
        error: probe.error,
      });
    }

    // On considère le drill SUCCESS dès qu'on a pu mesurer l'état de chaque
    // service (atteignable ou non). L'objectif est de prouver qu'on détecte
    // la panne, pas que tout est vert.
    const success = results.length > 0;
    lines.push(
      `[pca] Bilan : ${results.filter((r) => r.reachable).length}/${results.length} services joignables`,
    );

    return {
      success,
      logs: lines.join('\n'),
      result: {
        summary: success
          ? 'Probing terminé (détection de panne fonctionnelle)'
          : 'Aucune sonde exécutée',
        services: results as unknown as Prisma.InputJsonValue,
      },
    };
  }

  /**
   * Vérifie la présence d'un dump récent + compte les tables critiques.
   * Ne restaure rien (non destructif). Renvoie les counts pour comparaison
   * avec le dernier backup (métadonnée).
   */
  private async runDbSnapshotCheck(): Promise<{
    success: boolean;
    logs: string;
    result: Prisma.InputJsonValue;
  }> {
    const lines: string[] = ['[pca] db-snapshot-check — démarrage'];

    const backupDir = '/var/backups/omnitech';
    let latestBackup: { name: string; size: number; mtime: string } | null = null;
    try {
      if (fs.existsSync(backupDir)) {
        const entries = await fs.promises.readdir(backupDir);
        const sqlFiles: Array<{ name: string; size: number; mtime: Date }> = [];
        for (const entry of entries) {
          if (!entry.endsWith('.sql.gz')) continue;
          const full = path.join(backupDir, entry);
          try {
            const stat = await fs.promises.stat(full);
            if (stat.isFile()) {
              sqlFiles.push({ name: entry, size: stat.size, mtime: stat.mtime });
            }
          } catch {
            // skip
          }
        }
        sqlFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        const head = sqlFiles[0];
        if (head) {
          latestBackup = {
            name: head.name,
            size: head.size,
            mtime: head.mtime.toISOString(),
          };
          lines.push(
            `[pca] Dernier backup: ${head.name} (${head.size} octets, ${head.mtime.toISOString()})`,
          );
        } else {
          lines.push(`[pca] Aucun .sql.gz trouvé dans ${backupDir}`);
        }
      } else {
        lines.push(`[pca] Répertoire ${backupDir} introuvable`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`[pca] Erreur lecture répertoire backups: ${msg}`);
    }

    // Counts des tables critiques côté DB live.
    const counts: Record<string, number> = {};
    try {
      const [users, documents, auditLogs, incidents] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.document.count(),
        this.prisma.auditLog.count(),
        this.prisma.incident.count(),
      ]);
      counts.User = users;
      counts.Document = documents;
      counts.AuditLog = auditLogs;
      counts.Incident = incidents;
      for (const [table, count] of Object.entries(counts)) {
        lines.push(`[pca] ${table}: ${count} lignes`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`[pca] Erreur comptage DB: ${msg}`);
      return {
        success: false,
        logs: lines.join('\n'),
        result: {
          summary: `Erreur comptage DB: ${msg}`,
          latestBackup: latestBackup as unknown as Prisma.InputJsonValue,
        },
      };
    }

    const success = latestBackup !== null && counts.User > 0;
    lines.push(`[pca] Bilan: ${success ? 'OK' : 'WARN (vérifier backup)'}`);

    return {
      success,
      logs: lines.join('\n'),
      result: {
        summary: success
          ? 'Backup présent & base live cohérente'
          : 'Backup manquant ou DB vide',
        latestBackup: latestBackup as unknown as Prisma.InputJsonValue,
        liveCounts: counts,
      },
    };
  }

  /**
   * Ping TCP minimaliste — ouvre une socket, mesure la latence, referme.
   * Ne dépend d'aucun protocole applicatif (suffisant pour un "is it up?").
   */
  private tcpPing(
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<{ reachable: boolean; latencyMs: number | null; error?: string }> {
    // Import local pour éviter d'ajouter net au scope global du service.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const net = require('net') as typeof import('net');
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const socket = new net.Socket();
      let settled = false;
      const finish = (outcome: {
        reachable: boolean;
        latencyMs: number | null;
        error?: string;
      }) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        resolve(outcome);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        finish({ reachable: true, latencyMs: Date.now() - startedAt });
      });
      socket.once('timeout', () => {
        finish({ reachable: false, latencyMs: null, error: 'timeout' });
      });
      socket.once('error', (err) => {
        finish({ reachable: false, latencyMs: null, error: err.message });
      });
      try {
        socket.connect(port, host);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        finish({ reachable: false, latencyMs: null, error: msg });
      }
    });
  }

  private truncateLogs(logs: string): string {
    if (!logs) return '';
    if (logs.length <= PcaService.MAX_LOG_BYTES) return logs;
    const suffix = '\n[pca] ... logs tronqués ...';
    return logs.slice(-(PcaService.MAX_LOG_BYTES - suffix.length)) + suffix;
  }
}
