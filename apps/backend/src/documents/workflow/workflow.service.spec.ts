import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowService } from "./workflow.service";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { AuditService } from "../../audit/audit.service";
import { IsoAnalyzerService } from "../../iso-analyzer/iso-analyzer.service";
import { DocumentsService } from "../documents.service";
import { BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "../../common/enums";

describe("WorkflowService", () => {
  let service: WorkflowService;
  let prisma: any;
  let notificationsService: any;
  let auditService: any;
  let tx: any;

  const mockDocument = {
    id: "doc-1",
    title: "Test Document",
    reference: "DOC-001",
    status: "DRAFT",
    ownerId: "user-1",
    verifierId: null,
    reviewerId: "user-2",
    approverId: "user-3",
    currentVersionId: "ver-1",
    isNative: false,
    content: null,
    deletedAt: null,
    reviewer: { id: "user-2", firstName: "Reviewer", lastName: "One" },
  };

  beforeEach(async () => {
    tx = {
      document: {
        update: jest.fn().mockResolvedValue(mockDocument),
        findUnique: jest.fn().mockResolvedValue(mockDocument),
      },
      documentVersion: {
        create: jest.fn().mockResolvedValue({ id: "ver-snap" }),
      },
      validationRequest: {
        create: jest.fn().mockResolvedValue({ id: "req-1" }),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({ id: "req-1", status: "PENDING" }),
      },
      validationStep: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    notificationsService = { create: jest.fn().mockResolvedValue({}) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(mockDocument),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(mockDocument),
      },
      user: {
        // Par défaut : l'approbateur/relecteur assigné (user-2/user-3) a un rôle
        // DIRECTION. Les tests surchargent au besoin.
        findUnique: jest.fn().mockResolvedValue({ id: "user-3", role: "DIRECTION" }),
      },
      validationRequest: {
        create: jest.fn().mockResolvedValue({ id: "req-1" }),
        findFirst: jest.fn().mockResolvedValue({ id: "req-1", status: "PENDING" }),
        update: jest.fn().mockResolvedValue({}),
      },
      validationStep: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AuditService, useValue: auditService },
        {
          provide: IsoAnalyzerService,
          useValue: {
            autoAssignControls: jest.fn().mockResolvedValue({ assigned: 0, controls: [] }),
          },
        },
        {
          provide: DocumentsService,
          useValue: {
            notifyNewDocumentAvailable: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  describe("submitForReview", () => {
    it("should throw NotFoundException if document not found", async () => {
      prisma.document.findUnique.mockResolvedValue(null);
      await expect(service.submitForReview("bad-id", "user-1")).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if non-owner tries to submit", async () => {
      await expect(service.submitForReview("doc-1", "user-999")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should throw BadRequestException if no reviewer assigned", async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        reviewerId: null,
      });
      await expect(service.submitForReview("doc-1", "user-1")).rejects.toThrow(BadRequestException);
    });

    it("should start at REVIEW (notify reviewer) when no verifier assigned", async () => {
      const result = await service.submitForReview("doc-1", "user-1");
      expect(prisma.$transaction).toHaveBeenCalled();
      // Étape de départ = REVIEW, assignée au relecteur (user-2)
      expect(tx.validationStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stepType: "REVIEW",
            assignedToId: "user-2",
          }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-2", type: "DOC_REVIEW_NEEDED" }),
      );
      expect(result.message).toContain("review");
    });

    it("should start at VERIFICATION when a verifier is assigned", async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        verifierId: "user-9",
      });
      await service.submitForReview("doc-1", "user-1");
      expect(tx.validationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStep: "VERIFICATION" }),
        }),
      );
      expect(tx.validationStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stepType: "VERIFICATION",
            assignedToId: "user-9",
          }),
        }),
      );
      // Le vérificateur est notifié, pas le relecteur
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-9", type: "DOC_REVIEW_NEEDED" }),
      );
    });
  });

  describe("approveVerification", () => {
    const docVerif = {
      ...mockDocument,
      status: "IN_REVIEW",
      verifierId: "user-9",
      validationRequests: [
        { id: "req-1", status: "PENDING", currentStep: "VERIFICATION", steps: [] },
      ],
    };

    it("should throw if not at VERIFICATION step", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-9", role: "REVIEWER" });
      prisma.document.findUnique.mockResolvedValue({
        ...docVerif,
        validationRequests: [{ id: "req-1", status: "PENDING", currentStep: "REVIEW", steps: [] }],
      });
      await expect(service.approveVerification("doc-1", "user-9")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw Forbidden if actor is neither verifier nor admin", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-x", role: "COLLABORATEUR" });
      prisma.document.findUnique.mockResolvedValue(docVerif);
      await expect(service.approveVerification("doc-1", "user-x")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should advance to REVIEW and notify the reviewer", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-9", role: "REVIEWER" });
      prisma.document.findUnique.mockResolvedValue(docVerif);
      const result = await service.approveVerification("doc-1", "user-9", "ok");
      expect(tx.validationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStep: "REVIEW" } }),
      );
      expect(tx.validationStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stepType: "REVIEW", assignedToId: "user-2" }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-2", type: "DOC_REVIEW_NEEDED" }),
      );
      expect(result.message).toMatch(/vérification|revue/i);
    });
  });

  describe("approveReview", () => {
    const docInReview = {
      ...mockDocument,
      status: "IN_REVIEW",
      validationRequests: [{ id: "req-1", status: "PENDING", currentStep: "REVIEW", steps: [] }],
    };

    it("should throw if document is not IN_REVIEW", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-2", role: "REVIEWER" });
      prisma.document.findUnique.mockResolvedValue({
        ...docInReview,
        status: "DRAFT",
      });
      await expect(service.approveReview("doc-1", "user-2")).rejects.toThrow(BadRequestException);
    });

    it("should throw if user is not the assigned reviewer (non-admin)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-999", role: "REVIEWER" });
      prisma.document.findUnique.mockResolvedValue(docInReview);
      await expect(service.approveReview("doc-1", "user-999")).rejects.toThrow(ForbiddenException);
    });

    it("should approve review and notify the owner", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-2", role: "REVIEWER" });
      prisma.document.findUnique.mockResolvedValue(docInReview);
      const result = await service.approveReview("doc-1", "user-2", "LGTM");
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", type: "DOC_APPROVED" }),
      );
      expect(result.message).toMatch(/revue|approb/i);
    });
  });

  describe("approveDocument (contrôle approbateur)", () => {
    const docPending = {
      ...mockDocument,
      status: "PENDING_APPROVAL",
      validationRequests: [{ id: "req-1", status: "PENDING", currentStep: "APPROVAL", steps: [] }],
    };

    it("should throw if user role is below DIRECTION", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-low",
        role: "COLLABORATEUR",
      });
      await expect(service.approveDocument("doc-1", "user-low")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should throw Forbidden if DIRECTION user is NOT the assigned approver", async () => {
      // Un DIRECTION non assigné (et non ADMIN) ne peut pas approuver.
      prisma.user.findUnique.mockResolvedValue({ id: "user-other", role: "DIRECTION" });
      prisma.document.findUnique.mockResolvedValue(docPending);
      await expect(service.approveDocument("doc-1", "user-other")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should approve when the assigned approver acts (no derogation)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-3", role: "DIRECTION" });
      prisma.document.findUnique.mockResolvedValue(docPending);
      const result = await service.approveDocument("doc-1", "user-3", "Approved");
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", type: "DOC_APPROVED" }),
      );
      // decidedById = acteur réel
      expect(tx.validationStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ decidedById: "user-3", action: "APPROVED" }),
        }),
      );
      // audit non-dérogation → severity INFO
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DOCUMENT_APPROVED",
          severity: "INFO",
          metadata: expect.objectContaining({ derogation: false }),
        }),
      );
      expect(result.message).toContain("approved");
    });

    it("should allow ADMIN derogation but trace it (audit WARN)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
      prisma.document.findUnique.mockResolvedValue(docPending);
      await service.approveDocument("doc-1", "admin-1", "Override");
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DOCUMENT_APPROVED",
          severity: "WARN",
          metadata: expect.objectContaining({
            derogation: true,
            assignedApproverId: "user-3",
            actualDeciderId: "admin-1",
          }),
        }),
      );
    });
  });

  describe("rejectDocument", () => {
    const docPending = {
      ...mockDocument,
      status: "PENDING_APPROVAL",
      validationRequests: [{ id: "req-1", status: "PENDING", currentStep: "APPROVAL", steps: [] }],
    };

    it("should throw if comment is missing", async () => {
      await expect(service.rejectDocument("doc-1", "user-3", "")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should reject and return document to DRAFT (assigned approver)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-3", role: "DIRECTION" });
      prisma.document.findUnique.mockResolvedValue(docPending);
      const result = await service.rejectDocument(
        "doc-1",
        "user-3",
        "Not compliant with the policy framework",
        ["add-iso-references"],
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", type: "DOC_REJECTED" }),
      );
      expect(result.message).toMatch(/rejet/i);
    });
  });

  describe("markObsolete", () => {
    it("should throw if role is below ADMIN", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-low",
        role: "COLLABORATEUR",
      });
      await expect(service.markObsolete("doc-1", "user-low")).rejects.toThrow(ForbiddenException);
    });

    it("should mark document as OBSOLETE for ADMIN", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
      const result = await service.markObsolete("doc-1", "admin-1");
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: "doc-1" },
        data: { status: "OBSOLETE" },
      });
      expect(result.message).toContain("obsolete");
    });
  });

  describe("getPendingForUser", () => {
    it("should include the owner REVIEW_APPROVED docs (à confirmer)", async () => {
      await service.getPendingForUser("user-1", UserRole.COLLABORATEUR);
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: expect.arrayContaining([{ status: "REVIEW_APPROVED", ownerId: "user-1" }]),
          }),
        }),
      );
    });

    it("should query IN_REVIEW docs by the PENDING step (VERIFICATION/REVIEW) assigned to the user", async () => {
      await service.getPendingForUser("user-2", UserRole.REVIEWER);
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                status: "IN_REVIEW",
                validationRequests: {
                  some: {
                    status: "PENDING",
                    currentStep: { in: ["VERIFICATION", "REVIEW"] },
                    steps: {
                      some: {
                        action: null,
                        assignedToId: "user-2",
                        stepType: { in: ["VERIFICATION", "REVIEW"] },
                      },
                    },
                  },
                },
              },
            ]),
          }),
        }),
      );
    });

    it("should query PENDING_APPROVAL docs only when currentStep=APPROVAL and an APPROVAL step is assigned (steps héritées exclues)", async () => {
      await service.getPendingForUser("user-3", UserRole.DIRECTION);
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                status: "PENDING_APPROVAL",
                validationRequests: {
                  some: {
                    status: "PENDING",
                    currentStep: "APPROVAL",
                    steps: {
                      some: {
                        action: null,
                        assignedToId: "user-3",
                        stepType: "APPROVAL",
                      },
                    },
                  },
                },
              },
            ]),
          }),
        }),
      );
    });
  });
});
