import { Test, TestingModule } from '@nestjs/testing';
import { ChartesService } from './chartes.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ChartesService', () => {
  let service: ChartesService;
  let prisma: any;
  let auditService: any;

  const mockCharte = {
    id: 'charte-1',
    title: 'PSSI',
    slug: 'pssi',
    isMandatory: true,
    isActive: true,
    signedByDirection: true,
    classification: 'INTERNE',
    versions: [
      {
        id: 'ver-1',
        versionNumber: '1.0',
        isActive: true,
        fileUrl: '/test.pdf',
        fileSizeBytes: 1000,
        checksum: 'abc',
        createdAt: new Date(),
      },
    ],
    _count: { signatures: 5 },
  };

  beforeEach(async () => {
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    prisma = {
      charte: {
        findMany: jest.fn().mockResolvedValue([mockCharte]),
        findUnique: jest.fn().mockResolvedValue(mockCharte),
        create: jest.fn().mockResolvedValue(mockCharte),
        update: jest.fn().mockResolvedValue(mockCharte),
      },
      charteVersion: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({
          id: 'ver-2',
          versionNumber: '2.0',
          isActive: true,
        }),
      },
      charteSignature: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'sig-1' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        {
          provide: StorageService,
          useValue: {
            upload: jest.fn().mockResolvedValue({ fileUrl: '/test.pdf' }),
            generateChecksum: jest.fn().mockResolvedValue('hash123'),
          },
        },
      ],
    }).compile();

    service = module.get<ChartesService>(ChartesService);
  });

  describe('findAll', () => {
    it('should return all active chartes with their active versions', async () => {
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(prisma.charte.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });

    it('should return all chartes when activeOnly is false', async () => {
      await service.findAll(false);
      expect(prisma.charte.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  describe('findBySlug', () => {
    it('should return charte by slug', async () => {
      const result = await service.findBySlug('pssi');
      expect(result.id).toBe('charte-1');
      expect(prisma.charte.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'pssi' },
        }),
      );
    });

    it('should throw NotFoundException for unknown slug', async () => {
      prisma.charte.findUnique.mockResolvedValue(null);
      await expect(service.findBySlug('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUnsignedChartes', () => {
    it('should return chartes without signatures for user', async () => {
      const result = await service.getUnsignedChartes('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].activeVersion.versionNumber).toBe('1.0');
    });

    it('should return empty when all mandatory chartes are signed', async () => {
      prisma.charteSignature.findMany.mockResolvedValue([
        { charteId: 'charte-1', charteVersionId: 'ver-1' },
      ]);
      const result = await service.getUnsignedChartes('user-1');
      expect(result).toHaveLength(0);
    });

    it('should return empty when no mandatory chartes exist', async () => {
      prisma.charte.findMany.mockResolvedValue([]);
      const result = await service.getUnsignedChartes('user-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('sign', () => {
    it('should throw ForbiddenException if charte not signed by Direction', async () => {
      prisma.charte.findUnique.mockResolvedValue({
        ...mockCharte,
        signedByDirection: false,
      });
      await expect(service.sign('charte-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if charte not found', async () => {
      prisma.charte.findUnique.mockResolvedValue(null);
      await expect(service.sign('bad-id', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if no active version exists', async () => {
      prisma.charte.findUnique.mockResolvedValue({
        ...mockCharte,
        versions: [],
      });
      await expect(service.sign('charte-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create signature for valid charte and log audit', async () => {
      const result = await service.sign(
        'charte-1',
        'user-1',
        '127.0.0.1',
        'Mozilla/5.0',
      );
      expect(result.id).toBe('sig-1');
      expect(prisma.charteSignature.upsert).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHARTE_SIGNED',
          resourceId: 'charte-1',
        }),
      );
    });
  });

  describe('hasSignedAllChartes', () => {
    it('should return true when no unsigned mandatory chartes', async () => {
      prisma.charteSignature.findMany.mockResolvedValue([
        { charteId: 'charte-1', charteVersionId: 'ver-1' },
      ]);
      const result = await service.hasSignedAllChartes('user-1');
      expect(result).toBe(true);
    });

    it('should return false when unsigned chartes remain', async () => {
      prisma.charteSignature.findMany.mockResolvedValue([]);
      const result = await service.hasSignedAllChartes('user-1');
      expect(result).toBe(false);
    });
  });

  describe('markSignedByDirection', () => {
    it('should mark charte as signed by Direction and log audit', async () => {
      const result = await service.markSignedByDirection(
        'charte-1',
        'admin-1',
      );
      expect(result.id).toBe('charte-1');
      expect(prisma.charte.update).toHaveBeenCalledWith({
        where: { id: 'charte-1' },
        data: { signedByDirection: true },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHARTE_SIGNED_BY_DIRECTION',
        }),
      );
    });

    it('should throw NotFoundException for unknown charte', async () => {
      prisma.charte.findUnique.mockResolvedValue(null);
      await expect(
        service.markSignedByDirection('bad-id', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new charte with defaults', async () => {
      await service.create({ title: 'New Charte', slug: 'new-charte' });
      expect(prisma.charte.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'New Charte',
          slug: 'new-charte',
          isMandatory: true,
          classification: 'INTERNE',
        }),
      });
    });
  });
});
