import { Test, TestingModule } from '@nestjs/testing';
import { CertificatesService } from './certificates.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CertificatesService', () => {
  let service: CertificatesService;
  let prisma: any;
  let audit: any;

  const now = new Date();
  const inFuture = new Date(Date.now() + 90 * 24 * 3600000);
  const inPast = new Date(Date.now() - 30 * 24 * 3600000);

  const mockCert = {
    id: 'cert-1',
    name: 'ISO 27001 Lead Auditor',
    certType: 'ISO_27001',
    obtainedAt: new Date('2025-01-15'),
    expiresAt: inFuture,
    fileUrl: null,
    fileName: null,
    fileSizeBytes: null,
    notes: null,
    userId: 'user-1',
    externalPersonId: null,
    createdById: 'admin-1',
    createdAt: now,
    updatedAt: now,
  };

  const expiredCert = {
    ...mockCert,
    id: 'cert-2',
    name: 'Expired Cert',
    expiresAt: inPast,
  };

  beforeEach(async () => {
    prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([mockCert]),
        findUnique: jest.fn().mockResolvedValue(mockCert),
        create: jest.fn().mockResolvedValue(mockCert),
        update: jest.fn().mockResolvedValue(mockCert),
        delete: jest.fn().mockResolvedValue(mockCert),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<CertificatesService>(CertificatesService);
  });

  describe('create', () => {
    it('should create a certificate with valid data', async () => {
      const dto = {
        name: 'ISO 27001 Lead Auditor',
        certType: 'ISO_27001',
        obtainedAt: '2025-01-15',
        expiresAt: '2028-01-15',
        userId: 'user-1',
      };

      const result = await service.create(dto as any, 'admin-1');
      expect(result).toBeDefined();
      expect(result.id).toBe('cert-1');
      expect(prisma.certificate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'ISO 27001 Lead Auditor',
          certType: 'ISO_27001',
          userId: 'user-1',
          createdById: 'admin-1',
        }),
      });
    });

    it('should create audit log entry on creation', async () => {
      const dto = {
        name: 'Test Cert',
        certType: 'OTHER',
        obtainedAt: '2025-01-01',
        userId: 'user-1',
      };

      await service.create(dto as any, 'admin-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'CERTIFICATE_CREATED',
          resourceType: 'Certificate',
          resourceId: 'cert-1',
        }),
      );
    });

    it('should throw BadRequestException when neither userId nor externalPersonId is provided', async () => {
      const dto = {
        name: 'Test Cert',
        certType: 'OTHER',
        obtainedAt: '2025-01-01',
      };

      await expect(service.create(dto as any, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when both userId and externalPersonId are provided', async () => {
      const dto = {
        name: 'Test Cert',
        certType: 'OTHER',
        obtainedAt: '2025-01-01',
        userId: 'user-1',
        externalPersonId: 'ext-1',
      };

      await expect(service.create(dto as any, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle null expiresAt (no expiry)', async () => {
      const certNoExpiry = { ...mockCert, expiresAt: null };
      prisma.certificate.create.mockResolvedValue(certNoExpiry);

      const dto = {
        name: 'Perpetual Cert',
        certType: 'OTHER',
        obtainedAt: '2025-01-01',
        userId: 'user-1',
      };

      const result = await service.create(dto as any, 'admin-1');
      expect(result.status).toBe('valid');
    });
  });

  describe('getStats', () => {
    it('should return aggregated statistics', async () => {
      prisma.certificate.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2)  // expired
        .mockResolvedValueOnce(3); // expiring in 30 days
      prisma.certificate.groupBy.mockResolvedValue([
        { certType: 'ISO_27001', _count: { _all: 5 } },
        { certType: 'CEH', _count: { _all: 3 } },
      ]);

      const result = await service.getStats();
      expect(result.total).toBe(10);
      expect(result.expired).toBe(2);
      expect(result.valid).toBe(8); // total - expired
      expect(result.expiringIn30Days).toBe(3);
      expect(result.byType).toEqual(
        expect.arrayContaining([
          { certType: 'ISO_27001', count: 5 },
          { certType: 'CEH', count: 3 },
        ]),
      );
    });
  });

  describe('expiry detection', () => {
    it('should mark certificate as expired when expiresAt is in the past', async () => {
      prisma.certificate.findMany.mockResolvedValue([expiredCert]);
      const certs = await service.findMy('user-1');
      expect(certs[0].status).toBe('expired');
    });

    it('should mark certificate as valid when expiresAt is in the future', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCert]);
      const certs = await service.findMy('user-1');
      expect(certs[0].status).toBe('valid');
    });

    it('should mark certificate as valid when expiresAt is null', async () => {
      prisma.certificate.findMany.mockResolvedValue([
        { ...mockCert, expiresAt: null },
      ]);
      const certs = await service.findMy('user-1');
      expect(certs[0].status).toBe('valid');
    });

    it('should return expiring certificates via findExpiring', async () => {
      const soonExpiring = {
        ...mockCert,
        expiresAt: new Date(Date.now() + 15 * 24 * 3600000),
      };
      prisma.certificate.findMany.mockResolvedValue([soonExpiring]);

      const result = await service.findExpiring();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('valid');
      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expiresAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return certificate with status', async () => {
      const result = await service.findOne('cert-1');
      expect(result.id).toBe('cert-1');
      expect(result).toHaveProperty('status');
    });

    it('should throw NotFoundException for missing certificate', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCert]);
      prisma.certificate.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should filter by certType', async () => {
      await service.findAll({ certType: 'ISO_27001' });
      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ certType: 'ISO_27001' }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should delete certificate and log audit', async () => {
      await service.remove('cert-1', 'admin-1');
      expect(prisma.certificate.delete).toHaveBeenCalledWith({
        where: { id: 'cert-1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATE_DELETED',
          resourceId: 'cert-1',
        }),
      );
    });
  });
});
