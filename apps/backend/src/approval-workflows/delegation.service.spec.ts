import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DelegationService } from "./delegation.service";
import { PrismaService } from "../prisma/prisma.service";

describe("DelegationService", () => {
  let service: DelegationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      approvalDelegation: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      approvalStepInstance: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      document: { findUnique: jest.fn().mockResolvedValue({ id: 'document', title: 'Politique', reference: 'POL_001', ownerId: 'owner', currentVersionId: 'version', deletedAt: null }) },
      notification: { create: jest.fn() },
      $transaction: jest.fn(async operation => operation(prisma)),
      approvalAuditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelegationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DelegationService>(DelegationService);
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe("create", () => {
    const validUser = {
      id: "u-target",
      isActive: true,
      deletedAt: null,
    };

    it("refuse l'auto-délégation", async () => {
      await expect(
        service.create("u-1", {
          toUserId: "u-1",
          startDate: "2026-01-01",
          endDate: "2026-01-15",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("refuse si endDate <= startDate", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      await expect(
        service.create("u-1", {
          toUserId: "u-target",
          startDate: "2026-01-15",
          endDate: "2026-01-01",
        }),
      ).rejects.toThrow(/postérieure/);
    });

    it("refuse si délégataire inactif/supprimé", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...validUser,
        isActive: false,
      });
      await expect(
        service.create("u-1", {
          toUserId: "u-target",
          startDate: "2026-01-01",
          endDate: "2026-01-15",
        }),
      ).rejects.toThrow(/inactif/);
    });

    it("crée une délégation GLOBAL valide et trace audit", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      prisma.approvalDelegation.findFirst.mockResolvedValue(null);
      const mockDelegation = {
        id: "d-1",
        fromUserId: "u-1",
        toUserId: "u-target",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-15"),
      };
      prisma.approvalDelegation.create.mockResolvedValue(mockDelegation);

      const result = await service.create("u-1", {
        toUserId: "u-target",
        startDate: "2026-01-01",
        endDate: "2026-01-15",
        reason: "Vacances",
      });

      expect(result).toEqual(mockDelegation);
      expect(prisma.approvalDelegation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromUserId: "u-1",
            toUserId: "u-target",
            scope: "GLOBAL",
            auto: false,
          }),
        }),
      );
      expect(prisma.approvalAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "DELEGATION_CREATED" }),
        }),
      );
    });

    it("refuse un chevauchement GLOBAL avec une délégation existante", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      prisma.approvalDelegation.findFirst.mockResolvedValue({
        id: "d-existing",
        startDate: new Date("2026-01-05"),
        endDate: new Date("2026-01-20"),
      });

      await expect(
        service.create("u-1", {
          toUserId: "u-target",
          startDate: "2026-01-01",
          endDate: "2026-01-15",
        }),
      ).rejects.toThrow(/délégation GLOBAL active existe déjà/);
    });
  });

  // ---------------------------------------------------------------------------
  // resolveDelegate
  // ---------------------------------------------------------------------------

  describe("resolveDelegate", () => {
    it("retourne null si aucune délégation active", async () => {
      prisma.approvalDelegation.findMany.mockResolvedValue([]);
      const result = await service.resolveDelegate("u-1");
      expect(result).toBeNull();
    });

    it("retourne le délégataire GLOBAL si présent", async () => {
      prisma.approvalDelegation.findMany.mockResolvedValue([
        {
          toUserId: "u-mgr",
          scope: "GLOBAL",
          categories: [],
          createdAt: new Date(),
        },
      ]);
      const result = await service.resolveDelegate("u-1");
      expect(result).toBe("u-mgr");
    });

    it("priorise SCOPED sur GLOBAL quand category matche", async () => {
      prisma.approvalDelegation.findMany.mockResolvedValue([
        {
          toUserId: "u-policy-expert",
          scope: "SCOPED",
          categories: ["POLICY"],
          createdAt: new Date("2026-01-02"),
        },
        {
          toUserId: "u-mgr",
          scope: "GLOBAL",
          categories: [],
          createdAt: new Date("2026-01-01"),
        },
      ]);
      const result = await service.resolveDelegate("u-1", {
        category: "POLICY",
      });
      expect(result).toBe("u-policy-expert");
    });

    it("retombe sur GLOBAL si SCOPED ne matche pas la catégorie", async () => {
      prisma.approvalDelegation.findMany.mockResolvedValue([
        {
          toUserId: "u-policy-expert",
          scope: "SCOPED",
          categories: ["POLICY"],
          createdAt: new Date(),
        },
        {
          toUserId: "u-mgr",
          scope: "GLOBAL",
          categories: [],
          createdAt: new Date(),
        },
      ]);
      const result = await service.resolveDelegate("u-1", {
        category: "CONTRACT",
      });
      expect(result).toBe("u-mgr");
    });
  });

  // ---------------------------------------------------------------------------
  // revoke
  // ---------------------------------------------------------------------------

  describe("revoke", () => {
    it("lève NotFoundException si délégation inexistante", async () => {
      prisma.approvalDelegation.findUnique.mockResolvedValue(null);
      await expect(
        service.revoke("d-nope", "u-1", false),
      ).rejects.toThrow(NotFoundException);
    });

    it("refuse la révocation par un user qui n'est ni délégant ni admin", async () => {
      prisma.approvalDelegation.findUnique.mockResolvedValue({
        id: "d-1",
        fromUserId: "u-other",
        isActive: true,
        revokedAt: null,
      });
      await expect(
        service.revoke("d-1", "u-1", false),
      ).rejects.toThrow(ForbiddenException);
    });

    it("permet à l'admin de révoquer une délégation tierce", async () => {
      prisma.approvalDelegation.findUnique.mockResolvedValue({
        id: "d-1",
        fromUserId: "u-other",
        isActive: true,
        revokedAt: null,
      });
      prisma.approvalDelegation.update.mockResolvedValue({
        id: "d-1",
        isActive: false,
        revokedAt: new Date(),
      });

      const result = await service.revoke("d-1", "u-admin", true);
      expect(result.isActive).toBe(false);
      expect(prisma.approvalAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "DELEGATION_REVOKED" }),
        }),
      );
    });

    it("est idempotent si déjà révoquée", async () => {
      const alreadyRevoked = {
        id: "d-1",
        fromUserId: "u-1",
        isActive: false,
        revokedAt: new Date(),
      };
      prisma.approvalDelegation.findUnique.mockResolvedValue(alreadyRevoked);

      const result = await service.revoke("d-1", "u-1", false);
      expect(result).toEqual(alreadyRevoked);
      expect(prisma.approvalDelegation.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // runAutoDelegation
  // ---------------------------------------------------------------------------

  describe("runAutoDelegation", () => {
    const stale = (overrides: any = {}) => ({
      id: 'si-1', instanceId: 'i-1', stepId: 's-1', assignedToId: 'u-original', decision: 'PENDING',
      escalatedAt: null, dueAt: new Date('2026-01-01'),
      assignedTo: { id: 'u-original', isActive: true, deletedAt: null, managerId: 'u-mgr' },
      step: { id: 's-1', name: 'Validation', order: 1, slaHours: 1, escalateToUserId: null },
      instance: { id: 'i-1', documentId: 'document', documentVersionId: 'version', status: 'PENDING', currentStepOrder: 1, startedAt: new Date('2026-01-01') },
      ...overrides,
    });
    beforeEach(() => {
      prisma.approvalStepInstance.findMany.mockResolvedValue([{ id: 'si-1' }]);
      prisma.approvalStepInstance.findUnique.mockResolvedValue(stale());
      prisma.user.findFirst.mockImplementation(async ({ where }: any) => where.id === 'u-mgr' ? { id: 'u-mgr' } : { id: 'super-admin' });
    });

    it('does nothing with an empty queue', async () => {
      prisma.approvalStepInstance.findMany.mockResolvedValue([]);
      expect(await service.runAutoDelegation()).toEqual({ delegated: 0, escalated: 0, skipped: 0 });
    });

    it('delegates only this step, once, with an atomic audit and notification', async () => {
      expect(await service.runAutoDelegation()).toEqual({ delegated: 1, escalated: 0, skipped: 0 });
      expect(prisma.approvalDelegation.create).not.toHaveBeenCalled();
      expect(prisma.approvalStepInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ decision: 'PENDING', escalatedAt: null, instance: { status: 'PENDING', currentStepOrder: 1 } }),
        data: expect.objectContaining({ assignedToId: 'u-mgr', escalatedAt: expect.any(Date) }),
      }));
      expect(prisma.approvalAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'DELEGATION_AUTO_CREATED', metadata: expect.objectContaining({ scope: 'STEP_ONLY' }) }) }));
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('honours the explicit escalation target before the manager', async () => {
      const row = stale(); row.step.escalateToUserId = 'rssi';
      prisma.approvalStepInstance.findUnique.mockResolvedValue(row);
      prisma.user.findFirst.mockResolvedValue({ id: 'rssi' });
      expect((await service.runAutoDelegation()).escalated).toBe(1);
      expect(prisma.approvalStepInstance.updateMany.mock.calls[0][0].data.assignedToId).toBe('rssi');
    });

    it('escalates an unclaimed role-based task to its explicit target', async () => {
      const row = stale({ assignedTo: null, assignedToId: null }); row.step.escalateToUserId = 'rssi';
      prisma.approvalStepInstance.findUnique.mockResolvedValue(row);
      prisma.user.findFirst.mockResolvedValue({ id: 'rssi' });
      expect((await service.runAutoDelegation()).escalated).toBe(1);
      expect(prisma.approvalStepInstance.updateMany.mock.calls[0][0].where.assignedToId).toBeNull();
      expect(prisma.approvalStepInstance.updateMany.mock.calls[0][0].data.assignedToId).toBe('rssi');
    });

    it('falls back to a distinct active SUPER_ADMIN when no manager is available', async () => {
      prisma.user.findFirst.mockImplementation(async ({ where }: any) => where.role === 'SUPER_ADMIN' ? { id: 'super-admin' } : null);
      expect((await service.runAutoDelegation()).escalated).toBe(1);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ role: 'SUPER_ADMIN', id: { notIn: ['u-original', 'owner'] } }) }));
    });

    it.each(['future', 'already-escalated', 'closed', 'new-version'])('skips a %s task without changing permissions', async kind => {
      const row = stale();
      if (kind === 'future') row.instance.currentStepOrder = 2;
      if (kind === 'already-escalated') row.escalatedAt = new Date();
      if (kind === 'closed') row.instance.status = 'APPROVED';
      if (kind === 'new-version') row.instance.documentVersionId = 'old-version';
      prisma.approvalStepInstance.findUnique.mockResolvedValue(row);
      expect((await service.runAutoDelegation()).skipped).toBe(1);
      expect(prisma.approvalStepInstance.updateMany).not.toHaveBeenCalled();
    });

    it('measures the default delay from stage activation, not document creation', async () => {
      prisma.approvalStepInstance.findUnique.mockResolvedValue(stale({ dueAt: null }));
      prisma.approvalAuditLog.findFirst.mockResolvedValue({ createdAt: new Date() });
      expect((await service.runAutoDelegation()).skipped).toBe(1);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('never collapses two independent quorum votes into one delegate', async () => {
      prisma.approvalStepInstance.findFirst.mockResolvedValue({ id: 'peer' });
      expect((await service.runAutoDelegation()).skipped).toBe(1);
      expect(prisma.approvalStepInstance.updateMany).not.toHaveBeenCalled();
    });

    it('does not emit notifications if a concurrent decision consumed the task', async () => {
      prisma.approvalStepInstance.updateMany.mockResolvedValue({ count: 0 });
      expect((await service.runAutoDelegation()).skipped).toBe(1);
      expect(prisma.approvalAuditLog.create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it.each(['ARCHIVED', 'OBSOLETE', 'APPROVED'])('does not escalate an old pending task for a %s document', async status => {
      prisma.document.findUnique.mockResolvedValue({ id: 'document', status, ownerId: 'owner', currentVersionId: 'version', deletedAt: null });
      expect((await service.runAutoDelegation()).skipped).toBe(1);
      expect(prisma.approvalStepInstance.updateMany).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
