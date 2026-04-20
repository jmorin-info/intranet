import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { ScannerService } from '../scanner/scanner.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../common/cache/cache.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: any;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
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

    it('should call prisma count and groupBy', async () => {
      await service.getStatistics();
      expect(prisma.document.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
      expect(prisma.document.groupBy).toHaveBeenCalled();
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
