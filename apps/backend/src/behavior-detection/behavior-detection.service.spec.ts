import { Test, TestingModule } from "@nestjs/testing";
import { BehaviorDetectionService, haversineKm } from "./behavior-detection.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Wave D — Item 28 — UEBA detection unit tests.
 *
 * Stratégie : on stub PrismaService au minimum pour chaque règle, on injecte
 * un dataset déclencheur, on vérifie qu'une `BehaviorAlert` est créée avec
 * la bonne `evidence` ET qu'une notif RSSI part en HIGH/CRITICAL.
 *
 * Couvre R001..R008 + helpers (normalizeScore, dédup, haversine).
 */
describe("BehaviorDetectionService", () => {
  let service: BehaviorDetectionService;
  let prisma: any;
  let notifications: any;

  const buildRule = (overrides: Partial<{
    code: string;
    severity: string;
    threshold: Record<string, unknown>;
    enabled: boolean;
  }> = {}) => ({
    id: `rule-${overrides.code ?? "R000"}`,
    code: overrides.code ?? "R001",
    name: "test",
    description: "test",
    severity: (overrides.severity ?? "HIGH") as never,
    threshold: overrides.threshold ?? {},
    enabled: overrides.enabled ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    prisma = {
      behaviorAlert: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({
          id: "alert-1",
          ...data,
          createdAt: new Date(),
        })),
      },
      behaviorRule: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      document: {
        findUnique: jest.fn(),
      },
    };
    notifications = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviorDetectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(BehaviorDetectionService);
  });

  // =========================================================================
  // bootstrap
  // =========================================================================

  describe("bootstrapRules", () => {
    it("seeds the 8 default rules when none exist", async () => {
      prisma.behaviorRule.findUnique.mockResolvedValue(null);
      prisma.behaviorRule.create.mockResolvedValue({});
      const result = await service.bootstrapRules();
      expect(result.created).toBe(8);
      expect(result.existing).toBe(0);
      expect(prisma.behaviorRule.create).toHaveBeenCalledTimes(8);
    });

    it("does not overwrite RSSI-tuned thresholds", async () => {
      // Toutes les règles existent déjà avec un threshold custom
      prisma.behaviorRule.findUnique.mockResolvedValue({ code: "x" });
      const result = await service.bootstrapRules();
      expect(result.created).toBe(0);
      expect(result.existing).toBe(8);
      expect(prisma.behaviorRule.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // R001 — Login bursty multi-IP
  // =========================================================================

  describe("R001 — login bursty", () => {
    it("creates a HIGH alert when threshold exceeded across distinct IPs", async () => {
      const rule = buildRule({
        code: "R001",
        severity: "HIGH",
        threshold: { windowSeconds: 600, minLogins: 10, minDistinctIps: 3 },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "user-1", _count: { _all: 12 } },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "a1", ipAddress: "10.0.1.1", createdAt: new Date() },
        { id: "a2", ipAddress: "10.1.2.3", createdAt: new Date() },
        { id: "a3", ipAddress: "192.168.5.10", createdAt: new Date() },
        { id: "a4", ipAddress: "172.16.0.5", createdAt: new Date() },
      ]);

      const created = await service.evalR001(rule, rule.threshold);

      expect(created).toBe(1);
      expect(prisma.behaviorAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ruleCode: "R001",
            userId: "user-1",
            severity: "HIGH",
          }),
        }),
      );
      const data = prisma.behaviorAlert.create.mock.calls[0][0].data;
      expect(data.evidence.distinctIps.length).toBeGreaterThanOrEqual(3);
      expect(data.evidence.loginCount).toBe(12);
    });

    it("does not alert below the login threshold", async () => {
      const rule = buildRule({
        code: "R001",
        threshold: { windowSeconds: 600, minLogins: 10, minDistinctIps: 3 },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "user-1", _count: { _all: 5 } },
      ]);
      const created = await service.evalR001(rule, rule.threshold);
      expect(created).toBe(0);
      expect(prisma.behaviorAlert.create).not.toHaveBeenCalled();
    });

    it("does not alert when only one IP is involved (legitimate burst)", async () => {
      const rule = buildRule({
        code: "R001",
        threshold: { windowSeconds: 600, minLogins: 10, minDistinctIps: 3 },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "user-1", _count: { _all: 12 } },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "a1", ipAddress: "10.0.1.1", createdAt: new Date() },
        { id: "a2", ipAddress: "10.0.1.1", createdAt: new Date() },
      ]);
      const created = await service.evalR001(rule, rule.threshold);
      expect(created).toBe(0);
    });
  });

  // =========================================================================
  // R002 — Off-hours access
  // =========================================================================

  describe("R002 — off-hours access", () => {
    it("alerts when login at 03h UTC for user with all-office-hours history", async () => {
      const rule = buildRule({
        code: "R002",
        severity: "MEDIUM",
        threshold: {
          offHoursStart: 22,
          offHoursEnd: 6,
          historicalStart: 9,
          historicalEnd: 19,
          historicalDays: 30,
          minHistoricalLogins: 10,
        },
      });

      const offHoursLogin = new Date();
      offHoursLogin.setUTCHours(3, 0, 0, 0);

      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          { id: "log-night", userId: "user-1", ipAddress: "10.0.0.1", createdAt: offHoursLogin },
        ])
        .mockResolvedValueOnce(
          // historical : tous à 14h UTC = office hours
          Array.from({ length: 15 }).map((_, i) => ({
            createdAt: (() => {
              const d = new Date();
              d.setUTCHours(14, i, 0, 0);
              return d;
            })(),
          })),
        );

      const created = await service.evalR002(rule, rule.threshold);
      expect(created).toBe(1);
      const data = prisma.behaviorAlert.create.mock.calls[0][0].data;
      expect(data.ruleCode).toBe("R002");
      expect(data.evidence.hour).toBe(3);
    });

    it("skips users without enough historical data", async () => {
      const rule = buildRule({
        code: "R002",
        threshold: {
          offHoursStart: 22,
          offHoursEnd: 6,
          historicalStart: 9,
          historicalEnd: 19,
          minHistoricalLogins: 10,
        },
      });
      const offHoursLogin = new Date();
      offHoursLogin.setUTCHours(3);
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          { id: "x", userId: "u", ipAddress: "1.2.3.4", createdAt: offHoursLogin },
        ])
        .mockResolvedValueOnce([{ createdAt: new Date() }]); // < 10
      const created = await service.evalR002(rule, rule.threshold);
      expect(created).toBe(0);
    });
  });

  // =========================================================================
  // R003 — Document download burst
  // =========================================================================

  describe("R003 — document burst", () => {
    it("alerts on >50 downloads in 5min", async () => {
      const rule = buildRule({
        code: "R003",
        severity: "HIGH",
        threshold: { windowSeconds: 300, minDownloads: 50, auditAction: "DOCUMENT_DOWNLOADED" },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "user-1", _count: { _all: 75 } },
      ]);
      prisma.auditLog.findMany.mockResolvedValue(
        Array.from({ length: 75 }).map((_, i) => ({
          id: `dl-${i}`,
          resourceId: `doc-${i}`,
          createdAt: new Date(),
        })),
      );
      const created = await service.evalR003(rule, rule.threshold);
      expect(created).toBe(1);
      const data = prisma.behaviorAlert.create.mock.calls[0][0].data;
      expect(data.evidence.downloadCount).toBe(75);
    });
  });

  // =========================================================================
  // R004 — Geographic anomaly (impossible travel) — heuristique fallback
  // =========================================================================

  describe("R004 — geographic anomaly (fallback /16)", () => {
    it("alerts when two consecutive logins come from different /16s", async () => {
      const rule = buildRule({
        code: "R004",
        severity: "CRITICAL",
        threshold: { windowSeconds: 3600, minDistanceKm: 1000, requireDistinctCountries: true },
      });
      const t1 = new Date();
      const t2 = new Date(t1.getTime() + 30 * 60_000); // 30 min plus tard
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "l1", userId: "u", ipAddress: "212.50.10.1", createdAt: t1 },
        { id: "l2", userId: "u", ipAddress: "203.0.113.5", createdAt: t2 },
      ]);
      const created = await service.evalR004(rule, rule.threshold);
      // Sans geolite2 installée, on tombe sur le check /16 différent
      expect(created).toBeGreaterThanOrEqual(1);
    });

    it("does not alert when both logins are in the same /16", async () => {
      const rule = buildRule({
        code: "R004",
        severity: "CRITICAL",
        threshold: { windowSeconds: 3600, minDistanceKm: 1000, requireDistinctCountries: true },
      });
      const t1 = new Date();
      const t2 = new Date(t1.getTime() + 5 * 60_000);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "l1", userId: "u", ipAddress: "10.20.1.1", createdAt: t1 },
        { id: "l2", userId: "u", ipAddress: "10.20.5.7", createdAt: t2 },
      ]);
      const created = await service.evalR004(rule, rule.threshold);
      expect(created).toBe(0);
    });
  });

  // =========================================================================
  // R005 — Failed login spike
  // =========================================================================

  describe("R005 — failed login spike", () => {
    it("alerts on >20 failures in 15min for same user", async () => {
      const rule = buildRule({
        code: "R005",
        severity: "HIGH",
        threshold: { windowSeconds: 900, minFailures: 20 },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "user-x", _count: { _all: 35 } },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "f1", ipAddress: "1.2.3.4", createdAt: new Date() },
        { id: "f2", ipAddress: "1.2.3.4", createdAt: new Date() },
      ]);
      const created = await service.evalR005(rule, rule.threshold);
      expect(created).toBe(1);
      const data = prisma.behaviorAlert.create.mock.calls[0][0].data;
      expect(data.evidence.failureCount).toBe(35);
    });
  });

  // =========================================================================
  // R006 — Privilege escalation suspicion
  // =========================================================================

  describe("R006 — privilege escalation", () => {
    it("alerts when role change followed by admin action <1min", async () => {
      const rule = buildRule({
        code: "R006",
        severity: "CRITICAL",
        threshold: { windowSeconds: 60, adminPathPatterns: ["/admin", "/audit"] },
      });
      const at = new Date();
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          { id: "rc-1", resourceId: "target-user", createdAt: at, userId: "promoter" },
        ])
        .mockResolvedValueOnce([
          {
            id: "act-1",
            action: "GET /admin/users",
            resourceType: "Admin",
            createdAt: new Date(at.getTime() + 30_000),
          },
        ]);
      const created = await service.evalR006(rule, rule.threshold);
      expect(created).toBe(1);
      const data = prisma.behaviorAlert.create.mock.calls[0][0].data;
      expect(data.severity).toBe("CRITICAL");
      expect(data.userId).toBe("target-user");
    });

    it("does not alert when the user does not touch admin endpoints", async () => {
      const rule = buildRule({
        code: "R006",
        threshold: { windowSeconds: 60, adminPathPatterns: ["/admin", "/audit"] },
      });
      const at = new Date();
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          { id: "rc-1", resourceId: "target", createdAt: at, userId: "promoter" },
        ])
        .mockResolvedValueOnce([]);
      const created = await service.evalR006(rule, rule.threshold);
      expect(created).toBe(0);
    });
  });

  // =========================================================================
  // R007 — Sensitive bulk download
  // =========================================================================

  describe("R007 — sensitive bulk download", () => {
    it("alerts on >5 downloads of CONFIDENTIEL/SECRET docs", async () => {
      const rule = buildRule({
        code: "R007",
        severity: "CRITICAL",
        threshold: {
          windowSeconds: 600,
          minDownloads: 5,
          classifications: ["CONFIDENTIEL", "SECRET"],
          auditAction: "DOCUMENT_DOWNLOADED",
        },
      });
      prisma.auditLog.findMany.mockResolvedValue(
        Array.from({ length: 7 }).map((_, i) => ({
          id: `dl-${i}`,
          userId: "spy",
          resourceId: `doc-${i}`,
          createdAt: new Date(),
          metadata: { classification: "CONFIDENTIEL" },
        })),
      );
      const created = await service.evalR007(rule, rule.threshold);
      expect(created).toBe(1);
      const data = prisma.behaviorAlert.create.mock.calls[0][0].data;
      expect(data.severity).toBe("CRITICAL");
      expect(data.evidence.downloadCount).toBe(7);
    });

    it("does not alert when documents are PUBLIC/INTERNE", async () => {
      const rule = buildRule({
        code: "R007",
        threshold: {
          windowSeconds: 600,
          minDownloads: 5,
          classifications: ["CONFIDENTIEL", "SECRET"],
          auditAction: "DOCUMENT_DOWNLOADED",
        },
      });
      prisma.auditLog.findMany.mockResolvedValue(
        Array.from({ length: 10 }).map((_, i) => ({
          id: `dl-${i}`,
          userId: "u",
          resourceId: `doc-${i}`,
          createdAt: new Date(),
          metadata: { classification: "PUBLIC" },
        })),
      );
      prisma.document.findUnique.mockResolvedValue({ classification: "PUBLIC" });
      const created = await service.evalR007(rule, rule.threshold);
      expect(created).toBe(0);
    });
  });

  // =========================================================================
  // R008 — MFA brute force
  // =========================================================================

  describe("R008 — MFA brute force", () => {
    it("alerts on >10 MFA failures in 5min", async () => {
      const rule = buildRule({
        code: "R008",
        severity: "HIGH",
        threshold: {
          windowSeconds: 300,
          minFailures: 10,
          auditActions: [
            "MFA_REVALIDATE_FAILED",
            "MFA_ACTIVATE_FAILED",
            "MFA_DISABLE_FAILED",
          ],
        },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "victim", _count: { _all: 15 } },
      ]);
      prisma.auditLog.findMany.mockResolvedValue(
        Array.from({ length: 15 }).map((_, i) => ({
          id: `mfa-${i}`,
          action: "MFA_REVALIDATE_FAILED",
          ipAddress: "1.2.3.4",
          createdAt: new Date(),
        })),
      );
      const created = await service.evalR008(rule, rule.threshold);
      expect(created).toBe(1);
      const data = prisma.behaviorAlert.create.mock.calls[0][0].data;
      expect(data.evidence.failureCount).toBe(15);
    });
  });

  // =========================================================================
  // Notifications HIGH/CRITICAL
  // =========================================================================

  describe("notifications", () => {
    it("notifies SUPER_ADMIN + RSSI on HIGH alert", async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: "super-1" },
        { id: "rssi-1" },
      ]);
      const rule = buildRule({
        code: "R001",
        severity: "HIGH",
        threshold: { windowSeconds: 600, minLogins: 10, minDistinctIps: 3 },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "user-1", _count: { _all: 12 } },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "a", ipAddress: "10.0.1.1", createdAt: new Date() },
        { id: "b", ipAddress: "10.1.2.3", createdAt: new Date() },
        { id: "c", ipAddress: "172.16.0.5", createdAt: new Date() },
      ]);

      await service.evalR001(rule, rule.threshold);
      // L'appel notify est lazy via Promise.catch, on attend la microtask :
      await new Promise((r) => setImmediate(r));

      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SECURITY_ALERT" }),
      );
    });

    it("does not notify on MEDIUM/LOW", async () => {
      const rule = buildRule({
        code: "R002",
        severity: "MEDIUM",
        threshold: {
          offHoursStart: 22,
          offHoursEnd: 6,
          historicalStart: 9,
          historicalEnd: 19,
          minHistoricalLogins: 10,
        },
      });
      const off = new Date();
      off.setUTCHours(3);
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          { id: "l", userId: "u", ipAddress: "1.2.3.4", createdAt: off },
        ])
        .mockResolvedValueOnce(
          Array.from({ length: 12 }).map(() => {
            const d = new Date();
            d.setUTCHours(14);
            return { createdAt: d };
          }),
        );
      await service.evalR002(rule, rule.threshold);
      await new Promise((r) => setImmediate(r));
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Dédoublonnage
  // =========================================================================

  describe("dedup", () => {
    it("does not create a second alert when a recent one already exists", async () => {
      prisma.behaviorAlert.findFirst.mockResolvedValue({ id: "existing" });
      const rule = buildRule({
        code: "R001",
        severity: "HIGH",
        threshold: { windowSeconds: 600, minLogins: 10, minDistinctIps: 3 },
      });
      prisma.auditLog.groupBy.mockResolvedValue([
        { userId: "u", _count: { _all: 30 } },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: "a", ipAddress: "10.0.1.1", createdAt: new Date() },
        { id: "b", ipAddress: "10.1.2.3", createdAt: new Date() },
        { id: "c", ipAddress: "172.16.0.5", createdAt: new Date() },
      ]);
      const created = await service.evalR001(rule, rule.threshold);
      expect(created).toBe(0);
      expect(prisma.behaviorAlert.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Resilience — une règle qui throw n'arrête pas les autres
  // =========================================================================

  describe("runDetection resilience", () => {
    it("continues when one rule throws", async () => {
      prisma.behaviorRule.findMany.mockResolvedValue([
        buildRule({ code: "R001", threshold: { minLogins: 10, minDistinctIps: 3 } }),
        buildRule({ code: "R003", threshold: { minDownloads: 50 } }),
      ]);
      prisma.auditLog.groupBy.mockImplementation(({ where }: any) => {
        if (where?.action === "LOGIN_SUCCESS") {
          throw new Error("R001 boom");
        }
        return Promise.resolve([]);
      });
      const result = await service.runDetection();
      expect(result.rulesEvaluated).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].ruleCode).toBe("R001");
    });
  });
});

// ===========================================================================
// haversineKm helper
// ===========================================================================

describe("haversineKm", () => {
  it("computes Paris-Marseille ≈ 660km", () => {
    const d = haversineKm(48.8566, 2.3522, 43.2965, 5.3698);
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(800);
  });

  it("computes Paris-NYC ≈ 5800km", () => {
    const d = haversineKm(48.8566, 2.3522, 40.7128, -74.006);
    expect(d).toBeGreaterThan(5500);
    expect(d).toBeLessThan(6100);
  });

  it("returns 0 for identical points", () => {
    expect(haversineKm(48.85, 2.35, 48.85, 2.35)).toBeCloseTo(0, 5);
  });
});
