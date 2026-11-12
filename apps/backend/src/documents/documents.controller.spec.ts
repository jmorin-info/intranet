import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StorageService } from '../storage/storage.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { Response } from 'express';
import * as fs from 'fs';

jest.mock('fs');

/**
 * Tests documents controller :
 *  (a) findAll → délégation au service avec filtres
 *  (b) RBAC : direct-publish requiert ADMIN+ (vérifie metadata)
 *  (c) bulkDelete → input invalide (ids non array → service le rejette)
 *  (d) uploadVersion → BadRequest sans fichier (input invalide)
 *  (e) downloadLatest → 404 si aucune version
 */
describe('DocumentsController', () => {
  let controller: DocumentsController;
  let documentsService: any;
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

  const buildResponse = () => {
    const res: Partial<Response> = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeEach(async () => {
    documentsService = {
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            reference: 'OMS-001',
            title: 'Doc 1',
            category: 'POLICY',
            classification: 'INTERNE',
            status: 'APPROVED',
            owner: { firstName: 'A', lastName: 'B' },
            createdAt: new Date('2026-01-15'),
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
      findById: jest.fn().mockResolvedValue({
        id: 'doc-1',
        title: 'Test',
        classification: 'INTERNE',
      }),
      getStatistics: jest.fn().mockResolvedValue({
        total: 100,
        byCategory: {},
        byStatus: {},
        byClassification: {},
      }),
      bulkSoftDelete: jest.fn().mockResolvedValue({ deleted: 3 }),
      bulkArchive: jest.fn().mockResolvedValue({ archived: 3 }),
      bulkClassify: jest.fn().mockResolvedValue({ updated: 3 }),
      getHistory: jest.fn().mockResolvedValue({ timeline: [] }),
      findRelated: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'doc-new' }),
      directPublish: jest
        .fn()
        .mockResolvedValue({ id: 'doc-pub', status: 'APPROVED' }),
      forceApprove: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      reopenDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      createInline: jest.fn().mockResolvedValue({ id: 'doc-inline' }),
      updateInlineContent: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      update: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      softDelete: jest.fn().mockResolvedValue({ deleted: 1 }),
      uploadVersion: jest.fn().mockResolvedValue({ versionId: 'v-1' }),
      reimportObsolete: jest.fn().mockResolvedValue({ versionId: 'v-2' }),
      getVersions: jest.fn().mockResolvedValue([]),
      getDownloadUrl: jest.fn().mockResolvedValue({
        fileName: 'storage/docs/uuid.pdf',
        documentReference: 'OMS-001',
        versionNumber: '1',
        fileType: 'application/pdf',
      }),
    };

    storageService = {
      getFilePath: jest.fn().mockReturnValue('/tmp/storage/docs/uuid.pdf'),
      getFileStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
    };

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(''));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: documentsService },
        { provide: StorageService, useValue: storageService },
        Reflector,
      ],
    }).compile();

    controller = module.get<DocumentsController>(DocumentsController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('findAll (happy path)', () => {
    it('returns documents from service', async () => {
      const result = await controller.findAll({} as any, collabUser as any);
      expect(documentsService.findAll).toHaveBeenCalledWith(
        expect.any(Object),
        collabUser,
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe('RBAC metadata (autorisation)', () => {
    it('directPublish requires ADMIN/SUPER_ADMIN/DIRECTION', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.directPublish,
      );
      expect(roles).toContain(UserRole.ADMIN);
      expect(roles).toContain(UserRole.SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.COLLABORATEUR);
    });

    it('bulkDelete requires ADMIN/SUPER_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.bulkDelete,
      );
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
      );
      expect(roles).not.toContain(UserRole.REVIEWER);
    });

    it('softDelete requires ADMIN/SUPER_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.softDelete);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
      );
    });

    it('getStatistics requires ADMIN/SUPER_ADMIN/REVIEWER', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.getStatistics,
      );
      expect(roles).toContain(UserRole.REVIEWER);
    });
  });

  describe('uploadVersion (input invalide)', () => {
    it('throws BadRequestException when no file is provided', () => {
      expect(() => controller.uploadVersion(
          'doc-1',
          undefined as unknown as Express.Multer.File,
          'changelog',
          collabUser as any,
        ),
      ).toThrow(BadRequestException);
    });

    it('forwards file + changelog when valid', async () => {
      const file = {
        originalname: 'v2.pdf',
        buffer: Buffer.from(''),
        size: 100,
      } as Express.Multer.File;
      await controller.uploadVersion(
        'doc-1',
        file,
        'Update v2',
        collabUser as any,
      );
      expect(documentsService.uploadVersion).toHaveBeenCalledWith(
        'doc-1',
        file,
        'Update v2',
        'user-1',
      );
    });
  });

  describe('reimportObsolete (input invalide)', () => {
    it('throws BadRequestException when no file', async () => {
      await expect(
        controller.reimportObsolete(
          'doc-1',
          undefined as unknown as Express.Multer.File,
          'changelog',
          collabUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('downloadLatest (no version → 404)', () => {
    it('throws NotFoundException when no versions exist', async () => {
      documentsService.getVersions.mockResolvedValueOnce([]);
      await expect(
        controller.downloadLatest(
          'doc-1',
          collabUser as any,
          'true',
          'false',
          buildResponse(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('downloads the current approved pointer rather than an unrelated newer historical row', async () => {
      documentsService.findById.mockResolvedValueOnce({ currentVersionId: 'current-version' });
      documentsService.getVersions.mockResolvedValueOnce([{ id: 'other-version' }]);
      const stream = jest.spyOn(controller as any, 'streamWatermarkedDocument').mockResolvedValue(undefined);
      const response = buildResponse();
      await controller.downloadLatest('doc-1', collabUser as any, 'true', 'false', response);
      expect(stream).toHaveBeenCalledWith('doc-1', 'current-version', collabUser, 'true', 'false', response);
      expect(documentsService.getVersions).not.toHaveBeenCalled();
    });
  });

  describe('bulk endpoints (happy path)', () => {
    it('bulkDelete forwards ids+user', async () => {
      await controller.bulkDelete({ ids: ['1', '2'] }, adminUser as any);
      expect(documentsService.bulkSoftDelete).toHaveBeenCalledWith(
        ['1', '2'],
        adminUser,
      );
    });

    it('bulkArchive forwards ids+user', async () => {
      await controller.bulkArchive({ ids: ['1'] }, adminUser as any);
      expect(documentsService.bulkArchive).toHaveBeenCalledWith(['1'], adminUser);
    });

    it('bulkClassify forwards ids+classification+user', async () => {
      await controller.bulkClassify(
        { ids: ['1'], classification: 'CONFIDENTIEL' },
        adminUser as any,
      );
      expect(documentsService.bulkClassify).toHaveBeenCalledWith(
        ['1'],
        'CONFIDENTIEL',
        adminUser,
      );
    });
  });

  describe('exportCsv (happy path)', () => {
    it('returns CSV with appropriate headers', async () => {
      const res = buildResponse();
      await controller.exportCsv({} as any, adminUser as any, res);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': expect.stringContaining('attachment'),
        }),
      );
      expect(res.send).toHaveBeenCalled();
    });
  });
});
