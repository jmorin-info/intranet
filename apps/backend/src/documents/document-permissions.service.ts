import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/interfaces";
import { UserRole, ROLE_HIERARCHY } from "../common/enums";
import { hasBaselineDocumentReadAccess } from './document-library.policy';

/**
 * Niveaux de permission GED (cumulatifs).
 * - READ : peut lire le document + ses versions
 * - COMMENT : READ + ajout de commentaires
 * - EDIT : COMMENT + upload de nouvelles versions, édition inline
 * - ADMIN : EDIT + gestion des permissions et partages
 */
export type DocPermLevel = "READ" | "COMMENT" | "EDIT" | "ADMIN";

const LEVEL_RANK: Record<DocPermLevel, number> = {
  READ: 1,
  COMMENT: 2,
  EDIT: 3,
  ADMIN: 4,
};

const VALID_LEVELS = new Set<DocPermLevel>([
  "READ",
  "COMMENT",
  "EDIT",
  "ADMIN",
]);

export interface GrantPermissionDto {
  userId?: string | null;
  departmentId?: string | null;
  role?: string | null;
  level: DocPermLevel;
  expiresAt?: string | Date | null;
}

/**
 * Service ACL granulaire pour la GED (ISO 27001 A.5.15 + A.5.18).
 *
 * Précédence du résolveur :
 *   1. owner du document → ADMIN automatique
 *   2. roleLevel >= ROLE_HIERARCHY[ADMIN] (SUPER_ADMIN/ADMIN/DIRECTION) → ADMIN auto
 *      (compat existante, ces rôles voient tout)
 *   3. Permission explicite par user
 *   4. Permission explicite par department (matched via UserDepartment.userId)
 *   5. Permission explicite par role
 *   6. Fallback : classification + isPublic + status
 *
 * Les permissions périmées (expiresAt < now) sont ignorées.
 */
@Injectable()
export class DocumentPermissionsService {
  private readonly logger = new Logger(DocumentPermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Liste les IDs de département auxquels appartient l'utilisateur (membership multi-dpt + departmentId legacy). */
  private async getUserDepartmentIds(userId: string): Promise<string[]> {
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      }),
      this.prisma.userDepartment.findMany({
        where: { userId },
        select: { departmentId: true },
      }),
    ]);
    const ids = new Set<string>();
    if (user?.departmentId) ids.add(user.departmentId);
    for (const m of memberships) ids.add(m.departmentId);
    return Array.from(ids);
  }

  /**
   * Résout le niveau effectif de l'utilisateur sur un document.
   * Renvoie null si aucun accès autorisé.
   */
  async resolveLevel(
    userId: string,
    documentId: string,
  ): Promise<DocPermLevel | null> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        ownerId: true,
        classification: true,
        isPublic: true,
        status: true,
        deletedAt: true,
        verifierId: true,
        reviewerId: true,
        approverId: true,
      },
    });
    if (!document || document.deletedAt) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt) return null;

    // 1. Owner = ADMIN auto
    if (document.ownerId === userId) return "ADMIN";

    // 2. SUPER_ADMIN / ADMIN / DIRECTION = ADMIN auto (compat avec checks existants)
    const roleLevel = ROLE_HIERARCHY[user.role as UserRole] ?? 0;
    if (roleLevel >= ROLE_HIERARCHY[UserRole.DIRECTION]) return "ADMIN";

    // 3-5. Permissions explicites
    const dptIds = await this.getUserDepartmentIds(userId);
    const now = new Date();
    const explicitPerms = await this.prisma.documentPermission.findMany({
      where: {
        documentId,
        OR: [
          { userId },
          ...(dptIds.length > 0 ? [{ departmentId: { in: dptIds } }] : []),
          { role: user.role },
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      select: {
        userId: true,
        departmentId: true,
        role: true,
        level: true,
      },
    });

    if (explicitPerms.length > 0) {
      // Précédence : user > department > role. À niveau de précédence égal,
      // on garde le niveau cumulatif le plus élevé.
      const valid = explicitPerms.filter((permission) => VALID_LEVELS.has(permission.level as DocPermLevel));
      const tiers = [
        valid.filter((permission) => permission.userId === userId),
        valid.filter((permission) => permission.departmentId !== null),
        valid.filter((permission) => permission.role !== null),
      ];
      for (const tier of tiers) {
        if (tier.length) {
          return tier.reduce((best, permission) => LEVEL_RANK[permission.level as DocPermLevel] > LEVEL_RANK[best] ? permission.level as DocPermLevel : best, 'READ' as DocPermLevel);
        }
      }
    }

    return hasBaselineDocumentReadAccess(document, { id: user.id, role: user.role as UserRole, email: '' }) ? 'READ' : null;
  }

  async canRead(userId: string, documentId: string): Promise<boolean> {
    const lvl = await this.resolveLevel(userId, documentId);
    return lvl !== null && LEVEL_RANK[lvl] >= LEVEL_RANK.READ;
  }

  async canComment(userId: string, documentId: string): Promise<boolean> {
    const lvl = await this.resolveLevel(userId, documentId);
    return lvl !== null && LEVEL_RANK[lvl] >= LEVEL_RANK.COMMENT;
  }

  async canEdit(userId: string, documentId: string): Promise<boolean> {
    const lvl = await this.resolveLevel(userId, documentId);
    return lvl !== null && LEVEL_RANK[lvl] >= LEVEL_RANK.EDIT;
  }

  async canAdmin(userId: string, documentId: string): Promise<boolean> {
    const lvl = await this.resolveLevel(userId, documentId);
    return lvl !== null && LEVEL_RANK[lvl] >= LEVEL_RANK.ADMIN;
  }

  /**
   * Liste les permissions explicites d'un document (avec relations).
   * RBAC : caller doit être canAdmin.
   */
  async listPermissions(documentId: string, currentUser: RequestUser) {
    if (!(await this.canAdmin(currentUser.id, documentId))) {
      throw new ForbiddenException(
        "Vous devez être propriétaire ou avoir le niveau ADMIN sur ce document.",
      );
    }
    const perms = await this.prisma.documentPermission.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        department: { select: { id: true, name: true, code: true } },
        grantedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    return perms;
  }

  /**
   * Accorde une permission. La cible (user OU department OU role) est exclusive
   * — vérifié côté code en plus du check constraint Postgres.
   */
  async grantPermission(
    documentId: string,
    dto: GrantPermissionDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, deletedAt: true, ownerId: true },
    });
    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }
    if (!(await this.canAdmin(currentUser.id, documentId))) {
      throw new ForbiddenException(
        "Permission ADMIN requise pour accorder un accès.",
      );
    }

    // Validation XOR
    const targets = [dto.userId, dto.departmentId, dto.role].filter(
      (v) => v != null && v !== "",
    );
    if (targets.length !== 1) {
      throw new BadRequestException(
        "Exactement une cible parmi userId, departmentId, role doit être fournie.",
      );
    }
    if (!VALID_LEVELS.has(dto.level)) {
      throw new BadRequestException(`Niveau invalide : ${dto.level}`);
    }
    if (dto.role && !this.isValidRole(dto.role)) {
      throw new BadRequestException(`Rôle invalide : ${dto.role}`);
    }

    // Vérifie l'existence des FK
    if (dto.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true },
      });
      if (!u) throw new BadRequestException("Utilisateur introuvable");
    }
    if (dto.departmentId) {
      const d = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        select: { id: true },
      });
      if (!d) throw new BadRequestException("Département introuvable");
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("expiresAt invalide");
    }
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException("L'expiration doit se situer dans le futur");
    }

    const created = await this.prisma.documentPermission.create({
      data: {
        documentId,
        userId: dto.userId ?? null,
        departmentId: dto.departmentId ?? null,
        role: dto.role ?? null,
        level: dto.level,
        expiresAt,
        grantedById: currentUser.id,
      },
    });

    await this.audit.log({
      userId: currentUser.id,
      ipAddress,
      action: "DOCUMENT_PERMISSION_GRANTED",
      resourceType: "Document",
      resourceId: documentId,
      severity: "INFO",
      metadata: {
        permissionId: created.id,
        target: dto.userId
          ? { type: "user", id: dto.userId }
          : dto.departmentId
            ? { type: "department", id: dto.departmentId }
            : { type: "role", value: dto.role },
        level: dto.level,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
    });

    return created;
  }

  async revokePermission(
    documentId: string,
    permissionId: string,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    if (!(await this.canAdmin(currentUser.id, documentId))) {
      throw new ForbiddenException(
        "Permission ADMIN requise pour révoquer un accès.",
      );
    }
    const perm = await this.prisma.documentPermission.findUnique({
      where: { id: permissionId },
    });
    if (!perm || perm.documentId !== documentId) {
      throw new NotFoundException("Permission introuvable");
    }
    await this.prisma.documentPermission.delete({
      where: { id: permissionId },
    });

    await this.audit.log({
      userId: currentUser.id,
      ipAddress,
      action: "DOCUMENT_PERMISSION_REVOKED",
      resourceType: "Document",
      resourceId: documentId,
      severity: "WARN",
      metadata: {
        permissionId,
        target: perm.userId
          ? { type: "user", id: perm.userId }
          : perm.departmentId
            ? { type: "department", id: perm.departmentId }
            : { type: "role", value: perm.role },
        level: perm.level,
      },
    });

    return { success: true };
  }

  private isValidRole(role: string): boolean {
    return Object.values(UserRole).includes(role as UserRole);
  }
}
