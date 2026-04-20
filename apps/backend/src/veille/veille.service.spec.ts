import { Test, TestingModule } from '@nestjs/testing';
import { VeilleService } from './veille.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('VeilleService', () => {
  let service: VeilleService;
  let prisma: any;

  const mockVeilleItem = {
    id: 'veille-1',
    title: 'Vulnérabilité FortiGate CVE-2026-1234',
    description: 'Critical vulnerability in FortiOS',
    sourceUrl: 'https://cert.ssi.gouv.fr/alerte/1',
    sourceName: 'CERT-FR Alertes',
    publishedAt: new Date(),
    severity: 'CRITICAL',
    cveId: 'CVE-2026-1234',
    isProcessed: false,
    bulletinId: null,
    acks: [],
  };

  const mockBulletin = {
    id: 'bulletin-1',
    title: 'Bulletin Cybersécurité — Semaine du 30/03/2026 au 06/04/2026',
    weekStart: new Date('2026-03-30'),
    weekEnd: new Date('2026-04-06'),
    content: '<div>HTML content</div>',
    itemCount: 3,
    isPublished: true,
    publishedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      veilleItem: {
        findMany: jest.fn().mockResolvedValue([mockVeilleItem]),
        findUnique: jest.fn().mockResolvedValue(mockVeilleItem),
        count: jest.fn().mockResolvedValue(1),
        upsert: jest.fn().mockResolvedValue(mockVeilleItem),
        update: jest.fn().mockResolvedValue(mockVeilleItem),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      veilleAck: {
        upsert: jest.fn().mockResolvedValue({
          id: 'ack-1',
          veilleItemId: 'veille-1',
          userId: 'user-1',
          action: 'APPLIED',
          user: { id: 'user-1', firstName: 'Test', lastName: 'User' },
        }),
      },
      veilleBulletin: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockBulletin]),
        create: jest.fn().mockResolvedValue(mockBulletin),
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeilleService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get<VeilleService>(VeilleService);
  });

  describe('findAll', () => {
    it('should return paginated veille items', async () => {
      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should filter by isProcessed', async () => {
      await service.findAll({ isProcessed: false });
      expect(prisma.veilleItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isProcessed: false }),
        }),
      );
    });

    it('should filter by search term across title, description, and cveId', async () => {
      await service.findAll({ search: 'FortiGate' });
      expect(prisma.veilleItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'FortiGate', mode: 'insensitive' } },
              { description: { contains: 'FortiGate', mode: 'insensitive' } },
              { cveId: { contains: 'FortiGate', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should use default pagination of page 1, limit 30', async () => {
      await service.findAll({});
      expect(prisma.veilleItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 30,
        }),
      );
    });
  });

  describe('isRelevantToParc', () => {
    it('should match FortiGate', () => {
      expect(service.isRelevantToParc('Vulnerability in FortiGate firewall')).toBe(true);
    });

    it('should match VMware', () => {
      expect(service.isRelevantToParc('VMware vSphere update available')).toBe(true);
    });

    it('should match ESXi', () => {
      expect(service.isRelevantToParc('Critical ESXi vulnerability')).toBe(true);
    });

    it('should match Microsoft products', () => {
      expect(service.isRelevantToParc('Microsoft Exchange zero-day')).toBe(true);
    });

    it('should match Veeam', () => {
      expect(service.isRelevantToParc('Veeam backup vulnerability')).toBe(true);
    });

    it('should match ESET', () => {
      expect(service.isRelevantToParc('ESET NOD32 update')).toBe(true);
    });

    it('should match Cisco/Meraki', () => {
      expect(service.isRelevantToParc('Cisco Meraki firmware update')).toBe(true);
    });

    it('should match PostgreSQL', () => {
      expect(service.isRelevantToParc('PostgreSQL security patch')).toBe(true);
    });

    it('should match nginx', () => {
      expect(service.isRelevantToParc('nginx HTTP/2 vulnerability')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(service.isRelevantToParc('FORTIGATE CRITICAL ALERT')).toBe(true);
    });

    it('should not match unrelated products', () => {
      expect(service.isRelevantToParc('Oracle Database patch')).toBe(false);
    });

    it('should not match empty string', () => {
      expect(service.isRelevantToParc('')).toBe(false);
    });
  });

  describe('generateWeeklyBulletin', () => {
    it('should create a new bulletin for the week', async () => {
      const weekStart = new Date('2026-03-30');
      prisma.veilleItem.findMany.mockResolvedValue([
        { ...mockVeilleItem, severity: 'CRITICAL', title: 'FortiGate CVE', description: 'FortiOS vuln' },
        { ...mockVeilleItem, id: 'veille-2', severity: 'HIGH', title: 'VMware update', description: 'ESXi patch' },
      ]);

      const result = await service.generateWeeklyBulletin(weekStart);
      expect(prisma.veilleBulletin.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            weekStart,
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
      expect(result).toEqual(mockBulletin);
    });

    it('should return existing bulletin if one exists for the week', async () => {
      const weekStart = new Date('2026-03-30');
      prisma.veilleBulletin.findUnique.mockResolvedValue(mockBulletin);

      const result = await service.generateWeeklyBulletin(weekStart);
      expect(result).toEqual(mockBulletin);
      expect(prisma.veilleBulletin.create).not.toHaveBeenCalled();
    });

    it('should filter items relevant to OMNITECH parc', async () => {
      const weekStart = new Date('2026-03-30');
      prisma.veilleItem.findMany.mockResolvedValue([
        { ...mockVeilleItem, title: 'FortiGate CVE', description: 'FortiOS vuln', severity: 'CRITICAL' },
        { ...mockVeilleItem, id: 'veille-2', title: 'Oracle patch', description: 'Oracle DB update', severity: 'HIGH' },
      ]);

      await service.generateWeeklyBulletin(weekStart);

      // Only FortiGate item is relevant, so itemCount should be 1
      expect(prisma.veilleBulletin.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemCount: 1,
          }),
        }),
      );
    });

    it('should generate HTML content in the bulletin', async () => {
      const weekStart = new Date('2026-03-30');
      prisma.veilleItem.findMany.mockResolvedValue([mockVeilleItem]);

      await service.generateWeeklyBulletin(weekStart);

      const createCall = prisma.veilleBulletin.create.mock.calls[0][0];
      expect(createCall.data.content).toContain('Bulletin Cybersécurité OMNITECH');
      expect(createCall.data.content).toContain('ISO 27001');
    });

    it('should link relevant items to the bulletin', async () => {
      const weekStart = new Date('2026-03-30');
      prisma.veilleItem.findMany.mockResolvedValue([mockVeilleItem]);

      await service.generateWeeklyBulletin(weekStart);

      expect(prisma.veilleItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['veille-1'] } },
        }),
      );
    });
  });

  describe('getBulletins', () => {
    it('should return paginated published bulletins', async () => {
      const result = await service.getBulletins();
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should use custom pagination', async () => {
      await service.getBulletins(2, 5);
      expect(prisma.veilleBulletin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });

    it('should only return published bulletins', async () => {
      await service.getBulletins();
      expect(prisma.veilleBulletin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isPublished: true },
        }),
      );
    });
  });

  describe('getBulletinById', () => {
    it('should return bulletin with items', async () => {
      prisma.veilleBulletin.findUnique.mockResolvedValue({
        ...mockBulletin,
        items: [mockVeilleItem],
      });
      const result = await service.getBulletinById('bulletin-1');
      expect(result.title).toContain('Bulletin');
      expect(result.items).toHaveLength(1);
    });

    it('should throw NotFoundException for missing bulletin', async () => {
      prisma.veilleBulletin.findUnique.mockResolvedValue(null);
      await expect(service.getBulletinById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge a veille item', async () => {
      const result = await service.acknowledge('veille-1', 'user-1', 'APPLIED', 'Done');
      expect(prisma.veilleAck.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { veilleItemId_userId: { veilleItemId: 'veille-1', userId: 'user-1' } },
          create: expect.objectContaining({
            veilleItemId: 'veille-1',
            userId: 'user-1',
            action: 'APPLIED',
            comment: 'Done',
          }),
        }),
      );
    });

    it('should mark item as processed for definitive actions', async () => {
      await service.acknowledge('veille-1', 'user-1', 'APPLIED');
      expect(prisma.veilleItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'veille-1' },
          data: { isProcessed: true },
        }),
      );
    });

    it('should not mark item as processed for non-definitive actions', async () => {
      await service.acknowledge('veille-1', 'user-1', 'NOTED');
      expect(prisma.veilleItem.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent item', async () => {
      prisma.veilleItem.findUnique.mockResolvedValue(null);
      await expect(
        service.acknowledge('bad-id', 'user-1', 'APPLIED'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return veille statistics', async () => {
      prisma.veilleItem.count
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(6)   // unprocessed
        .mockResolvedValueOnce(4);  // processed
      prisma.veilleItem.groupBy.mockResolvedValue([
        { severity: 'CRITICAL', _count: 2 },
        { severity: 'HIGH', _count: 4 },
      ]);

      const result = await service.getStats();
      expect(result.total).toBe(10);
      expect(result.unprocessed).toBe(6);
      expect(result.processed).toBe(4);
    });
  });
});
