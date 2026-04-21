import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketSpace, TicketSpaceMember, TicketSpacePermission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/interfaces';
import { ROLE_HIERARCHY, UserRole } from '../common/enums';
import { slugify, generateUniqueSlug } from '../common/utils/slugify';
import { CreateSpaceDto, UpdateSpaceDto } from './dto/create-space.dto';
import { AddMemberDto, UpdateMemberDto } from './dto/member.dto';

/**
 * Permissions order (low → high).
 * VIEWER can read.
 * CREATOR can create + read.
 * AGENT can create, read, comment, and be assigned tickets.
 * MANAGER has full control : edit space config, add/remove members, close.
 */
const PERMISSION_RANK: Record<TicketSpacePermission, number> = {
  VIEWER: 1,
  CREATOR: 2,
  AGENT: 3,
  MANAGER: 4,
};

export interface AccessCheck {
  allowed: boolean;
  level: TicketSpacePermission | null;
  isAdmin: boolean;
}

@Injectable()
export class TicketSpacesService {
  private readonly logger = new Logger(TicketSpacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ========================================================================
  // Queries
  // ========================================================================

  async listForUser(user: RequestUser): Promise<TicketSpace[]> {
    if (this.isAdmin(user)) {
      return this.prisma.ticketSpace.findMany({
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });
    }

    // User sees only spaces where he's a member (direct / via role / via dept)
    const memberOf = await this.prisma.ticketSpaceMember.findMany({
      where: {
        OR: [
          { userId: user.id },
          { role: user.role },
          ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ],
        space: { isActive: true },
      },
      select: { spaceId: true },
    });
    const spaceIds = [...new Set(memberOf.map((m) => m.spaceId))];
    return this.prisma.ticketSpace.findMany({
      where: { id: { in: spaceIds }, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getById(spaceId: string, user: RequestUser): Promise<TicketSpace & { members: TicketSpaceMember[] }> {
    const space = await this.prisma.ticketSpace.findUnique({
      where: { id: spaceId },
      include: { members: { orderBy: { createdAt: 'desc' } } },
    });
    if (!space) throw new NotFoundException('Espace de ticketing introuvable');

    const check = await this.checkAccess(user, spaceId);
    if (!check.allowed) throw new NotFoundException('Espace de ticketing introuvable');

    return space;
  }

  /**
   * Returns all spaceIds the user can access (via membership, role, dept,
   * or admin role). Used by tickets.service.findAll to filter tickets.
   */
  async listAccessibleSpaceIds(user: RequestUser): Promise<string[]> {
    if (this.isAdmin(user)) {
      const all = await this.prisma.ticketSpace.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      return all.map((s) => s.id);
    }
    const memberOf = await this.prisma.ticketSpaceMember.findMany({
      where: {
        OR: [
          { userId: user.id },
          { role: user.role },
          ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ],
        space: { isActive: true },
      },
      select: { spaceId: true },
    });
    return [...new Set(memberOf.map((m) => m.spaceId))];
  }

  // ========================================================================
  // CRUD
  // ========================================================================

  async create(user: RequestUser, dto: CreateSpaceDto): Promise<TicketSpace> {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException("Seul un administrateur peut créer un espace de ticketing.");
    }
    const name = dto.name.trim();
    const requestedSlug = dto.slug?.trim();
    const slug = requestedSlug
      ? slugify(requestedSlug, { maxLength: 80 })
      : await generateUniqueSlug(
          name,
          async (candidate) =>
            !!(await this.prisma.ticketSpace.findUnique({ where: { slug: candidate } })),
          { maxLength: 80, fallback: 'espace' },
        );

    if (requestedSlug) {
      const existing = await this.prisma.ticketSpace.findUnique({ where: { slug } });
      if (existing) {
        throw new ConflictException(`Un espace avec le slug "${slug}" existe déjà.`);
      }
    }

    const nameClash = await this.prisma.ticketSpace.findUnique({ where: { name } });
    if (nameClash) {
      throw new ConflictException(`Un espace nommé "${name}" existe déjà.`);
    }

    const space = await this.prisma.ticketSpace.create({
      data: {
        name,
        slug,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
        isDefault: dto.isDefault ?? false,
        allowedCategories: dto.allowedCategories ?? [],
      },
    });

    // Le créateur devient MANAGER automatiquement (sauf si c'est l'admin qui
    // crée pour quelqu'un d'autre — ici on garde simple et on l'ajoute).
    await this.prisma.ticketSpaceMember.create({
      data: { spaceId: space.id, userId: user.id, permission: 'MANAGER' },
    });

    await this.audit.log({
      userId: user.id,
      action: 'TICKET_SPACE_CREATED',
      resourceType: 'TicketSpace',
      resourceId: space.id,
      metadata: { name, slug },
    });

    return space;
  }

  async update(user: RequestUser, spaceId: string, dto: UpdateSpaceDto): Promise<TicketSpace> {
    await this.requireManagerOrAdmin(user, spaceId);
    const space = await this.prisma.ticketSpace.update({
      where: { id: spaceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.allowedCategories !== undefined ? { allowedCategories: dto.allowedCategories } : {}),
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'TICKET_SPACE_UPDATED',
      resourceType: 'TicketSpace',
      resourceId: space.id,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return space;
  }

  async delete(user: RequestUser, spaceId: string): Promise<{ message: string }> {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Seul un administrateur peut supprimer un espace de ticketing.');
    }
    const space = await this.prisma.ticketSpace.findUnique({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Espace de ticketing introuvable');

    if (space.isDefault) {
      throw new BadRequestException(
        "L'espace par défaut ne peut pas être supprimé. Désignez-en un autre comme défaut avant.",
      );
    }

    // Réassigne les tickets à l'espace par défaut (garantie : il en existe toujours un)
    const fallback = await this.prisma.ticketSpace.findFirst({
      where: { isDefault: true, id: { not: spaceId } },
    });
    if (!fallback) {
      throw new BadRequestException(
        "Aucun espace par défaut de repli disponible. Impossible de supprimer.",
      );
    }
    await this.prisma.ticket.updateMany({
      where: { spaceId },
      data: { spaceId: fallback.id },
    });

    await this.prisma.ticketSpaceMember.deleteMany({ where: { spaceId } });
    await this.prisma.ticketSpace.delete({ where: { id: spaceId } });

    await this.audit.log({
      userId: user.id,
      action: 'TICKET_SPACE_DELETED',
      resourceType: 'TicketSpace',
      resourceId: spaceId,
      severity: 'WARN',
      metadata: { name: space.name, fallback: fallback.name },
    });

    return { message: `Espace "${space.name}" supprimé (tickets réassignés à "${fallback.name}")` };
  }

  // ========================================================================
  // Members
  // ========================================================================

  async addMember(
    user: RequestUser,
    spaceId: string,
    dto: AddMemberDto,
  ): Promise<TicketSpaceMember> {
    await this.requireManagerOrAdmin(user, spaceId);

    const scopes = [dto.userId, dto.role, dto.departmentId].filter(Boolean);
    if (scopes.length !== 1) {
      throw new BadRequestException(
        "Exactement UN scope doit être fourni : userId, role ou departmentId.",
      );
    }

    const where: Prisma.TicketSpaceMemberWhereInput = { spaceId };
    if (dto.userId) where.userId = dto.userId;
    if (dto.role) where.role = dto.role;
    if (dto.departmentId) where.departmentId = dto.departmentId;
    const existing = await this.prisma.ticketSpaceMember.findFirst({ where });
    if (existing) {
      throw new ConflictException('Ce membre existe déjà dans cet espace.');
    }

    const member = await this.prisma.ticketSpaceMember.create({
      data: {
        spaceId,
        userId: dto.userId ?? null,
        role: dto.role ?? null,
        departmentId: dto.departmentId ?? null,
        permission: dto.permission,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'TICKET_SPACE_MEMBER_ADDED',
      resourceType: 'TicketSpace',
      resourceId: spaceId,
      metadata: {
        memberId: member.id,
        scope: dto.userId ? 'user' : dto.role ? 'role' : 'department',
        scopeValue: dto.userId ?? dto.role ?? dto.departmentId,
        permission: dto.permission,
      },
    });

    return member;
  }

  async updateMember(
    user: RequestUser,
    spaceId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<TicketSpaceMember> {
    await this.requireManagerOrAdmin(user, spaceId);
    const member = await this.prisma.ticketSpaceMember.findUnique({ where: { id: memberId } });
    if (!member || member.spaceId !== spaceId) {
      throw new NotFoundException('Membre introuvable dans cet espace');
    }

    const updated = await this.prisma.ticketSpaceMember.update({
      where: { id: memberId },
      data: { permission: dto.permission },
    });

    await this.audit.log({
      userId: user.id,
      action: 'TICKET_SPACE_MEMBER_UPDATED',
      resourceType: 'TicketSpace',
      resourceId: spaceId,
      metadata: { memberId, newPermission: dto.permission },
    });

    return updated;
  }

  async removeMember(user: RequestUser, spaceId: string, memberId: string): Promise<void> {
    await this.requireManagerOrAdmin(user, spaceId);
    const member = await this.prisma.ticketSpaceMember.findUnique({ where: { id: memberId } });
    if (!member || member.spaceId !== spaceId) {
      throw new NotFoundException('Membre introuvable dans cet espace');
    }

    // Safety : on refuse de retirer le DERNIER manager (empêche de perdre la gestion)
    if (member.permission === 'MANAGER') {
      const otherManagers = await this.prisma.ticketSpaceMember.count({
        where: { spaceId, permission: 'MANAGER', id: { not: memberId } },
      });
      if (otherManagers === 0 && !this.isAdmin(user)) {
        throw new BadRequestException(
          "Impossible de retirer le dernier manager de l'espace. Nommez-en un autre d'abord.",
        );
      }
    }

    await this.prisma.ticketSpaceMember.delete({ where: { id: memberId } });

    await this.audit.log({
      userId: user.id,
      action: 'TICKET_SPACE_MEMBER_REMOVED',
      resourceType: 'TicketSpace',
      resourceId: spaceId,
      severity: 'WARN',
      metadata: { memberId, wasPermission: member.permission },
    });
  }

  // ========================================================================
  // Access checks (used by tickets.service)
  // ========================================================================

  async checkAccess(
    user: RequestUser,
    spaceId: string,
    required: TicketSpacePermission = 'VIEWER',
  ): Promise<AccessCheck> {
    if (this.isAdmin(user)) {
      return { allowed: true, level: 'MANAGER', isAdmin: true };
    }

    const members = await this.prisma.ticketSpaceMember.findMany({
      where: {
        spaceId,
        OR: [
          { userId: user.id },
          { role: user.role },
          ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ],
      },
    });
    if (members.length === 0) {
      return { allowed: false, level: null, isAdmin: false };
    }

    // Prend le permission le plus élevé parmi les membres du user
    const highest = members.reduce(
      (acc, m) => (PERMISSION_RANK[m.permission] > PERMISSION_RANK[acc] ? m.permission : acc),
      'VIEWER' as TicketSpacePermission,
    );
    const allowed = PERMISSION_RANK[highest] >= PERMISSION_RANK[required];
    return { allowed, level: highest, isAdmin: false };
  }

  private async requireManagerOrAdmin(user: RequestUser, spaceId: string): Promise<void> {
    const check = await this.checkAccess(user, spaceId, 'MANAGER');
    if (!check.allowed) {
      throw new ForbiddenException(
        "Seuls les managers de cet espace (ou un administrateur global) peuvent effectuer cette action.",
      );
    }
  }

  private isAdmin(user: RequestUser): boolean {
    return (
      ROLE_HIERARCHY[user.role as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN]
    );
  }
}
