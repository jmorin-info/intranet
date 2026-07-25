import { NotificationsService } from "./notifications.service";

/**
 * Tests unitaires — déduplication optionnelle de NotificationsService.create
 * (paramètre `dedupeKey`, fenêtre glissante 7 jours par user+type).
 *
 * Utilisé par la veille (dedupeKey = cveId) pour ne pas renotifier le même
 * CVE arrivé via plusieurs sources/URLs. Instanciation directe : seul le
 * PrismaService est requis, les autres dépendances sont @Optional().
 */
describe("NotificationsService — déduplication (dedupeKey)", () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "n1" }),
      },
      // Chemin email : SMTP désactivé → sendEmailNotification bail out tôt.
      appConfig: {
        findFirst: jest.fn().mockResolvedValue({ value: "false" }),
      },
    };
    service = new NotificationsService(prisma);
  });

  it("sans dedupeKey : aucun lookup de dédup, création normale", async () => {
    await service.create({ userId: "u1", type: "VEILLE_CRITICAL", title: "x" });
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it("dedupeKey avec doublon existant (<7j) : skip, retourne null, pas de create", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "existing" });
    const res = await service.create({
      userId: "u1",
      type: "VEILLE_CRITICAL",
      title: "Veille CRITIQUE — CVE-2026-1",
      dedupeKey: "CVE-2026-1",
    });
    expect(res).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("dedupeKey sans doublon : recherche par resourceId OU titre, puis crée", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    const res = await service.create({
      userId: "u1",
      type: "VEILLE_CRITICAL",
      title: "Veille CRITIQUE — CVE-2026-1",
      dedupeKey: "CVE-2026-1",
    });
    expect(prisma.notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          OR: [{ resourceId: "CVE-2026-1" }, { title: { contains: "CVE-2026-1" } }],
        }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ id: "n1" });
  });

  it("lookup de dédup en erreur : fail-open, la notification est créée", async () => {
    prisma.notification.findFirst.mockRejectedValue(new Error("db error"));
    const res = await service.create({
      userId: "u1",
      type: "VEILLE_CRITICAL",
      title: "x",
      dedupeKey: "CVE-2026-1",
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ id: "n1" });
  });
});
