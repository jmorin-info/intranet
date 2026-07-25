import { JobsService } from "./jobs.service";
import { NotificationType } from "@prisma/client";

/**
 * Tests unitaires — rétention des notifications (JobsService.purgeOldNotifications).
 *
 * Politique (remédiation spam veille, 2026-07-24) :
 *   - notifs VEILLE (type VEILLE_* OU resourceType VeilleItem/VeilleBulletin,
 *     legacy DOC_PUBLISHED inclus) : purge à 30 jours quel que soit l'état ;
 *   - notifs LUES (tous types) : 90 jours ;
 *   - notifs NON LUES (tous types) : 180 jours.
 */
describe("JobsService — purgeOldNotifications (rétention)", () => {
  let service: JobsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      notification: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new JobsService(prisma, {} as any);
  });

  it("émet 3 purges : veille >30j, lues >90j, non lues >180j", async () => {
    const now = Date.now();
    await service.purgeOldNotifications();

    expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(3);
    const calls = prisma.notification.deleteMany.mock.calls.map((c: any[]) => c[0]);

    // 1. Veille — prédicat type dédié OU resourceType veille (legacy inclus).
    expect(calls[0].where.OR).toEqual([
      {
        type: {
          in: [NotificationType.VEILLE_CRITICAL, NotificationType.VEILLE_BULLETIN],
        },
      },
      { resourceType: { in: ["VeilleItem", "VeilleBulletin"] } },
    ]);
    // La veille est purgée quel que soit l'état (pas de filtre isRead).
    expect(calls[0].where.isRead).toBeUndefined();

    // 2. Lues (isRead=true). 3. Non lues (isRead=false).
    expect(calls[1].where.isRead).toBe(true);
    expect(calls[2].where.isRead).toBe(false);

    // Seuils d'ancienneté (tolérance d'arrondi au jour).
    const daysAgo = (d: Date) => Math.round((now - d.getTime()) / 86400000);
    expect(daysAgo(calls[0].where.createdAt.lt)).toBe(30);
    expect(daysAgo(calls[1].where.createdAt.lt)).toBe(90);
    expect(daysAgo(calls[2].where.createdAt.lt)).toBe(180);
  });

  it("ne jette pas si une purge échoue (best-effort, loggé)", async () => {
    prisma.notification.deleteMany.mockRejectedValueOnce(new Error("db down"));
    await expect(service.purgeOldNotifications()).resolves.toBeUndefined();
  });
});
