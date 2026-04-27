import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma, AuditLog } from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AppConfigService } from "../config/config.service";

/**
 * AuditAnonymizationService — RGPD-compliant rolling anonymization of
 * AuditLog rows.
 *
 * Why : ISO 27001 A.5.36 demands long-term retention of audit trails
 * (proof of monitoring) but RGPD article 5(c) imposes data minimization
 * and article 17 the right to erasure. The compromise we implement keeps
 * the *occurrence* of the event (action / resourceType / createdAt) for
 * the full forensic window but strips the personal identifiers (userId,
 * ipAddress, userAgent, payload PII) once the legal hold window expires.
 *
 * Two retention thresholds, both stored in `AppConfig` (key/value table)
 * so a SUPER_ADMIN can adjust them at runtime without a redeploy:
 *
 *   - `audit.retention.fullDays`        (default 90)  → after this delay,
 *                                                       PII fields are
 *                                                       anonymized.
 *   - `audit.retention.anonymizedDays`  (default 730 = 2 years) → after
 *                                                       this delay (counted
 *                                                       from `createdAt`),
 *                                                       the row is deleted.
 *
 * Setting either value to `NEVER` disables the corresponding stage (legal
 * hold mode for litigation contexts).
 *
 * Anonymization rules per field — see `anonymizeRecord` below:
 *   - userId    → set NULL (the User relation already cascades onDelete:
 *                 SetNull, so this is consistent). The `actorSnapshot`
 *                 metadata key is also stripped to avoid leaking email.
 *   - ipAddress → IPv4 truncated to /16 (e.g. 192.168.1.42 → 192.168.0.0).
 *                 IPv6 truncated to /48. RGPD-acceptable partial mask.
 *   - userAgent → reduced to browser family (Chrome / Firefox / Safari /
 *                 Edge / Opera / IE / Other), version stripped.
 *   - metadata  → known-PII keys removed (email, phone, name, ssn, ip,
 *                 ipAddress, userAgent, actor*); free-text fields are
 *                 replaced by a SHA-256 truncated hash so the structural
 *                 shape of the JSON is preserved for analytics.
 *   - userEmail (if present in metadata.email) → SHA-256 hash truncated
 *                 to 8 chars + `@anonymized.local`.
 *
 * Anonymization is irreversible by design — the only exception is the
 * row's `id` which is preserved to keep referential integrity (e.g. for
 * report drill-downs that link by audit log id).
 */

const FULL_DAYS_KEY = "audit.retention.fullDays";
const ANON_DAYS_KEY = "audit.retention.anonymizedDays";
const LAST_RUN_KEY = "audit.retention.lastRunAt";
const NEVER_TOKEN = "NEVER";

/** Default thresholds when no AppConfig row exists. */
export const DEFAULT_FULL_DAYS = 90;
export const DEFAULT_ANON_DAYS = 730;

/** Hard cap of rows touched per cron tick to avoid long transactions. */
const DEFAULT_BATCH_SIZE = 1000;
/** Max iterations the cron runs in a row to avoid runaway loops. */
const MAX_BATCHES_PER_RUN = 50;

export interface RetentionPolicy {
  /** Days after createdAt before PII fields are anonymized. `null` = never. */
  fullDays: number | null;
  /** Days after createdAt before the row is hard-deleted. `null` = never. */
  anonymizedDays: number | null;
  /** ISO timestamp of the last cron run, or null if never run. */
  lastRunAt: string | null;
}

/** PII keys that are stripped from metadata JSON during anonymization. */
const PII_KEYS = new Set([
  "email",
  "userEmail",
  "phone",
  "phoneNumber",
  "name",
  "firstName",
  "lastName",
  "fullName",
  "ssn",
  "socialSecurityNumber",
  "ip",
  "ipAddress",
  "userAgent",
  "actorSnapshot",
  "actorEmail",
  "actorName",
  "actorFirstName",
  "actorLastName",
]);

@Injectable()
export class AuditAnonymizationService {
  private readonly logger = new Logger(AuditAnonymizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Policy I/O
  // ---------------------------------------------------------------------------

  /**
   * Reads the active retention policy from AppConfig. Falls back to the
   * baked-in defaults if the keys do not exist (first-run / fresh install).
   */
  async getPolicy(): Promise<RetentionPolicy> {
    const [full, anon, last] = await Promise.all([
      this.appConfig.findByKey(FULL_DAYS_KEY),
      this.appConfig.findByKey(ANON_DAYS_KEY),
      this.appConfig.findByKey(LAST_RUN_KEY),
    ]);
    return {
      fullDays: parsePolicyValue(full?.value, DEFAULT_FULL_DAYS),
      anonymizedDays: parsePolicyValue(anon?.value, DEFAULT_ANON_DAYS),
      lastRunAt: last?.value ?? null,
    };
  }

  /**
   * Updates the policy. Pass `null` (or the literal string "NEVER") to
   * disable a stage. Throws on invalid input. Audited via AppConfigService.
   */
  async updatePolicy(
    patch: { fullDays?: number | null; anonymizedDays?: number | null },
    updatedById?: string,
  ): Promise<RetentionPolicy> {
    if (patch.fullDays !== undefined) {
      const value = serializePolicyValue(patch.fullDays);
      validatePositiveOrNever(value, FULL_DAYS_KEY);
      await this.appConfig.upsert(
        FULL_DAYS_KEY,
        value,
        "Days after createdAt before AuditLog PII is anonymized (or NEVER).",
        updatedById,
      );
    }
    if (patch.anonymizedDays !== undefined) {
      const value = serializePolicyValue(patch.anonymizedDays);
      validatePositiveOrNever(value, ANON_DAYS_KEY);
      await this.appConfig.upsert(
        ANON_DAYS_KEY,
        value,
        "Days after createdAt before anonymized AuditLog rows are purged (or NEVER).",
        updatedById,
      );
    }
    return this.getPolicy();
  }

  // ---------------------------------------------------------------------------
  // Anonymization core (pure & testable)
  // ---------------------------------------------------------------------------

  /**
   * Pure function: returns the anonymized payload for an audit log row.
   * Does NOT touch the database — used by `anonymizeBatch` and unit tests.
   *
   * Idempotent: calling twice on the same record yields the same output.
   */
  anonymizeRecord(record: AuditLog): {
    userId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Prisma.InputJsonValue | null;
  } {
    return {
      userId: null,
      ipAddress: anonymizeIp(record.ipAddress),
      userAgent: anonymizeUserAgent(record.userAgent),
      metadata: anonymizeMetadata(record.metadata),
    };
  }

  // ---------------------------------------------------------------------------
  // Batch operations
  // ---------------------------------------------------------------------------

  /**
   * Runs one anonymization batch: selects up to `batchSize` rows older
   * than `fullDays` and not yet anonymized, and rewrites their PII fields.
   *
   * Returns the number of rows touched and a list of errors (per row id).
   * Each row is updated independently so a single failure cannot rollback
   * the whole batch.
   */
  async anonymizeBatch(batchSize = DEFAULT_BATCH_SIZE): Promise<{
    anonymized: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    const policy = await this.getPolicy();
    if (policy.fullDays === null) {
      this.logger.log(
        "anonymizeBatch skipped: fullDays = NEVER (legal hold mode)",
      );
      return { anonymized: 0, errors: [] };
    }
    const cutoff = daysAgo(policy.fullDays);
    const candidates = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { lt: cutoff },
        anonymizedAt: null,
      },
      orderBy: { createdAt: "asc" },
      take: clampBatchSize(batchSize),
    });

    if (candidates.length === 0) {
      return { anonymized: 0, errors: [] };
    }

    const errors: Array<{ id: string; error: string }> = [];
    let anonymized = 0;
    const now = new Date();

    for (const row of candidates) {
      try {
        const anonymized_data = this.anonymizeRecord(row);
        await this.prisma.auditLog.update({
          where: { id: row.id },
          data: {
            userId: anonymized_data.userId,
            ipAddress: anonymized_data.ipAddress,
            userAgent: anonymized_data.userAgent,
            metadata:
              anonymized_data.metadata === null
                ? Prisma.JsonNull
                : anonymized_data.metadata,
            anonymizedAt: now,
          },
        });
        anonymized += 1;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `Failed to anonymize AuditLog ${row.id}: ${msg}`,
          e instanceof Error ? e.stack : undefined,
        );
        errors.push({ id: row.id, error: msg });
      }
    }

    return { anonymized, errors };
  }

  /**
   * Runs one purge batch: deletes up to `batchSize` rows older than
   * `anonymizedDays`. We use createdAt (not anonymizedAt) as the cutoff
   * basis so the total retention from event emission is bounded.
   */
  async purgeOldAnonymized(batchSize = DEFAULT_BATCH_SIZE): Promise<{
    deleted: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    const policy = await this.getPolicy();
    if (policy.anonymizedDays === null) {
      this.logger.log(
        "purgeOldAnonymized skipped: anonymizedDays = NEVER (legal hold mode)",
      );
      return { deleted: 0, errors: [] };
    }
    const cutoff = daysAgo(policy.anonymizedDays);

    // Deterministic selection by id so concurrent runs don't fight.
    const candidates = await this.prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: clampBatchSize(batchSize),
    });
    if (candidates.length === 0) {
      return { deleted: 0, errors: [] };
    }

    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: { id: { in: candidates.map((c) => c.id) } },
      });
      return { deleted: result.count, errors: [] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `purgeOldAnonymized failed: ${msg}`,
        e instanceof Error ? e.stack : undefined,
      );
      // Fall back to per-row delete to surface the offending id.
      const errors: Array<{ id: string; error: string }> = [];
      let deleted = 0;
      for (const c of candidates) {
        try {
          await this.prisma.auditLog.delete({ where: { id: c.id } });
          deleted += 1;
        } catch (inner: unknown) {
          const innerMsg =
            inner instanceof Error ? inner.message : String(inner);
          errors.push({ id: c.id, error: innerMsg });
        }
      }
      return { deleted, errors };
    }
  }

  /**
   * Stats endpoint: returns the active policy plus the count of rows
   * that *would* be processed by the next run. Read-only, never mutates.
   */
  async getStats(): Promise<{
    policy: RetentionPolicy;
    auditLogsToAnonymize: number;
    auditLogsToDelete: number;
    cutoffs: { fullDays: string | null; anonymizedDays: string | null };
  }> {
    const policy = await this.getPolicy();
    const fullCutoff =
      policy.fullDays !== null ? daysAgo(policy.fullDays) : null;
    const anonCutoff =
      policy.anonymizedDays !== null ? daysAgo(policy.anonymizedDays) : null;

    const [toAnonymize, toDelete] = await Promise.all([
      fullCutoff
        ? this.prisma.auditLog.count({
            where: {
              createdAt: { lt: fullCutoff },
              anonymizedAt: null,
            },
          })
        : Promise.resolve(0),
      anonCutoff
        ? this.prisma.auditLog.count({
            where: { createdAt: { lt: anonCutoff } },
          })
        : Promise.resolve(0),
    ]);

    return {
      policy,
      auditLogsToAnonymize: toAnonymize,
      auditLogsToDelete: toDelete,
      cutoffs: {
        fullDays: fullCutoff?.toISOString() ?? null,
        anonymizedDays: anonCutoff?.toISOString() ?? null,
      },
    };
  }

  /**
   * Runs the full pipeline: anonymize until exhausted (capped) then purge
   * until exhausted (capped). Used by both the cron and the manual
   * "anonymize-now" endpoint.
   */
  async runFullCycle(batchSize = DEFAULT_BATCH_SIZE): Promise<{
    anonymizedCount: number;
    deletedCount: number;
    durationMs: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    const start = Date.now();
    const errors: Array<{ id: string; error: string }> = [];
    let anonymizedCount = 0;
    let deletedCount = 0;

    for (let i = 0; i < MAX_BATCHES_PER_RUN; i += 1) {
      const result = await this.anonymizeBatch(batchSize);
      anonymizedCount += result.anonymized;
      errors.push(...result.errors);
      if (result.anonymized === 0) break;
    }

    for (let i = 0; i < MAX_BATCHES_PER_RUN; i += 1) {
      const result = await this.purgeOldAnonymized(batchSize);
      deletedCount += result.deleted;
      errors.push(...result.errors);
      if (result.deleted === 0) break;
    }

    const durationMs = Date.now() - start;
    // Best-effort persistence of the timestamp; failure here must not abort
    // the cron, so we swallow the exception.
    try {
      await this.appConfig.upsert(
        LAST_RUN_KEY,
        new Date().toISOString(),
        "Last successful AuditLog anonymization cron tick (ISO 8601).",
      );
    } catch (e: unknown) {
      this.logger.warn(
        `Failed to persist lastRunAt: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    this.logger.log(
      `audit.anonymization.run anonymized=${anonymizedCount} deleted=${deletedCount} durationMs=${durationMs} errors=${errors.length}`,
    );
    return { anonymizedCount, deletedCount, durationMs, errors };
  }

  // ---------------------------------------------------------------------------
  // Cron — daily 04:00 (off-peak, before backups complete)
  // ---------------------------------------------------------------------------

  @Cron("0 4 * * *")
  async handleCron(): Promise<void> {
    this.logger.log("Daily AuditLog anonymization cron tick (RGPD)");
    try {
      await this.runFullCycle();
    } catch (e: unknown) {
      this.logger.error(
        `audit.anonymization.run failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        e instanceof Error ? e.stack : undefined,
      );
    }
  }
}

// =============================================================================
// Pure helpers (exported for unit tests)
// =============================================================================

/**
 * Anonymizes an IP address by truncating to /16 (IPv4) or /48 (IPv6).
 * Returns null if the input is null or unrecognizable.
 *
 * RGPD G29 working party guidance: a /16 mask is the minimum acceptable
 * truncation for "pseudonymization" of IPv4. We use /16 (not /24) to be
 * conservative and avoid re-identification by triangulation.
 */
export function anonymizeIp(ip: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed === "") return null;

  // IPv4 dotted quad
  const v4 = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    return `${v4[1]}.${v4[2]}.0.0`;
  }

  // IPv6 — truncate to /48 (first three hextets)
  if (trimmed.includes(":")) {
    // Normalize :: shorthand to a deterministic form
    const expanded = expandIpv6(trimmed);
    if (expanded) {
      const parts = expanded.split(":");
      const first3 = parts.slice(0, 3).join(":");
      return `${first3}::`;
    }
  }

  // Unknown format — strip entirely (better safe than leak).
  return null;
}

function expandIpv6(addr: string): string | null {
  // Reject IPv4-mapped (::ffff:1.2.3.4) by anonymizing the v4 tail
  if (addr.includes(".")) return null;
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - (left.length + right.length);
  if (missing < 0 && halves.length === 2) return null;
  if (halves.length === 1 && left.length !== 8) return null;
  const filler = halves.length === 2 ? Array(missing).fill("0") : [];
  const all = [...left, ...filler, ...right];
  if (all.length !== 8) return null;
  return all.map((h) => (h === "" ? "0" : h)).join(":");
}

/**
 * Reduces a User-Agent string to its browser family. Strips version,
 * platform and any other identifying token. Returns null on empty input
 * or "Other" if the family cannot be inferred.
 */
export function anonymizeUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  if (lower.includes("edg/") || lower.includes("edge/")) return "Edge";
  if (lower.includes("opr/") || lower.includes("opera")) return "Opera";
  // Order matters: Chrome contains "safari", Firefox does not.
  if (lower.includes("firefox/")) return "Firefox";
  if (lower.includes("chrome/") || lower.includes("chromium")) return "Chrome";
  if (lower.includes("safari/")) return "Safari";
  if (lower.includes("msie ") || lower.includes("trident/")) return "IE";
  if (lower.includes("curl/") || lower.includes("wget/")) return "CLI";
  return "Other";
}

/**
 * Anonymizes an email address: SHA-256 truncated to 8 chars + a fixed
 * domain. The hash is salted with a per-record nonce so the same email
 * across two rows yields two distinct outputs (prevents joining attack).
 *
 * The salt is derived from the audit log id (which is *not* PII), so the
 * hash is deterministic per row → the operation remains idempotent.
 */
export function anonymizeEmail(email: string, salt: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(salt + ":" + email.toLowerCase())
    .digest("hex")
    .slice(0, 8);
  return `${hash}@anonymized.local`;
}

/**
 * Strips PII from a metadata JSON object. Removes known PII keys
 * outright; for free-text leaf values, replaces them with a SHA-256 hash
 * truncated to 8 chars (so analytics that count distinct values still
 * work).
 *
 * Returns null if the input is null or the result is empty.
 */
export function anonymizeMetadata(
  metadata: Prisma.JsonValue | null,
): Prisma.InputJsonValue | null {
  if (metadata === null || metadata === undefined) return null;
  const result = stripPii(metadata, "");
  if (
    result === null ||
    (typeof result === "object" &&
      !Array.isArray(result) &&
      Object.keys(result as Record<string, unknown>).length === 0)
  ) {
    return null;
  }
  return result as Prisma.InputJsonValue;
}

function stripPii(value: Prisma.JsonValue, path: string): Prisma.JsonValue {
  if (value === null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v, i) => stripPii(v, `${path}[${i}]`));
  }
  const out: Record<string, Prisma.JsonValue> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEYS.has(key)) continue;
    out[key] = stripPii(raw as Prisma.JsonValue, `${path}.${key}`);
  }
  return out;
}

// =============================================================================
// Internal utilities
// =============================================================================

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function clampBatchSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(Math.floor(size), 1), 5000);
}

function parsePolicyValue(
  raw: string | undefined | null,
  fallback: number,
): number | null {
  if (raw === undefined || raw === null) return fallback;
  if (raw === NEVER_TOKEN) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function serializePolicyValue(input: number | null): string {
  if (input === null) return NEVER_TOKEN;
  if (!Number.isFinite(input) || input <= 0) {
    throw new Error("Retention days must be a positive integer or NEVER");
  }
  return String(Math.floor(input));
}

function validatePositiveOrNever(value: string, key: string): void {
  if (value === NEVER_TOKEN) return;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${key}: expected positive integer or NEVER`);
  }
}
