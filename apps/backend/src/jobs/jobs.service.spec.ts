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

/**
 * Tests unitaires — relance des étapes en souffrance
 * (JobsService.remindStaleWorkflowSteps).
 *
 * Garde-fous introduits (remédiation double-step héritée) :
 *   - ne relance QUE la step dont stepType === request.currentStep ;
 *   - cohérence de statut documentaire (VERIFICATION/REVIEW => IN_REVIEW,
 *     APPROVAL => PENDING_APPROVAL) ;
 *   - throttle PAR step (metadata.stepId).
 */
describe("JobsService — remindStaleWorkflowSteps (garde-fous double-step)", () => {
  let service: JobsService;
  let prisma: any;
  let notifications: { create: jest.Mock };

  const SIX_DAYS_AGO = new Date(Date.now() - 6 * 86400000);

  function makeStep(over: Record<string, any>) {
    return {
      id: over.id ?? "step-1",
      stepType: over.stepType ?? "REVIEW",
      assignedToId: over.assignedToId ?? "user-assignee",
      createdAt: over.createdAt ?? SIX_DAYS_AGO,
      assignedTo: { id: "user-assignee", firstName: "Alice", lastName: "R" },
      request: {
        currentStep: over.currentStep ?? "REVIEW",
        document: {
          id: over.docId ?? "doc-1",
          title: "Doc",
          reference: "REF-1",
          ownerId: "owner-1",
          deletedAt: null,
          status: over.docStatus ?? "IN_REVIEW",
        },
      },
    };
  }

  beforeEach(() => {
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      validationStep: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new JobsService(prisma, notifications as any);
  });

  it("relance une step dont le type correspond à l'étape courante et au statut du doc", async () => {
    prisma.validationStep.findMany.mockResolvedValue([
      makeStep({ stepType: "REVIEW", currentStep: "REVIEW", docStatus: "IN_REVIEW" }),
    ]);
    await service.remindStaleWorkflowSteps();
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0].userId).toBe("user-assignee");
    // Throttle interrogé par step (metadata.stepId).
    expect(prisma.auditLog.findFirst.mock.calls[0][0].where.metadata).toEqual({
      path: ["stepId"],
      equals: "step-1",
    });
  });

  it("ignore une step REVIEW héritée quand currentStep = APPROVAL (pas de relance fantôme)", async () => {
    prisma.validationStep.findMany.mockResolvedValue([
      makeStep({
        stepType: "REVIEW",
        currentStep: "APPROVAL",
        docStatus: "PENDING_APPROVAL",
      }),
    ]);
    await service.remindStaleWorkflowSteps();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it("ignore une step REVIEW quand le document est REVIEW_APPROVED (balle au rédacteur)", async () => {
    prisma.validationStep.findMany.mockResolvedValue([
      makeStep({ stepType: "REVIEW", currentStep: "REVIEW", docStatus: "REVIEW_APPROVED" }),
    ]);
    await service.remindStaleWorkflowSteps();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it("relance la vraie step APPROVAL même si une step REVIEW fantôme la précède", async () => {
    prisma.validationStep.findMany.mockResolvedValue([
      makeStep({
        id: "ghost-review",
        stepType: "REVIEW",
        currentStep: "APPROVAL",
        docStatus: "PENDING_APPROVAL",
        assignedToId: "old-reviewer",
      }),
      makeStep({
        id: "real-approval",
        stepType: "APPROVAL",
        currentStep: "APPROVAL",
        docStatus: "PENDING_APPROVAL",
        assignedToId: "approver",
      }),
    ]);
    await service.remindStaleWorkflowSteps();
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0].userId).toBe("approver");
  });
});
