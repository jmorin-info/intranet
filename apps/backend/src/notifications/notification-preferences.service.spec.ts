import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { DigestFrequency as PrismaDigestFrequency } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferencesService,
  categoryFromType,
  fromPrismaFrequency,
  toPrismaFrequency,
} from "./notification-preferences.service";

/**
 * Tests unitaires NotificationPreferencesService (Vague A v1.1).
 *
 * Couvre :
 *   - helpers de conversion JSON-legacy ↔ enum Prisma typé
 *   - categoryFromType : routing par préfixe NotificationType
 *   - get() : merge avec les défauts si pas de prefs
 *   - update() : sync JSON ↔ User.digestFrequency en une transaction
 *   - getDigestFrequency() : lecture priorité enum, fallback JSON
 *   - isChannelEnabled() : default-allow si pas de prefs (rétrocompat)
 */

describe("NotificationPreferencesService", () => {
  let service: NotificationPreferencesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [NotificationPreferencesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(NotificationPreferencesService);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────
  //  Conversion helpers (purs)
  // ──────────────────────────────────────────────────────────────

  describe("toPrismaFrequency", () => {
    it("'off' → NONE", () => {
      expect(toPrismaFrequency("off")).toBe(PrismaDigestFrequency.NONE);
    });
    it("'none' → NONE", () => {
      expect(toPrismaFrequency("none")).toBe(PrismaDigestFrequency.NONE);
    });
    it("'NONE' (case-insensitive) → NONE", () => {
      expect(toPrismaFrequency("NONE")).toBe(PrismaDigestFrequency.NONE);
    });
    it("'weekly' → WEEKLY", () => {
      expect(toPrismaFrequency("weekly")).toBe(PrismaDigestFrequency.WEEKLY);
    });
    it("'WEEKLY' (case-insensitive) → WEEKLY", () => {
      expect(toPrismaFrequency("WEEKLY")).toBe(PrismaDigestFrequency.WEEKLY);
    });
    it("'daily' → DAILY", () => {
      expect(toPrismaFrequency("daily")).toBe(PrismaDigestFrequency.DAILY);
    });
    it("undefined → DAILY (défaut)", () => {
      expect(toPrismaFrequency(undefined)).toBe(PrismaDigestFrequency.DAILY);
    });
    it("null → DAILY (défaut)", () => {
      expect(toPrismaFrequency(null)).toBe(PrismaDigestFrequency.DAILY);
    });
    it("garbage → DAILY (défaut)", () => {
      expect(toPrismaFrequency("xxx")).toBe(PrismaDigestFrequency.DAILY);
    });
  });

  describe("fromPrismaFrequency", () => {
    it("NONE → 'off'", () => {
      expect(fromPrismaFrequency(PrismaDigestFrequency.NONE)).toBe("off");
    });
    it("WEEKLY → 'weekly'", () => {
      expect(fromPrismaFrequency(PrismaDigestFrequency.WEEKLY)).toBe("weekly");
    });
    it("DAILY → 'daily'", () => {
      expect(fromPrismaFrequency(PrismaDigestFrequency.DAILY)).toBe("daily");
    });
    it("undefined/null → 'daily' (défaut)", () => {
      expect(fromPrismaFrequency(undefined)).toBe("daily");
      expect(fromPrismaFrequency(null)).toBe("daily");
    });
    it("round-trip pour les 3 valeurs", () => {
      for (const v of ["off", "daily", "weekly"] as const) {
        expect(fromPrismaFrequency(toPrismaFrequency(v))).toBe(v);
      }
    });
  });

  describe("categoryFromType", () => {
    it("TICKET_* → tickets", () => {
      expect(categoryFromType("TICKET_CREATED")).toBe("tickets");
      expect(categoryFromType("TICKET_SLA_BREACH")).toBe("tickets");
    });
    it("DOC_*, SIGNATURE_NEEDED, ACK_REQUIRED → documents", () => {
      expect(categoryFromType("DOC_PUBLISHED")).toBe("documents");
      expect(categoryFromType("SIGNATURE_NEEDED")).toBe("documents");
      expect(categoryFromType("ACK_REQUIRED")).toBe("documents");
      expect(categoryFromType("REVIEW_OVERDUE")).toBe("documents");
    });
    it("INCIDENT_* → incidents", () => {
      expect(categoryFromType("INCIDENT_CREATED")).toBe("incidents");
      expect(categoryFromType("INCIDENT_RESOLVED")).toBe("incidents");
    });
    it("MENTION → mentions", () => {
      expect(categoryFromType("MENTION")).toBe("mentions");
    });
    it("VEILLE_* → veille", () => {
      expect(categoryFromType("VEILLE_CRITICAL")).toBe("veille");
      expect(categoryFromType("VEILLE_BULLETIN")).toBe("veille");
    });
    it("type non-mutable → null", () => {
      expect(categoryFromType("SECURITY_ALERT")).toBeNull();
      expect(categoryFromType("ALERT_CRITICAL")).toBeNull();
    });
    it("undefined → null", () => {
      expect(categoryFromType(undefined)).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  Défauts de la catégorie « veille » (anti-spam)
  // ──────────────────────────────────────────────────────────────

  describe("défauts catégorie veille", () => {
    it("veille : in-app ON, email OFF, jamais de push", () => {
      expect(DEFAULT_NOTIFICATION_PREFERENCES.inApp.veille).toBe(true);
      expect(DEFAULT_NOTIFICATION_PREFERENCES.email.veille).toBe(false);
      expect(
        (DEFAULT_NOTIFICATION_PREFERENCES.push as Record<string, unknown>).veille,
      ).toBeUndefined();
    });

    it("sans prefs enregistrées : in-app veille autorisé, email/push refusés", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: null,
      });
      await expect(service.isChannelEnabled("u1", "inApp", "VEILLE_CRITICAL")).resolves.toBe(true);
      await expect(service.isChannelEnabled("u1", "email", "VEILLE_CRITICAL")).resolves.toBe(false);
      await expect(service.isChannelEnabled("u1", "push", "VEILLE_CRITICAL")).resolves.toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  get() / mergeWithDefaults
  // ──────────────────────────────────────────────────────────────

  describe("get()", () => {
    it("retourne les défauts si user n'a pas de prefs", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: null,
      });
      const prefs = await service.get("u1");
      expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("merge un patch partiel avec les défauts (ex: email.tickets=false)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: { email: { tickets: false } },
      });
      const prefs = await service.get("u1");
      expect(prefs.email.tickets).toBe(false);
      expect(prefs.email.documents).toBe(true); // depuis défaut
      expect(prefs.inApp).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.inApp);
    });

    it("fail-safe : retourne les défauts si DB throw", async () => {
      prisma.user.findUnique.mockRejectedValue(new Error("DB down"));
      const prefs = await service.get("u1");
      expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  update() : sync JSON + colonne typée
  // ──────────────────────────────────────────────────────────────

  describe("update()", () => {
    it("sync digestFrequency typé + JSON en une seule transaction Prisma", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: null,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.update("u1", {
        digestFrequency: "WEEKLY",
      });

      expect(result.email.digest).toBe("weekly");
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const args = prisma.user.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: "u1" });
      expect(args.data.digestFrequency).toBe(PrismaDigestFrequency.WEEKLY);
      expect((args.data.notificationPreferences as any).email.digest).toBe("weekly");
    });

    it("top-level digestFrequency prime sur email.digest si les 2 fournis", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: null,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.update("u1", {
        email: { digest: "daily" } as any,
        digestFrequency: "NONE",
      });

      expect(result.email.digest).toBe("off");
      expect(prisma.user.update.mock.calls[0][0].data.digestFrequency).toBe(
        PrismaDigestFrequency.NONE,
      );
    });

    it("normalise une valeur garbage en 'daily'", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: null,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.update("u1", {
        email: { digest: "garbage" } as any,
      });

      expect(result.email.digest).toBe("daily");
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  getDigestFrequency : priorité colonne typée
  // ──────────────────────────────────────────────────────────────

  describe("getDigestFrequency()", () => {
    it("retourne 'weekly' si User.digestFrequency=WEEKLY (priorité enum)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        digestFrequency: PrismaDigestFrequency.WEEKLY,
        notificationPreferences: { email: { digest: "off" } }, // ignoré
      });
      const freq = await service.getDigestFrequency("u1");
      expect(freq).toBe("weekly");
    });

    it("fallback JSON si la colonne typée n'est pas remontée", async () => {
      prisma.user.findUnique.mockResolvedValue({
        digestFrequency: null,
        notificationPreferences: { email: { digest: "weekly" } },
      });
      const freq = await service.getDigestFrequency("u1");
      expect(freq).toBe("weekly");
    });

    it("'daily' par défaut si rien", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const freq = await service.getDigestFrequency("u1");
      expect(freq).toBe("daily");
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  isChannelEnabled : 401-style fail-open & critical types
  // ──────────────────────────────────────────────────────────────

  describe("isChannelEnabled()", () => {
    it("type non-mutable (SECURITY_ALERT) → toujours envoyé", async () => {
      const ok = await service.isChannelEnabled("u1", "email", "SECURITY_ALERT");
      expect(ok).toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("user sans prefs → fail-open (allow)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: null,
      });
      const ok = await service.isChannelEnabled("u1", "email", "TICKET_CREATED");
      expect(ok).toBe(true);
    });

    it("user a opt-out tickets/email → block", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: { email: { tickets: false } },
      });
      const ok = await service.isChannelEnabled("u1", "email", "TICKET_CREATED");
      expect(ok).toBe(false);
    });

    it("push + documents : toujours false (matrice push n'a pas documents)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationPreferences: { push: { documents: true } },
      });
      const ok = await service.isChannelEnabled("u1", "push", "DOC_PUBLISHED");
      expect(ok).toBe(false);
    });

    it("DB throw → fail-open (allow)", async () => {
      prisma.user.findUnique.mockRejectedValue(new Error("DB down"));
      const ok = await service.isChannelEnabled("u1", "email", "TICKET_CREATED");
      expect(ok).toBe(true);
    });
  });
});
