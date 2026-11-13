import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DigestService, groupByModule, moduleFromNotification } from "./digest.service";
import { NotificationPreferencesService } from "./notification-preferences.service";

/**
 * Tests unitaires DigestService (Vague A v1.1, item 13).
 *
 * Couvre :
 *   - moduleFromNotification : routing par type / resourceType
 *   - groupByModule : pas de notification perdue, ordre interne
 *   - sendUserDigest : skip SMTP non configuré, skip 0 unread, opt-out NONE
 *   - runFrequency : filtrage par enum digestFrequency
 *   - handleDigestCron : exécute DAILY tous les jours, WEEKLY que le lundi
 */

const ENV_BACKUP = { ...process.env };

describe("DigestService", () => {
  let service: DigestService;
  let prisma: any;

  beforeEach(async () => {
    process.env = { ...ENV_BACKUP };

    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          email: "alice@omnitech-security.fr",
          firstName: "Alice",
          lastName: "Martin",
        }),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      appConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DigestService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationPreferencesService,
          useValue: {
            getDigestFrequency: jest.fn().mockResolvedValue("daily"),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(DigestService);
    // Silence logs pendant les tests
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────
  //  helpers (purs)
  // ──────────────────────────────────────────────────────────────

  describe("moduleFromNotification", () => {
    it("dispatch INCIDENT_* → incidents", () => {
      expect(moduleFromNotification({ type: "INCIDENT_CREATED" })).toBe("incidents");
    });

    it("dispatch SIGNATURE_* → signatures", () => {
      expect(moduleFromNotification({ type: "SIGNATURE_NEEDED" })).toBe("signatures");
    });

    it("dispatch MENTION → mentions", () => {
      expect(moduleFromNotification({ type: "MENTION" })).toBe("mentions");
    });

    it("dispatch DOC_* → documents", () => {
      expect(moduleFromNotification({ type: "DOC_PUBLISHED" })).toBe("documents");
      expect(moduleFromNotification({ type: "ACK_REQUIRED" })).toBe("documents");
    });

    it("dispatch TICKET_* → tickets", () => {
      expect(moduleFromNotification({ type: "TICKET_CREATED" })).toBe("tickets");
    });

    it("dispatch VEILLE_* → veille", () => {
      expect(moduleFromNotification({ type: "VEILLE_CRITICAL" })).toBe("veille");
      expect(moduleFromNotification({ type: "VEILLE_BULLETIN" })).toBe("veille");
    });

    it("dispatch legacy DOC_PUBLISHED+resourceType veille → veille (pas documents)", () => {
      // Les notifs veille legacy (type DOC_PUBLISHED) ne doivent plus tomber
      // dans le bucket « documents » : le resourceType prime.
      expect(
        moduleFromNotification({
          type: "DOC_PUBLISHED",
          resourceType: "VeilleItem",
        }),
      ).toBe("veille");
      expect(
        moduleFromNotification({
          type: "DOC_PUBLISHED",
          resourceType: "VeilleBulletin",
        }),
      ).toBe("veille");
    });

    it("dispatch resourceType=WIKI → wiki (priorité)", () => {
      expect(moduleFromNotification({ type: "OTHER", resourceType: "WIKI" })).toBe("wiki");
    });

    it("dispatch resourceType=NEWS → news (priorité)", () => {
      expect(moduleFromNotification({ type: "OTHER", resourceType: "NEWS" })).toBe("news");
    });

    it("fallback unknown → other", () => {
      expect(moduleFromNotification({ type: "ZZZ_UNKNOWN" })).toBe("other");
    });
  });

  describe("groupByModule", () => {
    it("groupe sans perte ; section vide pour les modules sans notif", () => {
      const notifs = [
        { type: "INCIDENT_CREATED" },
        { type: "TICKET_CREATED" },
        { type: "TICKET_ASSIGNED" },
        { type: "MENTION" },
      ] as any;
      const groups = groupByModule(notifs);
      expect(groups.incidents.length).toBe(1);
      expect(groups.tickets.length).toBe(2);
      expect(groups.mentions.length).toBe(1);
      expect(groups.signatures.length).toBe(0);
      expect(groups.documents.length).toBe(0);
      expect(groups.wiki.length).toBe(0);
      expect(groups.news.length).toBe(0);
      expect(groups.other.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  sendUserDigest (skip paths)
  // ──────────────────────────────────────────────────────────────

  describe("sendUserDigest skip paths", () => {
    const SINCE = new Date("2026-04-25T08:00:00Z");

    it("opt-out NONE → skip et retourne false", async () => {
      const ok = await service.sendUserDigest("u1", "NONE" as any, SINCE);
      expect(ok).toBe(false);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("opt-out 'off' (legacy) → skip", async () => {
      const ok = await service.sendUserDigest("u1", "off" as any, SINCE);
      expect(ok).toBe(false);
    });

    it("SMTP désactivé via AppConfig → skip", async () => {
      prisma.appConfig.findFirst.mockResolvedValue({
        key: "smtp.enabled",
        value: "false",
      });
      const ok = await service.sendUserDigest("u1", "DAILY" as any, SINCE);
      expect(ok).toBe(false);
    });

    it("SMTP_HOST manquant → skip", async () => {
      delete process.env.SMTP_HOST;
      const ok = await service.sendUserDigest("u1", "DAILY" as any, SINCE);
      expect(ok).toBe(false);
    });

    it("SMTP_HOST=localhost → skip (dev)", async () => {
      process.env.SMTP_HOST = "localhost";
      const ok = await service.sendUserDigest("u1", "DAILY" as any, SINCE);
      expect(ok).toBe(false);
    });

    it("user introuvable → skip", async () => {
      process.env.SMTP_HOST = "smtp.example.com";
      prisma.user.findUnique.mockResolvedValue(null);
      const ok = await service.sendUserDigest("u1", "DAILY" as any, SINCE);
      expect(ok).toBe(false);
    });

    it("0 notification non-lue → skip", async () => {
      process.env.SMTP_HOST = "smtp.example.com";
      prisma.notification.count.mockResolvedValue(0);
      prisma.notification.findMany.mockResolvedValue([]);
      const ok = await service.sendUserDigest("u1", "DAILY" as any, SINCE);
      expect(ok).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  runFrequency : filtrage Prisma
  // ──────────────────────────────────────────────────────────────

  describe("runFrequency", () => {
    it("interroge user.findMany avec digestFrequency=WEEKLY et fenêtre 7 jours", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now);

      const sent = await service.runFrequency("WEEKLY");

      expect(sent).toBe(0);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            deletedAt: null,
            digestFrequency: "WEEKLY",
          }),
        }),
      );
      const args = prisma.user.findMany.mock.calls[0][0];
      const since = args.where.notifications.some.createdAt.gte as Date;
      const expected = new Date(now - 7 * 24 * 60 * 60 * 1000);
      expect(Math.abs(since.getTime() - expected.getTime())).toBeLessThan(50);
    });

    it("DAILY : fenêtre 24h", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now);

      await service.runFrequency("DAILY");

      const args = prisma.user.findMany.mock.calls[0][0];
      const since = args.where.notifications.some.createdAt.gte as Date;
      const expected = new Date(now - 24 * 60 * 60 * 1000);
      expect(Math.abs(since.getTime() - expected.getTime())).toBeLessThan(50);
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  handleDigestCron (Monday vs week-day)
  // ──────────────────────────────────────────────────────────────

  describe("handleDigestCron", () => {
    it("lundi : déclenche DAILY ET WEEKLY", async () => {
      // 2026-04-27 = lundi
      jest.useFakeTimers().setSystemTime(new Date("2026-04-27T08:00:00Z"));
      const spy = jest.spyOn(service, "runFrequency").mockResolvedValue(0);

      await service.handleDigestCron();

      expect(spy).toHaveBeenCalledWith("DAILY");
      expect(spy).toHaveBeenCalledWith("WEEKLY");
      expect(spy).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it("mardi : ne déclenche QUE DAILY", async () => {
      // 2026-04-28 = mardi
      jest.useFakeTimers().setSystemTime(new Date("2026-04-28T08:00:00Z"));
      const spy = jest.spyOn(service, "runFrequency").mockResolvedValue(0);

      await service.handleDigestCron();

      expect(spy).toHaveBeenCalledWith("DAILY");
      expect(spy).not.toHaveBeenCalledWith("WEEKLY");
      expect(spy).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it("dimanche : ne déclenche QUE DAILY (corrige le bug 1-5)", async () => {
      // 2026-04-26 = dimanche
      jest.useFakeTimers().setSystemTime(new Date("2026-04-26T08:00:00Z"));
      const spy = jest.spyOn(service, "runFrequency").mockResolvedValue(0);

      await service.handleDigestCron();

      expect(spy).toHaveBeenCalledWith("DAILY");
      expect(spy).not.toHaveBeenCalledWith("WEEKLY");

      jest.useRealTimers();
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  renderDigestHtml (sanity / smoke)
  // ──────────────────────────────────────────────────────────────

  describe("renderDigestHtml", () => {
    it("rend du HTML contenant les sections actives et le total", () => {
      const grouped = {
        incidents: [
          {
            id: "n1",
            type: "INCIDENT_CREATED",
            title: "Phishing détecté",
            createdAt: new Date("2026-04-25T10:00:00Z"),
            resourceType: "INCIDENT",
            resourceId: "inc-1",
          },
        ],
        signatures: [],
        documents: [],
        tickets: [],
        wiki: [],
        news: [],
        mentions: [],
        other: [],
      } as any;

      const html = service.renderDigestHtml({
        firstName: "Alice",
        frequency: "daily" as any,
        grouped,
        totalUnread: 1,
        shownCount: 1,
      });

      expect(html).toContain("Alice");
      expect(html).toContain("Phishing d");
      // Le label est rendu en titlecase, mis en MAJUSCULE par CSS text-transform.
      expect(html).toContain("Incidents");
      expect(html).toContain("OMNITECH");
      // Pas de section vide (signatures par exemple) — le titre "Signatures"
      // ne doit donc pas apparaître dans le rendu.
      expect(html).not.toContain(">Signatures<");
    });

    it("échappe les caractères dangereux dans le titre", () => {
      const grouped = {
        incidents: [],
        signatures: [],
        documents: [
          {
            id: "n1",
            type: "DOC_PUBLISHED",
            title: "<script>alert(1)</script>",
            createdAt: new Date(),
            resourceType: "DOC",
            resourceId: "d1",
          },
        ],
        tickets: [],
        wiki: [],
        news: [],
        mentions: [],
        other: [],
      } as any;

      const html = service.renderDigestHtml({
        firstName: "Eve",
        frequency: "daily" as any,
        grouped,
        totalUnread: 1,
        shownCount: 1,
      });

      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });
});
