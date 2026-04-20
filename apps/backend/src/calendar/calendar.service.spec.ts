import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from './calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('CalendarService', () => {
  let service: CalendarService;
  let prisma: any;

  const mockEvent = {
    id: 'evt-1',
    title: 'Security audit',
    description: 'Annual audit',
    startDate: new Date('2026-05-01T09:00:00Z'),
    endDate: new Date('2026-05-01T17:00:00Z'),
    allDay: false,
    category: 'AUDIT',
    location: 'Salle A',
    createdById: 'user-1',
    departmentId: null,
    isRecurring: false,
    recurrence: null,
    color: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: { id: 'user-1', firstName: 'Jean', lastName: 'Dupont' },
    department: null,
  };

  beforeEach(async () => {
    prisma = {
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([mockEvent]),
        findUnique: jest.fn().mockResolvedValue(mockEvent),
        create: jest.fn().mockResolvedValue(mockEvent),
        update: jest.fn().mockResolvedValue(mockEvent),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
  });

  describe('create', () => {
    it('should create an event with parsed dates', async () => {
      await service.create(
        {
          title: 'Team meeting',
          startDate: '2026-06-15T10:00:00Z',
          endDate: '2026-06-15T11:00:00Z',
          category: 'REUNION',
        },
        'user-1',
      );

      expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Team meeting',
            startDate: expect.any(Date),
            createdById: 'user-1',
          }),
        }),
      );
    });

    it('should default allDay to false', async () => {
      await service.create(
        { title: 'Quick sync', startDate: '2026-06-15T10:00:00Z' },
        'user-1',
      );

      expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ allDay: false }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should apply dateFrom filter', async () => {
      await service.findAll({ dateFrom: '2026-01-01' });

      expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should apply dateTo filter', async () => {
      await service.findAll({ dateTo: '2026-12-31' });

      expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should apply both dateFrom and dateTo', async () => {
      await service.findAll({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });

      expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('should allow the owner to delete', async () => {
      await service.delete('evt-1', 'user-1', 'COLLABORATEUR');

      expect(prisma.calendarEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should allow an ADMIN to delete any event', async () => {
      await service.delete('evt-1', 'other-user', 'ADMIN');

      expect(prisma.calendarEvent.update).toHaveBeenCalled();
    });

    it('should reject deletion by non-owner non-admin', async () => {
      await expect(
        service.delete('evt-1', 'other-user', 'COLLABORATEUR'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for deleted event', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValueOnce({ ...mockEvent, deletedAt: new Date() });

      await expect(
        service.delete('evt-1', 'user-1', 'COLLABORATEUR'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
