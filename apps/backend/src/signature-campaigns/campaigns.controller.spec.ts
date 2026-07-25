import { Test, TestingModule } from '@nestjs/testing';
import { GoneException } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

/**
 * Tests signature campaigns controller :
 *  (a) list/detail (RBAC SUPER_ADMIN/ADMIN/DIRECTION)
 *  (b) launch/remind (RBAC SUPER_ADMIN/ADMIN strict)
 *  (c) webhook DocuSeal historique : retiré → 410 Gone, aucun traitement
 */
describe('CampaignsController', () => {
  let controller: CampaignsController;
  let campaigns: any;
  let reflector: Reflector;

  const adminUser = {
    id: 'admin-1',
    email: 'admin@omnitech.fr',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    campaigns = {
      findAll: jest.fn().mockResolvedValue([]),
      createFromCharte: jest.fn().mockResolvedValue({ id: 'camp-1' }),
      createFromDocument: jest.fn().mockResolvedValue({ id: 'camp-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'camp-1' }),
      launch: jest.fn().mockResolvedValue({ launched: true }),
      sendReminders: jest.fn().mockResolvedValue({ sent: 10 }),
      handleWebhook: jest.fn().mockResolvedValue({ ok: true }),
      findMyPending: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [
        { provide: CampaignsService, useValue: campaigns },
        Reflector,
      ],
    }).compile();

    controller = module.get<CampaignsController>(CampaignsController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('RBAC metadata (autorisation)', () => {
    it('list requires SUPER_ADMIN/ADMIN/DIRECTION', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.list);
      expect(roles).toEqual(
        expect.arrayContaining([
          UserRole.SUPER_ADMIN,
          UserRole.ADMIN,
          UserRole.DIRECTION,
        ]),
      );
    });

    it('launch requires SUPER_ADMIN/ADMIN only (strict)', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.launch);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
      );
      // DIRECTION cannot launch — only review
      expect(roles).not.toContain(UserRole.DIRECTION);
    });

    it('remind requires SUPER_ADMIN/ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.remind);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
      );
    });

    it('createFromCharte requires SUPER_ADMIN/ADMIN', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.createFromCharte,
      );
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
      );
    });
  });

  describe('webhook DocuSeal historique (retiré)', () => {
    it('répond 410 Gone quel que soit le payload', async () => {
      const req = {
        ip: '10.0.0.1',
        headers: { 'x-docuseal-signature': 'peu-importe' },
        rawBody: Buffer.from('{"event_type":"form.completed"}'),
      };
      await expect(controller.deprecatedWebhook(req)).rejects.toThrow(
        GoneException,
      );
    });

    it('ne traite JAMAIS le payload (aucune délégation au service)', async () => {
      const req = { ip: '10.0.0.1', headers: {} };
      await expect(controller.deprecatedWebhook(req)).rejects.toThrow(
        GoneException,
      );
      expect(campaigns.handleWebhook).not.toHaveBeenCalled();
    });

    it("le message d'erreur pointe vers le point d'entrée unique", async () => {
      const req = { ip: '10.0.0.1', headers: {} };
      await expect(controller.deprecatedWebhook(req)).rejects.toThrow(
        /\/signatures\/webhook/,
      );
    });
  });

  describe('list (happy path)', () => {
    it('returns campaigns list from service', async () => {
      await controller.list();
      expect(campaigns.findAll).toHaveBeenCalled();
    });
  });

  describe('createFromCharte (input pass-through)', () => {
    it('forwards charteId+createdById and parses dueAt', async () => {
      await controller.createFromCharte(
        'charte-1',
        { dueAt: '2026-06-01T00:00:00Z' } as any,
        adminUser as any,
      );
      expect(campaigns.createFromCharte).toHaveBeenCalledWith(
        'charte-1',
        expect.objectContaining({
          createdById: 'admin-1',
          dueAt: expect.any(Date),
        }),
      );
    });
  });

  describe('myPending (auth user)', () => {
    it('forwards user.id', async () => {
      await controller.myPending(adminUser as any);
      expect(campaigns.findMyPending).toHaveBeenCalledWith('admin-1');
    });
  });
});
