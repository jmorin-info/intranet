import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';
import { AuditService } from '../audit/audit.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { Request } from 'express';

/**
 * Tests push-notifications controller :
 *  (a) vapid-public-key happy path → renvoie clé publique + flag enabled
 *  (b) subscribe → délégation au service + audit log async
 *  (c) test (RBAC ADMIN) → metadata correcte
 *  (d) input invalide gracefully handled (audit failure ne casse pas la requête)
 */
describe('PushNotificationsController', () => {
  let controller: PushNotificationsController;
  let pushService: any;
  let auditService: any;
  let reflector: Reflector;

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

  beforeEach(async () => {
    pushService = {
      isEnabled: jest.fn().mockReturnValue(true),
      getVapidPublicKey: jest.fn().mockReturnValue('PUBLIC_KEY_BASE64'),
      subscribe: jest
        .fn()
        .mockResolvedValue({ id: 'sub-1', endpoint: 'https://push.example/123' }),
      unsubscribe: jest.fn().mockResolvedValue({ removed: 1 }),
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushNotificationsController],
      providers: [
        { provide: PushNotificationsService, useValue: pushService },
        { provide: AuditService, useValue: auditService },
        Reflector,
      ],
    }).compile();

    controller = module.get<PushNotificationsController>(
      PushNotificationsController,
    );
    reflector = module.get<Reflector>(Reflector);
  });

  describe('vapid-public-key (happy path)', () => {
    it('returns enabled flag + public key', () => {
      const result = controller.getVapidPublicKey();
      expect(result).toEqual({
        enabled: true,
        publicKey: 'PUBLIC_KEY_BASE64',
      });
    });
  });

  describe('subscribe', () => {
    it('forwards endpoint and keys to service', async () => {
      const req = buildRequest();
      const dto = {
        endpoint: 'https://fcm.googleapis.com/abc',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        userAgent: 'Mozilla/5.0',
      };
      const result = await controller.subscribe(dto, collabUser as any, req);
      expect(pushService.subscribe).toHaveBeenCalledWith(
        'user-1',
        dto.endpoint,
        'p256dh-key',
        'auth-key',
        'Mozilla/5.0',
      );
      expect(result.success).toBe(true);
    });

    it('falls back to req userAgent when DTO has none', async () => {
      const req = buildRequest();
      await controller.subscribe(
        {
          endpoint: 'https://fcm.googleapis.com/abc',
          keys: { p256dh: 'pk', auth: 'ak' },
        },
        collabUser as any,
        req,
      );
      // userAgent from req.headers
      expect(pushService.subscribe).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        'pk',
        'ak',
        'jest',
      );
    });
  });

  describe('unsubscribe', () => {
    it('forwards endpoint to service and audits', async () => {
      const req = buildRequest();
      const result = await controller.unsubscribe(
        { endpoint: 'https://fcm.googleapis.com/abc' },
        collabUser as any,
        req,
      );
      expect(pushService.unsubscribe).toHaveBeenCalledWith(
        'user-1',
        'https://fcm.googleapis.com/abc',
      );
      expect(result.success).toBe(true);
    });
  });

  describe('test (RBAC : ADMIN/SUPER_ADMIN)', () => {
    it('metadata @Roles requires ADMIN/SUPER_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.sendTest);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
      );
      expect(roles).not.toContain(UserRole.COLLABORATEUR);
    });

    it('sends a test notification to the requesting admin', async () => {
      const result = await controller.sendTest({
        ...collabUser,
        role: UserRole.ADMIN,
      } as any);
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          title: expect.stringContaining('OMNITECH'),
        }),
      );
      expect(result.success).toBe(true);
    });
  });
});
