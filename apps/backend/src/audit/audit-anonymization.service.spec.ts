import { Test, TestingModule } from "@nestjs/testing";
import {
  AuditAnonymizationService,
  anonymizeIp,
  anonymizeUserAgent,
  anonymizeEmail,
  anonymizeMetadata,
  DEFAULT_FULL_DAYS,
  DEFAULT_ANON_DAYS,
} from "./audit-anonymization.service";
import { PrismaService } from "../prisma/prisma.service";
import { AppConfigService } from "../config/config.service";

/**
 * Tests for AuditAnonymizationService — Item 29 (RGPD).
 *
 * Coverage targets :
 *  - pure helpers (anonymizeIp, anonymizeUserAgent, anonymizeMetadata,
 *    anonymizeEmail) — no DB
 *  - anonymizeBatch : selects rows older than fullDays, rewrites them,
 *    sets anonymizedAt. Re-running on the same row is a no-op (idempotent
 *    because the `anonymizedAt IS NULL` filter excludes the second pass).
 *  - purgeOldAnonymized : respects the threshold and deletes by id batch.
 *  - NEVER token : both stages are skipped (legal hold).
 *  - getStats : returns the active policy + counts.
 */
describe("AuditAnonymizationService", () => {
  let service: AuditAnonymizationService;
  let prisma: {
    auditLog: {
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let appConfig: {
    findByKey: jest.Mock;
    upsert: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
    };
    appConfig = {
      findByKey: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ key: "k", value: "v" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditAnonymizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: appConfig },
      ],
    }).compile();

    service = module.get(AuditAnonymizationService);
  });

  // ---------------------------------------------------------------------------
  // Pure helpers
  // ---------------------------------------------------------------------------

  describe("anonymizeIp", () => {
    it("truncates IPv4 to /16", () => {
      expect(anonymizeIp("192.168.1.42")).toBe("192.168.0.0");
      expect(anonymizeIp("10.0.0.1")).toBe("10.0.0.0");
      expect(anonymizeIp("203.0.113.55")).toBe("203.0.0.0");
    });

    it("truncates IPv6 to /48", () => {
      expect(anonymizeIp("2001:db8:1234:5678::1")).toBe("2001:db8:1234::");
    });

    it("returns null for null / empty input", () => {
      expect(anonymizeIp(null)).toBeNull();
      expect(anonymizeIp("")).toBeNull();
      expect(anonymizeIp("   ")).toBeNull();
    });

    it("returns null for unrecognized formats", () => {
      expect(anonymizeIp("not-an-ip")).toBeNull();
      // IPv4-mapped IPv6 is rejected (no dot inside an IPv6 string)
      expect(anonymizeIp("::ffff:192.168.1.1")).toBeNull();
    });
  });

  describe("anonymizeUserAgent", () => {
    it("identifies Chrome", () => {
      expect(
        anonymizeUserAgent(
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
      ).toBe("Chrome");
    });

    it("identifies Firefox without confusion", () => {
      expect(
        anonymizeUserAgent(
          "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        ),
      ).toBe("Firefox");
    });

    it("identifies Edge before Chrome (since Edge UAs include Chrome)", () => {
      expect(
        anonymizeUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 Edg/120.0",
        ),
      ).toBe("Edge");
    });

    it("identifies Safari", () => {
      expect(
        anonymizeUserAgent(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ),
      ).toBe("Safari");
    });

    it("returns Other for unknown UA", () => {
      expect(anonymizeUserAgent("RandomBot/1.0")).toBe("Other");
    });

    it("returns null for null", () => {
      expect(anonymizeUserAgent(null)).toBeNull();
      expect(anonymizeUserAgent("")).toBeNull();
    });
  });

  describe("anonymizeEmail", () => {
    it("returns the same hash twice for the same salt+email (idempotent)", () => {
      const a = anonymizeEmail("alice@example.com", "log-1");
      const b = anonymizeEmail("alice@example.com", "log-1");
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{8}@anonymized\.local$/);
    });

    it("produces distinct hashes for different rows (no join attack)", () => {
      const a = anonymizeEmail("alice@example.com", "log-1");
      const b = anonymizeEmail("alice@example.com", "log-2");
      expect(a).not.toBe(b);
    });
  });

  describe("anonymizeMetadata", () => {
    it("strips known PII keys recursively", () => {
      const out = anonymizeMetadata({
        action: "USER_UPDATED",
        email: "alice@example.com",
        actorSnapshot: { email: "bob@x.com", role: "ADMIN" },
        nested: {
          phone: "0123456789",
          firstName: "Alice",
          keepMe: "value",
        },
        bulk: true,
      });
      expect(out).toEqual({
        action: "USER_UPDATED",
        nested: { keepMe: "value" },
        bulk: true,
      });
    });

    it("returns null on null input", () => {
      expect(anonymizeMetadata(null)).toBeNull();
    });

    it("returns null on empty object after stripping", () => {
      const out = anonymizeMetadata({
        email: "x@y.com",
        userAgent: "Chrome",
      });
      expect(out).toBeNull();
    });

    it("preserves arrays", () => {
      const out = anonymizeMetadata({
        items: [{ name: "Alice", id: 1 }, { name: "Bob", id: 2 }],
      });
      expect(out).toEqual({ items: [{ id: 1 }, { id: 2 }] });
    });
  });

  // ---------------------------------------------------------------------------
  // Service behaviour
  // ---------------------------------------------------------------------------

  describe("getPolicy", () => {
    it("returns defaults when no AppConfig keys exist", async () => {
      const policy = await service.getPolicy();
      expect(policy.fullDays).toBe(DEFAULT_FULL_DAYS);
      expect(policy.anonymizedDays).toBe(DEFAULT_ANON_DAYS);
      expect(policy.lastRunAt).toBeNull();
    });

    it("parses NEVER token as null (legal hold)", async () => {
      appConfig.findByKey.mockImplementation((key: string) => {
        if (key === "audit.retention.fullDays")
          return Promise.resolve({ value: "NEVER" });
        if (key === "audit.retention.anonymizedDays")
          return Promise.resolve({ value: "NEVER" });
        return Promise.resolve(null);
      });
      const policy = await service.getPolicy();
      expect(policy.fullDays).toBeNull();
      expect(policy.anonymizedDays).toBeNull();
    });

    it("parses positive integers", async () => {
      appConfig.findByKey.mockImplementation((key: string) => {
        if (key === "audit.retention.fullDays")
          return Promise.resolve({ value: "30" });
        if (key === "audit.retention.anonymizedDays")
          return Promise.resolve({ value: "365" });
        return Promise.resolve(null);
      });
      const policy = await service.getPolicy();
      expect(policy.fullDays).toBe(30);
      expect(policy.anonymizedDays).toBe(365);
    });

    it("falls back to default on invalid stored values", async () => {
      appConfig.findByKey.mockResolvedValue({ value: "garbage" });
      const policy = await service.getPolicy();
      expect(policy.fullDays).toBe(DEFAULT_FULL_DAYS);
      expect(policy.anonymizedDays).toBe(DEFAULT_ANON_DAYS);
    });
  });

  describe("updatePolicy", () => {
    it("persists fullDays as integer string", async () => {
      await service.updatePolicy({ fullDays: 60 }, "admin-1");
      expect(appConfig.upsert).toHaveBeenCalledWith(
        "audit.retention.fullDays",
        "60",
        expect.any(String),
        "admin-1",
      );
    });

    it("persists null as NEVER", async () => {
      await service.updatePolicy({ anonymizedDays: null }, "admin-1");
      expect(appConfig.upsert).toHaveBeenCalledWith(
        "audit.retention.anonymizedDays",
        "NEVER",
        expect.any(String),
        "admin-1",
      );
    });

    it("rejects zero / negative values", async () => {
      await expect(
        service.updatePolicy({ fullDays: 0 }),
      ).rejects.toThrow();
      await expect(
        service.updatePolicy({ fullDays: -1 }),
      ).rejects.toThrow();
    });
  });

  describe("anonymizeBatch", () => {
    const fakeRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: "log-1",
      userId: "user-1",
      ipAddress: "192.168.1.42",
      userAgent: "Mozilla/5.0 Chrome/120 Safari",
      action: "USER_LOGIN",
      resourceType: "User",
      resourceId: "user-1",
      metadata: { email: "alice@x.com", success: true },
      severity: "INFO",
      createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      anonymizedAt: null,
      ...overrides,
    });

    it("rewrites PII fields and sets anonymizedAt", async () => {
      prisma.auditLog.findMany.mockResolvedValue([fakeRow()]);
      prisma.auditLog.update.mockResolvedValue({});

      const out = await service.anonymizeBatch();

      expect(out.anonymized).toBe(1);
      expect(out.errors).toEqual([]);
      const call = prisma.auditLog.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: "log-1" });
      expect(call.data.userId).toBeNull();
      expect(call.data.ipAddress).toBe("192.168.0.0");
      expect(call.data.userAgent).toBe("Chrome");
      expect(call.data.metadata).toEqual({ success: true });
      expect(call.data.anonymizedAt).toBeInstanceOf(Date);
    });

    it("filters by anonymizedAt IS NULL (idempotent)", async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      const out = await service.anonymizeBatch();
      expect(out.anonymized).toBe(0);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ anonymizedAt: null }),
        }),
      );
    });

    it("skips entirely when fullDays = NEVER (legal hold)", async () => {
      appConfig.findByKey.mockImplementation((key: string) => {
        if (key === "audit.retention.fullDays")
          return Promise.resolve({ value: "NEVER" });
        return Promise.resolve(null);
      });
      const out = await service.anonymizeBatch();
      expect(out.anonymized).toBe(0);
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it("collects per-row errors without aborting the batch", async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        fakeRow({ id: "log-1" }),
        fakeRow({ id: "log-2" }),
      ]);
      prisma.auditLog.update.mockImplementationOnce(() => {
        throw new Error("DB write conflict");
      });
      prisma.auditLog.update.mockResolvedValueOnce({});

      const out = await service.anonymizeBatch();
      expect(out.anonymized).toBe(1);
      expect(out.errors).toEqual([
        { id: "log-1", error: "DB write conflict" },
      ]);
    });
  });

  describe("purgeOldAnonymized", () => {
    it("respects the cutoff threshold and deletes by id batch", async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "old-1" },
        { id: "old-2" },
      ]);
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 2 });
      const out = await service.purgeOldAnonymized();
      expect(out.deleted).toBe(2);
      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["old-1", "old-2"] } },
      });
    });

    it("skips entirely when anonymizedDays = NEVER", async () => {
      appConfig.findByKey.mockImplementation((key: string) => {
        if (key === "audit.retention.anonymizedDays")
          return Promise.resolve({ value: "NEVER" });
        return Promise.resolve(null);
      });
      const out = await service.purgeOldAnonymized();
      expect(out.deleted).toBe(0);
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it("falls back to per-row delete on bulk deleteMany failure", async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "old-1" },
        { id: "old-2" },
      ]);
      prisma.auditLog.deleteMany.mockRejectedValue(
        new Error("FK constraint"),
      );
      prisma.auditLog.delete.mockResolvedValue({});
      const out = await service.purgeOldAnonymized();
      expect(out.deleted).toBe(2);
      expect(prisma.auditLog.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe("getStats", () => {
    it("returns counts + cutoffs + policy", async () => {
      prisma.auditLog.count
        .mockResolvedValueOnce(42) // toAnonymize
        .mockResolvedValueOnce(7); // toDelete
      const out = await service.getStats();
      expect(out.auditLogsToAnonymize).toBe(42);
      expect(out.auditLogsToDelete).toBe(7);
      expect(out.policy.fullDays).toBe(DEFAULT_FULL_DAYS);
      expect(out.cutoffs.fullDays).toBeDefined();
      expect(out.cutoffs.anonymizedDays).toBeDefined();
    });

    it("returns 0 counts when both stages are NEVER (legal hold)", async () => {
      appConfig.findByKey.mockResolvedValue({ value: "NEVER" });
      const out = await service.getStats();
      expect(out.auditLogsToAnonymize).toBe(0);
      expect(out.auditLogsToDelete).toBe(0);
      expect(out.cutoffs.fullDays).toBeNull();
      expect(out.cutoffs.anonymizedDays).toBeNull();
      expect(prisma.auditLog.count).not.toHaveBeenCalled();
    });
  });

  describe("runFullCycle (cron entry point)", () => {
    it("anonymizes then purges, persists lastRunAt, never throws", async () => {
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          {
            id: "log-1",
            userId: "u",
            ipAddress: "1.2.3.4",
            userAgent: "Chrome/1",
            metadata: null,
            createdAt: new Date(),
          },
        ])
        .mockResolvedValueOnce([]) // exhausted anonymize
        .mockResolvedValueOnce([{ id: "old-1" }])
        .mockResolvedValueOnce([]); // exhausted purge
      prisma.auditLog.update.mockResolvedValue({});
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 1 });

      const out = await service.runFullCycle();
      expect(out.anonymizedCount).toBe(1);
      expect(out.deletedCount).toBe(1);
      expect(out.errors).toEqual([]);
      expect(out.durationMs).toBeGreaterThanOrEqual(0);
      // lastRunAt is upserted as ISO string
      expect(appConfig.upsert).toHaveBeenCalledWith(
        "audit.retention.lastRunAt",
        expect.stringMatching(/T.*Z$/),
        expect.any(String),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotence — anonymizing a row that's already anonymized should be a no-op
  // ---------------------------------------------------------------------------
  describe("idempotence", () => {
    it("never re-selects rows where anonymizedAt IS NOT NULL", async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.anonymizeBatch();
      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      // Defensive: the filter must include anonymizedAt: null
      expect(where.anonymizedAt).toBeNull();
    });

    it("anonymizeRecord is deterministic (same input → same output)", () => {
      const row = {
        id: "log-1",
        userId: "u",
        ipAddress: "192.168.1.42",
        userAgent: "Chrome/120 Safari",
        action: "X",
        resourceType: "Y",
        resourceId: null,
        metadata: { email: "x@y.com", a: 1 },
        severity: "INFO" as const,
        createdAt: new Date(),
        anonymizedAt: null,
      };
      const a = service.anonymizeRecord(row as never);
      const b = service.anonymizeRecord(row as never);
      expect(a).toEqual(b);
    });
  });
});
