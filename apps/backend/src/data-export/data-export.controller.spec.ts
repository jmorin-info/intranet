import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';

/**
 * Tests data-export controller (RGPD Art. 20 — droit a la portabilite) :
 *  (a) requestExport happy path → cree request + retourne 202 metadata
 *  (b) listMyExports → renvoie uniquement les exports du user courant
 *  (c) getStatus refuse si user demande un export d'un autre user (403)
 *  (d) getStatus 404 si l'ID n'existe pas
 */
describe('DataExportController', () => {
  let controller: DataExportController;
  let service: any;

  const collabUser = {
    id: 'user-1',
    email: 'jdoe@omnitech.fr',
    role: UserRole.COLLABORATEUR,
  };
  const otherUser = {
    id: 'user-2',
    email: 'other@omnitech.fr',
    role: UserRole.COLLABORATEUR,
  };

  beforeEach(async () => {
    service = {
      requestExport: jest.fn().mockResolvedValue({
        id: 'req-1',
        status: 'PENDING',
        requestedAt: new Date('2026-01-15T10:00:00Z'),
      }),
      listForUser: jest.fn().mockResolvedValue([
        {
          id: 'req-1',
          status: 'COMPLETED',
          requestedAt: new Date(),
          completedAt: new Date(),
          downloadUrl: '/storage/exports/foo.json',
          expiresAt: new Date(),
          errorMessage: null,
        },
      ]),
      findById: jest.fn().mockResolvedValue({
        id: 'req-1',
        userId: 'user-1',
        status: 'COMPLETED',
        requestedAt: new Date(),
        completedAt: new Date(),
        downloadUrl: '/storage/exports/foo.json',
        expiresAt: new Date(),
        errorMessage: null,
        filePath: '/internal/path.json',
      }),
      getStatusPayload: jest.fn().mockImplementation((req) => ({
        id: req.id,
        status: req.status,
        requestedAt: req.requestedAt,
        completedAt: req.completedAt,
        downloadUrl: req.downloadUrl,
        expiresAt: req.expiresAt,
        errorMessage: req.errorMessage,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataExportController],
      providers: [
        { provide: DataExportService, useValue: service },
        Reflector,
      ],
    }).compile();

    controller = module.get<DataExportController>(DataExportController);
  });

  describe('requestExport (happy path — RGPD)', () => {
    it('creates a request via service and returns 202 metadata', async () => {
      const result = await controller.requestExport(collabUser as any);
      expect(service.requestExport).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({
        id: 'req-1',
        status: 'PENDING',
      });
      expect(result.message).toContain('Export en cours');
    });
  });

  describe('listMyExports', () => {
    it('returns the current user exports only', async () => {
      const result = await controller.listMyExports(collabUser as any);
      expect(service.listForUser).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getStatus (autorisation refusee)', () => {
    it('throws ForbiddenException when requesting another user export', async () => {
      service.findById.mockResolvedValueOnce({
        id: 'req-1',
        userId: 'user-1', // owned by user-1
        status: 'COMPLETED',
        requestedAt: new Date(),
        completedAt: new Date(),
        downloadUrl: null,
        expiresAt: null,
        errorMessage: null,
        filePath: null,
      });
      // user-2 trying to read user-1's request
      await expect(
        controller.getStatus(
          '11111111-1111-1111-1111-111111111111',
          otherUser as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when request id does not exist', async () => {
      service.findById.mockResolvedValueOnce(null);
      await expect(
        controller.getStatus(
          '11111111-1111-1111-1111-111111111111',
          collabUser as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatus (happy path)', () => {
    it('returns the status payload (without filePath internal)', async () => {
      const result = await controller.getStatus(
        '11111111-1111-1111-1111-111111111111',
        collabUser as any,
      );
      expect(service.getStatusPayload).toHaveBeenCalled();
      // filePath disk path NOT exposed to client
      expect(result).not.toHaveProperty('filePath');
      expect(result).toHaveProperty('downloadUrl');
      expect(result).toHaveProperty('status');
    });
  });
});
