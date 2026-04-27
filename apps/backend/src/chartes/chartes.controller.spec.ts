import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChartesController } from './chartes.controller';
import { ChartesService } from './chartes.service';
import { StorageService } from '../storage/storage.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { Request, Response } from 'express';

/**
 * Tests chartes controller :
 *  (a) findAll/status/unsigned (utilisateurs auth) → délégation
 *  (b) RBAC : createFromDocument/uploadVersion/remove requièrent ADMIN+
 *  (c) sign happy path → délégation avec ip/user-agent
 *  (d) streamPdf input invalide → 404 si pas de version active
 */
describe('ChartesController', () => {
  let controller: ChartesController;
  let chartesService: any;
  let storageService: any;
  let reflector: Reflector;

  const adminUser = {
    id: 'admin-1',
    email: 'admin@omnitech.fr',
    role: UserRole.ADMIN,
  };
  const collabUser = {
    id: 'user-1',
    email: 'jdoe@omnitech.fr',
    role: UserRole.COLLABORATEUR,
  };

  const buildRequest = (): Request => {
    return {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    } as unknown as Request;
  };

  const buildResponse = () => {
    const res: Partial<Response> = {
      set: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeEach(async () => {
    chartesService = {
      findAll: jest.fn().mockResolvedValue([]),
      getUnsignedChartes: jest.fn().mockResolvedValue([]),
      hasSignedAllChartes: jest.fn().mockResolvedValue(true),
      createFromDocument: jest.fn().mockResolvedValue({ id: 'charte-1' }),
      create: jest.fn().mockResolvedValue({ id: 'charte-1' }),
      uploadVersion: jest.fn().mockResolvedValue({ versionId: 'v-1' }),
      markSignedByDirection: jest.fn().mockResolvedValue({ signed: true }),
      sign: jest.fn().mockResolvedValue({ signedAt: new Date() }),
      getSignatures: jest.fn().mockResolvedValue([]),
      getComplianceReport: jest
        .fn()
        .mockResolvedValue({ totalUsers: 100, signed: 75 }),
      getCharteById: jest.fn().mockResolvedValue({
        slug: 'charte-rgpd',
        versions: [
          { isActive: true, fileUrl: 'storage/chartes/v1.pdf', versionNumber: '1' },
        ],
      }),
      remove: jest.fn().mockResolvedValue(undefined),
      findBySlug: jest.fn().mockResolvedValue(null),
    };
    storageService = {
      getFileStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChartesController],
      providers: [
        { provide: ChartesService, useValue: chartesService },
        { provide: StorageService, useValue: storageService },
        Reflector,
      ],
    }).compile();

    controller = module.get<ChartesController>(ChartesController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('findAll/status (happy path)', () => {
    it('passes user.id to service for signedAt enrichment', async () => {
      await controller.findAll(collabUser as any);
      expect(chartesService.findAll).toHaveBeenCalledWith(true, 'user-1');
    });

    it('status returns allSigned bool', async () => {
      const result = await controller.getStatus(collabUser as any);
      expect(result).toEqual({ allSigned: true });
    });

    it('unsigned returns user-specific list', async () => {
      await controller.getUnsigned(collabUser as any);
      expect(chartesService.getUnsignedChartes).toHaveBeenCalledWith('user-1');
    });
  });

  describe('RBAC metadata (autorisation refusée)', () => {
    it('create requires SUPER_ADMIN/ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.create);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
      );
      expect(roles).not.toContain(UserRole.COLLABORATEUR);
    });

    it('createFromDocument requires SUPER_ADMIN/ADMIN', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.createFromDocument,
      );
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
      );
    });

    it('uploadVersion requires SUPER_ADMIN/ADMIN/DIRECTION', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.uploadVersion,
      );
      expect(roles).toEqual(
        expect.arrayContaining([
          UserRole.SUPER_ADMIN,
          UserRole.ADMIN,
          UserRole.DIRECTION,
        ]),
      );
    });

    it('remove requires SUPER_ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.remove);
      expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });

    it('markSignedByDirection requires DIRECTION/SUPER_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.markSignedByDirection,
      );
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.DIRECTION, UserRole.SUPER_ADMIN]),
      );
    });
  });

  describe('sign (happy path)', () => {
    it('forwards id+userId+ip+userAgent to service', async () => {
      const req = buildRequest();
      await controller.sign(
        '11111111-1111-1111-1111-111111111111',
        collabUser as any,
        req,
      );
      expect(chartesService.sign).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'user-1',
        '127.0.0.1',
        'jest',
      );
    });
  });

  describe('streamPdf (input invalide / 404)', () => {
    it('throws NotFoundException when charte does not exist', async () => {
      chartesService.getCharteById.mockResolvedValueOnce(null);
      await expect(
        controller.streamPdf(
          '11111111-1111-1111-1111-111111111111',
          buildResponse(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no active version', async () => {
      chartesService.getCharteById.mockResolvedValueOnce({
        slug: 'charte-test',
        versions: [{ isActive: false, fileUrl: 'old.pdf' }],
      });
      await expect(
        controller.streamPdf(
          '11111111-1111-1111-1111-111111111111',
          buildResponse(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createFromDocument (input pass-through)', () => {
    it('passes documentId+slug+isMandatory+user.id', async () => {
      await controller.createFromDocument(
        { documentId: 'doc-1', slug: 'rgpd', isMandatory: true },
        adminUser as any,
      );
      expect(chartesService.createFromDocument).toHaveBeenCalledWith(
        'doc-1',
        'rgpd',
        true,
        'admin-1',
      );
    });

    it('defaults isMandatory to true when omitted', async () => {
      await controller.createFromDocument(
        { documentId: 'doc-1', slug: 'rgpd' },
        adminUser as any,
      );
      expect(chartesService.createFromDocument).toHaveBeenCalledWith(
        'doc-1',
        'rgpd',
        true,
        'admin-1',
      );
    });
  });
});
