import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

/**
 * Tests signature campaigns controller :
 *  (a) list/detail (RBAC SUPER_ADMIN/ADMIN/DIRECTION)
 *  (b) launch/remind (RBAC SUPER_ADMIN/ADMIN strict)
 *  (c) webhook : signature invalide → 401 UnauthorizedException
 *  (d) webhook : signature valide → délégation au handler
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
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
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

  describe('webhook (autorisation refusée → input invalide signature)', () => {
    it('throws UnauthorizedException on invalid signature', async () => {
      campaigns.verifyWebhookSignature.mockReturnValueOnce(false);
      const req = {
        headers: { 'x-docuseal-signature': 'bad-signature' },
        rawBody: Buffer.from('{}'),
      };
      await expect(controller.webhook(req, {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(campaigns.handleWebhook).not.toHaveBeenCalled();
    });

    it('forwards payload to handleWebhook on valid signature', async () => {
      campaigns.verifyWebhookSignature.mockReturnValueOnce(true);
      const req = {
        headers: { 'x-docuseal-signature': 'valid-sig' },
        rawBody: Buffer.from('{"event":"submission.completed"}'),
      };
      const result = await controller.webhook(req, { event: 'submission.completed' });
      expect(campaigns.handleWebhook).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('falls back to JSON.stringify when no rawBody available', async () => {
      campaigns.verifyWebhookSignature.mockReturnValueOnce(true);
      const req = {
        headers: { 'x-docuseal-signature': 'valid-sig' },
      };
      await controller.webhook(req, { event: 'test' });
      // Verify handler was reached (signature check passed)
      expect(campaigns.verifyWebhookSignature).toHaveBeenCalled();
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
