import { Test, TestingModule } from '@nestjs/testing';
import { IsoControlsController } from './iso-controls.controller';
import { IsoControlsService } from './iso-controls.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

/**
 * Tests ISO controls controller :
 *  (a) findAll/getDomains/findById → délégation au service
 *  (b) RBAC : create/update/remove requièrent SUPER_ADMIN
 *  (c) findById input invalide géré par ParseUUIDPipe (testé indirectement)
 */
describe('IsoControlsController', () => {
  let controller: IsoControlsController;
  let service: any;
  let reflector: Reflector;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'iso-1', code: 'A.5.1', title: 'Politique', domain: 'A.5' },
      ]),
      getDomains: jest
        .fn()
        .mockResolvedValue([{ code: 'A.5', name: 'Politique organisationnelle' }]),
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'iso-1', code: 'A.5.1', title: 'Politique' }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'iso-new', code: 'A.5.99', title: 'New' }),
      update: jest.fn().mockResolvedValue({ id: 'iso-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IsoControlsController],
      providers: [
        { provide: IsoControlsService, useValue: service },
        Reflector,
      ],
    }).compile();

    controller = module.get<IsoControlsController>(IsoControlsController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('findAll/getDomains (happy path — auth)', () => {
    it('returns all ISO controls (no domain filter)', async () => {
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toHaveLength(1);
    });

    it('returns ISO controls filtered by domain', async () => {
      await controller.findAll('A.5');
      expect(service.findAll).toHaveBeenCalledWith('A.5');
    });

    it('returns domains list', async () => {
      const result = await controller.getDomains();
      expect(result).toHaveLength(1);
    });
  });

  describe('findById (input)', () => {
    it('forwards id to service', async () => {
      await controller.findById('11111111-1111-1111-1111-111111111111');
      expect(service.findById).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
      );
    });
  });

  describe('RBAC metadata (autorisation refusée hors SUPER_ADMIN)', () => {
    it('create requires SUPER_ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.create);
      expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });

    it('update requires SUPER_ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.update);
      expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });

    it('remove requires SUPER_ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.remove);
      expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });
  });

  describe('create (input + délégation)', () => {
    it('forwards body to service', async () => {
      await controller.create({
        code: 'A.5.99',
        title: 'New',
        domain: 'A.5',
        description: 'Test',
      });
      expect(service.create).toHaveBeenCalledWith({
        code: 'A.5.99',
        title: 'New',
        domain: 'A.5',
        description: 'Test',
      });
    });
  });

  describe('update', () => {
    it('forwards id+partial body to service', async () => {
      await controller.update('11111111-1111-1111-1111-111111111111', {
        title: 'Updated',
      });
      expect(service.update).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        { title: 'Updated' },
      );
    });
  });

  describe('remove', () => {
    it('forwards id to service', async () => {
      await controller.remove('11111111-1111-1111-1111-111111111111');
      expect(service.remove).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
      );
    });
  });
});
