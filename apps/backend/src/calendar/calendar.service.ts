import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/create-event.dto';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    departmentId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 200);

    const where: any = { deletedAt: null };

    if (filters.dateFrom) {
      where.startDate = { ...(where.startDate || {}), gte: new Date(filters.dateFrom) };
    }
    if (filters.dateTo) {
      where.startDate = { ...(where.startDate || {}), lte: new Date(filters.dateTo) };
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.departmentId) {
      where.departmentId = filters.departmentId;
    }

    const [data, total] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true, code: true } },
        },
        orderBy: { startDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.calendarEvent.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUpcoming(days = 7) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 3600000);

    return this.prisma.calendarEvent.findMany({
      where: {
        deletedAt: null,
        startDate: { gte: now, lte: future },
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 50,
    });
  }

  async create(dto: CreateCalendarEventDto, userId: string) {
    return this.prisma.calendarEvent.create({
      data: {
        title: dto.title,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        allDay: dto.allDay ?? false,
        category: dto.category || 'GENERAL',
        location: dto.location,
        createdById: userId,
        departmentId: dto.departmentId || undefined,
        isRecurring: dto.isRecurring ?? false,
        recurrence: dto.recurrence,
        color: dto.color,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCalendarEventDto, userId: string, userRole: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event || event.deletedAt) throw new NotFoundException('Événement introuvable');

    const isAdmin = ROLE_HIERARCHY[userRole as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN];
    if (event.createdById !== userId && !isAdmin) {
      throw new ForbiddenException('Seul le créateur ou un administrateur peut modifier cet événement');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.allDay !== undefined) data.allDay = dto.allDay;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId || null;
    if (dto.isRecurring !== undefined) data.isRecurring = dto.isRecurring;
    if (dto.recurrence !== undefined) data.recurrence = dto.recurrence;
    if (dto.color !== undefined) data.color = dto.color;

    return this.prisma.calendarEvent.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async delete(id: string, userId: string, userRole: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event || event.deletedAt) throw new NotFoundException('Événement introuvable');

    const isAdmin = ROLE_HIERARCHY[userRole as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN];
    if (event.createdById !== userId && !isAdmin) {
      throw new ForbiddenException('Seul le créateur ou un administrateur peut supprimer cet événement');
    }

    // Soft delete
    return this.prisma.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
