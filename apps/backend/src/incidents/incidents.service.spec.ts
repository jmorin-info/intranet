import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from './incidents.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../common/enums';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: any;

  const adminUser = { id: 'admin-1', role: UserRole.ADMIN };
  const reviewerUser = { id: 'reviewer-1', role: UserRole.REVIEWER };

  const mockIncident = {
    id: 'inc-1',
    reference: 'INC-2026-001',
    title: 'Phishing campaign detected',
    description: 'Multiple employees received phishing emails',
    category: 'PHISHING',
    severity: 'HIGH',
    status: 'DETECTED',
    reporterId: 'admin-1',
    assignedToId: null,
    affectedSystems: [],
    affectedUsers: 0,
    impactSummary: null,
    gdprNotifiable: false,
    cnilReported: false,
    cnilReportedAt: null,
    tags: [],
    detectedAt: new Date(),
    containedAt: null,
    resolvedAt: null,
    closedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reporter: { id: 'admin-1', email: 'admin@omnitech.fr', firstName: 'Admin', lastName: 'User', role: 'ADMIN', department: null },
    assignedTo: null,
    remediations: [],
    timeline: [],
  };

  beforeEach(async () => {
    prisma = {
      incident: {
        findFirst: jest.fn().mockResolvedValue(mockIncident),
        findMany: jest.fn().mockResolvedValue([mockIncident]),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockIncident, ...args.data })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockIncident, ...args.data })),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      incidentTimelineEntry: {
        create: jest.fn().mockResolvedValue({ id: 'timeline-1', entryType: 'STATUS_CHANGE', content: 'test' }),
      },
      remediation: {
        create: jest.fn().mockResolvedValue({
          id: 'rem-1',
          incidentId: 'inc-1',
          title: 'Patch servers',
          status: 'TODO',
          responsibleId: null,
          responsible: null,
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((args) => Promise.all(args)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  describe('create', () => {
    it('should generate a reference in INC-YYYY-NNN format', async () => {
      // No existing incident => next = INC-2026-001
      prisma.incident.findFirst.mockResolvedValueOnce(null);
      prisma.incident.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'new-1', ...args.data }),
      );

      const result = await service.create(
        {
          title: 'Test incident',
          description: 'Description of the test incident',
          category: 'PHISHING' as any,
          severity: 'HIGH' as any,
        },
        'admin-1',
      );

      const year = new Date().getFullYear();
      expect(result.reference).toMatch(new RegExp(`^INC-${year}-\\d{3}$`));
    });

    it('should increment reference based on last existing', async () => {
      const year = new Date().getFullYear();
      prisma.incident.findFirst
        .mockResolvedValueOnce({ reference: `INC-${year}-042` }) // generateReference query
        .mockResolvedValueOnce(mockIncident); // any subsequent query

      prisma.incident.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'new-2', ...args.data }),
      );

      const result = await service.create(
        {
          title: 'Another incident',
          description: 'Another incident description here',
          category: 'MALWARE' as any,
          severity: 'CRITICAL' as any,
        },
        'admin-1',
      );

      expect(result.reference).toBe(`INC-${year}-043`);
    });
  });

  describe('changeStatus', () => {
    it('should allow DETECTED -> UNDER_INVESTIGATION', async () => {
      prisma.incident.findFirst.mockResolvedValueOnce({
        ...mockIncident,
        status: 'DETECTED',
      });

      const result = await service.changeStatus(
        'inc-1',
        { status: 'UNDER_INVESTIGATION' as any },
        adminUser,
      );

      expect(prisma.incident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inc-1' },
          data: expect.objectContaining({ status: 'UNDER_INVESTIGATION' }),
        }),
      );
    });

    it('should stamp closedAt when transitioning to CLOSED', async () => {
      prisma.incident.findFirst.mockResolvedValueOnce({
        ...mockIncident,
        status: 'RECOVERED',
        closedAt: null,
      });

      await service.changeStatus(
        'inc-1',
        { status: 'CLOSED' as any },
        adminUser,
      );

      expect(prisma.incident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CLOSED',
            closedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should reject same-status transition', async () => {
      prisma.incident.findFirst.mockResolvedValueOnce({
        ...mockIncident,
        status: 'DETECTED',
      });

      await expect(
        service.changeStatus('inc-1', { status: 'DETECTED' as any }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent incident', async () => {
      prisma.incident.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.changeStatus('nonexistent', { status: 'CLOSED' as any }, adminUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addRemediation', () => {
    it('should create a remediation and a timeline entry', async () => {
      prisma.incident.findFirst.mockResolvedValueOnce(mockIncident);

      await service.addRemediation(
        'inc-1',
        { title: 'Patch servers', description: 'Apply security patches' },
        'admin-1',
      );

      expect(prisma.remediation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            incidentId: 'inc-1',
            title: 'Patch servers',
            status: 'TODO',
          }),
        }),
      );

      expect(prisma.incidentTimelineEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            incidentId: 'inc-1',
            entryType: 'ACTION',
          }),
        }),
      );
    });

    it('should throw NotFoundException if incident does not exist', async () => {
      prisma.incident.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.addRemediation('nonexistent', { title: 'Fix it' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
