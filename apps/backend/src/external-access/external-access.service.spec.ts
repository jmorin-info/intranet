import { Test, TestingModule } from '@nestjs/testing';
import { ExternalAccessService } from './external-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ExternalAccessService', () => {
  let service: ExternalAccessService;
  let prisma: any;
  let audit: any;

  const mockUser = {
    id: 'user-1',
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean@prestataire.fr',
    role: 'PRESTATAIRE',
    isActive: true,
    deletedAt: null,
  };

  const mockAccess = {
    id: 'access-1',
    userId: 'user-1',
    companyName: 'ExternCo',
    contractRef: 'CTR-001',
    accessGrantedAt: new Date(),
    accessExpiresAt: null,
    sessionTimeout: 3600,
    isActive: true,
    lastReviewedAt: null,
    lastReviewedBy: null,
    createdAt: new Date(),
    user: { id: 'user-1', firstName: 'Jean', lastName: 'Dupont', email: 'jean@prestataire.fr' },
  };

  beforeEach(async () => {
    audit = { log: jest.fn() };

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        findMany: jest.fn().mockResolvedValue([]),
      },
      externalAccess: {
        create: jest.fn().mockResolvedValue(mockAccess),
        findUnique: jest.fn().mockResolvedValue(mockAccess),
        findFirst: jest.fn().mockResolvedValue(mockAccess),
        findMany: jest.fn().mockResolvedValue([mockAccess]),
        update: jest.fn().mockResolvedValue({ ...mockAccess, isActive: false }),
        count: jest.fn().mockResolvedValue(1),
      },
      ticket: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
      ],
    }).compile();

    service = module.get<ExternalAccessService>(ExternalAccessService);
  });

  describe('grantAccess', () => {
    it('should grant access to a PRESTATAIRE user', async () => {
      const result = await service.grantAccess(
        {
          userId: 'user-1',
          companyName: 'ExternCo',
          contractRef: 'CTR-001',
        },
        'admin-1',
      );
      expect(result).toEqual(mockAccess);
      expect(prisma.externalAccess.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            companyName: 'ExternCo',
            contractRef: 'CTR-001',
            isActive: true,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EXTERNAL_ACCESS_GRANTED',
        }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.grantAccess(
          { userId: 'bad-id', companyName: 'Co', contractRef: 'CTR' },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not PRESTATAIRE', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, role: 'COLLABORATEUR' });
      await expect(
        service.grantAccess(
          { userId: 'user-1', companyName: 'Co', contractRef: 'CTR' },
          'admin-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use default sessionTimeout of 3600 when not provided', async () => {
      await service.grantAccess(
        { userId: 'user-1', companyName: 'Co', contractRef: 'CTR' },
        'admin-1',
      );
      expect(prisma.externalAccess.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionTimeout: 3600,
          }),
        }),
      );
    });
  });

  describe('revokeAccess', () => {
    it('should revoke access and log audit', async () => {
      const result = await service.revokeAccess('access-1', 'admin-1');
      expect(prisma.externalAccess.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'access-1' },
          data: { isActive: false },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EXTERNAL_ACCESS_REVOKED',
          severity: 'WARN',
        }),
      );
    });

    it('should throw NotFoundException for non-existent access', async () => {
      prisma.externalAccess.findUnique.mockResolvedValue(null);
      await expect(service.revokeAccess('bad-id', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listExternalAccess', () => {
    it('should return paginated results', async () => {
      const result = await service.listExternalAccess({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should filter by isActive', async () => {
      await service.listExternalAccess({ isActive: true });
      expect(prisma.externalAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should filter by companyName', async () => {
      await service.listExternalAccess({ companyName: 'ExternCo' });
      expect(prisma.externalAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyName: { contains: 'ExternCo', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      await service.listExternalAccess();
      expect(prisma.externalAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('getPrestataireDashboard', () => {
    it('should return dashboard with access, tickets, and documents', async () => {
      const result = await service.getPrestataireDashboard('user-1');
      expect(result).toHaveProperty('access');
      expect(result).toHaveProperty('tickets');
      expect(result).toHaveProperty('documents');
      expect(result.access.companyName).toBe('ExternCo');
    });

    it('should throw NotFoundException when user has no active access', async () => {
      prisma.externalAccess.findFirst.mockResolvedValue(null);
      await expect(
        service.getPrestataireDashboard('user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fetch only CONTRACT category documents', async () => {
      await service.getPrestataireDashboard('user-1');
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'CONTRACT',
          }),
        }),
      );
    });
  });

  describe('getAccessDueForReview', () => {
    it('should return accesses not reviewed in 30 days', async () => {
      const result = await service.getAccessDueForReview();
      expect(prisma.externalAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: expect.arrayContaining([
              { lastReviewedAt: null },
              { lastReviewedAt: { lt: expect.any(Date) } },
            ]),
          }),
        }),
      );
      expect(result).toEqual([mockAccess]);
    });
  });

  describe('reviewAccess', () => {
    it('should update lastReviewedAt and log audit', async () => {
      await service.reviewAccess('access-1', 'admin-1');
      expect(prisma.externalAccess.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'access-1' },
          data: expect.objectContaining({
            lastReviewedAt: expect.any(Date),
            lastReviewedBy: 'admin-1',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EXTERNAL_ACCESS_REVIEWED',
        }),
      );
    });

    it('should throw NotFoundException for non-existent access', async () => {
      prisma.externalAccess.findUnique.mockResolvedValue(null);
      await expect(service.reviewAccess('bad-id', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getExpiredAccess', () => {
    it('should query for active accesses past expiration', async () => {
      await service.getExpiredAccess();
      expect(prisma.externalAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            accessExpiresAt: { lt: expect.any(Date) },
          }),
        }),
      );
    });
  });

  describe('getByUserId', () => {
    it('should return active access for user', async () => {
      const result = await service.getByUserId('user-1');
      expect(result).toEqual(mockAccess);
    });

    it('should throw NotFoundException when no active access exists', async () => {
      prisma.externalAccess.findFirst.mockResolvedValue(null);
      await expect(service.getByUserId('user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
