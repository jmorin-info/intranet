import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";

/**
 * Application-level Prometheus metrics (counters + histograms).
 *
 * Uses a dedicated `Registry` (NOT the global default) so multiple test
 * runs / module re-instantiations don't trigger
 * `Cannot register metric with name X already registered`.
 *
 * Exposed via `GET /api/health/metrics` (concatenated with the legacy
 * gauge-based output of MetricsService).
 *
 * Naming follows Prom conventions:
 *   - `*_total` for monotonic counters
 *   - `*_seconds` for histograms in seconds
 *   - units in suffix
 */
@Injectable()
export class AppMetricsService implements OnModuleInit {
  private readonly logger = new Logger(AppMetricsService.name);
  readonly registry: Registry;

  // ── HTTP ──
  readonly httpRequestsTotal: Counter<"route" | "method" | "statusCode">;
  readonly httpRequestDurationSeconds: Histogram<"route" | "method">;

  // ── DB ──
  readonly databaseQueriesTotal: Counter<"operation" | "model">;

  // ── Cache ──
  readonly cacheOperationsTotal: Counter<"operation" | "status">;

  // ── LDAP / AD ──
  readonly ldapSyncDurationSeconds: Histogram<string>;

  // ── Business KPIs ──
  readonly documentsApprovedTotal: Counter<string>;
  readonly mfaVerifyAttemptsTotal: Counter<"status">;

  constructor() {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ app: "omnitech-intranet" });

    // Default Node.js process metrics (event loop lag, GC, heap, FDs, etc.)
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total HTTP requests handled (after Express has resolved the route)",
      labelNames: ["route", "method", "statusCode"] as const,
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["route", "method"] as const,
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 3, 10],
      registers: [this.registry],
    });

    this.databaseQueriesTotal = new Counter({
      name: "database_queries_total",
      help: "Total Prisma queries by operation and model",
      labelNames: ["operation", "model"] as const,
      registers: [this.registry],
    });

    this.cacheOperationsTotal = new Counter({
      name: "cache_operations_total",
      help: "Cache wrap operations broken down by status (hit / miss / error)",
      labelNames: ["operation", "status"] as const,
      registers: [this.registry],
    });

    this.ldapSyncDurationSeconds = new Histogram({
      name: "ldap_sync_duration_seconds",
      help: "Duration of full LDAP/AD bulk sync operations",
      buckets: [1, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    this.documentsApprovedTotal = new Counter({
      name: "documents_approved_total",
      help: "Total number of documents transitioning to APPROVED status",
      registers: [this.registry],
    });

    this.mfaVerifyAttemptsTotal = new Counter({
      name: "mfa_verify_attempts_total",
      help: "MFA verification attempts (TOTP + backup codes)",
      labelNames: ["status"] as const,
      registers: [this.registry],
    });
  }

  onModuleInit() {
    this.logger.log("Prometheus metrics registry initialised");
  }

  /** Increment cache counter — fire-and-forget, never throws. */
  incCacheOp(
    operation: "wrap" | "get" | "set" | "del",
    status: "hit" | "miss" | "error",
  ): void {
    try {
      this.cacheOperationsTotal.inc({ operation, status });
    } catch {
      // never let metrics break the request path
    }
  }

  /** Render the entire registry as Prometheus text (v0.0.4). */
  async render(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content-type header (ie. registry.contentType). */
  get contentType(): string {
    return this.registry.contentType;
  }
}
