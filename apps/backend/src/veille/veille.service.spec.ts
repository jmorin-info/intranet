import { Test, TestingModule } from "@nestjs/testing";
import { VeilleService } from "./veille.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotFoundException } from "@nestjs/common";

describe("VeilleService", () => {
  let service: VeilleService;
  let prisma: any;
  let notifications: { create: jest.Mock };

  const mockVeilleItem = {
    id: "veille-1",
    title: "Vulnérabilité FortiGate CVE-2026-1234",
    description: "Critical vulnerability in FortiOS",
    sourceUrl: "https://cert.ssi.gouv.fr/alerte/1",
    sourceName: "CERT-FR Alertes",
    publishedAt: new Date(),
    severity: "CRITICAL",
    cveId: "CVE-2026-1234",
    isProcessed: false,
    bulletinId: null,
    acks: [],
  };

  const mockBulletin = {
    id: "bulletin-1",
    title: "Bulletin Cybersécurité — Semaine du 30/03/2026 au 06/04/2026",
    weekStart: new Date("2026-03-30"),
    weekEnd: new Date("2026-04-06"),
    content: "<div>HTML content</div>",
    itemCount: 3,
    isPublished: true,
    publishedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      veilleItem: {
        findMany: jest.fn().mockResolvedValue([mockVeilleItem]),
        findUnique: jest.fn().mockResolvedValue(mockVeilleItem),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
        upsert: jest.fn().mockResolvedValue(mockVeilleItem),
        update: jest.fn().mockResolvedValue(mockVeilleItem),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      veilleAck: {
        upsert: jest.fn().mockResolvedValue({
          id: "ack-1",
          veilleItemId: "veille-1",
          userId: "user-1",
          action: "APPLIED",
          user: { id: "user-1", firstName: "Test", lastName: "User" },
        }),
      },
      veilleBulletin: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockBulletin]),
        create: jest.fn().mockResolvedValue(mockBulletin),
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: "admin-1" }]),
      },
      appConfig: {
        // Par défaut : kill-switch DÉSACTIVÉ (clé absente → enabled=false).
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    notifications = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeilleService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<VeilleService>(VeilleService);
  });

  /** Active le kill-switch (AppConfig veille.notifications.enabled = "true"). */
  function enableNotifications() {
    prisma.appConfig.findUnique.mockResolvedValue({ value: "true" });
  }

  describe("findAll", () => {
    it("should return paginated veille items", async () => {
      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it("should filter by isProcessed", async () => {
      await service.findAll({ isProcessed: false });
      expect(prisma.veilleItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isProcessed: false }),
        }),
      );
    });

    it("should filter by search term across title, description, and cveId", async () => {
      await service.findAll({ search: "FortiGate" });
      expect(prisma.veilleItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: "FortiGate", mode: "insensitive" } },
              { description: { contains: "FortiGate", mode: "insensitive" } },
              { cveId: { contains: "FortiGate", mode: "insensitive" } },
            ],
          }),
        }),
      );
    });

    it("should use default pagination of page 1, limit 30", async () => {
      await service.findAll({});
      expect(prisma.veilleItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 30,
        }),
      );
    });
  });

  describe("isRelevantToParc", () => {
    it("should match FortiGate", () => {
      expect(service.isRelevantToParc("Vulnerability in FortiGate firewall")).toBe(true);
    });

    it("should match VMware", () => {
      expect(service.isRelevantToParc("VMware vSphere update available")).toBe(true);
    });

    it("should match ESXi", () => {
      expect(service.isRelevantToParc("Critical ESXi vulnerability")).toBe(true);
    });

    it("should match Microsoft products", () => {
      expect(service.isRelevantToParc("Microsoft Exchange zero-day")).toBe(true);
    });

    it("should match Veeam", () => {
      expect(service.isRelevantToParc("Veeam backup vulnerability")).toBe(true);
    });

    it("should match ESET", () => {
      expect(service.isRelevantToParc("ESET NOD32 update")).toBe(true);
    });

    it("should match Cisco/Meraki", () => {
      expect(service.isRelevantToParc("Cisco Meraki firmware update")).toBe(true);
    });

    it("should match PostgreSQL", () => {
      expect(service.isRelevantToParc("PostgreSQL security patch")).toBe(true);
    });

    it("should match nginx", () => {
      expect(service.isRelevantToParc("nginx HTTP/2 vulnerability")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(service.isRelevantToParc("FORTIGATE CRITICAL ALERT")).toBe(true);
    });

    it("should not match unrelated products", () => {
      expect(service.isRelevantToParc("Oracle Database patch")).toBe(false);
    });

    it("should not match empty string", () => {
      expect(service.isRelevantToParc("")).toBe(false);
    });
  });

  describe("generateWeeklyBulletin", () => {
    it("should create a new bulletin for the week", async () => {
      const weekStart = new Date("2026-03-30");
      prisma.veilleItem.findMany.mockResolvedValue([
        {
          ...mockVeilleItem,
          severity: "CRITICAL",
          title: "FortiGate CVE",
          description: "FortiOS vuln",
        },
        {
          ...mockVeilleItem,
          id: "veille-2",
          severity: "HIGH",
          title: "VMware update",
          description: "ESXi patch",
        },
      ]);

      const result = await service.generateWeeklyBulletin(weekStart);
      expect(prisma.veilleBulletin.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            weekStart,
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
      expect(result).toEqual(mockBulletin);
    });

    it("should return existing bulletin if one exists for the week", async () => {
      const weekStart = new Date("2026-03-30");
      prisma.veilleBulletin.findUnique.mockResolvedValue(mockBulletin);

      const result = await service.generateWeeklyBulletin(weekStart);
      expect(result).toEqual(mockBulletin);
      expect(prisma.veilleBulletin.create).not.toHaveBeenCalled();
    });

    it("should filter items relevant to OMNITECH parc", async () => {
      const weekStart = new Date("2026-03-30");
      prisma.veilleItem.findMany.mockResolvedValue([
        {
          ...mockVeilleItem,
          title: "FortiGate CVE",
          description: "FortiOS vuln",
          severity: "CRITICAL",
        },
        {
          ...mockVeilleItem,
          id: "veille-2",
          title: "Oracle patch",
          description: "Oracle DB update",
          severity: "HIGH",
        },
      ]);

      await service.generateWeeklyBulletin(weekStart);

      // Only FortiGate item is relevant, so itemCount should be 1
      expect(prisma.veilleBulletin.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemCount: 1,
          }),
        }),
      );
    });

    it("should generate HTML content in the bulletin", async () => {
      const weekStart = new Date("2026-03-30");
      prisma.veilleItem.findMany.mockResolvedValue([mockVeilleItem]);

      await service.generateWeeklyBulletin(weekStart);

      const createCall = prisma.veilleBulletin.create.mock.calls[0][0];
      expect(createCall.data.content).toContain("Bulletin Cybersécurité OMNITECH");
      expect(createCall.data.content).toContain("ISO 27001");
    });

    it("should link relevant items to the bulletin", async () => {
      const weekStart = new Date("2026-03-30");
      prisma.veilleItem.findMany.mockResolvedValue([mockVeilleItem]);

      await service.generateWeeklyBulletin(weekStart);

      expect(prisma.veilleItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["veille-1"] } },
        }),
      );
    });
  });

  describe("getBulletins", () => {
    it("should return paginated published bulletins", async () => {
      const result = await service.getBulletins();
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it("should use custom pagination", async () => {
      await service.getBulletins(2, 5);
      expect(prisma.veilleBulletin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });

    it("should only return published bulletins", async () => {
      await service.getBulletins();
      expect(prisma.veilleBulletin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isPublished: true },
        }),
      );
    });
  });

  describe("getBulletinById", () => {
    it("should return bulletin with items", async () => {
      prisma.veilleBulletin.findUnique.mockResolvedValue({
        ...mockBulletin,
        items: [mockVeilleItem],
      });
      const result = await service.getBulletinById("bulletin-1");
      expect(result.title).toContain("Bulletin");
      expect(result.items).toHaveLength(1);
    });

    it("should throw NotFoundException for missing bulletin", async () => {
      prisma.veilleBulletin.findUnique.mockResolvedValue(null);
      await expect(service.getBulletinById("bad-id")).rejects.toThrow(NotFoundException);
    });
  });

  describe("acknowledge", () => {
    it("should acknowledge a veille item", async () => {
      const result = await service.acknowledge("veille-1", "user-1", "APPLIED", "Done");
      expect(prisma.veilleAck.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { veilleItemId_userId: { veilleItemId: "veille-1", userId: "user-1" } },
          create: expect.objectContaining({
            veilleItemId: "veille-1",
            userId: "user-1",
            action: "APPLIED",
            comment: "Done",
          }),
        }),
      );
    });

    it("should mark item as processed for definitive actions", async () => {
      await service.acknowledge("veille-1", "user-1", "APPLIED");
      expect(prisma.veilleItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "veille-1" },
          data: { isProcessed: true },
        }),
      );
    });

    it("should not mark item as processed for non-definitive actions", async () => {
      await service.acknowledge("veille-1", "user-1", "NOTED");
      expect(prisma.veilleItem.update).not.toHaveBeenCalled();
    });

    it("should throw NotFoundException for non-existent item", async () => {
      prisma.veilleItem.findUnique.mockResolvedValue(null);
      await expect(service.acknowledge("bad-id", "user-1", "APPLIED")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getStats", () => {
    it("should return veille statistics", async () => {
      prisma.veilleItem.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(6) // unprocessed
        .mockResolvedValueOnce(4); // processed
      prisma.veilleItem.groupBy.mockResolvedValue([
        { severity: "CRITICAL", _count: 2 },
        { severity: "HIGH", _count: 4 },
      ]);

      const result = await service.getStats();
      expect(result.total).toBe(10);
      expect(result.unprocessed).toBe(6);
      expect(result.processed).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  Kill-switch notifications (AppConfig veille.notifications.enabled)
  // ──────────────────────────────────────────────────────────────

  describe("areNotificationsEnabled (kill-switch)", () => {
    it("défaut DÉSACTIVÉ quand la clé AppConfig est absente", async () => {
      prisma.appConfig.findUnique.mockResolvedValue(null);
      await expect(service.areNotificationsEnabled()).resolves.toBe(false);
    });

    it('activé uniquement pour la valeur exacte "true" (fail-closed)', async () => {
      prisma.appConfig.findUnique.mockResolvedValue({ value: "true" });
      await expect(service.areNotificationsEnabled()).resolves.toBe(true);
      prisma.appConfig.findUnique.mockResolvedValue({ value: "false" });
      await expect(service.areNotificationsEnabled()).resolves.toBe(false);
      prisma.appConfig.findUnique.mockResolvedValue({ value: "1" });
      await expect(service.areNotificationsEnabled()).resolves.toBe(false);
    });

    it("fail-closed si la lecture AppConfig échoue", async () => {
      prisma.appConfig.findUnique.mockRejectedValue(new Error("db down"));
      await expect(service.areNotificationsEnabled()).resolves.toBe(false);
    });

    it("setNotificationsEnabled upsert la clé avec la bonne valeur", async () => {
      await service.setNotificationsEnabled(true, "admin-1");
      expect(prisma.appConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "veille.notifications.enabled" },
          create: expect.objectContaining({ value: "true" }),
          update: expect.objectContaining({ value: "true" }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  Détection de sévérité durcie
  // ──────────────────────────────────────────────────────────────

  describe("detectSeverity (durcie 2026-07-24)", () => {
    it("CRITICAL uniquement si CVE + exploitation active / zero-day", () => {
      expect(service.detectSeverity("CVE-2026-1234 actively exploited in the wild")).toBe(
        "CRITICAL",
      );
      expect(service.detectSeverity("FortiOS CVE-2026-1234 zero-day")).toBe("CRITICAL");
    });

    it("CRITICAL si CVE + CVSS ≥ 9", () => {
      expect(service.detectSeverity("CVE-2026-1234 CVSS 9.8 RCE")).toBe("CRITICAL");
    });

    it("« critical » seul, sans CVE, ne suffit plus → HIGH", () => {
      expect(service.detectSeverity("A critical opinion piece on cybersecurity")).toBe("HIGH");
    });

    it("CVE + CVSS 7 (sans exploitation) → HIGH, pas CRITICAL", () => {
      expect(service.detectSeverity("CVE-2026-1234 rated CVSS 7.2")).toBe("HIGH");
    });

    it("texte anodin → LOW", () => {
      expect(service.detectSeverity("Weekly security newsletter roundup")).toBe("LOW");
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  Pertinence parc durcie (plus de matches génériques)
  // ──────────────────────────────────────────────────────────────

  describe("isStrictParcMatch / isRelevantToParc (durcies)", () => {
    it("matche un produit précis du parc", () => {
      expect(service.isStrictParcMatch("FortiGate SSL-VPN flaw")).toBe(true);
      expect(service.isStrictParcMatch("VMware ESXi patch")).toBe(true);
      expect(service.isStrictParcMatch("Microsoft Exchange Server RCE")).toBe(true);
    });

    it("ne matche PLUS les termes génériques seuls", () => {
      expect(service.isStrictParcMatch("New Windows 11 feature")).toBe(false);
      expect(service.isStrictParcMatch("Microsoft announces Copilot")).toBe(false);
      expect(service.isStrictParcMatch("Docker Desktop update")).toBe(false);
      expect(service.isStrictParcMatch("Best LLM prompt tips")).toBe(false);
    });

    it("frontière de mot : « eset » ne matche pas « reset »", () => {
      expect(service.isStrictParcMatch("Please reset your password")).toBe(false);
      expect(service.isStrictParcMatch("ESET NOD32 detection")).toBe(true);
    });

    it("isRelevantToParc inclut les sujets métier mais exclut le hors-périmètre", () => {
      expect(service.isRelevantToParc("NIS2 compliance deadline")).toBe(true);
      expect(service.isRelevantToParc("Déploiement de vidéosurveillance")).toBe(true);
      expect(service.isRelevantToParc("Oracle Database patch")).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  Canal immédiat strict + déduplication
  // ──────────────────────────────────────────────────────────────

  describe("notifyImmediateCriticals (canal immédiat strict)", () => {
    const parcItem = (over: Record<string, unknown> = {}) => ({
      id: "i1",
      title: "FortiGate CVE-2026-1234 exploited in the wild",
      description: "FortiOS SSL-VPN",
      sourceName: "Fortinet PSIRT",
      cveId: "CVE-2026-1234",
      ...over,
    });

    it("ne notifie rien si le kill-switch est OFF (défaut)", async () => {
      await (service as any).notifyImmediateCriticals([parcItem()]);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("kill-switch ON : notifie chaque admin, type VEILLE_CRITICAL + dedupeKey CVE", async () => {
      enableNotifications();
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
      prisma.veilleItem.findFirst.mockResolvedValue(null);
      prisma.veilleItem.findMany.mockResolvedValue([]);
      await (service as any).notifyImmediateCriticals([parcItem()]);
      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "VEILLE_CRITICAL",
          resourceType: "VeilleItem",
          dedupeKey: "CVE-2026-1234",
        }),
      );
    });

    it("ignore les items sans CVE ou hors parc strict", async () => {
      enableNotifications();
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
      await (service as any).notifyImmediateCriticals([
        parcItem({ id: "no-cve", cveId: null }),
        parcItem({
          id: "off-parc",
          title: "Oracle DB flaw CVE-2026-9999",
          description: "Oracle Database",
          cveId: "CVE-2026-9999",
        }),
      ]);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("dédup INTRA-cycle : même CVE via 3 flux → 1 notif/admin (ni 0 ni 3)", async () => {
      enableNotifications();
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
      prisma.veilleItem.findFirst.mockResolvedValue(null);
      prisma.veilleItem.findMany.mockResolvedValue([]);
      await (service as any).notifyImmediateCriticals([
        parcItem({ id: "a", sourceName: "Fortinet PSIRT" }),
        parcItem({ id: "b", sourceName: "BleepingComputer" }),
        parcItem({ id: "c", sourceName: "CVE Feed" }),
      ]);
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it("dédup HISTORIQUE : un item préexistant même CVE (<30j) → skip", async () => {
      enableNotifications();
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
      // hasRecentDuplicate : findFirst renvoie un item PRÉEXISTANT (hors lot).
      prisma.veilleItem.findFirst.mockResolvedValue({ id: "old-item" });
      await (service as any).notifyImmediateCriticals([parcItem()]);
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────
  //  Digest quotidien de synthèse
  // ──────────────────────────────────────────────────────────────

  describe("sendDailyCriticalDigest", () => {
    it("skip si kill-switch OFF", async () => {
      const res = await service.sendDailyCriticalDigest(new Date(2026, 6, 21, 8, 0, 0));
      expect(res).toEqual({ notified: 0, items: 0 });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("ON : agrège les items CRITICAL pertinents en 1 notif de synthèse/admin", async () => {
      enableNotifications();
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
      prisma.veilleItem.findMany.mockResolvedValue([
        {
          id: "1",
          title: "FortiGate CVE-2026-1",
          description: "FortiOS",
          cveId: "CVE-2026-1",
          sourceName: "Fortinet",
        },
        {
          id: "2",
          title: "VMware ESXi CVE-2026-2",
          description: "vSphere",
          cveId: "CVE-2026-2",
          sourceName: "VMware",
        },
        {
          id: "3",
          title: "Oracle DB patch",
          description: "Oracle Database",
          cveId: null,
          sourceName: "Oracle",
        },
      ]);
      const res = await service.sendDailyCriticalDigest(
        new Date(2026, 6, 21, 8, 0, 0), // mardi → fenêtre 24h
      );
      expect(res.items).toBe(2); // Oracle exclu (hors parc)
      expect(res.notified).toBe(2); // 2 admins
      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "VEILLE_CRITICAL",
          resourceType: "VeilleItem",
        }),
      );
    });

    it("dédup par CVE dans le digest : même CVE ×2 compté une fois", async () => {
      enableNotifications();
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
      prisma.veilleItem.findMany.mockResolvedValue([
        {
          id: "1",
          title: "FortiGate CVE-2026-1 via source A",
          description: "FortiOS",
          cveId: "CVE-2026-1",
          sourceName: "A",
        },
        {
          id: "2",
          title: "FortiGate CVE-2026-1 via source B",
          description: "FortiOS",
          cveId: "CVE-2026-1",
          sourceName: "B",
        },
      ]);
      const res = await service.sendDailyCriticalDigest(new Date(2026, 6, 21, 8, 0, 0));
      expect(res.items).toBe(1);
    });

    it("fenêtre élargie à 72h le lundi (couvre le week-end)", async () => {
      enableNotifications();
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
      prisma.veilleItem.findMany.mockResolvedValue([]);
      const monday = new Date(2026, 6, 20, 8, 0, 0); // lundi
      await service.sendDailyCriticalDigest(monday);
      const call = prisma.veilleItem.findMany.mock.calls[0][0];
      const since = call.where.fetchedAt.gte as Date;
      const hours = (monday.getTime() - since.getTime()) / 3600000;
      expect(Math.round(hours)).toBe(72);
    });
  });
});
