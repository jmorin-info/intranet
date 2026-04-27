import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

/**
 * Tests notifications controller :
 *  (a) findAll happy path → délégation au service avec pagination
 *  (b) RBAC : create/broadcast/test-email requièrent ADMIN+
 *  (c) markAsRead/markAllAsRead → délégation au service
 */
describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: any;
  let reflector: Reflector;

  const collabUser = {
    id: 'user-1',
    email: 'jdoe@omnitech.fr',
    role: UserRole.COLLABORATEUR,
  };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      findByUser: jest
        .fn()
        .mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20 } }),
      markAsRead: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      markAllAsRead: jest.fn().mockResolvedValue({ updated: 5 }),
      broadcast: jest.fn().mockResolvedValue({ created: 50 }),
      sendTestEmail: jest.fn().mockResolvedValue({ sent: true }),
      getUnreadCount: jest.fn().mockResolvedValue(3),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: service },
        Reflector,
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('findAll (happy path)', () => {
    it('passes user.id and parsed pagination', async () => {
      await controller.findAll('2', '50', collabUser as any);
      expect(service.findByUser).toHaveBeenCalledWith('user-1', {
        page: 2,
        limit: 50,
      });
    });

    it('defaults page=1 limit=20 when no params', async () => {
      await controller.findAll('', '', collabUser as any);
      expect(service.findByUser).toHaveBeenCalledWith('user-1', {
        page: 1,
        limit: 20,
      });
    });
  });

  describe('RBAC metadata (autorisation refusée)', () => {
    it('create requires SUPER_ADMIN/ADMIN/DIRECTION', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.create);
      expect(roles).toEqual(
        expect.arrayContaining([
          UserRole.SUPER_ADMIN,
          UserRole.ADMIN,
          UserRole.DIRECTION,
        ]),
      );
      expect(roles).not.toContain(UserRole.COLLABORATEUR);
    });

    it('broadcast requires SUPER_ADMIN/ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.broadcast);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
      );
      expect(roles).not.toContain(UserRole.DIRECTION);
    });

    it('test-email requires SUPER_ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.sendTestEmail,
      );
      expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });
  });

  describe('markAsRead/markAllAsRead', () => {
    it('markAsRead forwards id + user.id', async () => {
      await controller.markAsRead(
        '11111111-1111-1111-1111-111111111111',
        collabUser as any,
      );
      expect(service.markAsRead).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'user-1',
      );
    });

    it('markAllAsRead forwards user.id', async () => {
      await controller.markAllAsRead(collabUser as any);
      expect(service.markAllAsRead).toHaveBeenCalledWith('user-1');
    });
  });

  describe('unread-count', () => {
    it('wraps the count in { count } shape', async () => {
      const result = await controller.getUnreadCount(collabUser as any);
      expect(result).toEqual({ count: 3 });
    });
  });

  describe('broadcast (input pass-through)', () => {
    it('forwards full broadcast body to service', async () => {
      await controller.broadcast({
        type: 'INFO',
        title: 'Test',
        body: 'broadcast',
        targetRole: 'COLLABORATEUR',
      });
      expect(service.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'INFO', title: 'Test' }),
      );
    });
  });
});
