import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundException } from '@nestjs/common';

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: any;

  const mockTicket = {
    id: 'ticket-1',
    reference: 'TK-00001',
    title: 'Test ticket',
    description: 'Test description',
    category: 'INCIDENT',
    priority: 'MEDIUM',
    status: 'OPEN',
    creatorId: 'user-1',
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    creator: { id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@omnitech.fr' },
    assignee: null,
    _count: { comments: 0 },
  };

  const adminUser = { id: 'admin-1', role: 'ADMIN' };
  const collaborateurUser = { id: 'user-1', role: 'COLLABORATEUR' };

  beforeEach(async () => {
    prisma = {
      ticket: {
        findMany: jest.fn().mockResolvedValue([mockTicket]),
        findUnique: jest.fn().mockResolvedValue(mockTicket),
        create: jest.fn().mockResolvedValue(mockTicket),
        update: jest.fn().mockResolvedValue(mockTicket),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      ticketComment: {
        create: jest.fn().mockResolvedValue({
          id: 'comment-1',
          content: 'test',
          author: { id: 'user-1', firstName: 'Test', lastName: 'User', role: 'COLLABORATEUR' },
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', departmentId: null }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  describe('findAll', () => {
    it('should return paginated tickets', async () => {
      const result = await service.findAll({}, adminUser);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should filter by status', async () => {
      await service.findAll({ status: 'OPEN' }, adminUser);
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'OPEN' }),
        }),
      );
    });

    it('should filter by priority', async () => {
      await service.findAll({ priority: 'HIGH' }, adminUser);
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ priority: 'HIGH' }),
        }),
      );
    });

    it('should restrict collaborateur to own tickets + assigned + department', async () => {
      await service.findAll({}, collaborateurUser);
      // Le nouveau scoping : creatorId OR assigneeId OR departmentId
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ creatorId: 'user-1' }),
            ]),
          }),
        }),
      );
    });

    it('should add SLA info to tickets', async () => {
      const result = await service.findAll({}, adminUser);
      expect(result.data[0]).toHaveProperty('sla');
      expect(result.data[0].sla).toHaveProperty('deadline');
      expect(result.data[0].sla).toHaveProperty('isOverdue');
      expect(result.data[0].sla).toHaveProperty('remainingHours');
    });
  });

  describe('findById', () => {
    it('should return ticket with comments', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...mockTicket,
        comments: [],
      });
      const result = await service.findById('ticket-1');
      expect(result.reference).toBe('TK-00001');
    });

    it('should throw NotFoundException for missing ticket', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should filter internal comments for non-admin users', async () => {
      await service.findById('ticket-1', { id: 'user-1', role: 'COLLABORATEUR' });
      expect(prisma.ticket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            comments: expect.objectContaining({
              where: { isInternal: false },
            }),
          }),
        }),
      );
    });

    it('should show internal comments for admin users', async () => {
      await service.findById('ticket-1', { id: 'admin-1', role: 'ADMIN' });
      expect(prisma.ticket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            comments: expect.objectContaining({
              where: {},
            }),
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should create ticket with auto-generated reference', async () => {
      prisma.ticket.count.mockResolvedValue(5);
      await service.create(
        { title: 'New ticket', description: 'Description', category: 'INCIDENT', priority: 'HIGH' },
        'user-1',
      );
      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reference: 'TK-00006',
            title: 'New ticket',
            description: 'Description',
            category: 'INCIDENT',
            priority: 'HIGH',
            creatorId: 'user-1',
          }),
        }),
      );
    });

    it('should use default category and priority when not provided', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      await service.create(
        { title: 'Minimal ticket', description: 'Desc' },
        'user-1',
      );
      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'OTHER',
            priority: 'MEDIUM',
          }),
        }),
      );
    });
  });

  describe('addComment', () => {
    it('should add comment to existing ticket', async () => {
      const result = await service.addComment('ticket-1', 'Test comment', 'user-1', false);
      expect(prisma.ticketComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 'ticket-1',
            authorId: 'user-1',
            content: 'Test comment',
            isInternal: false,
          }),
        }),
      );
    });

    it('should add internal comment', async () => {
      await service.addComment('ticket-1', 'Internal note', 'user-1', true, 'REVIEWER');
      expect(prisma.ticketComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isInternal: true,
          }),
        }),
      );
    });

    it('should throw for non-existent ticket', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(
        service.addComment('bad-id', 'test', 'user-1', false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update ticket status', async () => {
      await service.update('ticket-1', { status: 'IN_PROGRESS' }, 'user-1');
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
    });

    it('should set resolvedAt when status is RESOLVED', async () => {
      await service.update('ticket-1', { status: 'RESOLVED' }, 'user-1');
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolvedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should set closedAt when status is CLOSED', async () => {
      await service.update('ticket-1', { status: 'CLOSED' }, 'user-1');
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CLOSED',
            closedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw NotFoundException for missing ticket', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(
        service.update('bad-id', { status: 'CLOSED' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update assignee', async () => {
      await service.update('ticket-1', { assigneeId: 'user-2' }, 'user-1');
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assigneeId: 'user-2' }),
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should return ticket statistics', async () => {
      prisma.ticket.count
        .mockResolvedValueOnce(3)  // open
        .mockResolvedValueOnce(2)  // inProgress
        .mockResolvedValueOnce(5); // resolved
      prisma.ticket.groupBy.mockResolvedValue([
        { priority: 'HIGH', _count: 2 },
        { priority: 'MEDIUM', _count: 3 },
      ]);

      const result = await service.getStats();
      expect(result.open).toBe(3);
      expect(result.inProgress).toBe(2);
      expect(result.resolved).toBe(5);
    });

    it('should return byPriority as an object', async () => {
      prisma.ticket.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.ticket.groupBy.mockResolvedValue([
        { priority: 'CRITICAL', _count: 1 },
      ]);

      const result = await service.getStats();
      expect(result.byPriority).toEqual({ CRITICAL: 1 });
    });
  });

  describe('SLA calculation', () => {
    it('should mark CRITICAL ticket as overdue after 4 hours', async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 3600000);
      const criticalTicket = {
        ...mockTicket,
        priority: 'CRITICAL',
        status: 'OPEN',
        createdAt: fiveHoursAgo,
      };
      prisma.ticket.findMany.mockResolvedValue([criticalTicket]);
      prisma.ticket.count.mockResolvedValue(1);

      const result = await service.findAll({}, adminUser);
      expect(result.data[0].sla.isOverdue).toBe(true);
      expect(result.data[0].sla.hours).toBe(4);
    });

    it('should NOT mark MEDIUM ticket as overdue within 24 hours', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
      const mediumTicket = {
        ...mockTicket,
        priority: 'MEDIUM',
        status: 'OPEN',
        createdAt: twoHoursAgo,
      };
      prisma.ticket.findMany.mockResolvedValue([mediumTicket]);
      prisma.ticket.count.mockResolvedValue(1);

      const result = await service.findAll({}, adminUser);
      expect(result.data[0].sla.isOverdue).toBe(false);
      expect(result.data[0].sla.hours).toBe(24);
      expect(result.data[0].sla.remainingHours).toBeGreaterThan(0);
    });

    it('should NOT mark RESOLVED ticket as overdue even if past SLA', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600000);
      const resolvedTicket = {
        ...mockTicket,
        priority: 'LOW',
        status: 'RESOLVED',
        createdAt: tenDaysAgo,
      };
      prisma.ticket.findMany.mockResolvedValue([resolvedTicket]);
      prisma.ticket.count.mockResolvedValue(1);

      const result = await service.findAll({}, adminUser);
      expect(result.data[0].sla.isOverdue).toBe(false);
    });

    it('should set SLA deadline based on priority hours', async () => {
      const now = new Date();
      const highTicket = {
        ...mockTicket,
        priority: 'HIGH',
        status: 'OPEN',
        createdAt: now,
      };
      prisma.ticket.findMany.mockResolvedValue([highTicket]);
      prisma.ticket.count.mockResolvedValue(1);

      const result = await service.findAll({}, adminUser);
      const deadline = new Date(result.data[0].sla.deadline);
      const expectedDeadline = new Date(now.getTime() + 8 * 3600000);
      // Allow 1 second tolerance
      expect(Math.abs(deadline.getTime() - expectedDeadline.getTime())).toBeLessThan(1000);
    });
  });

  describe('role-based access', () => {
    it('should allow ADMIN to see all tickets without restriction', async () => {
      await service.findAll({}, adminUser);
      const callArgs = prisma.ticket.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeUndefined();
    });

    it('should restrict COLLABORATEUR to own/assigned/department tickets', async () => {
      const collabWithDept = { id: 'user-1', role: 'COLLABORATEUR', departmentId: 'dept-1' };
      await service.findAll({}, collabWithDept);
      const callArgs = prisma.ticket.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual(
        expect.arrayContaining([
          { creatorId: 'user-1' },
          { assigneeId: 'user-1' },
          { departmentId: 'dept-1' },
        ]),
      );
    });

    it('should not include departmentId clause if collaborateur has no department', async () => {
      const collabNoDept = { id: 'user-1', role: 'COLLABORATEUR', departmentId: null };
      await service.findAll({}, collabNoDept);
      const callArgs = prisma.ticket.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toHaveLength(2);
      expect(callArgs.where.OR).toEqual(
        expect.arrayContaining([
          { creatorId: 'user-1' },
          { assigneeId: 'user-1' },
        ]),
      );
    });
  });
});
