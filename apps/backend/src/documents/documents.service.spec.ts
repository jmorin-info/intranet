import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { ScannerService } from '../scanner/scanner.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../common/cache/cache.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: any;
  let repo: any;

  beforeEach(async () => {
    prisma = {
      document: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([{ category: 'POLICY', _count: 5 }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'doc-1', title: 'Test' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      documentVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    repo = {
      findById: jest.fn().mockResolvedValue({ id: 'doc-1', title: 'Test' }),
      findByIdRaw: jest.fn().mockResolvedValue(null),
      findManyWithCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(10),
      groupByCategory: jest
        .fn()
        .mockResolvedValue([{ category: 'POLICY', _count: 5 }]),
      groupByStatus: jest.fn().mockResolvedValue([]),
      findManyForBulk: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: DocumentsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: { upload: jest.fn(), generateChecksum: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: ScannerService, useValue: { scanFile: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({}) } },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            wrap: jest.fn().mockImplementation(async (_k: string, _t: number, fn: () => any) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('getStatistics', () => {
    it('should return document statistics', async () => {
      const result = await service.getStatistics();
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byCategory');
      expect(result).toHaveProperty('byStatus');
      expect(result).toHaveProperty('byClassification');
    });

    it('should call repository count + groupByCategory + groupByStatus', async () => {
      await service.getStatistics();
      // After repository pattern migration, calls go via repo, not prisma directly.
      expect(repo.count).toHaveBeenCalledWith({ deletedAt: null });
      expect(repo.groupByCategory).toHaveBeenCalled();
      expect(repo.groupByStatus).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('should return timeline with versions and audit logs', async () => {
      const result = await service.getHistory('doc-1');
      expect(result).toHaveProperty('timeline');
      expect(result).toHaveProperty('versions');
      expect(result).toHaveProperty('auditLogs');
      expect(Array.isArray(result.timeline)).toBe(true);
    });

    it('should query versions and audit logs for the document', async () => {
      await service.getHistory('doc-1');
      expect(prisma.documentVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { documentId: 'doc-1' } }),
      );
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceType: 'Document', resourceId: 'doc-1' },
        }),
      );
    });
  });

  describe('findById — accès par assignation workflow', () => {
    beforeEach(() => {
      // hasExplicitPermission => aucune permission explicite.
      prisma.userDepartment = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.documentPermission = { findFirst: jest.fn().mockResolvedValue(null) };
      prisma.user.findUnique = jest.fn().mockResolvedValue({ departmentId: null });
    });

    it('laisse le relecteur assigné lire un document SECRET (pas de 403)', async () => {
      repo.findById.mockResolvedValue({
        id: 'doc-1',
        ownerId: 'owner-x',
        classification: 'SECRET',
        status: 'IN_REVIEW',
        verifierId: null,
        reviewerId: 'me',
        approverId: null,
        deletedAt: null,
        isoControls: [],
      });
      const result = await service.findById('doc-1', {
        id: 'me',
        role: 'REVIEWER',
      } as any);
      expect(result).toMatchObject({ id: 'doc-1' });
    });

    it('refuse toujours un REVIEWER NON assigné sur un document SECRET', async () => {
      repo.findById.mockResolvedValue({
        id: 'doc-1',
        ownerId: 'owner-x',
        classification: 'SECRET',
        status: 'IN_REVIEW',
        verifierId: null,
        reviewerId: 'someone-else',
        approverId: null,
        deletedAt: null,
        isoControls: [],
      });
      await expect(
        service.findById('doc-1', { id: 'me', role: 'REVIEWER' } as any),
      ).rejects.toThrow('Niveau de classification insuffisant');
    });
  });

  describe('update — gardes workflow', () => {
    it('refuse la désassignation du relecteur tant que la step REVIEW est en cours', async () => {
      prisma.document.findUnique = jest.fn().mockResolvedValue({
        id: 'doc-1',
        ownerId: 'me',
        status: 'IN_REVIEW',
        classification: 'INTERNE',
        verifierId: null,
        reviewerId: 'alice',
        approverId: null,
        deletedAt: null,
        validationRequests: [
          {
            id: 'req-1',
            currentStep: 'REVIEW',
            steps: [{ id: 's1', stepType: 'REVIEW', assignedToId: 'alice', action: null }],
          },
        ],
      });
      prisma.document.update = jest.fn();
      await expect(
        service.update('doc-1', { reviewerId: null } as any, {
          id: 'me',
          role: 'ADMIN',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Aucune écriture : on a refusé avant de persister le null.
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('refuse DRAFT->IN_REVIEW via PATCH (doit passer par submit-review)', async () => {
      prisma.document.findUnique = jest.fn().mockResolvedValue({
        id: 'doc-1',
        ownerId: 'me',
        status: 'DRAFT',
        classification: 'INTERNE',
        verifierId: null,
        reviewerId: null,
        approverId: null,
        deletedAt: null,
        validationRequests: [],
      });
      prisma.document.update = jest.fn();
      await expect(
        service.update('doc-1', { status: 'IN_REVIEW' } as any, {
          id: 'me',
          role: 'ADMIN',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
  });
});
