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
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock };
    approvalDelegation: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    approvalStepInstance: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    approvalAuditLog: {
      create: jest.Mock;
    };
  };

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
        update: jest.fn(),
      },
      approvalAuditLog: {
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
    it("ne fait rien si aucune step-instance stale", async () => {
      prisma.approvalStepInstance.findMany.mockResolvedValue([]);
      const result = await service.runAutoDelegation(48);
      expect(result).toEqual({ delegated: 0, escalated: 0, skipped: 0 });
    });

    it("délègue au manager si présent et actif", async () => {
      prisma.approvalStepInstance.findMany.mockResolvedValue([
        {
          id: "si-1",
          instanceId: "i-1",
          assignedToId: "u-original",
          assignedTo: {
            id: "u-original",
            firstName: "Jean",
            lastName: "Morin",
            isActive: true,
            deletedAt: null,
            managerId: "u-mgr",
          },
          step: { id: "s-1", name: "Validation", slaHours: 48 },
          instance: { id: "i-1", documentId: "d-1" },
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        id: "u-mgr",
        isActive: true,
        deletedAt: null,
      });
      prisma.approvalDelegation.findFirst.mockResolvedValue(null);
      prisma.approvalDelegation.create.mockResolvedValue({ id: "d-auto" });
      prisma.approvalStepInstance.update.mockResolvedValue({});

      const result = await service.runAutoDelegation(48);

      expect(result.delegated).toBe(1);
      expect(result.escalated).toBe(0);
      expect(prisma.approvalDelegation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromUserId: "u-original",
            toUserId: "u-mgr",
            auto: true,
          }),
        }),
      );
      expect(prisma.approvalStepInstance.update).toHaveBeenCalledWith({
        where: { id: "si-1" },
        data: { assignedToId: "u-mgr" },
      });
    });

    it("escalade vers SUPER_ADMIN si pas de manager", async () => {
      prisma.approvalStepInstance.findMany.mockResolvedValue([
        {
          id: "si-1",
          instanceId: "i-1",
          assignedToId: "u-orphan",
          assignedTo: {
            id: "u-orphan",
            firstName: "Solo",
            lastName: "User",
            isActive: true,
            deletedAt: null,
            managerId: null,
          },
          step: { id: "s-1", name: "V", slaHours: 48 },
          instance: { id: "i-1", documentId: "d-1" },
        },
      ]);
      prisma.user.findFirst.mockResolvedValue({ id: "u-superadmin" });
      prisma.approvalDelegation.findFirst.mockResolvedValue(null);
      prisma.approvalDelegation.create.mockResolvedValue({ id: "d-auto" });

      const result = await service.runAutoDelegation(48);
      expect(result.escalated).toBe(1);
      expect(result.delegated).toBe(0);
      expect(prisma.approvalAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "DELEGATION_AUTO_ESCALATED",
          }),
        }),
      );
    });

    it("skip si l'utilisateur d'origine est inactif", async () => {
      prisma.approvalStepInstance.findMany.mockResolvedValue([
        {
          id: "si-1",
          instanceId: "i-1",
          assignedToId: "u-inactive",
          assignedTo: {
            id: "u-inactive",
            firstName: "X",
            lastName: "Y",
            isActive: false,
            deletedAt: null,
            managerId: "u-mgr",
          },
          step: { id: "s-1", name: "V", slaHours: 48 },
          instance: { id: "i-1", documentId: "d-1" },
        },
      ]);

      const result = await service.runAutoDelegation(48);
      expect(result.skipped).toBe(1);
    });
  });
});
