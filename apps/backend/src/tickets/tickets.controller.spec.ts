import { Test, TestingModule } from '@nestjs/testing';
import { UserThrottlerGuard } from '../auth/guards/user-throttler.guard';
import { BadRequestException } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { Response } from 'express';

/**
 * Tests tickets controller :
 *  (a) findAll happy path → délégation au service avec filtres
 *  (b) findAll input invalide (page=0, limit=200) → BadRequestException
 *  (c) RBAC : analytics requiert ADMIN/SUPER_ADMIN
 *  (d) bulk endpoints → délégation au service
 */
describe('TicketsController', () => {
  let controller: TicketsController;
  let service: any;
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
    };
    return res as Response;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            reference: 'TKT-001',
            title: 'Issue 1',
            status: 'OPEN',
            priority: 'P2',
            category: 'BUG',
            creator: { firstName: 'A', lastName: 'B' },
            assignee: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
      findAllSpaces: jest.fn().mockResolvedValue([]),
      findSpaceBySlugOrId: jest.fn().mockResolvedValue(null),
      getLabels: jest.fn().mockResolvedValue({ labels: [] }),
      getStatusCounts: jest.fn().mockResolvedValue({ OPEN: 5, CLOSED: 3 }),
      getStats: jest.fn().mockResolvedValue({ total: 100 }),
      byDepartment: jest.fn().mockResolvedValue([]),
      myDepartment: jest.fn().mockResolvedValue([]),
      getAnalytics: jest.fn().mockResolvedValue({ resolutionTime: 24 }),
      bulkUpdateStatus: jest.fn().mockResolvedValue({ updated: 3 }),
      bulkAssign: jest.fn().mockResolvedValue({ updated: 3 }),
      findById: jest.fn().mockResolvedValue({ id: 'tkt-1' }),
      getAiSuggestion: jest.fn().mockResolvedValue({ category: 'BUG' }),
      create: jest.fn().mockResolvedValue({ id: 'tkt-new' }),
      update: jest.fn().mockResolvedValue({ id: 'tkt-1' }),
      updateDates: jest.fn().mockResolvedValue({ id: 'tkt-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      addComment: jest.fn().mockResolvedValue({ id: 'cmt-1' }),
      generateKbDraft: jest.fn().mockResolvedValue({ title: 'Draft' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        { provide: TicketsService, useValue: service },
        Reflector,
      ],
    }).overrideGuard(UserThrottlerGuard).useValue({ canActivate: () => true }).compile();

    controller = module.get<TicketsController>(TicketsController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('findAll (happy path + auth)', () => {
    it('forwards filters and resolves "me" to user.id for assigneeId/userId', async () => {
      await controller.findAll(
        'OPEN',
        'P2',
        'me',
        'dept-1',
        'search',
        'me',
        'space-1',
        undefined as any,
        '1',
        '20',
        collabUser as any,
      );
      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'OPEN',
          priority: 'P2',
          assigneeId: 'user-1',
          creatorId: 'user-1',
          page: 1,
          limit: 20,
        }),
        collabUser,
      );
    });
  });

  describe('findAll (input invalide)', () => {
    it('throws BadRequestException when page < 1', () => {
      expect(() =>
        controller.findAll(
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          '0',
          '20',
          collabUser as any,
        ),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when limit > 100', () => {
      expect(() =>
        controller.findAll(
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          '1',
          '200',
          collabUser as any,
        ),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when limit < 1', () => {
      expect(() =>
        controller.findAll(
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          '1',
          '0',
          collabUser as any,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('RBAC metadata (autorisation)', () => {
    it('getStats requires ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.getStats);
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('getAnalytics requires ADMIN/SUPER_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.getAnalytics,
      );
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
      );
    });

    it('byDepartment requires ADMIN/SUPER_ADMIN/REVIEWER', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.byDepartment,
      );
      expect(roles).toContain(UserRole.REVIEWER);
    });

    it('update requires ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.update);
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('remove requires ADMIN/SUPER_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.remove);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
      );
    });
  });

  describe('bulk endpoints (happy path)', () => {
    it('bulkUpdateStatus forwards ids+status+user', async () => {
      await controller.bulkUpdateStatus(
        { ids: ['1', '2'], status: 'CLOSED' },
        adminUser as any,
      );
      expect(service.bulkUpdateStatus).toHaveBeenCalledWith(
        ['1', '2'],
        'CLOSED',
        adminUser,
      );
    });

    it('bulkAssign forwards ids+assigneeId+user', async () => {
      await controller.bulkAssign(
        { ids: ['1'], assigneeId: 'assignee-1' },
        adminUser as any,
      );
      expect(service.bulkAssign).toHaveBeenCalledWith(
        ['1'],
        'assignee-1',
        adminUser,
      );
    });

    it('bulkAssign with assigneeId=null unassigns', async () => {
      await controller.bulkAssign(
        { ids: ['1'], assigneeId: null },
        adminUser as any,
      );
      expect(service.bulkAssign).toHaveBeenCalledWith(['1'], null, adminUser);
    });
  });

  describe('export CSV', () => {
    it('returns CSV with appropriate headers', async () => {
      const res = buildResponse();
      await controller.exportCsv(
        'OPEN',
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        adminUser as any,
        res,
      );
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv; charset=utf-8',
        }),
      );
    });
  });

  describe('addComment (happy path)', () => {
    it('forwards content+isInternal+role to service', async () => {
      await controller.addComment(
        'tkt-1',
        { content: 'Hello', isInternal: true },
        adminUser as any,
      );
      expect(service.addComment).toHaveBeenCalledWith(
        'tkt-1',
        'Hello',
        'admin-1',
        true,
        UserRole.ADMIN,
      );
    });
  });
});
