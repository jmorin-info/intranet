import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/create-event.dto';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';
import { buildICal, ICalEvent } from './ical.util';

/**
 * Mapping date metier ticket -> couleur + libelle (FR) pour les evenements
 * synchronises vers le calendrier individuel de l'assigne.
 */
const TICKET_DATE_FIELDS = {
  dueDate: { label: 'Echeance', color: '#dc2626' }, // red
  deployedAt: { label: 'Deploiement realise', color: '#16a34a' }, // green
  clientShipmentDate: { label: 'Envoi client', color: '#2563eb' }, // blue
  materialReceivedDate: { label: 'Reception materiel', color: '#d97706' }, // amber
  deploymentScheduledFor: { label: 'Deploiement programme', color: '#7c3aed' }, // violet
} as const;

export type TicketDateField = keyof typeof TICKET_DATE_FIELDS;

const TICKET_SOURCE_TYPE = 'TICKET';

const SUBSCRIPTION_TOKEN_DAYS = 30;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

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

  // ==========================================================================
  // Synchronisation tickets -> calendrier individuel (P1.10)
  // ==========================================================================

  /**
   * Synchronise les dates metier d'un ticket vers le calendrier de l'assigne.
   *
   * Idempotent : pour chaque champ date renseigne, upsert un CalendarEvent
   * keyed sur (sourceType=TICKET, sourceId="ticketId:fieldName"). Si la date
   * est null, l'event correspondant est soft-deleted. Si l'assigne change
   * (oldAssigneeId fourni), tous les events lies au ticket sont reassignes
   * vers le nouvel utilisateur (userId).
   */
  async syncFromTicket(
    ticket: {
      id: string;
      reference: string;
      title: string;
      assigneeId: string | null;
      dueDate?: Date | null;
      clientShipmentDate?: Date | null;
      materialReceivedDate?: Date | null;
      deployedAt?: Date | null;
      deploymentScheduledFor?: Date | null;
    },
    oldAssigneeId?: string | null,
  ): Promise<void> {
    try {
      // Si l'assigne a change : reattribuer tous les events TICKET du ticket
      // au nouvel utilisateur (ou null si plus d'assigne).
      if (oldAssigneeId !== undefined && oldAssigneeId !== ticket.assigneeId) {
        await this.prisma.calendarEvent.updateMany({
          where: {
            sourceType: TICKET_SOURCE_TYPE,
            sourceId: { startsWith: `${ticket.id}:` },
            deletedAt: null,
          },
          data: { userId: ticket.assigneeId },
        });
      }

      const fields = Object.keys(TICKET_DATE_FIELDS) as TicketDateField[];
      for (const field of fields) {
        const value = ticket[field];
        const sourceId = `${ticket.id}:${field}`;
        const meta = TICKET_DATE_FIELDS[field];

        const existing = await this.prisma.calendarEvent.findFirst({
          where: { sourceType: TICKET_SOURCE_TYPE, sourceId },
        });

        if (!value) {
          // Date deleted -> soft-delete event si present
          if (existing && !existing.deletedAt) {
            await this.prisma.calendarEvent.update({
              where: { id: existing.id },
              data: { deletedAt: new Date() },
            });
          }
          continue;
        }

        const startDate = new Date(value);
        const title = `[${ticket.reference}] ${meta.label} — ${ticket.title}`;
        const description = `Ticket ${ticket.reference}\n${meta.label}`;

        if (existing) {
          await this.prisma.calendarEvent.update({
            where: { id: existing.id },
            data: {
              title,
              description,
              startDate,
              allDay: true,
              color: meta.color,
              userId: ticket.assigneeId,
              deletedAt: null,
            },
          });
        } else {
          // createdById = assigneeId si dispo, sinon on saute (besoin d'un user
          // pour la FK NOT NULL). Si pas d'assigne, pas d'event individuel.
          if (!ticket.assigneeId) continue;
          await this.prisma.calendarEvent.create({
            data: {
              title,
              description,
              startDate,
              allDay: true,
              category: 'GENERAL',
              color: meta.color,
              createdById: ticket.assigneeId,
              userId: ticket.assigneeId,
              sourceType: TICKET_SOURCE_TYPE,
              sourceId,
            },
          });
        }
      }
    } catch (err) {
      this.logger.warn(
        `syncFromTicket failed for ticket ${ticket.id}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  // ==========================================================================
  // Abonnement iCal (Outlook / Google) (P1.10)
  // ==========================================================================

  /**
   * Mint un token d'abonnement iCal valable 30 jours pour l'utilisateur.
   * Si un token actif existe deja, on le retourne (idempotent).
   */
  async getOrCreateSubscriptionToken(userId: string): Promise<{ token: string; expiresAt: Date; url?: string }> {
    const now = new Date();
    const existing = await this.prisma.calendarSubscriptionToken.findFirst({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'desc' },
    });
    if (existing) {
      return { token: existing.token, expiresAt: existing.expiresAt };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_TOKEN_DAYS * 24 * 3600 * 1000);
    const created = await this.prisma.calendarSubscriptionToken.create({
      data: { userId, token, expiresAt },
    });
    return { token: created.token, expiresAt: created.expiresAt };
  }

  /**
   * Genere un fichier iCal pour un token donne. Lance NotFoundException si
   * le token est invalide ou expire (pas d'auth applicative — l'unique
   * autorisation est la connaissance du token).
   */
  async exportIcsByToken(token: string, calendarBaseUrl?: string): Promise<{ ics: string; filename: string }> {
    const tokenRow = await this.prisma.calendarSubscriptionToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!tokenRow) throw new NotFoundException('Token invalide');
    if (tokenRow.expiresAt < new Date()) {
      throw new NotFoundException('Token expire');
    }

    const userId = tokenRow.userId;

    // Evenements personnels de l'utilisateur :
    //  - tous les CalendarEvent createdBy = user (events partages crees par lui)
    //  - tous les CalendarEvent userId = user (events lies aux tickets)
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        deletedAt: null,
        OR: [{ createdById: userId }, { userId }],
      },
      orderBy: { startDate: 'asc' },
      take: 1000,
    });

    const icalEvents: ICalEvent[] = events.map((e: any) => ({
      uid: `${e.id}@omnitech-intranet`,
      summary: e.title,
      description: e.description,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      allDay: e.allDay,
      category: e.category,
      color: e.color,
      url: calendarBaseUrl ? `${calendarBaseUrl}/calendar` : undefined,
    }));

    const fullName = `${tokenRow.user?.firstName ?? ''} ${tokenRow.user?.lastName ?? ''}`.trim();
    const calendarName = `OMNITECH — ${fullName || 'Calendrier'}`;

    const ics = buildICal({
      prodId: '-//OMNITECH Security//Intranet//FR',
      calendarName,
      events: icalEvents,
    });

    const filename = `omnitech-${userId}.ics`;
    return { ics, filename };
  }
}
