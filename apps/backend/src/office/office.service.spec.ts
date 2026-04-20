import { Test, TestingModule } from '@nestjs/testing';
import { OfficeService } from './office.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';

describe('OfficeService', () => {
  let service: OfficeService;
  let prisma: any;

  // Save original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isEnabled', () => {
    it('should return false when ONLYOFFICE_ENABLED is not set', async () => {
      delete process.env.ONLYOFFICE_ENABLED;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when ONLYOFFICE_ENABLED is "true"', async () => {
      process.env.ONLYOFFICE_ENABLED = 'true';
      process.env.ONLYOFFICE_JWT_SECRET = 'test-secret';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('buildEditorConfig', () => {
    it('should throw NotFoundException for non-existent document', async () => {
      process.env.ONLYOFFICE_ENABLED = 'true';
      process.env.ONLYOFFICE_JWT_SECRET = 'test-secret';

      prisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: prisma },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('token'), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);

      await expect(
        service.buildEditorConfig('nonexistent-id', {
          id: 'user-1',
          email: 'user@omnitech.fr',
          role: 'ADMIN' as any,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for soft-deleted document', async () => {
      process.env.ONLYOFFICE_ENABLED = 'true';
      process.env.ONLYOFFICE_JWT_SECRET = 'test-secret';

      prisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-1',
            deletedAt: new Date(),
            versions: [],
          }),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: prisma },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('token'), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);

      await expect(
        service.buildEditorConfig('doc-1', {
          id: 'user-1',
          email: 'user@omnitech.fr',
          role: 'ADMIN' as any,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('healthCheck', () => {
    it('should return ok:false when service is disabled', async () => {
      delete process.env.ONLYOFFICE_ENABLED;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      const result = await service.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('désactivé');
    });

    it('should return ok:false when fetch fails', async () => {
      process.env.ONLYOFFICE_ENABLED = 'true';
      process.env.ONLYOFFICE_JWT_SECRET = 'test-secret';
      process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = 'http://localhost:99999';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      const result = await service.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });
});
