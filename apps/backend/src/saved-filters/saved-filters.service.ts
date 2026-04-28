import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, SavedFilterVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { SavedFilterVisibility as SavedFilterVisibilityDto } from './dto/create-saved-filter.dto';

/**
 * Scope d'une requête `findAll` :
 *  - mine   : filtres dont l'utilisateur courant est l'auteur (`userId`)
 *  - shared : filtres partagés accessibles à l'utilisateur (DEPT/ROLE/PUBLIC),
 *             en EXCLUANT ceux qu'il a lui-même créés
 *  - all    : union de mine + shared
 */
export type SavedFilterScope = 'mine' | 'shared' | 'all';

@Injectable()
export class SavedFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Construit la clause Prisma `OR` qui matche les filtres partagés
   * accessibles à `user` (hors PRIVATE).
   */
  private sharedAccessClauses(user: RequestUser): Prisma.SavedFilterWhereInput[] {
    const clauses: Prisma.SavedFilterWhereInput[] = [
      { visibility: SavedFilterVisibility.PUBLIC },
      { visibility: SavedFilterVisibility.ROLE, sharedWithRole: user.role as unknown as UserRole },
    ];
    if (user.departmentId) {
      clauses.push({
        visibility: SavedFilterVisibility.DEPARTMENT,
        sharedWithDepartmentId: user.departmentId,
      });
    }
    return clauses;
  }

  async findAll(
    user: RequestUser,
    opts: { module?: string; scope?: SavedFilterScope } = {},
  ) {
    const scope: SavedFilterScope = opts.scope ?? 'mine';
    const moduleClause = opts.module ? { module: opts.module } : {};

    let where: Prisma.SavedFilterWhereInput;
    if (scope === 'mine') {
      where = { ...moduleClause, userId: user.id };
    } else if (scope === 'shared') {
      where = {
        ...moduleClause,
        userId: { not: user.id },
        OR: this.sharedAccessClauses(user),
      };
    } else {
      // all = union mine + shared
      where = {
        ...moduleClause,
        OR: [{ userId: user.id }, ...this.sharedAccessClauses(user)],
      };
    }

    return this.prisma.savedFilter.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Validation cohérence visibility ↔ champs sharedWith*.
   * Rejette les combinaisons illégales avant écriture.
   */
  private validateVisibilityPayload(payload: {
    visibility?: SavedFilterVisibilityDto;
    sharedWithDepartmentId?: string | null;
    sharedWithRole?: UserRole | null;
  }) {
    const v = payload.visibility ?? SavedFilterVisibilityDto.PRIVATE;
    if (v === SavedFilterVisibilityDto.DEPARTMENT && !payload.sharedWithDepartmentId) {
      throw new BadRequestException('sharedWithDepartmentId requis pour visibility=DEPARTMENT');
    }
    if (v === SavedFilterVisibilityDto.ROLE && !payload.sharedWithRole) {
      throw new BadRequestException('sharedWithRole requis pour visibility=ROLE');
    }
  }

  async create(
    user: RequestUser,
    data: {
      module: string;
      name: string;
      filters: any;
      isDefault?: boolean;
      visibility?: SavedFilterVisibilityDto;
      sharedWithDepartmentId?: string;
      sharedWithRole?: UserRole;
    },
  ) {
    this.validateVisibilityPayload(data);
    const visibility = data.visibility ?? SavedFilterVisibilityDto.PRIVATE;

    // If setting as default, unset any existing default for this user+module.
    // NB: "default" reste une notion par-utilisateur — un filtre partagé n'est
    // pas auto-default pour les autres utilisateurs.
    if (data.isDefault) {
      await this.prisma.savedFilter.updateMany({
        where: { userId: user.id, module: data.module, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedFilter.create({
      data: {
        userId: user.id,
        module: data.module,
        name: data.name,
        filters: data.filters,
        isDefault: data.isDefault ?? false,
        visibility: visibility as unknown as SavedFilterVisibility,
        sharedWithDepartmentId:
          visibility === SavedFilterVisibilityDto.DEPARTMENT
            ? (data.sharedWithDepartmentId ?? null)
            : null,
        sharedWithRole:
          visibility === SavedFilterVisibilityDto.ROLE
            ? ((data.sharedWithRole ?? null) as unknown as UserRole)
            : null,
        sharedById: visibility !== SavedFilterVisibilityDto.PRIVATE ? user.id : null,
      },
    });
  }

  async update(
    id: string,
    user: RequestUser,
    data: { name?: string; isDefault?: boolean },
  ) {
    const filter = await this.prisma.savedFilter.findUnique({ where: { id } });
    if (!filter) throw new NotFoundException('Filtre non trouvé');
    if (filter.userId !== user.id && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException();
    }

    // If setting as default, unset any existing default for this user+module
    if (data.isDefault) {
      await this.prisma.savedFilter.updateMany({
        where: { userId: filter.userId, module: filter.module, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedFilter.update({
      where: { id },
      data,
    });
  }

  /**
   * Modifie la visibilité (partage / révocation) d'un filtre.
   * Auteur ou ADMIN seul peut partager. Logge dans AuditLog.
   */
  async share(
    id: string,
    user: RequestUser,
    payload: {
      visibility: SavedFilterVisibilityDto;
      sharedWithDepartmentId?: string;
      sharedWithRole?: UserRole;
    },
  ) {
    const filter = await this.prisma.savedFilter.findUnique({ where: { id } });
    if (!filter) throw new NotFoundException('Filtre non trouvé');
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (filter.userId !== user.id && !isAdmin) {
      throw new ForbiddenException();
    }

    this.validateVisibilityPayload(payload);

    const wasShared = filter.visibility !== SavedFilterVisibility.PRIVATE;
    const willBeShared = payload.visibility !== SavedFilterVisibilityDto.PRIVATE;

    const updated = await this.prisma.savedFilter.update({
      where: { id },
      data: {
        visibility: payload.visibility as unknown as SavedFilterVisibility,
        sharedWithDepartmentId:
          payload.visibility === SavedFilterVisibilityDto.DEPARTMENT
            ? (payload.sharedWithDepartmentId ?? null)
            : null,
        sharedWithRole:
          payload.visibility === SavedFilterVisibilityDto.ROLE
            ? ((payload.sharedWithRole ?? null) as unknown as UserRole)
            : null,
        sharedById: willBeShared ? (filter.sharedById ?? user.id) : null,
      },
    });

    // Audit log : SHARED si on passe à un état partagé,
    // UNSHARED si on revient à PRIVATE depuis un état partagé.
    let action: 'SAVED_FILTER_SHARED' | 'SAVED_FILTER_UNSHARED' | null = null;
    if (!wasShared && willBeShared) action = 'SAVED_FILTER_SHARED';
    else if (wasShared && !willBeShared) action = 'SAVED_FILTER_UNSHARED';
    else if (wasShared && willBeShared) action = 'SAVED_FILTER_SHARED'; // reconfig partage

    if (action) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action,
          resourceType: 'SavedFilter',
          resourceId: id,
          metadata: {
            module: filter.module,
            name: filter.name,
            previousVisibility: filter.visibility,
            newVisibility: payload.visibility,
            sharedWithDepartmentId: payload.sharedWithDepartmentId ?? null,
            sharedWithRole: payload.sharedWithRole ?? null,
          },
        },
      });
    }

    return updated;
  }

  async remove(id: string, user: RequestUser) {
    const filter = await this.prisma.savedFilter.findUnique({ where: { id } });
    if (!filter) throw new NotFoundException('Filtre non trouvé');
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (filter.userId !== user.id && !isAdmin) {
      throw new ForbiddenException();
    }

    return this.prisma.savedFilter.delete({ where: { id } });
  }
}
