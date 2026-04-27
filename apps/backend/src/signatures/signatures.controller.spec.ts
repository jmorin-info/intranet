import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import type { Response } from 'express';

/**
 * Tests signatures controller :
 *  (a) listTemplates / listSubmissions (REVIEWER+) → délégation OK
 *  (b) signDirectly → bloqué si signerId !== user.id (autorisation refusée)
 *  (c) createRequest → forwarde tous les champs DTO + user.id
 *  (d) export CSV → headers HTTP + filtre status optionnel
 */
describe('SignaturesController', () => {
  let controller: SignaturesController;
  let service: any;

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
    };
    return res as Response;
  };

  beforeEach(async () => {
    service = {
      listTemplates: jest.fn().mockResolvedValue([{ id: 't1', name: 'Tpl1' }]),
      listSubmissions: jest.fn().mockResolvedValue([]),
      getSubmission: jest.fn().mockResolvedValue({ id: 's1' }),
      listAllSignatureRequests: jest.fn().mockResolvedValue([
        {
          status: 'PENDING',
          createdAt: new Date(),
          signedAt: null,
          signer: { firstName: 'A', lastName: 'B', email: 'a@b.fr' },
          requestedBy: { firstName: 'R', lastName: 'B', email: 'r@b.fr' },
          documentVersion: {
            versionNumber: '1',
            document: { title: 'Doc', reference: 'OMS-001' },
          },
        },
      ]),
      createSignatureRequest: jest.fn().mockResolvedValue({ id: 'sig-1' }),
      getMySignatures: jest.fn().mockResolvedValue([]),
      getStatus: jest.fn().mockResolvedValue({ id: 'sig-1', signerId: 'user-1' }),
      signDirectly: jest.fn().mockResolvedValue({ success: true }),
      getByDocument: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SignaturesController],
      providers: [
        { provide: SignaturesService, useValue: service },
        Reflector,
      ],
    }).compile();

    controller = module.get<SignaturesController>(SignaturesController);
  });

  describe('listTemplates (RBAC happy path)', () => {
    it('returns templates from service', async () => {
      const result = await controller.listTemplates();
      expect(service.listTemplates).toHaveBeenCalled();
      expect(result).toEqual([{ id: 't1', name: 'Tpl1' }]);
    });
  });

  describe('signDirectly (autorisation refusée)', () => {
    it('throws ForbiddenException when user is not the assigned signer', async () => {
      service.getStatus.mockResolvedValueOnce({
        id: 'sig-1',
        signerId: 'someone-else',
      });
      await expect(
        controller.signDirectly('sig-1', collabUser as any),
      ).rejects.toThrow(ForbiddenException);
      expect(service.signDirectly).not.toHaveBeenCalled();
    });

    it('signs successfully when user is the designated signer', async () => {
      service.getStatus.mockResolvedValueOnce({
        id: 'sig-1',
        signerId: 'user-1',
      });
      const result = await controller.signDirectly('sig-1', collabUser as any);
      expect(service.signDirectly).toHaveBeenCalledWith('sig-1', 'user-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('createRequest (input invalide / délégation)', () => {
    it('forwards documentVersionId, signerId, requesterId and templateId', async () => {
      await controller.createRequest(
        {
          documentVersionId: 'doc-v-1',
          signerId: 'signer-1',
          templateId: 42,
        },
        adminUser as any,
      );
      expect(service.createSignatureRequest).toHaveBeenCalledWith(
        'doc-v-1',
        'signer-1',
        'admin-1',
        42,
      );
    });
  });

  describe('exportCsv (RBAC ADMIN+)', () => {
    it('returns CSV with appropriate headers', async () => {
      const res = buildResponse();
      await controller.exportCsv(undefined, res);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv; charset=utf-8',
        }),
      );
      expect(res.send).toHaveBeenCalled();
    });

    it('filters by status when provided', async () => {
      const res = buildResponse();
      service.listAllSignatureRequests.mockResolvedValueOnce([
        {
          status: 'SIGNED',
          createdAt: new Date(),
          signedAt: new Date(),
          signer: { firstName: 'A', lastName: 'B', email: 'a@b.fr' },
          requestedBy: { firstName: 'R', lastName: 'B', email: 'r@b.fr' },
          documentVersion: {
            versionNumber: '1',
            document: { title: 'Doc', reference: 'OMS-001' },
          },
        },
        {
          status: 'PENDING',
          createdAt: new Date(),
          signedAt: null,
          signer: { firstName: 'C', lastName: 'D', email: 'c@d.fr' },
          requestedBy: { firstName: 'R', lastName: 'B', email: 'r@b.fr' },
          documentVersion: {
            versionNumber: '1',
            document: { title: 'Doc2', reference: 'OMS-002' },
          },
        },
      ]);
      await controller.exportCsv('SIGNED', res);
      const csv = (res.send as jest.Mock).mock.calls[0][0];
      // SIGNED row exported, PENDING filtered out
      expect(csv).toContain('OMS-001');
      expect(csv).not.toContain('OMS-002');
    });
  });

  describe('getStatus / getByDocument', () => {
    it('returns signature status', async () => {
      const result = await controller.getStatus('sig-1');
      expect(result).toMatchObject({ id: 'sig-1' });
    });

    it('returns signatures by document id', async () => {
      const result = await controller.getByDocument(
        '11111111-1111-1111-1111-111111111111',
      );
      expect(service.getByDocument).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
