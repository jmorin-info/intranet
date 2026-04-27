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
});
