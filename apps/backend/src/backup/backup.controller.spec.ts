import { Test, TestingModule } from '@nestjs/testing';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { Request, Response } from 'express';
import fs = require('fs');

jest.mock('fs');

/**
 * Tests backup controller (SUPER_ADMIN only) :
 *  (a) list happy path → délégation au service
 *  (b) RBAC : la metadata @Roles est bien posée à SUPER_ADMIN
 *  (c) export → délégation avec userId+ip
 *  (d) restore → file requis (input invalide → service le rejette)
 */
describe('BackupController', () => {
  let controller: BackupController;
  let backupService: any;
  let reflector: Reflector;

  const mockUser = {
    id: 'admin-1',
    email: 'admin@omnitech.fr',
    role: UserRole.SUPER_ADMIN,
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
    backupService = {
      listBackups: jest
        .fn()
        .mockResolvedValue([
          { filename: 'backup-2026-01-15.sql.gz', size: 12345, createdAt: new Date() },
        ]),
      exportBackup: jest
        .fn()
        .mockResolvedValue({ filename: 'backup-2026-01-15.sql.gz', size: 12345 }),
      restoreBackup: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Restored' }),
      getBackupFilePath: jest.fn().mockReturnValue('/tmp/backup-test.sql.gz'),
      exportFullToNetwork: jest
        .fn()
        .mockResolvedValue({ success: true, network: '/share' }),
      createDownloadableArchive: jest.fn().mockResolvedValue('/tmp/project-bundle.tar.gz'),
      deleteBackup: jest.fn().mockResolvedValue(undefined),
    };

    (fs.createReadStream as jest.Mock) = jest.fn().mockReturnValue({
      on: jest.fn(),
      pipe: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        { provide: BackupService, useValue: backupService },
        Reflector,
      ],
    }).compile();

    controller = module.get<BackupController>(BackupController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('RBAC metadata (autorisation refusée hors SUPER_ADMIN)', () => {
    it('controller-level @Roles requires SUPER_ADMIN', () => {
      const requiredRoles = reflector.get<UserRole[]>(ROLES_KEY, BackupController);
      expect(requiredRoles).toContain(UserRole.SUPER_ADMIN);
    });
  });

  describe('list (happy path)', () => {
    it('returns list of backups from service', async () => {
      const result = await controller.list();
      expect(backupService.listBackups).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('export', () => {
    it('passes userId and ip to service', async () => {
      const req = buildRequest();
      await controller.exportBackup(mockUser as any, req);
      expect(backupService.exportBackup).toHaveBeenCalledWith('admin-1', '127.0.0.1');
    });
  });

  describe('download', () => {
    it('sets Content-Disposition with filename', async () => {
      const res = buildResponse();
      await controller.download('backup-2026-01-15.sql.gz', res);
      expect(backupService.getBackupFilePath).toHaveBeenCalledWith(
        'backup-2026-01-15.sql.gz',
      );
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Disposition': expect.stringContaining('backup-test.sql.gz'),
        }),
      );
    });
  });

  describe('restore (input invalide)', () => {
    it('forwards file to service for processing', async () => {
      const file = {
        originalname: 'backup-test.sql.gz',
        buffer: Buffer.from(''),
        size: 100,
      } as Express.Multer.File;
      const req = buildRequest();
      await controller.restore(file, mockUser as any, req);
      expect(backupService.restoreBackup).toHaveBeenCalledWith(
        file,
        'admin-1',
        '127.0.0.1',
        'jest',
      );
    });
  });

  describe('deleteBackup', () => {
    it('passes filename + actor info to service', async () => {
      const req = buildRequest();
      const result = await controller.deleteBackup(
        'backup-old.sql.gz',
        mockUser as any,
        req,
      );
      expect(backupService.deleteBackup).toHaveBeenCalledWith(
        'backup-old.sql.gz',
        'admin-1',
        '127.0.0.1',
      );
      expect(result.success).toBe(true);
    });
  });
});
