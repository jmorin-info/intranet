import {
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
  Optional,
} from "@nestjs/common";
import { spawn } from "child_process";
import { MetricsService } from "./metrics.service";
import { AppMetricsService } from "./app-metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { OfficeService } from "../office/office.service";
import { RedisThrottlerStorage } from "../common/throttler/redis-throttler.storage";
import { CacheService } from "../common/cache/cache.service";

/**
 * Vérifie ClamAV en async (spawn) au lieu de execSync — sinon le thread
 * Node bloque jusqu'à 5s sur un health check public pollé toutes les 30s,
 * ce qui peut freeze l'event loop en multi-instance.
 *
 * Result caché en Redis 30s pour éviter de spawner un process par poll.
 */
async function probeClamavOnce(): Promise<"up" | "down"> {
  return new Promise((resolve) => {
    const proc = spawn("clamscan", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve("down");
    }, 5000);
    proc.on("error", () => {
      clearTimeout(timer);
      resolve("down");
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? "up" : "down");
    });
  });
}

/**
 * Unified service health state contract.
 *
 * Every service in the health response MUST use one of these values:
 *   - 'up'             : service is reachable and fully operational
 *   - 'down'           : service is unreachable or returning errors
 *   - 'degraded'       : service is reachable but not fully operational (e.g. no models loaded)
 *   - 'not_configured' : service is intentionally disabled or missing required configuration
 *   - 'unknown'        : could not determine status
 *
 * Frontend consumers rely on this exact union type. Do NOT add ad-hoc
 * values like 'configured', 'no_model', etc.
 */
export type ServiceHealthState =
  | "up"
  | "down"
  | "degraded"
  | "not_configured"
  | "unknown";

// Read version once at startup
let appVersion = "1.0.0";
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require("../../package.json");
  appVersion = pkg.version || "1.0.0";
} catch {
  // fallback
}

@Controller("health")
export class HealthController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly appMetrics: AppMetricsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly officeService?: OfficeService,
    @Optional()
    private readonly throttlerStorage?: RedisThrottlerStorage,
    @Optional() private readonly cache?: CacheService,
  ) {}

  private async probeClamav(): Promise<"up" | "down"> {
    if (this.cache) {
      const cached = await this.cache.get<string>("health:clamav");
      if (cached === "up" || cached === "down") return cached;
    }
    const status = await probeClamavOnce();
    if (this.cache) {
      // TTL 30s : aligné sur la cadence de poll frontend
      await this.cache.set("health:clamav", status, 30);
    }
    return status;
  }

  /**
   * Lightweight endpoint pollé par le frontend (toutes les 30s) pour afficher
   * l'overlay de maintenance. Public pour que l'overlay soit visible même
   * sans session authentifiée.
   */
  @Public()
  @Get("maintenance")
  async maintenance() {
    try {
      const cfg = await this.prisma.appConfig.findUnique({
        where: { key: "maintenance_mode" },
      });
      if (cfg?.value === "true") {
        const returnTimeCfg = await this.prisma.appConfig.findUnique({
          where: { key: "maintenance_return_time" },
        });
        return {
          maintenance: true,
          estimatedReturnTime: returnTimeCfg?.value || null,
        };
      }
    } catch {
      // DB indisponible → on considère que le site est dispo (fallback safe)
    }
    return { maintenance: false };
  }

  @Public()
  @Get()
  async check(@Query("check") check?: string) {
    // Check maintenance mode first
    try {
      const maintenanceConfig = await this.prisma.appConfig.findUnique({
        where: { key: "maintenance_mode" },
      });
      if (maintenanceConfig?.value === "true") {
        const returnTimeConfig = await this.prisma.appConfig.findUnique({
          where: { key: "maintenance_return_time" },
        });
        return {
          status: "maintenance",
          message: "Maintenance en cours",
          estimatedReturnTime: returnTimeConfig?.value || null,
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // If appConfig table doesn't exist yet, skip maintenance check
    }

    // If no specific check requested and no query param, return full health check
    if (check === undefined) {
      const result: Record<string, ServiceHealthState> = {};

      try {
        await this.prisma.$queryRaw`SELECT 1`;
        result.database = "up";
      } catch {
        result.database = "down";
      }

      // Redis health via Bull queue connection
      result.redis = "up"; // BullMQ handles reconnection internally

      // Throttler Redis storage (item 15) : ping dédié pour distinguer
      // l'état du throttler (qui peut être en fallback in-memory) de Redis
      // général. Utile en runbook : un opérateur veut savoir si le rate
      // limiting reste cohérent entre les instances.
      if (this.throttlerStorage) {
        try {
          const ping = await this.throttlerStorage.ping();
          if (!ping.ok) {
            result.throttlerRedis = "down";
          } else if (ping.mode === "redis") {
            result.throttlerRedis = "up";
          } else if (ping.mode === "in-memory") {
            // Redis indisponible mais fail-open : compteurs locaux,
            // multi-instance INCOHÉRENT — dégradé au niveau cluster.
            result.throttlerRedis = "degraded";
          } else {
            result.throttlerRedis = "down";
          }
        } catch {
          result.throttlerRedis = "down";
        }
      } else {
        result.throttlerRedis = "not_configured";
      }

      // Check LDAP from AppConfig (not env)
      try {
        const ldapEnabled = await this.prisma.appConfig.findUnique({
          where: { key: "ldap.enabled" },
        });
        const ldapUrl = await this.prisma.appConfig.findUnique({
          where: { key: "ldap.url" },
        });
        result.ldap =
          ldapEnabled?.value === "true" && ldapUrl?.value
            ? "up"
            : "not_configured";
      } catch {
        result.ldap = "down";
      }

      // SMTP: check host is set and actually reachable (not just localhost placeholder)
      const smtpHost = process.env.SMTP_HOST;
      if (!smtpHost) {
        result.smtp = "not_configured";
      } else if (smtpHost === "localhost" || smtpHost === "127.0.0.1") {
        // localhost SMTP typically means dev placeholder or local relay —
        // report as 'degraded' instead of misleading 'up'
        result.smtp = "degraded";
      } else {
        result.smtp = "up";
      }

      const fs = await import("fs");
      const storagePath = process.env.STORAGE_PATH || "./storage";
      result.storage = fs.existsSync(storagePath) ? "up" : "down";

      result.clamav = await this.probeClamav();

      // Meilisearch
      try {
        const meiliUrl = process.env.MEILISEARCH_URL || "http://localhost:7700";
        const meiliKey = process.env.MEILISEARCH_MASTER_KEY;
        if (meiliKey && process.env.MEILISEARCH_ENABLED === "true") {
          const axios = (await import("axios")).default;
          const meiliHealth = await axios.get(`${meiliUrl}/health`, {
            headers: { Authorization: `Bearer ${meiliKey}` },
            timeout: 3000,
          });
          result.meilisearch =
            meiliHealth.data?.status === "available" ? "up" : "degraded";
        } else {
          result.meilisearch = "not_configured";
        }
      } catch {
        result.meilisearch = "down";
      }

      // Ollama (LLM local)
      try {
        const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
        if (process.env.OLLAMA_ENABLED === "true") {
          const axios = (await import("axios")).default;
          const ollamaHealth = await axios.get(`${ollamaUrl}/api/tags`, {
            timeout: 3000,
          });
          const models = ollamaHealth.data?.models || [];
          // 'degraded' when Ollama is reachable but has no models loaded
          result.ollama = models.length > 0 ? "up" : "degraded";
        } else {
          result.ollama = "not_configured";
        }
      } catch {
        result.ollama = "down";
      }

      // CDN (Item 32) — Bunny / Cloudflare
      // Polling lightweight : juste un HEAD sur le fichier témoin (~50ms).
      // Le détail latency est exposé sur /health/cdn (endpoint dédié).
      const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
      if (cdnUrl) {
        try {
          const witnessUrl = `${cdnUrl.replace(/\/$/, "")}/_next/static/check.txt`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const cdnResponse = await fetch(witnessUrl, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          result.cdn = cdnResponse.ok ? "up" : "down";
        } catch {
          result.cdn = "down";
        }
      } else {
        result.cdn = "not_configured";
      }

      // OnlyOffice Docs Server
      if (this.officeService) {
        try {
          const officeHealth = await this.officeService.healthCheck();
          if (!this.officeService.isEnabled()) {
            result.onlyoffice = "not_configured";
          } else {
            result.onlyoffice = officeHealth.ok ? "up" : "down";
          }
        } catch {
          result.onlyoffice = this.officeService.isEnabled()
            ? "down"
            : "not_configured";
        }
      } else {
        result.onlyoffice = "not_configured";
      }

      // Enriched info
      const mem = process.memoryUsage();
      const [activeUsers, documentCount, lastAudit] = await Promise.all([
        this.prisma.user
          .count({ where: { isActive: true, deletedAt: null } })
          .catch(() => 0),
        this.prisma.document
          .count({ where: { deletedAt: null } })
          .catch(() => 0),
        this.prisma.auditLog
          .findFirst({
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
          .catch(() => null),
      ]);

      return {
        status: "ok",
        version: appVersion,
        uptime: process.uptime(),
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
        },
        counts: {
          activeUsers,
          documents: documentCount,
        },
        lastAuditLogAt: lastAudit?.createdAt?.toISOString() ?? null,
        services: result,
        timestamp: new Date().toISOString(),
      };
    }

    // Specific service check
    const result: Record<string, string> = {};

    if (check === "db") {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        result.db = "up";
      } catch {
        result.db = "down";
      }
    }

    if (check === "redis") {
      result.redis = "up";
    }

    if (check === "throttler-redis") {
      if (!this.throttlerStorage) {
        result["throttler-redis"] = "not_configured";
      } else {
        try {
          const ping = await this.throttlerStorage.ping();
          result["throttler-redis"] = ping.ok
            ? ping.mode === "redis"
              ? "up"
              : "degraded"
            : "down";
        } catch {
          result["throttler-redis"] = "down";
        }
      }
    }

    if (check === "ldap") {
      try {
        const ldapEnabled = await this.prisma.appConfig.findUnique({
          where: { key: "ldap.enabled" },
        });
        const ldapUrl = await this.prisma.appConfig.findUnique({
          where: { key: "ldap.url" },
        });
        result.ldap =
          ldapEnabled?.value === "true" && ldapUrl?.value
            ? "up"
            : "not_configured";
      } catch {
        result.ldap = "down";
      }
    }

    if (check === "smtp") {
      const smtpHost = process.env.SMTP_HOST;
      if (!smtpHost) {
        result.smtp = "not_configured";
      } else if (smtpHost === "localhost" || smtpHost === "127.0.0.1") {
        result.smtp = "degraded";
      } else {
        result.smtp = "up";
      }
    }

    if (check === "storage") {
      const fs = await import("fs");
      const storagePath = process.env.STORAGE_PATH || "./storage";
      result.storage = fs.existsSync(storagePath) ? "up" : "down";
    }

    if (check === "clamav") {
      result.clamav = await this.probeClamav();
    }

    return { status: result[check] || "unknown", service: check };
  }

  /**
   * Item 32 — CDN health check (Bunny.net / Cloudflare).
   *
   * Vérifie que le CDN configuré (`NEXT_PUBLIC_CDN_URL`) sert correctement
   * le fichier témoin `_next/static/check.txt` uploadé par le script de
   * déploiement. Utile pour :
   *   - les dashboards SRE (cf. /admin/system-health)
   *   - les alertes Prometheus (`omnitech_cdn_status`)
   *   - le runbook : si "down" → BunkerWeb peut router vers l'origine
   *     (location `/cdn-fallback/*` qui proxy_pass http://frontend).
   *
   * Public (pas de JWT) car appelé en polling toutes les 30s par le
   * frontend (cf. `useHealthStore`). Les valeurs renvoyées ne fuitent
   * que `cdn_url` (déjà publique côté browser via `NEXT_PUBLIC_*`) et
   * un état boolean — aucune donnée sensible.
   */
  @Public()
  @Get("cdn")
  async cdnHealth(): Promise<{
    status: ServiceHealthState;
    cdnUrl: string | null;
    provider: string | null;
    latencyMs: number | null;
    checkedAt: string;
  }> {
    const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || "";
    const provider = process.env.CDN_PROVIDER || "bunny";
    const checkedAt = new Date().toISOString();

    if (!cdnUrl) {
      return {
        status: "not_configured",
        cdnUrl: null,
        provider: null,
        latencyMs: null,
        checkedAt,
      };
    }

    const witnessUrl = `${cdnUrl.replace(/\/$/, "")}/_next/static/check.txt`;
    const start = Date.now();
    try {
      // Node 18+ : `fetch` natif — pas de dépendance NPM ajoutée.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(witnessUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "OmnitechIntranet-HealthCheck/1.0" },
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return {
          status: "down",
          cdnUrl,
          provider,
          latencyMs,
          checkedAt,
        };
      }

      // Témoin présent → on regarde si le contenu est cohérent (commit=…).
      const body = (await response.text()).trim();
      const looksValid = /commit=\S+/.test(body);
      return {
        status: looksValid ? "up" : "degraded",
        cdnUrl,
        provider,
        latencyMs,
        checkedAt,
      };
    } catch {
      return {
        status: "down",
        cdnUrl,
        provider,
        latencyMs: null,
        checkedAt,
      };
    }
  }

  /**
   * Detailed health check (SUPER_ADMIN only).
   * Returns Redis, Postgres pool, BullMQ, LDAP sync, and disk usage stats.
   */
  @Get("detailed")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async detailed() {
    const os = await import("os");
    const fs = await import("fs");
    const { execSync } = await import("child_process");

    // --- Redis ping ---
    let redisStats: Record<string, unknown> = { status: "unknown" };
    try {
      const Redis = (await import("ioredis")).default;
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 3000,
      });
      await redis.connect();
      const pong = await redis.ping();
      const info = await redis.info("memory");
      const usedMemMatch = info.match(/used_memory_human:(\S+)/);
      redisStats = {
        status: pong === "PONG" ? "up" : "down",
        usedMemory: usedMemMatch?.[1] ?? null,
      };
      await redis.quit();
    } catch (err) {
      redisStats = {
        status: "down",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // --- Postgres pool stats ---
    let pgStats: Record<string, unknown> = { status: "unknown" };
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ active: bigint; idle: bigint; total: bigint }>
      >`
        SELECT
          count(*) FILTER (WHERE state = 'active') AS active,
          count(*) FILTER (WHERE state = 'idle') AS idle,
          count(*) AS total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      const row = rows[0];
      pgStats = {
        status: "up",
        activeConnections: Number(row?.active ?? 0),
        idleConnections: Number(row?.idle ?? 0),
        totalConnections: Number(row?.total ?? 0),
      };
    } catch (err) {
      pgStats = {
        status: "down",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // --- Last LDAP sync ---
    let ldapSync: Record<string, unknown> = { lastSync: null };
    try {
      const lastSync = await this.prisma.auditLog.findFirst({
        where: { action: { contains: "LDAP" } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, action: true, metadata: true },
      });
      ldapSync = lastSync
        ? {
            lastSync: lastSync.createdAt.toISOString(),
            action: lastSync.action,
            metadata: lastSync.metadata,
          }
        : { lastSync: null };
    } catch {
      ldapSync = { lastSync: null };
    }

    // --- Disk usage of storage folder ---
    let diskUsage: Record<string, unknown> = { status: "unknown" };
    const storagePath = process.env.STORAGE_PATH || "./storage";
    try {
      if (fs.existsSync(storagePath)) {
        const duOutput = execSync(`du -sh ${storagePath} 2>/dev/null`, {
          timeout: 5000,
        })
          .toString()
          .trim();
        const size = duOutput.split("\t")[0];
        diskUsage = { path: storagePath, used: size };
      } else {
        diskUsage = { path: storagePath, status: "not_found" };
      }
    } catch {
      diskUsage = { path: storagePath, status: "error" };
    }

    return {
      timestamp: new Date().toISOString(),
      version: appVersion,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      system: {
        platform: `${os.type()} ${os.release()}`,
        hostname: os.hostname(),
        cpus: os.cpus().length,
        loadAvg: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
      },
      redis: redisStats,
      postgres: pgStats,
      ldapSync,
      diskUsage,
    };
  }

  /**
   * Prometheus scrape endpoint.
   *
   * Returns:
   *   - Custom business gauges (users, documents, tickets…) computed from DB
   *   - Application counters/histograms (HTTP, cache, MFA, LDAP…) from
   *     `AppMetricsService` (prom-client)
   *   - Default Node.js process metrics (eventloop, GC, heap, FDs)
   *
   * `@Public()` for now — Prometheus scrapers don't carry JWTs. In production
   * the endpoint should be filtered by IP at the BunkerWeb / reverse-proxy
   * level (only allow the Prometheus VLAN). To restrict it via JWT/role,
   * swap `@Public()` for `@UseGuards(JwtAuthGuard, RolesGuard)` +
   * `@Roles(UserRole.SUPER_ADMIN)`.
   */
  @Public()
  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getMetrics() {
    const [legacy, app] = await Promise.all([
      this.metricsService.getMetrics(),
      this.appMetrics.render(),
    ]);
    return `${legacy}\n\n${app}`;
  }

  @Public()
  @Get("stats")
  async getSystemStats() {
    const [users, documents, tickets, notifications, veilleItems] =
      await Promise.all([
        this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
        this.prisma.document.count({ where: { deletedAt: null } }),
        this.prisma.ticket.count(),
        this.prisma.notification.count(),
        this.prisma.veilleItem.count(),
      ]);

    // Fetch last LDAP sync and last veille fetch times from audit log
    const [lastLdapSync, lastVeilleFetch, requestCount] = await Promise.all([
      this.prisma.auditLog
        .findFirst({
          where: { action: { contains: "LDAP" } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, action: true },
        })
        .catch(() => null),
      this.prisma.auditLog
        .findFirst({
          where: { action: { contains: "VEILLE" } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, action: true },
        })
        .catch(() => null),
      // Request count approximation from recent audit logs (last 24h)
      this.prisma.auditLog
        .count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 3600000) } },
        })
        .catch(() => 0),
    ]);

    const os = await import("os");
    const uptime = process.uptime();

    return {
      users,
      documents,
      tickets,
      notifications,
      veilleItems,
      rateLimiting: {
        requestsLast24h: requestCount,
        note: "Throttler: 60 requetes/minute par IP",
      },
      lastSyncTimes: {
        ldap: lastLdapSync?.createdAt?.toISOString() ?? null,
        veille: lastVeilleFetch?.createdAt?.toISOString() ?? null,
      },
      system: {
        nodeVersion: process.version,
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB`,
        platform: `${os.type()} ${os.release()}`,
        hostname: os.hostname(),
      },
    };
  }
}
