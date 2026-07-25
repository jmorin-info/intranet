import { Test, TestingModule } from '@nestjs/testing';
import { ChartesService } from './chartes.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

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
        findUnique: jest.fn().mockResolvedValue({
          email: 'jdoe@omnitech-security.fr',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'COLLABORATEUR',
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      charteExemption: {
        findMany: jest.fn().mockResolvedValue([]),
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

    it('fige le snapshot identité en création ET en mise à jour (A.5.28)', async () => {
      await service.sign('charte-1', 'user-1', '127.0.0.1', 'Mozilla/5.0');

      const arg = prisma.charteSignature.upsert.mock.calls[0][0];
      const expected = {
        userEmail: 'jdoe@omnitech-security.fr',
        userFirstName: 'Jane',
        userLastName: 'Doe',
        userRole: 'COLLABORATEUR',
      };
      expect(arg.create).toEqual(expect.objectContaining(expected));
      expect(arg.update).toEqual(expect.objectContaining(expected));
    });

    it('refuse d’attester sans identité résolvable', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.sign('charte-1', 'ghost')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.charteSignature.upsert).not.toHaveBeenCalled();
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

  describe('markSignedByDirection (validation de la direction tracée)', () => {
    it('écrit qui / quand / quelle version, et maintient le boolean legacy', async () => {
      const result = await service.markSignedByDirection(
        'charte-1',
        'direction-1',
      );
      expect(result.id).toBe('charte-1');

      const call = prisma.charte.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'charte-1' });
      expect(call.data).toEqual(
        expect.objectContaining({
          // double écriture : le boolean historique reste alimenté pour les
          // lecteurs existants (getUnsignedChartes, UI, exports)
          signedByDirection: true,
          directionValidatedById: 'direction-1',
          directionValidatedVersionId: 'ver-1',
          directionValidatedAt: expect.any(Date),
        }),
      );
    });

    it('trace la validation en audit WARN avec la version concernée', async () => {
      await service.markSignedByDirection('charte-1', 'direction-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHARTE_VALIDATED_BY_DIRECTION',
          severity: 'WARN',
          metadata: expect.objectContaining({
            versionId: 'ver-1',
            versionNumber: '1.0',
          }),
        }),
      );
    });

    it('refuse de valider une charte sans version active (rien à valider)', async () => {
      prisma.charte.findUnique.mockResolvedValue({
        ...mockCharte,
        versions: [],
      });
      await expect(
        service.markSignedByDirection('charte-1', 'direction-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.charte.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for unknown charte', async () => {
      prisma.charte.findUnique.mockResolvedValue(null);
      await expect(
        service.markSignedByDirection('bad-id', 'direction-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadVersion (une nouvelle version invalide la validation)', () => {
    const pdf = {
      mimetype: 'application/pdf',
      size: 1234,
      originalname: 'charte.pdf',
      buffer: Buffer.from('%PDF-1.4'),
    } as any;

    it('réinitialise le boolean legacy ET les trois champs tracés', async () => {
      await service.uploadVersion('charte-1', pdf, '2.0', 'MAJ', 'admin-1');

      const resetCall = prisma.charte.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.signedByDirection === false,
      );
      expect(resetCall).toBeDefined();
      expect(resetCall[0].data).toEqual(
        expect.objectContaining({
          signedByDirection: false,
          directionValidatedById: null,
          directionValidatedAt: null,
          directionValidatedVersionId: null,
        }),
      );
    });

    it('notifie la direction que la charte est à RE-valider si elle l’était', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'dir-1' },
        { id: 'dir-2' },
      ]);

      await service.uploadVersion('charte-1', pdf, '2.0', 'MAJ', 'admin-1');

      expect(prisma.notification.createMany).toHaveBeenCalled();
      const data = prisma.notification.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(2);
      expect(data[0].title).toContain('re-valider');
      expect(data[0].resourceType).toBe('Charte');
      expect(data[0].resourceId).toBe('charte-1');
    });

    it('parle de « valider » (et non « re-valider ») si elle ne l’était pas', async () => {
      prisma.charte.findUnique.mockResolvedValue({
        ...mockCharte,
        signedByDirection: false,
      });
      prisma.user.findMany.mockResolvedValue([{ id: 'dir-1' }]);

      await service.uploadVersion('charte-1', pdf, '2.0', undefined, 'admin-1');

      const data = prisma.notification.createMany.mock.calls[0][0].data;
      expect(data[0].title).toContain('à valider');
      expect(data[0].title).not.toContain('re-valider');
    });

    it('n’émet aucune notification s’il n’y a personne à la direction', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.uploadVersion('charte-1', pdf, '2.0', undefined, 'admin-1');
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new charte with defaults', async () => {
      // Le slug demandé doit être libre : findUnique(slug) ne doit rien trouver.
      prisma.charte.findUnique.mockResolvedValue(null);
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
