import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SavedFiltersService } from './saved-filters.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { SavedFilterVisibility } from './dto/create-saved-filter.dto';

/**
 * Tests F3 — partage de filtres sauvegardés.
 * Couvre : scope mine/shared/all, permissions share/unshare/delete,
 * audit log SAVED_FILTER_SHARED / SAVED_FILTER_UNSHARED, validation visibility.
 */
describe('SavedFiltersService', () => {
  let service: SavedFiltersService;
  let prisma: any;

  const owner: RequestUser = {
    id: 'user-owner',
    email: 'owner@omnitech.fr',
    role: UserRole.COLLABORATEUR,
    departmentId: 'dept-A',
  };

  const teammate: RequestUser = {
    id: 'user-teammate',
    email: 'teammate@omnitech.fr',
    role: UserRole.COLLABORATEUR,
    departmentId: 'dept-A',
  };

  const otherDeptUser: RequestUser = {
    id: 'user-other',
    email: 'other@omnitech.fr',
    role: UserRole.COLLABORATEUR,
    departmentId: 'dept-B',
  };

  const adminUser: RequestUser = {
    id: 'user-admin',
    email: 'admin@omnitech.fr',
    role: UserRole.ADMIN,
    departmentId: 'dept-A',
  };

  beforeEach(async () => {
    prisma = {
      savedFilter: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SavedFiltersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(SavedFiltersService);
  });

  describe('findAll — scope filtering', () => {
    it('scope=mine restricts to userId=owner.id', async () => {
      await service.findAll(owner, { module: 'tickets', scope: 'mine' });
      expect(prisma.savedFilter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: owner.id, module: 'tickets' }),
        }),
      );
    });

    it('scope=shared excludes own filters and includes PUBLIC + ROLE + DEPARTMENT', async () => {
      await service.findAll(teammate, { scope: 'shared' });
      const call = prisma.savedFilter.findMany.mock.calls[0][0];
      expect(call.where.userId).toEqual({ not: teammate.id });
      const orClauses = call.where.OR;
      expect(orClauses).toEqual(
        expect.arrayContaining([
          { visibility: 'PUBLIC' },
          { visibility: 'ROLE', sharedWithRole: UserRole.COLLABORATEUR },
          { visibility: 'DEPARTMENT', sharedWithDepartmentId: 'dept-A' },
        ]),
      );
    });

    it('scope=shared without departmentId omits the DEPARTMENT clause', async () => {
      const noDept: RequestUser = { ...teammate, departmentId: null };
      await service.findAll(noDept, { scope: 'shared' });
      const orClauses = prisma.savedFilter.findMany.mock.calls[0][0].where.OR;
      expect(orClauses).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ visibility: 'DEPARTMENT' }),
        ]),
      );
    });

    it('scope=all unions own + shared filters', async () => {
      await service.findAll(teammate, { scope: 'all' });
      const orClauses = prisma.savedFilter.findMany.mock.calls[0][0].where.OR;
      expect(orClauses[0]).toEqual({ userId: teammate.id });
      expect(orClauses.length).toBeGreaterThanOrEqual(3);
    });

    it('default scope is mine', async () => {
      await service.findAll(owner, {});
      const where = prisma.savedFilter.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(owner.id);
    });
  });

  describe('create — visibility validation', () => {
    it('rejects DEPARTMENT without sharedWithDepartmentId', async () => {
      await expect(
        service.create(owner, {
          module: 'tickets',
          name: 'Mes urgents',
          filters: { priority: 'HIGH' },
          visibility: SavedFilterVisibility.DEPARTMENT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects ROLE without sharedWithRole', async () => {
      await expect(
        service.create(owner, {
          module: 'tickets',
          name: 'Tickets reviewers',
          filters: {},
          visibility: SavedFilterVisibility.ROLE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('default visibility = PRIVATE — sharedWith* nulled, sharedById null', async () => {
      prisma.savedFilter.create.mockResolvedValue({});
      await service.create(owner, {
        module: 'tickets',
        name: 'Mine',
        filters: {},
      });
      expect(prisma.savedFilter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          visibility: 'PRIVATE',
          sharedWithDepartmentId: null,
          sharedWithRole: null,
          sharedById: null,
        }),
      });
    });

    it('PUBLIC visibility sets sharedById = author', async () => {
      prisma.savedFilter.create.mockResolvedValue({});
      await service.create(owner, {
        module: 'tickets',
        name: 'Public view',
        filters: {},
        visibility: SavedFilterVisibility.PUBLIC,
      });
      expect(prisma.savedFilter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          visibility: 'PUBLIC',
          sharedById: owner.id,
        }),
      });
    });
  });

  describe('share — permissions + audit', () => {
    it('forbids non-author non-admin', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
        module: 'tickets',
        name: 'X',
        visibility: 'PRIVATE',
        sharedById: null,
      });
      await expect(
        service.share('f1', otherDeptUser, {
          visibility: SavedFilterVisibility.PUBLIC,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN to share another user filter', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
        module: 'tickets',
        name: 'X',
        visibility: 'PRIVATE',
        sharedById: null,
      });
      prisma.savedFilter.update.mockResolvedValue({});
      await service.share('f1', adminUser, {
        visibility: SavedFilterVisibility.PUBLIC,
      });
      expect(prisma.savedFilter.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SAVED_FILTER_SHARED' }),
        }),
      );
    });

    it('logs SAVED_FILTER_UNSHARED when reverting to PRIVATE', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
        module: 'tickets',
        name: 'X',
        visibility: 'PUBLIC',
        sharedById: owner.id,
      });
      prisma.savedFilter.update.mockResolvedValue({});
      await service.share('f1', owner, {
        visibility: SavedFilterVisibility.PRIVATE,
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SAVED_FILTER_UNSHARED' }),
        }),
      );
    });

    it('does not log when staying PRIVATE -> PRIVATE', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
        module: 'tickets',
        name: 'X',
        visibility: 'PRIVATE',
        sharedById: null,
      });
      prisma.savedFilter.update.mockResolvedValue({});
      await service.share('f1', owner, {
        visibility: SavedFilterVisibility.PRIVATE,
      });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('throws NotFound on missing filter', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue(null);
      await expect(
        service.share('missing', owner, {
          visibility: SavedFilterVisibility.PUBLIC,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects DEPARTMENT visibility without sharedWithDepartmentId', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
        module: 'tickets',
        name: 'X',
        visibility: 'PRIVATE',
        sharedById: null,
      });
      await expect(
        service.share('f1', owner, {
          visibility: SavedFilterVisibility.DEPARTMENT,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove — permissions', () => {
    it('forbids non-author non-admin', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
      });
      await expect(service.remove('f1', otherDeptUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows author', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
      });
      prisma.savedFilter.delete.mockResolvedValue({});
      await service.remove('f1', owner);
      expect(prisma.savedFilter.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('allows ADMIN to delete any filter', async () => {
      prisma.savedFilter.findUnique.mockResolvedValue({
        id: 'f1',
        userId: owner.id,
      });
      prisma.savedFilter.delete.mockResolvedValue({});
      await service.remove('f1', adminUser);
      expect(prisma.savedFilter.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });
  });
});
