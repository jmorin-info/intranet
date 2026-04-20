import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ROLE_HIERARCHY, UserRole } from '../common/enums';
import { CreateIncidentDto } from './dto/create-incident.dto';
import {
  ChangeStatusDto,
  IncidentStatusValue,
  TimelineEntryDto,
  UpdateIncidentDto,
} from './dto/update-incident.dto';
import { CreateRemediationDto } from './dto/create-remediation.dto';
import { UpdateRemediationDto } from './dto/update-remediation.dto';

/**
 * IncidentsService — Information security incident management
 * (ISO 27001 A.5.24 planning, A.5.25 assessment/decision, A.5.26 response,
 * A.5.27 learning from incidents).
 *
 * Lifecycle:
 *   DETECTED → UNDER_INVESTIGATION → CONTAINED → ERADICATED → RECOVERED → CLOSED
 *
 * Side effects:
 *  - Every mutation is logged via AuditService
 *  - Critical incidents (severity=CRITICAL) push a notification to ADMIN+ users
 *  - Status changes add a STATUS_CHANGE entry in the IncidentTimelineEntry table
 */
@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private isAtLeast(role: UserRole, min: UserRole): boolean {
    return (ROLE_HIERARCHY[role] || 0) >= ROLE_HIERARCHY[min];
  }

  /** Generates the next available INC-YYYY-NNN reference for the current year. */
  private async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;
    const last = await this.prisma.incident.findFirst({
      where: { reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    let next = 1;
    if (last?.reference) {
      const tail = last.reference.substring(prefix.length);
      const n = parseInt(tail, 10);
      if (!Number.isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(3, '0')}`;
  }

  private userSelect() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      department: { select: { id: true, name: true, code: true } },
    };
  }

  /** Notifies ADMIN+ users when a critical incident is declared. */
  private async notifyCritical(
    incidentId: string,
    reference: string,
    title: string,
  ): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
        },
        select: { id: true },
      });
      await Promise.all(
        admins.map((a) =>
          this.notifications.create({
            userId: a.id,
            type: 'SECURITY_ALERT',
            title: `Incident critique — ${reference}`,
            body: title,
            resourceType: 'incident',
            resourceId: incidentId,
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`Failed to notify admins of critical incident: ${err}`);
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  async findAll(
    filters: {
      status?: string;
      severity?: string;
      category?: string;
      assignedToId?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
    user: { id: string; role: UserRole },
  ) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.IncidentWhereInput = { deletedAt: null };

    const validStatuses = Object.values(IncidentStatus) as string[];
    const validSeverities = Object.values(IncidentSeverity) as string[];
    const validCategories = Object.values(IncidentCategory) as string[];
    if (filters.status && validStatuses.includes(filters.status)) where.status = filters.status as IncidentStatus;
    if (filters.severity && validSeverities.includes(filters.severity)) where.severity = filters.severity as IncidentSeverity;
    if (filters.category && validCategories.includes(filters.category)) where.category = filters.category as IncidentCategory;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;

    if (filters.dateFrom || filters.dateTo) {
      where.detectedAt = {};
      if (filters.dateFrom) (where.detectedAt as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
      if (filters.dateTo) (where.detectedAt as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
    }

    if (filters.search && filters.search.trim().length > 0) {
      const q = filters.search.trim();
      where.OR = [
        { reference: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Role-based scope: COLLABORATEUR/PRESTATAIRE sees only incidents they
    // reported or were assigned to. REVIEWER+ sees everything.
    if (!this.isAtLeast(user.role, UserRole.REVIEWER)) {
      where.AND = [
        {
          OR: [{ reporterId: user.id }, { assignedToId: user.id }],
        },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        orderBy: [{ detectedAt: 'desc' }],
        skip,
        take: limit,
        include: {
          reporter: { select: this.userSelect() },
          assignedTo: { select: this.userSelect() },
          _count: { select: { remediations: true, timeline: true } },
        },
      }),
    ]);

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findById(id: string, user: { id: string; role: UserRole }) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, deletedAt: null },
      include: {
        reporter: { select: this.userSelect() },
        assignedTo: { select: this.userSelect() },
        remediations: {
          orderBy: [{ createdAt: 'asc' }],
          include: { responsible: { select: this.userSelect() } },
        },
        timeline: {
          orderBy: [{ createdAt: 'asc' }],
          include: { author: { select: this.userSelect() } },
        },
      },
    });
    if (!incident) throw new NotFoundException('Incident introuvable');

    if (!this.isAtLeast(user.role, UserRole.REVIEWER)) {
      const allowed =
        incident.reporterId === user.id || incident.assignedToId === user.id;
      if (!allowed) {
        throw new ForbiddenException("Vous n'avez pas accès à cet incident");
      }
    }

    return incident;
  }

  async create(dto: CreateIncidentDto, userId: string) {
    const reference = await this.generateReference();

    const incident = await this.prisma.incident.create({
      data: {
        reference,
        title: dto.title,
        description: dto.description,
        category: dto.category as IncidentCategory,
        severity: dto.severity as IncidentSeverity,
        status: IncidentStatus.DETECTED,
        reporterId: userId,
        assignedToId: dto.assignedToId || null,
        affectedSystems: dto.affectedSystems || [],
        affectedUsers: dto.affectedUsers || 0,
        impactSummary: dto.impactSummary || null,
        gdprNotifiable: dto.gdprNotifiable || false,
        tags: dto.tags || [],
      },
    });

    await this.prisma.incidentTimelineEntry.create({
      data: {
        incidentId: incident.id,
        authorId: userId,
        entryType: 'STATUS_CHANGE',
        content: `Incident signalé — statut initial DETECTED (sévérité ${dto.severity}).`,
      },
    });

    await this.audit.log({
      userId,
      action: 'INCIDENT_CREATED',
      resourceType: 'Incident',
      resourceId: incident.id,
      metadata: {
        reference: incident.reference,
        title: incident.title,
        category: incident.category,
        severity: incident.severity,
      },
      severity: dto.severity === 'CRITICAL' ? 'CRITICAL' : 'WARN',
    });

    if (dto.severity === 'CRITICAL') {
      await this.notifyCritical(incident.id, incident.reference, incident.title);
    }

    return incident;
  }

  async update(
    id: string,
    dto: UpdateIncidentDto,
    user: { id: string; role: UserRole },
  ) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Incident introuvable');

    const data: Prisma.IncidentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category as IncidentCategory;
    if (dto.severity !== undefined) data.severity = dto.severity as IncidentSeverity;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    if (dto.affectedSystems !== undefined) data.affectedSystems = dto.affectedSystems;
    if (dto.affectedUsers !== undefined) data.affectedUsers = dto.affectedUsers;
    if (dto.impactSummary !== undefined) data.impactSummary = dto.impactSummary;
    if (dto.rootCause !== undefined) data.rootCause = dto.rootCause;
    if (dto.lessonsLearned !== undefined) data.lessonsLearned = dto.lessonsLearned;
    if (dto.gdprNotifiable !== undefined) data.gdprNotifiable = dto.gdprNotifiable;
    if (dto.cnilReported !== undefined) {
      data.cnilReported = dto.cnilReported;
      if (dto.cnilReported && !existing.cnilReportedAt) {
        data.cnilReportedAt = new Date();
      }
    }
    if (dto.tags !== undefined) data.tags = dto.tags;

    const updated = await this.prisma.incident.update({ where: { id }, data });

    await this.audit.log({
      userId: user.id,
      action: 'INCIDENT_UPDATED',
      resourceType: 'Incident',
      resourceId: id,
      metadata: {
        reference: updated.reference,
        changes: Object.keys(dto),
      },
      severity: 'INFO',
    });

    return updated;
  }

  /**
   * Applies an explicit status transition and records it in the timeline.
   * Also stamps containedAt/resolvedAt/closedAt when relevant.
   */
  async changeStatus(
    id: string,
    dto: ChangeStatusDto,
    user: { id: string; role: UserRole },
  ) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Incident introuvable');

    const newStatus = dto.status as IncidentStatusValue;
    if (existing.status === newStatus) {
      throw new BadRequestException('Le statut est déjà celui demandé');
    }

    const data: Prisma.IncidentUpdateInput = { status: newStatus as IncidentStatus };
    const now = new Date();
    if (newStatus === 'CONTAINED' && !existing.containedAt) data.containedAt = now;
    if (newStatus === 'RECOVERED' && !existing.resolvedAt) data.resolvedAt = now;
    if (newStatus === 'CLOSED' && !existing.closedAt) data.closedAt = now;

    const updated = await this.prisma.incident.update({ where: { id }, data });

    await this.prisma.incidentTimelineEntry.create({
      data: {
        incidentId: id,
        authorId: user.id,
        entryType: 'STATUS_CHANGE',
        content:
          `Statut : ${existing.status} → ${newStatus}` +
          (dto.comment ? `\n${dto.comment}` : ''),
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'INCIDENT_STATUS_CHANGED',
      resourceType: 'Incident',
      resourceId: id,
      metadata: {
        reference: existing.reference,
        from: existing.status,
        to: newStatus,
        comment: dto.comment || null,
      },
      severity: newStatus === 'CLOSED' ? 'INFO' : 'WARN',
    });

    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.incident.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Incident introuvable');

    await this.prisma.incident.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: 'INCIDENT_DELETED',
      resourceType: 'Incident',
      resourceId: id,
      metadata: { reference: existing.reference },
      severity: 'WARN',
    });

    return { success: true };
  }

  async addTimelineEntry(
    id: string,
    dto: TimelineEntryDto,
    user: { id: string; role: UserRole },
  ) {
    // ensure visibility
    await this.findById(id, user);

    const entry = await this.prisma.incidentTimelineEntry.create({
      data: {
        incidentId: id,
        authorId: user.id,
        entryType: dto.entryType || 'COMMENT',
        content: dto.content,
      },
      include: { author: { select: this.userSelect() } },
    });

    await this.audit.log({
      userId: user.id,
      action: 'INCIDENT_COMMENT_ADDED',
      resourceType: 'Incident',
      resourceId: id,
      metadata: { entryType: entry.entryType },
      severity: 'INFO',
    });

    return entry;
  }

  // -------------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------------

  async getDashboard(user: { id: string; role: UserRole }) {
    const where: Prisma.IncidentWhereInput = { deletedAt: null };
    if (!this.isAtLeast(user.role, UserRole.REVIEWER)) {
      where.OR = [{ reporterId: user.id }, { assignedToId: user.id }];
    }

    const openStatuses: IncidentStatus[] = [
      IncidentStatus.DETECTED,
      IncidentStatus.UNDER_INVESTIGATION,
      IncidentStatus.CONTAINED,
      IncidentStatus.ERADICATED,
    ];

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [open, critical, thisMonth, byCategory, resolvedWithDates] =
      await this.prisma.$transaction([
        this.prisma.incident.count({ where: { ...where, status: { in: openStatuses } } }),
        this.prisma.incident.count({
          where: {
            ...where,
            severity: IncidentSeverity.CRITICAL,
            status: { not: IncidentStatus.CLOSED },
          },
        }),
        this.prisma.incident.count({
          where: { ...where, detectedAt: { gte: startOfMonth } },
        }),
        this.prisma.incident.groupBy({
          by: ['category'],
          where,
          _count: { _all: true },
          orderBy: { category: 'asc' },
        }),
        this.prisma.incident.findMany({
          where: {
            ...where,
            resolvedAt: { not: null },
            detectedAt: {
              gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
            },
          },
          select: { detectedAt: true, resolvedAt: true },
          take: 500,
        }),
      ]);

    // MTTR in hours averaged over the last 90 days
    let mttrHours = 0;
    if (resolvedWithDates.length > 0) {
      const total = resolvedWithDates.reduce((acc, r) => {
        if (!r.resolvedAt) return acc;
        return acc + (r.resolvedAt.getTime() - r.detectedAt.getTime());
      }, 0);
      mttrHours = Math.round(total / resolvedWithDates.length / 3600000);
    }

    return {
      open,
      critical,
      thisMonth,
      mttrHours,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        count: (c._count as { _all: number } | undefined)?._all ?? 0,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Remediations
  // -------------------------------------------------------------------------

  async addRemediation(
    incidentId: string,
    dto: CreateRemediationDto,
    userId: string,
  ) {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, deletedAt: null },
    });
    if (!incident) throw new NotFoundException('Incident introuvable');

    const remediation = await this.prisma.remediation.create({
      data: {
        incidentId,
        title: dto.title,
        description: dto.description || null,
        responsibleId: dto.responsibleId || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        priority: dto.priority || 'MEDIUM',
        status: 'TODO',
      },
      include: { responsible: { select: this.userSelect() } },
    });

    await this.prisma.incidentTimelineEntry.create({
      data: {
        incidentId,
        authorId: userId,
        entryType: 'ACTION',
        content: `Remédiation ajoutée : ${dto.title}`,
      },
    });

    await this.audit.log({
      userId,
      action: 'REMEDIATION_CREATED',
      resourceType: 'Remediation',
      resourceId: remediation.id,
      metadata: {
        incidentId,
        incidentReference: incident.reference,
        title: remediation.title,
        priority: remediation.priority,
      },
      severity: 'INFO',
    });

    // Notify responsible
    if (remediation.responsibleId) {
      try {
        await this.notifications.create({
          userId: remediation.responsibleId,
          type: 'TICKET_ASSIGNED',
          title: `Remédiation assignée — ${incident.reference}`,
          body: remediation.title,
          resourceType: 'incident',
          resourceId: incidentId,
        });
      } catch (err) {
        this.logger.warn(`Notify remediation assignee failed: ${err}`);
      }
    }

    return remediation;
  }

  async updateRemediation(
    remediationId: string,
    dto: UpdateRemediationDto,
    user: { id: string; role: UserRole },
  ) {
    const existing = await this.prisma.remediation.findUnique({
      where: { id: remediationId },
    });
    if (!existing) throw new NotFoundException('Remédiation introuvable');

    const canEdit =
      this.isAtLeast(user.role, UserRole.REVIEWER) ||
      existing.responsibleId === user.id;
    if (!canEdit) {
      throw new ForbiddenException("Vous n'êtes pas autorisé à modifier cette remédiation");
    }

    const data: Prisma.RemediationUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.responsibleId !== undefined) {
      data.responsible = dto.responsibleId
        ? { connect: { id: dto.responsibleId } }
        : { disconnect: true };
    }
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'DONE' && !existing.completedAt) {
        data.completedAt = new Date();
      }
    }
    if (dto.evidence !== undefined) data.evidence = dto.evidence;

    const updated = await this.prisma.remediation.update({
      where: { id: remediationId },
      data,
      include: { responsible: { select: this.userSelect() } },
    });

    await this.audit.log({
      userId: user.id,
      action: 'REMEDIATION_UPDATED',
      resourceType: 'Remediation',
      resourceId: remediationId,
      metadata: {
        incidentId: existing.incidentId,
        changes: Object.keys(dto),
      },
      severity: 'INFO',
    });

    return updated;
  }

  async completeRemediation(
    remediationId: string,
    evidence: string,
    user: { id: string; role: UserRole },
  ) {
    const existing = await this.prisma.remediation.findUnique({
      where: { id: remediationId },
    });
    if (!existing) throw new NotFoundException('Remédiation introuvable');

    const canEdit =
      this.isAtLeast(user.role, UserRole.REVIEWER) ||
      existing.responsibleId === user.id;
    if (!canEdit) {
      throw new ForbiddenException("Vous n'êtes pas autorisé à clôturer cette remédiation");
    }

    if (existing.status === 'DONE') {
      throw new BadRequestException('Remédiation déjà clôturée');
    }

    const updated = await this.prisma.remediation.update({
      where: { id: remediationId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        evidence,
      },
    });

    await this.prisma.incidentTimelineEntry.create({
      data: {
        incidentId: existing.incidentId,
        authorId: user.id,
        entryType: 'EVIDENCE',
        content: `Remédiation terminée : ${existing.title}\nPreuve : ${evidence}`,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'REMEDIATION_COMPLETED',
      resourceType: 'Remediation',
      resourceId: remediationId,
      metadata: {
        incidentId: existing.incidentId,
        title: existing.title,
        evidence,
      },
      severity: 'INFO',
    });

    return updated;
  }
}
