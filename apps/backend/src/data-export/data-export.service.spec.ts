import { Test, TestingModule } from '@nestjs/testing';
import { DataExportService } from './data-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getQueueToken } from '@nestjs/bullmq';

/**
 * Tests DataExportService :
 *  (a) requestExport → cree DataExportRequest PENDING + push job + audit
 *  (b) listForUser → renvoie les exports tries par requestedAt desc
 *  (c) getStatusPayload → cache filePath (champ interne)
 */
describe('DataExportService', () => {
  let service: DataExportService;
  let prisma: any;
  let audit: any;
  let queue: any;

  beforeEach(async () => {
    prisma = {
      dataExportRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'req-new',
          status: 'PENDING',
          requestedAt: new Date('2026-01-15'),
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'req-1', status: 'COMPLETED' },
          { id: 'req-2', status: 'PENDING' },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          userId: 'user-1',
          status: 'COMPLETED',
          filePath: '/internal/secret.json',
        }),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: getQueueToken('data-export'), useValue: queue },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
  });

  describe('requestExport', () => {
    it('creates a PENDING DataExportRequest', async () => {
      await service.requestExport('user-1');
      expect(prisma.dataExportRequest.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', status: 'PENDING' },
        select: expect.any(Object),
      });
    });

    it('pushes a job onto the BullMQ queue with stable jobId', async () => {
      await service.requestExport('user-1');
      expect(queue.add).toHaveBeenCalledWith(
        'export',
        { userId: 'user-1', exportRequestId: 'req-new' },
        expect.objectContaining({
          jobId: 'data-export-req-new',
          attempts: 3,
        }),
      );
    });

    it('audit logs GDPR_DATA_EXPORT_REQUESTED', async () => {
      await service.requestExport('user-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'GDPR_DATA_EXPORT_REQUESTED',
          resourceType: 'DataExportRequest',
        }),
      );
    });
  });

  describe('listForUser', () => {
    it('returns up to 50 exports ordered by requestedAt desc', async () => {
      await service.listForUser('user-1');
      expect(prisma.dataExportRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { requestedAt: 'desc' },
          take: 50,
        }),
      );
    });
  });

  describe('getStatusPayload', () => {
    it('does NOT include filePath (internal disk path)', () => {
      const result = service.getStatusPayload({
        id: 'req-1',
        status: 'COMPLETED',
        requestedAt: new Date(),
        completedAt: new Date(),
        downloadUrl: '/storage/exports/foo.json',
        expiresAt: new Date(),
        errorMessage: null,
      });
      expect(result).not.toHaveProperty('filePath');
      expect(result).toHaveProperty('downloadUrl');
    });
  });
});
