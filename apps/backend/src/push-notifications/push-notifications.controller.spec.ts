import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { Request } from 'express';
import type { RequestUser } from '../common/interfaces';

// Mock web-push to avoid pulling its native bindings during unit tests and
// to assert that sendNotification is invoked correctly via the service.
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));

describe('PushNotificationsController', () => {
  let controller: PushNotificationsController;
  let service: jest.Mocked<PushNotificationsService>;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;

  const mockUser: RequestUser = {
    id: 'user-1',
    email: 'jane@example.com',
    role: 'EMPLOYEE',
  } as unknown as RequestUser;

  const mockRequest = {
    ip: '10.0.0.42',
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4) Safari/605.1.15' },
  } as unknown as Request;

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const serviceMock: Partial<jest.Mocked<PushNotificationsService>> = {
      isEnabled: jest.fn().mockReturnValue(true),
      getVapidPublicKey: jest.fn().mockReturnValue('TEST_VAPID_PUBLIC_KEY'),
      subscribe: jest
        .fn()
        .mockResolvedValue({ id: 'sub-1', platform: 'ios' }),
      unsubscribe: jest.fn().mockResolvedValue({ removed: 1 }),
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushNotificationsController],
      providers: [
        { provide: PushNotificationsService, useValue: serviceMock },
        { provide: AuditService, useValue: audit },
      ],
    })
      // Bypass auth guards in unit tests — guard logic is tested elsewhere.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PushNotificationsController);
    service = module.get(PushNotificationsService) as jest.Mocked<PushNotificationsService>;
  });

  describe('GET /push/vapid-public-key', () => {
    it('returns the VAPID public key + enabled flag', () => {
      const result = controller.getVapidPublicKey();
      expect(result).toEqual({
        enabled: true,
        publicKey: 'TEST_VAPID_PUBLIC_KEY',
      });
    });
  });

  describe('GET /push/capabilities', () => {
    it('exposes Safari Web Push support and the VAPID public key', () => {
      const result = controller.getCapabilities();
      expect(result).toEqual({
        enabled: true,
        vapidPublicKey: 'TEST_VAPID_PUBLIC_KEY',
        supportsSafari: true,
        knownPlatforms: ['ios', 'macos', 'android', 'desktop', 'unknown'],
      });
    });

    it('still returns supportsSafari=true even when VAPID is not configured', () => {
      (service.isEnabled as jest.Mock).mockReturnValueOnce(false);
      (service.getVapidPublicKey as jest.Mock).mockReturnValueOnce(null);
      const result = controller.getCapabilities();
      expect(result.enabled).toBe(false);
      expect(result.vapidPublicKey).toBeNull();
      expect(result.supportsSafari).toBe(true);
    });
  });

  describe('POST /push/subscribe', () => {
    const baseDto = {
      endpoint: 'https://web.push.apple.com/abc123',
      keys: { p256dh: 'p256dhKey', auth: 'authKey' },
      platform: 'ios',
    };

    it('forwards the platform hint to the service and returns success', async () => {
      const result = await controller.subscribe(baseDto, mockUser, mockRequest);
      expect(service.subscribe).toHaveBeenCalledWith(
        'user-1',
        baseDto.endpoint,
        baseDto.keys.p256dh,
        baseDto.keys.auth,
        mockRequest.headers['user-agent'],
        'ios',
      );
      expect(result).toMatchObject({ success: true, id: 'sub-1', platform: 'ios' });
    });

    it('logs an audit entry with endpointHost + platform metadata (no full URL)', async () => {
      await controller.subscribe(baseDto, mockUser, mockRequest);
      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][0];
      expect(entry.action).toBe('PUSH_SUBSCRIBE');
      expect(entry.resourceType).toBe('PushSubscription');
      expect(entry.resourceId).toBe('sub-1');
      // Privacy: never log the full endpoint URL — only the host.
      expect(entry.metadata).toEqual({
        endpointHost: 'web.push.apple.com',
        platform: 'ios',
      });
    });

    it('falls back on the request User-Agent if dto.userAgent is missing', async () => {
      await controller.subscribe(baseDto, mockUser, mockRequest);
      const callUa = (service.subscribe as jest.Mock).mock.calls[0][4];
      expect(callUa).toContain('iPhone');
    });
  });

  describe('POST /push/unsubscribe', () => {
    it('removes the subscription and audit-logs the event', async () => {
      const dto = { endpoint: 'https://web.push.apple.com/abc123' };
      const result = await controller.unsubscribe(dto, mockUser, mockRequest);
      expect(service.unsubscribe).toHaveBeenCalledWith('user-1', dto.endpoint);
      expect(result).toMatchObject({ success: true, removed: 1 });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PUSH_UNSUBSCRIBE',
          resourceType: 'PushSubscription',
        }),
      );
    });
  });

  describe('POST /push/test', () => {
    it('triggers a test notification on the current user', async () => {
      const result = await controller.sendTest(mockUser);
      expect(service.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          title: expect.stringContaining('OMNITECH'),
          tag: 'test',
        }),
      );
      expect(result).toMatchObject({ success: true });
    });
  });
});
