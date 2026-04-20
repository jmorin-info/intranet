import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { IsoAnalyzerService } from '../../iso-analyzer/iso-analyzer.service';
import { DocumentsService } from '../documents.service';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../common/enums';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: any;
  let notificationsService: any;

  const mockDocument = {
    id: 'doc-1',
    title: 'Test Document',
    reference: 'DOC-001',
    status: 'DRAFT',
    ownerId: 'user-1',
    reviewerId: 'user-2',
    approverId: 'user-3',
    currentVersionId: 'ver-1',
    deletedAt: null,
    reviewer: { id: 'user-2', firstName: 'Reviewer', lastName: 'One' },
  };

  beforeEach(async () => {
    const tx = {
      document: {
        update: jest.fn().mockResolvedValue(mockDocument),
        findUnique: jest.fn().mockResolvedValue(mockDocument),
      },
      validationRequest: {
        create: jest.fn().mockResolvedValue({ id: 'req-1' }),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'req-1', status: 'PENDING' }),
      },
      validationStep: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    notificationsService = {
      create: jest.fn().mockResolvedValue({}),
    };

    prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(mockDocument),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(mockDocument),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-3',
          role: 'DIRECTION',
        }),
      },
      validationRequest: {
        create: jest.fn().mockResolvedValue({ id: 'req-1' }),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'req-1', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({}),
      },
      validationStep: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: IsoAnalyzerService, useValue: { autoAssignControls: jest.fn().mockResolvedValue({ assigned: 0, controls: [] }) } },
        { provide: DocumentsService, useValue: { notifyNewDocumentAvailable: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  describe('submitForReview', () => {
    it('should throw NotFoundException if document not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null);
      await expect(
        service.submitForReview('bad-id', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if document is soft-deleted', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        deletedAt: new Date(),
      });
      await expect(
        service.submitForReview('doc-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-owner tries to submit', async () => {
      await expect(
        service.submitForReview('doc-1', 'user-999'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if document is not DRAFT', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        status: 'APPROVED',
      });
      await expect(
        service.submitForReview('doc-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no reviewer assigned', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        reviewerId: null,
      });
      await expect(
        service.submitForReview('doc-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no version uploaded (non-native)', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        currentVersionId: null,
        isNative: false,
      });
      await expect(
        service.submitForReview('doc-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if native doc has no content', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...mockDocument,
        currentVersionId: null,
        isNative: true,
        content: '',
      });
      await expect(
        service.submitForReview('doc-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should submit valid DRAFT document for review', async () => {
      const result = await service.submitForReview('doc-1', 'user-1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          type: 'DOC_REVIEW_NEEDED',
        }),
      );
      expect(result.message).toContain('review');
    });
  });

  describe('approveReview', () => {
    const docInReview = {
      ...mockDocument,
      status: 'IN_REVIEW',
      validationRequests: [{ id: 'req-1', status: 'PENDING' }],
    };

    it('should throw if document is not IN_REVIEW', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docInReview,
        status: 'DRAFT',
        validationRequests: [],
      });
      await expect(
        service.approveReview('doc-1', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if user is not the assigned reviewer', async () => {
      prisma.document.findUnique.mockResolvedValue(docInReview);
      await expect(
        service.approveReview('doc-1', 'user-999'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if no approver is assigned', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docInReview,
        approverId: null,
      });
      await expect(
        service.approveReview('doc-1', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should approve review and notify the owner (awaiting their confirmation)', async () => {
      prisma.document.findUnique.mockResolvedValue(docInReview);
      const result = await service.approveReview('doc-1', 'user-2', 'LGTM');
      expect(prisma.$transaction).toHaveBeenCalled();
      // Le workflow refondu : reviewer valide → notifier l'OWNER, pas l'approver
      // (l'owner doit confirmer avant que l'approbation finale soit demandée)
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1', // owner
          type: 'DOC_APPROVED',
        }),
      );
      expect(result.message).toMatch(/revue|approb/i);
    });
  });

  describe('rejectReview', () => {
    const docInReview = {
      ...mockDocument,
      status: 'IN_REVIEW',
      validationRequests: [{ id: 'req-1', status: 'PENDING' }],
    };

    it('should throw if comment is missing', async () => {
      await expect(
        service.rejectReview('doc-1', 'user-2', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if user is not reviewer', async () => {
      prisma.document.findUnique.mockResolvedValue(docInReview);
      await expect(
        service.rejectReview('doc-1', 'user-999', 'Not good enough yet'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject and return document to DRAFT', async () => {
      prisma.document.findUnique.mockResolvedValue(docInReview);
      const result = await service.rejectReview(
        'doc-1',
        'user-2',
        'Needs significant changes on access control section',
        ['clarify-scope', 'add-iso-references'],
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'DOC_REJECTED',
        }),
      );
      expect(result.message).toMatch(/rejet/i);
    });
  });

  describe('approveDocument', () => {
    const docPending = {
      ...mockDocument,
      status: 'PENDING_APPROVAL',
      validationRequests: [{ id: 'req-1', status: 'PENDING' }],
    };

    it('should throw if user role is below DIRECTION', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-low',
        role: 'COLLABORATEUR',
      });
      await expect(
        service.approveDocument('doc-1', 'user-low'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if document is not PENDING_APPROVAL', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docPending,
        status: 'DRAFT',
      });
      await expect(
        service.approveDocument('doc-1', 'user-3'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should approve document and notify owner', async () => {
      prisma.document.findUnique.mockResolvedValue(docPending);
      const result = await service.approveDocument('doc-1', 'user-3', 'Approved');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'DOC_APPROVED',
        }),
      );
      expect(result.message).toContain('approved');
    });
  });

  describe('rejectDocument', () => {
    const docPending = {
      ...mockDocument,
      status: 'PENDING_APPROVAL',
      validationRequests: [{ id: 'req-1', status: 'PENDING' }],
    };

    it('should throw if comment is missing', async () => {
      await expect(
        service.rejectDocument('doc-1', 'user-3', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if role is below DIRECTION', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-low',
        role: 'COLLABORATEUR',
      });
      await expect(
        service.rejectDocument('doc-1', 'user-low', 'Bad document overall'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject and return document to DRAFT', async () => {
      prisma.document.findUnique.mockResolvedValue(docPending);
      const result = await service.rejectDocument(
        'doc-1',
        'user-3',
        'Not compliant with the policy framework',
        ['add-iso-references'],
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'DOC_REJECTED',
        }),
      );
      expect(result.message).toMatch(/rejet/i);
    });
  });

  describe('markObsolete', () => {
    it('should throw if role is below ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-low',
        role: 'COLLABORATEUR',
      });
      await expect(
        service.markObsolete('doc-1', 'user-low'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should mark document as OBSOLETE for ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: 'ADMIN',
      });
      const result = await service.markObsolete('doc-1', 'admin-1');
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: 'OBSOLETE' },
      });
      expect(result.message).toContain('obsolete');
    });
  });

  describe('getPendingForUser', () => {
    it('should include REVIEW_APPROVED docs as owner for COLLABORATEUR role', async () => {
      await service.getPendingForUser('user-1', UserRole.COLLABORATEUR);
      // Le nouveau workflow : tout user voit ses propres docs en REVIEW_APPROVED
      // (il doit lancer l'étape d'approbation finale)
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: expect.arrayContaining([
              { status: 'REVIEW_APPROVED', ownerId: 'user-1' },
            ]),
          }),
        }),
      );
    });

    it('should query IN_REVIEW docs for REVIEWER role', async () => {
      await service.getPendingForUser('user-2', UserRole.REVIEWER);
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: expect.arrayContaining([
              { status: 'IN_REVIEW', reviewerId: 'user-2' },
            ]),
          }),
        }),
      );
    });
  });
});
