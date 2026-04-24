import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { MentionsService } from '../mentions/mentions.service';
import { MeilisearchService, MeiliDocument } from '../search/meilisearch.service';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../common/cache/cache.service';
import { RequestUser } from '../common/interfaces';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';
import { sanitizePlainText } from '../common/sanitize';
import { parseEnumFilter, validateEnum } from '../common/validation-helpers';
import { TicketsRepository } from './tickets.repository';
import { AiService } from '../ai/ai.service';

const VALID_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
type TicketStatus = (typeof VALID_TICKET_STATUSES)[number];

const VALID_TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const VALID_TICKET_CATEGORIES = ['INCIDENT', 'REQUEST', 'ACCESS', 'HARDWARE', 'SOFTWARE', 'NETWORK', 'SECURITY', 'OTHER'] as const;

const MAX_PAGE_LIMIT = 100;

// SLA par priorité (en heures)
const SLA_HOURS: Record<string, number> = {
  CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48,
};

// Mapping catégorie → rôle/mot-clé pour suggestion d'assignation
const CATEGORY_ASSIGNEES: Record<string, { role?: string; departmentKeyword?: string; label: string }> = {
  SECURITY: { role: 'ADMIN', departmentKeyword: 'ssi', label: 'RSSI / Équipe SSI' },
  NETWORK: { departmentKeyword: 'réseau', label: 'Équipe réseau' },
  HARDWARE: { departmentKeyword: 'support', label: 'Support IT' },
  SOFTWARE: { departmentKeyword: 'dev', label: 'Équipe développement' },
  ACCESS: { role: 'ADMIN', label: 'Administrateur' },
  OTHER: { role: 'ADMIN', label: 'Administrateur' },
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TicketsRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly cacheService: CacheService,
    @Optional() private readonly mentions?: MentionsService,
    @Optional() private readonly meili?: MeilisearchService,
    @Optional() private readonly aiService?: AiService,
  ) {}

  /**
   * Qualify a freshly-created ticket with AI suggestions (category, priority,
   * tags). Non-blocking: any failure or timeout is logged but does not impact
   * the ticket creation. Stored in AuditLog (action `TICKET_AI_QUALIFICATION`)
   * as a suggestion — the agent can later `Apply` it from the ticket detail UI.
   *
   * Timeout budget: 5s total (the create() caller should not be delayed).
   */
  private async qualifyTicketWithAi(
    ticketId: string,
    userId: string,
    data: { title: string; description: string; category?: string; priority?: string; tags?: string[] },
    autoTags: string[],
  ): Promise<void> {
    if (!this.aiService) return;
    try {
      const analysis = await Promise.race([
        Promise.resolve(this.aiService.analyzeTicket(data.title, data.description, data.category || 'OTHER')),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI qualification timeout')), 5000)),
      ]);

      // Map AiService category labels (FR) → canonical TicketCategory (EN)
      const categoryMap: Record<string, string> = {
        SECURITE: 'SECURITY',
        RESEAU: 'NETWORK',
        MATERIEL: 'HARDWARE',
        LOGICIEL: 'SOFTWARE',
        ACCES: 'ACCESS',
      };
      const suggestedCategory = categoryMap[analysis.suggestedCategory] || analysis.suggestedCategory || 'OTHER';
      const suggestedPriority = analysis.suggestedPriority || 'MEDIUM';

      const userCategory = (data.category || 'OTHER').toUpperCase();
      const userPriority = (data.priority || 'MEDIUM').toUpperCase();

      const differs = {
        category: suggestedCategory !== userCategory,
        priority: suggestedPriority !== userPriority,
      };

      const suggestedTags = autoTags;

      await this.audit.log({
        userId,
        action: 'TICKET_AI_QUALIFICATION',
        resourceType: 'Ticket',
        resourceId: ticketId,
        metadata: {
          aiQualified: true,
          userCategory,
          userPriority,
          suggestedCategory,
          suggestedPriority,
          suggestedTags,
          riskFlags: analysis.riskFlags,
          confidence: analysis.confidence,
          analysis: analysis.analysis,
          differs,
        },
      });
    } catch (err) {
      this.logger.warn(
        `AI qualification failed for ticket ${ticketId}: ${(err as Error)?.message}`,
      );
    }
  }

  /**
   * Retrieve the latest AI qualification suggestion for a given ticket
   * (stored in AuditLog). Returns null when no suggestion is recorded.
   */
  async getAiSuggestion(ticketId: string): Promise<null | {
    suggestedCategory: string;
    suggestedPriority: string;
    suggestedTags: string[];
    riskFlags: string[];
    confidence: number;
    userCategory: string;
    userPriority: string;
    differs: { category: boolean; priority: boolean };
    createdAt: Date;
  }> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        action: 'TICKET_AI_QUALIFICATION',
        resourceType: 'Ticket',
        resourceId: ticketId,
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (!row) return null;
    const meta = (row.metadata as any) || {};
    return {
      suggestedCategory: meta.suggestedCategory || 'OTHER',
      suggestedPriority: meta.suggestedPriority || 'MEDIUM',
      suggestedTags: Array.isArray(meta.suggestedTags) ? meta.suggestedTags : [],
      riskFlags: Array.isArray(meta.riskFlags) ? meta.riskFlags : [],
      confidence: typeof meta.confidence === 'number' ? meta.confidence : 0,
      userCategory: meta.userCategory || 'OTHER',
      userPriority: meta.userPriority || 'MEDIUM',
      differs: meta.differs || { category: false, priority: false },
      createdAt: row.createdAt,
    };
  }

  /** Invalidate dashboard stats cache after ticket mutations. */
  private invalidateDashboardCache(): void {
    void this.cacheService.del('stats:dashboard:global');
  }

  /** Default deployment labels (used when no AppConfig override exists). */
  private static readonly DEFAULT_DEPLOYMENT_LABELS = {
    deployment: {
      types: ['NVR', 'Serveur', 'PC/Poste', 'Switch/Réseau', 'SEAL System', 'Pare-feu'],
      checklist: [
        { id: 'ip_configured', label: 'Adresse IP configurée' },
        { id: 'ad_joined', label: 'Jointure Active Directory' },
        { id: 'windows_deployed', label: 'Windows déployé' },
        { id: 'license_activated', label: 'Licence activée' },
        { id: 'eset_installed', label: 'ESET installé' },
        { id: 'seal_installed', label: 'SEAL installé' },
        { id: 'firmware_updated', label: 'Firmware à jour' },
        { id: 'veeam_configured', label: 'Sauvegarde VEEAM' },
        { id: 'vpn_configured', label: 'VPN configuré' },
        { id: 'tests_passed', label: 'Tests effectués' },
        { id: 'shipped', label: 'Expédié' },
        { id: 'power_supply', label: 'Alimentation vérifiée' },
      ],
      fields: [
        { id: 'serial_number', label: 'Numéro de série', type: 'text' as const },
        { id: 'client_site', label: 'Client / Site', type: 'text' as const },
        { id: 'ip_current', label: 'IP actuelle', type: 'text' as const },
        { id: 'ip_definitive', label: 'IP définitive', type: 'text' as const },
      ],
    },
    labelColors: {
      urgent: '#cc0000',
      securite: '#8b0000',
      reseau: '#2563eb',
      materiel: '#c68200',
      logiciel: '#6366f1',
      acces: '#70916a',
      email: '#0ea5e9',
      sauvegarde: '#7c3aed',
      deploiement: '#0d9488',
      rma: '#f97316',
    } as Record<string, string>,
  };

  /**
   * Return deployment labels + checklist + custom fields configuration.
   * Reads from AppConfig (key `ticket_labels`) if available, otherwise defaults.
   */
  async getLabels() {
    try {
      const row = await this.prisma.appConfig.findUnique({ where: { key: 'ticket_labels' } });
      if (row?.value) {
        return JSON.parse(row.value);
      }
    } catch (err) {
      this.logger.warn(`Failed to read ticket_labels from AppConfig: ${(err as Error)?.message}`);
    }
    return TicketsService.DEFAULT_DEPLOYMENT_LABELS;
  }

  /**
   * Push a ticket to Meilisearch (non-blocking).
   */
  private indexForMeili(ticket: any): void {
    if (!this.meili) return;
    const payload: MeiliDocument = {
      id: `ticket-${ticket.id}`,
      title: `[${ticket.reference}] ${ticket.title ?? ''}`,
      content: ticket.description ?? '',
      type: 'ticket',
      url: `/tickets/${ticket.id}`,
      authorId: ticket.creatorId ?? null,
      date: ticket.createdAt?.toISOString?.() ?? null,
      category: ticket.category ?? null,
      status: ticket.status ?? null,
      reference: ticket.reference ?? null,
      tags: [ticket.category, ticket.priority, ticket.status].filter(Boolean),
    };
    void this.meili.indexOne('ticket', payload).catch((err) =>
      this.logger.warn(`Meilisearch indexation failed for ticket ${ticket.id}: ${err?.message || err}`),
    );
  }

  // ── Space helpers ─────────────────────────────────────────────────

  /**
   * List all active ticket spaces. Optionally filtered by what the current
   * user can access (based on TicketSpaceMember rules).
   */
  async findAllSpaces(currentUser?: { id: string; role: string; departmentId?: string | null }) {
    const spaces = await (this.prisma as any).ticketSpace?.findMany?.({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { tickets: true } },
        members: true,
      },
    }).catch(() => []) ?? [];

    if (!currentUser) return spaces;

    const role = currentUser.role as UserRole;
    const isAdmin = ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN];

    // Admins see all spaces
    if (isAdmin) return spaces;

    // Non-admins: filter to spaces where they have membership (by userId, role, or department)
    return spaces.filter((space: any) => {
      // No members defined = open to everyone
      if (!space.members || space.members.length === 0) return true;
      return space.members.some((m: any) =>
        (m.userId && m.userId === currentUser.id) ||
        (m.role && m.role === currentUser.role) ||
        (m.departmentId && m.departmentId === currentUser.departmentId),
      );
    });
  }

  /**
   * Get a single space by slug or id.
   */
  async findSpaceBySlugOrId(slugOrId: string) {
    return (this.prisma as any).ticketSpace?.findFirst?.({
      where: {
        OR: [{ slug: slugOrId }, { id: slugOrId }],
        isActive: true,
      },
      include: { members: true },
    }).catch(() => null) ?? null;
  }

  async findAll(filters: {
    status?: string;
    priority?: string;
    assigneeId?: string;
    creatorId?: string;
    departmentId?: string;
    spaceId?: string;
    spaceSlug?: string;
    search?: string;
    page?: number;
    limit?: number;
  }, currentUser: { id: string; role: string; departmentId?: string | null }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, MAX_PAGE_LIMIT);
    const where: any = {};

    // Prevent low-privileged users from filtering on someone else's tickets
    const role = currentUser.role as UserRole;
    if (
      filters.creatorId &&
      filters.creatorId !== currentUser.id &&
      ROLE_HIERARCHY[role] < ROLE_HIERARCHY[UserRole.REVIEWER]
    ) {
      throw new ForbiddenException("Cannot filter by another user's tickets");
    }

    // Role-based ACL: non-admin users see tickets of their department + their
    // own created + those assigned to them. ADMIN+ see everything.
    const isAdmin = ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN];
    if (!isAdmin) {
      const deptId = currentUser.departmentId ?? null;
      const orClauses: any[] = [
        { creatorId: currentUser.id },
        { assigneeId: currentUser.id },
      ];
      if (deptId) orClauses.push({ departmentId: deptId });
      where.OR = orClauses;
    }

    // ── Space filtering avec ACL ─────────────────────────────────────
    // Non-admin : filtré par les espaces dont l'user est membre (via userId,
    // role ou departmentId) OU qui n'ont pas de spaceId (legacy pré-migration).
    let accessibleSpaceIds: string[] | null = null;
    if (!isAdmin) {
      const memberOf = await this.prisma.ticketSpaceMember.findMany({
        where: {
          OR: [
            { userId: currentUser.id },
            { role: currentUser.role },
            ...(currentUser.departmentId ? [{ departmentId: currentUser.departmentId }] : []),
          ],
          space: { isActive: true },
        },
        select: { spaceId: true },
      });
      accessibleSpaceIds = [...new Set(memberOf.map((m) => m.spaceId))];
    }

    if (filters.spaceId) {
      if (!isAdmin && accessibleSpaceIds && !accessibleSpaceIds.includes(filters.spaceId)) {
        // User demande un espace où il n'est pas membre → résultat vide
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
      where.spaceId = filters.spaceId;
    } else if (filters.spaceSlug) {
      const space = await (this.prisma as any).ticketSpace?.findUnique?.({ where: { slug: filters.spaceSlug } }).catch(() => null);
      if (space) {
        if (!isAdmin && accessibleSpaceIds && !accessibleSpaceIds.includes(space.id)) {
          return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
        }
        where.spaceId = space.id;
      }
    } else if (!isAdmin && accessibleSpaceIds) {
      // Aucun filtre explicite : user ne voit que les tickets de ses espaces
      // (+ tickets legacy sans spaceId pour rétro-compat pendant la migration)
      where.spaceId = { in: [...accessibleSpaceIds, null] };
    }

    if (filters.status) {
      const parsed = parseEnumFilter(filters.status, VALID_TICKET_STATUSES);
      if (parsed) where.status = parsed as any;
    }
    if (filters.priority) {
      const parsed = validateEnum(filters.priority, VALID_TICKET_PRIORITIES);
      if (parsed) where.priority = parsed;
    }
    if (filters.assigneeId && filters.assigneeId !== 'me') where.assigneeId = filters.assigneeId;
    if (filters.creatorId) where.creatorId = filters.creatorId;
    if (filters.departmentId) where.departmentId = filters.departmentId;

    if (filters.search) {
      const searchClauses = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { reference: { contains: filters.search, mode: 'insensitive' } },
      ];
      if (where.OR) {
        // Combine ACL-OR with search-OR using AND to avoid widening the scope
        where.AND = [{ OR: where.OR }, { OR: searchClauses }];
        delete where.OR;
      } else {
        where.OR = searchClauses;
      }
    }

    const [data, total] = await this.repo.findManyWithCount(
      where,
      (page - 1) * limit,
      limit,
    );

    // Add SLA info to each ticket
    const enriched = data.map((t: any) => {
      const slaHours = SLA_HOURS[t.priority] || 24;
      const deadline = new Date(t.createdAt.getTime() + slaHours * 3600000);
      const now = new Date();
      const isOverdue = !['RESOLVED', 'CLOSED'].includes(t.status) && now > deadline;
      const remainingMs = deadline.getTime() - now.getTime();
      const remainingHours = Math.max(0, Math.round(remainingMs / 3600000 * 10) / 10);
      return { ...t, sla: { deadline: deadline.toISOString(), hours: slaHours, isOverdue, remainingHours } };
    });

    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, currentUser?: { id: string; role: string; departmentId?: string | null }) {
    const role = (currentUser?.role as UserRole) || undefined;
    const isAdmin = role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.ADMIN];

    const ticket = await this.repo.findById(id, !!isAdmin);
    if (!ticket) throw new NotFoundException('Ticket introuvable');

    // Ownership / department check (ISO 27001 A.5.15 — Access Control)
    if (currentUser && !isAdmin) {
      const isCreator = ticket.creatorId === currentUser.id;
      const isAssignee = ticket.assigneeId === currentUser.id;
      const sameDepartment =
        currentUser.departmentId &&
        (ticket as any).departmentId &&
        (ticket as any).departmentId === currentUser.departmentId;

      if (!isCreator && !isAssignee && !sameDepartment) {
        throw new ForbiddenException('Accès refusé');
      }
    }

    return ticket;
  }

  async create(data: {
    title: string;
    description: string;
    category?: string;
    priority?: string;
    tags?: string[];
    departmentId?: string;
    spaceId?: string;
  }, userId: string) {
    // Merge user-supplied tags with auto-detected ones, deduplicate
    const autoTags = this.detectTags(data.title, data.description);
    const userTags = (data.tags || []).map(t => t.trim().toLowerCase()).filter(Boolean);
    const mergedTags = Array.from(new Set([...userTags, ...autoTags]));

    // Resolve department: explicit value wins, otherwise fall back to the
    // creator's primary department (so tickets naturally route to the right team).
    let departmentId: string | null = data.departmentId || null;
    if (!departmentId) {
      const creator = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      departmentId = creator?.departmentId || null;
    }

    // Resolve spaceId: explicit value wins, otherwise fall back to the
    // default space (if one is configured).
    let spaceId: string | null = data.spaceId || null;
    if (!spaceId) {
      const defaultSpace = await (this.prisma as any).ticketSpace?.findFirst?.({ where: { isDefault: true, isActive: true } }).catch(() => null);
      if (defaultSpace) spaceId = defaultSpace.id;
    }

    // Retry loop: sequence-based refs should never collide, but a retry
    // on P2002 (unique constraint) provides belt-and-suspenders safety.
    const MAX_REF_RETRIES = 3;
    let ticket: any;
    for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
      const ref = await this.generateRef();
      try {
        ticket = await this.repo.create({
          reference: ref,
          title: sanitizePlainText(data.title),
          description: sanitizePlainText(data.description),
          category: (validateEnum(data.category, VALID_TICKET_CATEGORIES) || 'OTHER') as any,
          priority: (validateEnum(data.priority, VALID_TICKET_PRIORITIES) || 'MEDIUM') as any,
          tags: mergedTags,
          creatorId: userId,
          departmentId,
          ...(spaceId ? { spaceId } : {}),
        } as any);
        break;
      } catch (err: any) {
        const isRefConflict = err?.code === 'P2002' &&
          (err?.meta?.target as string[])?.includes?.('reference');
        if (isRefConflict && attempt < MAX_REF_RETRIES - 1) {
          this.logger.warn(`Ticket reference collision on attempt ${attempt + 1}, retrying...`);
          continue;
        }
        throw err;
      }
    }

    // Notify IT admins (parallelized to avoid N×await latency)
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, deletedAt: null },
    });
    await Promise.all(admins.map((admin) =>
      this.notifications.create({
        userId: admin.id,
        type: 'TICKET_CREATED',
        title: `Nouveau ticket ${ticket.reference}`,
        body: `${(ticket as any).creator?.firstName ?? ''} ${(ticket as any).creator?.lastName ?? ''}: ${data.title}`,
        resourceType: 'Ticket',
        resourceId: ticket.id,
      }),
    ));

    await this.audit.log({
      userId,
      action: 'TICKET_CREATED',
      resourceType: 'Ticket',
      resourceId: ticket.id,
      metadata: { reference: ticket.reference, title: data.title, autoTags, tags: mergedTags },
    });

    // Suggest assignee based on category if no assignee is set
    let suggestedAssignee: { id: string; firstName: string; lastName: string; reason: string } | null = null;
    const category = (data.category as string) || 'OTHER';
    const mapping = CATEGORY_ASSIGNEES[category];

    if (mapping) {
      // Try to find a matching user by department keyword first, then by role
      let candidate: { id: string; firstName: string; lastName: string } | null = null;

      if (mapping.departmentKeyword) {
        candidate = await this.prisma.user.findFirst({
          where: {
            isActive: true,
            deletedAt: null,
            department: { name: { contains: mapping.departmentKeyword, mode: 'insensitive' } },
          },
          select: { id: true, firstName: true, lastName: true },
        });
      }

      if (!candidate && mapping.role) {
        candidate = await this.prisma.user.findFirst({
          where: {
            isActive: true,
            deletedAt: null,
            role: mapping.role as any,
          },
          select: { id: true, firstName: true, lastName: true },
        });
      }

      if (candidate) {
        suggestedAssignee = {
          ...candidate,
          reason: `Suggestion automatique : ${mapping.label} (catégorie ${category})`,
        };
      }
    }

    this.indexForMeili(ticket);
    this.invalidateDashboardCache();

    // AI qualification (non-blocking — fire and forget with internal timeout).
    // Suggestions are stored in AuditLog for agents to review/apply from the UI.
    void this.qualifyTicketWithAi(ticket.id, userId, data, mergedTags);

    return { ...ticket, autoTags: mergedTags, suggestedAssignee };
  }

  async update(id: string, data: {
    status?: string;
    priority?: string;
    assigneeId?: string;
    tags?: string[];
  }, userId: string) {
    const ticket = await this.repo.findByIdRaw(id);
    if (!ticket) throw new NotFoundException('Ticket introuvable');

    // Validate enum fields before Prisma to return 400 instead of 500
    if (data.status && !VALID_TICKET_STATUSES.includes(data.status as TicketStatus)) {
      throw new BadRequestException(`Statut invalide: ${data.status}. Valeurs acceptées: ${VALID_TICKET_STATUSES.join(', ')}`);
    }
    if (data.priority && !VALID_TICKET_PRIORITIES.includes(data.priority as any)) {
      throw new BadRequestException(`Priorité invalide: ${data.priority}. Valeurs acceptées: ${VALID_TICKET_PRIORITIES.join(', ')}`);
    }

    const updateData: any = {};
    if (data.status) {
      updateData.status = data.status;
      if (data.status === 'RESOLVED') updateData.resolvedAt = new Date();
      if (data.status === 'CLOSED') updateData.closedAt = new Date();
    }
    if (data.priority) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId || null;
    if (data.tags !== undefined) {
      updateData.tags = data.tags.map(t => t.trim().toLowerCase()).filter(Boolean);
    }

    const updated = await this.repo.update(id, updateData);

    this.indexForMeili(updated);

    // Notify creator on status change
    if (data.status && ticket.creatorId !== userId) {
      await this.notifications.create({
        userId: ticket.creatorId,
        type: 'TICKET_UPDATED',
        title: `Ticket ${ticket.reference} mis à jour`,
        body: `Statut: ${data.status}`,
        resourceType: 'Ticket',
        resourceId: id,
      });
    }

    if (data.status) this.invalidateDashboardCache();

    return updated;
  }

  async addComment(
    ticketId: string,
    content: string,
    userId: string,
    isInternal = false,
    userRole?: string,
  ) {
    const ticket = await this.repo.findByIdRaw(ticketId);
    if (!ticket) throw new NotFoundException('Ticket introuvable');

    // Only REVIEWER and above may post internal comments (ISO 27001 A.5.15).
    if (isInternal) {
      const role = (userRole as UserRole) || UserRole.COLLABORATEUR;
      if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[UserRole.REVIEWER]) {
        throw new ForbiddenException(
          'Only reviewers and above can post internal comments',
        );
      }
    }

    const comment = await this.repo.createComment({
      ticketId,
      authorId: userId,
      content: sanitizePlainText(content),
      isInternal,
    });

    // Parse les @mentions et notifie les utilisateurs cités (non-bloquant).
    if (this.mentions && !isInternal) {
      const authorName =
        `${comment.author.firstName} ${comment.author.lastName}`.trim() || 'Un utilisateur';
      void this.mentions
        .parseAndNotify({
          text: content,
          authorId: userId,
          authorName,
          sourceType: 'ticket',
          sourceId: ticket.id,
          sourceTitle: ticket.title,
          link: `/tickets/${ticket.id}`,
        })
        .catch((err) => this.logger.warn(`mention parsing failed: ${err?.message || err}`));
    }

    return comment;
  }

  async getStatusCounts(userId?: string): Promise<Record<string, number>> {
    const where = userId ? { assigneeId: userId } : {};
    const groups = await this.prisma.ticket.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });
    const counts: Record<string, number> = {};
    for (const g of groups) {
      counts[g.status] = g._count.status;
    }
    return counts;
  }

  async getStats() {
    const [open, inProgress, resolved, byPriority] = await Promise.all([
      this.repo.count({ status: 'OPEN' }),
      this.repo.count({ status: 'IN_PROGRESS' }),
      this.repo.count({ status: { in: ['RESOLVED', 'CLOSED'] } }),
      this.repo.groupByPriority({ status: { notIn: ['CLOSED'] } }),
    ]);
    return { open, inProgress, resolved, byPriority: byPriority.reduce((a, b) => ({ ...a, [b.priority]: b._count }), {}) };
  }

  /**
   * List all tickets grouped by department. ADMIN+ only — used on the
   * "Tickets by department" dashboard.
   */
  async byDepartment() {
    const [departments, orphans] = await this.repo.findByDepartment();

    return {
      departments: departments.map((d: any) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        totalTickets: d._count.tickets,
        openTickets: d.tickets.length,
        tickets: d.tickets,
      })),
      orphans,
    };
  }

  /**
   * Tickets belonging to the current user's department (open + in-progress).
   * Used by the per-department dashboard widget.
   */
  async myDepartment(currentUser: { id: string; role: string; departmentId?: string | null }) {
    const deptId = currentUser.departmentId ?? null;
    if (!deptId) {
      return { department: null, data: [], meta: { total: 0 } };
    }

    const [data, total, department] = await this.repo.findByUserDepartment(deptId);

    return { department, data, meta: { total } };
  }

  /**
   * Bulk update ticket statuses. Caps at 100 ids (DTO also enforces this).
   * ISO 27001 A.5.10 / A.8.3 — controlled bulk modification with audit trail.
   */
  async bulkUpdateStatus(ids: string[], status: string, currentUser: RequestUser) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Aucun identifiant fourni');
    }
    if (ids.length > 100) {
      throw new BadRequestException('Trop d\'identifiants (max 100)');
    }
    if (!VALID_TICKET_STATUSES.includes(status as TicketStatus)) {
      throw new BadRequestException(`Statut invalide: ${status}`);
    }

    const existing = await this.repo.findManyRaw(
      { id: { in: ids } },
      { id: true, reference: true, status: true },
    );

    if (existing.length === 0) {
      return { updated: 0 };
    }

    const existingIds = existing.map((t) => t.id);
    const updateData: any = { status };
    if (status === 'RESOLVED') updateData.resolvedAt = new Date();
    if (status === 'CLOSED') updateData.closedAt = new Date();

    const result = await this.repo.updateMany(
      { id: { in: existingIds } },
      updateData,
    );

    for (const ticket of existing) {
      await this.audit.log({
        userId: currentUser.id,
        action: 'TICKET_STATUS_UPDATED',
        resourceType: 'Ticket',
        resourceId: ticket.id,
        severity: 'INFO',
        metadata: {
          reference: ticket.reference,
          from: ticket.status,
          to: status,
          bulk: true,
          batchSize: existing.length,
        },
      });
    }

    this.logger.log(
      `Bulk status update (${status}): ${result.count} tickets by user ${currentUser.id}`,
    );

    this.invalidateDashboardCache();

    return { updated: result.count };
  }

  /**
   * Bulk reassign tickets. `assigneeId = null` unassigns.
   * ISO 27001 A.5.10 — controlled bulk modification with audit trail.
   */
  async bulkAssign(
    ids: string[],
    assigneeId: string | null,
    currentUser: RequestUser,
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Aucun identifiant fourni');
    }
    if (ids.length > 100) {
      throw new BadRequestException("Trop d'identifiants (max 100)");
    }

    if (assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, isActive: true },
      });
      if (!assignee) throw new BadRequestException('Assignee introuvable');
      if (!assignee.isActive) {
        throw new BadRequestException('Assignee inactif');
      }
    }

    const existing = await this.repo.findManyRaw(
      { id: { in: ids } },
      { id: true, reference: true, assigneeId: true },
    );

    if (existing.length === 0) return { updated: 0 };

    const existingIds = existing.map((t) => t.id);
    const result = await this.repo.updateMany(
      { id: { in: existingIds } },
      { assigneeId },
    );

    for (const ticket of existing) {
      await this.audit.log({
        userId: currentUser.id,
        action: assigneeId ? 'TICKET_ASSIGNED' : 'TICKET_UNASSIGNED',
        resourceType: 'Ticket',
        resourceId: ticket.id,
        severity: 'INFO',
        metadata: {
          reference: ticket.reference,
          from: ticket.assigneeId,
          to: assigneeId,
          bulk: true,
          batchSize: existing.length,
        },
      });
    }

    this.logger.log(
      `Bulk assign (${assigneeId ?? 'unassign'}): ${result.count} tickets by user ${currentUser.id}`,
    );

    this.invalidateDashboardCache();

    return { updated: result.count };
  }

  /**
   * Hard-delete a ticket and its related comments.
   * ADMIN/SUPER_ADMIN only. ISO 27001 A.5.10 — controlled deletion with audit trail.
   */
  async remove(id: string, userId: string) {
    const ticket = await this.repo.findByIdRaw(id);
    if (!ticket) throw new NotFoundException('Ticket introuvable');

    await this.repo.deleteWithRelations(id);

    await this.audit.log({
      userId,
      action: 'TICKET_DELETED',
      resourceType: 'Ticket',
      resourceId: id,
      metadata: { reference: ticket.reference, title: ticket.title },
    });

    this.invalidateDashboardCache();
  }

  /**
   * Check for SLA breaches and auto-escalate (ISO 27001 A.5.24)
   * Runs every 30 minutes
   */
  @Cron('*/30 * * * *')
  async checkSLABreaches() {
    const startTime = Date.now();
    this.logger.log('Started SLA check');

    const slaThresholds: Record<string, number> = {
      CRITICAL: 4 * 3600000,   // 4h
      HIGH: 8 * 3600000,       // 8h
      MEDIUM: 24 * 3600000,    // 24h
      LOW: 48 * 3600000,       // 48h
    };

    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    const openTickets = await this.repo.findManyRaw(
      { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      { id: true, reference: true, title: true, priority: true, createdAt: true, assigneeId: true, creatorId: true, status: true },
    );

    // Identify breached tickets and compute their new priority
    const breachedTickets: Array<{
      id: string;
      reference: string;
      title: string;
      oldPriority: string;
      newPriority: string;
      assigneeId: string | null;
      creatorId: string;
    }> = [];

    for (const ticket of openTickets) {
      const elapsed = Date.now() - ticket.createdAt.getTime();
      const threshold = slaThresholds[ticket.priority] || slaThresholds.LOW;

      if (elapsed > threshold && ticket.priority !== 'CRITICAL') {
        const currentIdx = priorities.indexOf(ticket.priority);
        const newPriority = priorities[Math.min(currentIdx + 1, 3)];
        breachedTickets.push({
          id: ticket.id,
          reference: ticket.reference,
          title: ticket.title,
          oldPriority: ticket.priority,
          newPriority,
          assigneeId: ticket.assigneeId,
          creatorId: ticket.creatorId,
        });
      }
    }

    // Group breached tickets by new priority and batch-update
    const byNewPriority = new Map<string, string[]>();
    for (const t of breachedTickets) {
      const ids = byNewPriority.get(t.newPriority) || [];
      ids.push(t.id);
      byNewPriority.set(t.newPriority, ids);
    }

    const updatePromises: Promise<any>[] = [];
    for (const [newPriority, ids] of byNewPriority) {
      updatePromises.push(
        this.repo.updateMany({ id: { in: ids } }, { priority: newPriority as any }),
      );
    }
    await Promise.all(updatePromises);

    // Send notifications (notifications.create doesn't support createMany)
    for (const ticket of breachedTickets) {
      this.logger.warn(`Ticket ${ticket.reference} escalated: ${ticket.oldPriority} → ${ticket.newPriority} (SLA breach)`);

      await this.notifications.create({
        userId: ticket.assigneeId || ticket.creatorId,
        type: 'TICKET_SLA_BREACH',
        title: `SLA dépassé — ${ticket.reference}`,
        body: `Le ticket "${ticket.title}" a dépassé son SLA. Priorité escaladée.`,
        resourceType: 'Ticket',
        resourceId: ticket.id,
      });
    }

    const elapsed = Date.now() - startTime;
    this.logger.log(`SLA check completed in ${elapsed}ms, ${breachedTickets.length} tickets escalated`);
  }

  async getAnalytics() {
    const resolvedWhere = { status: { in: ['RESOLVED', 'CLOSED'] as any }, resolvedAt: { not: null } };

    // --- Aggregated queries instead of loading all rows ---

    // Total and open counts
    const [total, open, resolvedCount] = await this.repo.countMany([
      {},
      { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } },
      { where: resolvedWhere },
    ]);

    // Average resolution time via raw SQL (Prisma aggregate doesn't support date diff)
    const avgResult = await this.prisma.$queryRaw<Array<{ avg_hours: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) as avg_hours
      FROM "Ticket"
      WHERE status IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL
    `;
    const avgResolutionHours = avgResult[0]?.avg_hours ?? 0;

    // By category: count and avg resolution time via raw SQL
    const categoryRows = await this.prisma.$queryRaw<Array<{ category: string; count: bigint; avg_hours: number }>>`
      SELECT category, COUNT(*) as count,
             AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) as avg_hours
      FROM "Ticket"
      WHERE status IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL
      GROUP BY category
    `;
    const categoryAvg = categoryRows.map((r) => ({
      category: r.category || 'OTHER',
      avgHours: Math.round(r.avg_hours ?? 0),
      count: Number(r.count),
    }));

    // By priority: count and avg resolution time via raw SQL
    const priorityRows = await this.prisma.$queryRaw<Array<{ priority: string; count: bigint; avg_hours: number }>>`
      SELECT priority, COUNT(*) as count,
             AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) as avg_hours
      FROM "Ticket"
      WHERE status IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL
      GROUP BY priority
    `;
    const slaThresholds: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48 };
    const priorityStats = priorityRows.map((r) => ({
      priority: r.priority || 'LOW',
      count: Number(r.count),
      avgHours: Math.round(r.avg_hours ?? 0),
      slaLimit: slaThresholds[r.priority] || 48,
    }));

    // SLA compliance rate — computed via SQL aggregation instead of loading rows
    const slaComplianceRows: { total: bigint; compliant: bigint }[] = await this.prisma.$queryRaw`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE
          EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600 <=
          CASE priority
            WHEN 'CRITICAL' THEN 4
            WHEN 'HIGH' THEN 8
            WHEN 'MEDIUM' THEN 24
            ELSE 48
          END
        )::bigint AS compliant
      FROM "Ticket"
      WHERE status IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL
    `;
    const slaRow = slaComplianceRows[0];
    const slaTotal = Number(slaRow?.total ?? 0);
    const slaCompliant = Number(slaRow?.compliant ?? 0);
    const slaComplianceRate = slaTotal > 0 ? Math.round((slaCompliant / slaTotal) * 100) : 100;

    // Weekly trend analysis
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600000);

    const [thisWeekCreated, lastWeekCreated, thisWeekResolved, lastWeekResolved] = await this.repo.countMany([
      { where: { createdAt: { gte: oneWeekAgo } } },
      { where: { createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } },
      { where: { resolvedAt: { gte: oneWeekAgo } } },
      { where: { resolvedAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } },
    ]);

    const weeklyCreatedTrend = lastWeekCreated > 0
      ? Math.round(((thisWeekCreated - lastWeekCreated) / lastWeekCreated) * 100)
      : thisWeekCreated > 0 ? 100 : 0;

    const weeklyResolvedTrend = lastWeekResolved > 0
      ? Math.round(((thisWeekResolved - lastWeekResolved) / lastWeekResolved) * 100)
      : thisWeekResolved > 0 ? 100 : 0;

    const weeklyTrend = lastWeekCreated > 0 ? Math.round(((thisWeekCreated - lastWeekCreated) / lastWeekCreated) * 100) : 0;

    return {
      total,
      open,
      resolved: resolvedCount,
      avgResolutionHours: Math.round(avgResolutionHours),
      slaComplianceRate,
      byCategory: categoryAvg,
      byPriority: priorityStats,
      thisWeekCreated,
      lastWeekCreated,
      weeklyTrend,
      weeklyTrendDetail: {
        created: {
          thisWeek: thisWeekCreated,
          lastWeek: lastWeekCreated,
          changePercent: weeklyCreatedTrend,
        },
        resolved: {
          thisWeek: thisWeekResolved,
          lastWeek: lastWeekResolved,
          changePercent: weeklyResolvedTrend,
        },
      },
    };
  }

  /**
   * Detect auto-tags from ticket title and description based on keywords.
   */
  private detectTags(title: string, description: string): string[] {
    const text = `${title} ${description}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const tagRules: Array<{ tag: string; keywords: string[] }> = [
      { tag: 'urgent', keywords: ['urgent', 'urgence', 'critique', 'critical', 'bloquant', 'immediat', 'asap'] },
      { tag: 'securite', keywords: ['securite', 'security', 'virus', 'malware', 'phishing', 'intrusion', 'fuite', 'piratage', 'ransomware', 'compromis'] },
      { tag: 'reseau', keywords: ['reseau', 'network', 'wifi', 'vpn', 'internet', 'connexion', 'dns', 'firewall', 'debit', 'latence'] },
      { tag: 'materiel', keywords: ['materiel', 'hardware', 'ecran', 'clavier', 'souris', 'imprimante', 'laptop', 'pc', 'ordinateur', 'peripherique', 'batterie'] },
      { tag: 'logiciel', keywords: ['logiciel', 'software', 'application', 'installation', 'mise a jour', 'update', 'licence', 'bug', 'erreur', 'crash', 'plantage'] },
      { tag: 'acces', keywords: ['acces', 'access', 'mot de passe', 'password', 'compte', 'habilitation', 'permission', 'verrouille', 'locked'] },
      { tag: 'email', keywords: ['email', 'mail', 'messagerie', 'outlook', 'teams', 'calendrier'] },
      { tag: 'sauvegarde', keywords: ['sauvegarde', 'backup', 'restauration', 'perte donnees', 'fichier perdu', 'recovery'] },
    ];

    const detected: string[] = [];

    for (const rule of tagRules) {
      if (rule.keywords.some((kw) => text.includes(kw))) {
        detected.push(rule.tag);
      }
    }

    return detected;
  }

  private async generateRef(): Promise<string> {
    return this.repo.nextReference();
  }

  /**
   * Generate a KB article draft from a resolved/closed ticket.
   * Returns structured HTML content + suggested metadata for wiki creation.
   */
  async generateKbDraft(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        comments: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { firstName: true, lastName: true } } },
        },
        creator: { select: { firstName: true, lastName: true } },
        assignee: { select: { firstName: true, lastName: true, id: true } },
        department: { select: { name: true, id: true } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket introuvable');
    if (!['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      throw new BadRequestException('Seuls les tickets résolus ou fermés peuvent générer un article KB');
    }

    const CATEGORY_MAP: Record<string, string> = {
      INCIDENT: 'support', REQUEST: 'support', ACCESS: 'support',
      HARDWARE: 'support', SOFTWARE: 'support', NETWORK: 'support',
      SECURITY: 'support', OTHER: 'support',
    };

    // Build HTML content from ticket data
    const commentsHtml = ticket.comments.length > 0
      ? ticket.comments.map((c) =>
          `<li><strong>${c.author.firstName} ${c.author.lastName}</strong> : ${sanitizePlainText(c.content)}</li>`,
        ).join('\n')
      : '<li><em>Aucun commentaire public</em></li>';

    const tagsHtml = ticket.tags.length > 0
      ? `<p><strong>Tags :</strong> ${ticket.tags.map((t) => `<code>${t}</code>`).join(', ')}</p>`
      : '';

    const content = `<h2>Problème</h2>
<p>${sanitizePlainText(ticket.description)}</p>

<h2>Résolution</h2>
<ul>
${commentsHtml}
</ul>

<h2>Informations</h2>
<p><strong>Catégorie :</strong> ${ticket.category}</p>
<p><strong>Priorité :</strong> ${ticket.priority}</p>
<p><strong>Référence ticket :</strong> ${ticket.reference}</p>
${tagsHtml}
<p><strong>Résolu le :</strong> ${ticket.resolvedAt ? ticket.resolvedAt.toLocaleDateString('fr-FR') : 'N/A'}</p>`;

    const slug = `${ticket.reference.toLowerCase()}-${ticket.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)}`;

    return {
      title: `[${ticket.reference}] ${ticket.title}`,
      slug,
      content,
      category: CATEGORY_MAP[ticket.category] || 'support',
      visibility: 'PUBLIC',
      ownerDepartmentId: ticket.departmentId ?? undefined,
      ticketReference: ticket.reference,
      assigneeId: ticket.assignee?.id,
    };
  }
}
