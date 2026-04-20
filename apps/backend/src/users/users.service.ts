import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationParams, PaginatedResult } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Annuaire "light" accessible à tous les utilisateurs connectés.
   * N'expose que les champs nécessaires pour l'assignment / mention /
   * affichage d'auteur — jamais MFA, secrets, historique, etc.
   */
  async getDirectory(opts: { search?: string; departmentId?: string; limit: number }) {
    const where: Record<string, unknown> = { isActive: true, deletedAt: null };
    if (opts.departmentId) where.departmentId = opts.departmentId;
    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where: where as never,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        jobTitle: true,
        avatarUrl: true,
        isActive: true,
        lastLoginAt: true,
        phone: true,
        location: true,
        departmentId: true,
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: opts.limit,
    });
    return { data: users, count: users.length };
  }

  async findAll(
    pagination: PaginationParams,
    filters?: { role?: string; departmentId?: string; search?: string },
  ): Promise<PaginatedResult<any>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;
    const sortBy = pagination.sortBy || 'createdAt';
    const sortOrder = pagination.sortOrder || 'desc';

    const where: any = {
      deletedAt: null,
    };

    if (filters?.role) {
      const validRoles = Object.values(UserRole) as string[];
      if (validRoles.includes(filters.role)) {
        where.role = filters.role;
      }
    }

    if (filters?.departmentId) {
      where.departmentId = filters.departmentId;
    }

    if (filters?.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          departmentId: true,
          department: true,
          departmentMemberships: {
            select: {
              id: true,
              isPrimary: true,
              department: { select: { id: true, name: true } },
            },
          },
          isActive: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          avatarUrl: true,
          jobTitle: true,
          phone: true,
          location: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private sanitizeUser(user: any) {
    if (!user) return user;
    const { passwordHash, mfaSecret, ...safe } = user;
    return safe;
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        department: true,
        departmentMemberships: {
          include: { department: { select: { id: true, name: true, code: true } } },
          orderBy: { isPrimary: 'desc' as const },
        },
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
        subordinates: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { department: true },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        departmentId: dto.departmentId || null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        departmentId: true,
        department: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`User created: ${user.email}`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email && { email: dto.email }),
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.role && { role: dto.role }),
        ...(dto.departmentId !== undefined && {
          departmentId: dto.departmentId || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        departmentId: true,
        department: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (dto.role && dto.role !== user.role) {
      await this.audit.log({
        userId: id,
        action: 'USER_ROLE_CHANGED',
        resourceType: 'User',
        resourceId: id,
        metadata: { previousRole: user.role, newRole: dto.role },
        severity: 'WARN',
      });
    }

    if (dto.isActive === false && user.isActive) {
      await this.audit.log({
        userId: id,
        action: 'USER_DEACTIVATED',
        resourceType: 'User',
        resourceId: id,
        severity: 'WARN',
      });
    }

    this.logger.log(`User updated: ${updated.email}`);
    return updated;
  }

  async softDelete(id: string) {
    await this.findById(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    this.logger.log(`User soft-deleted: ${id}`);
    return { message: 'User deleted successfully' };
  }

  private validatePasswordPolicy(password: string): void {
    const errors: string[] = [];
    if (password.length < 12) errors.push('Minimum 12 caractères');
    if (!/[A-Z]/.test(password)) errors.push('Au moins une majuscule');
    if (!/[a-z]/.test(password)) errors.push('Au moins une minuscule');
    if (!/[0-9]/.test(password)) errors.push('Au moins un chiffre');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Au moins un caractère spécial');
    if (errors.length > 0) {
      throw new BadRequestException(`Mot de passe non conforme : ${errors.join(', ')}`);
    }
  }

  async resetPassword(id: string, newPassword: string) {
    await this.findById(id);

    this.validatePasswordPolicy(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await this.audit.log({
      userId: id,
      action: 'USER_PASSWORD_RESET',
      resourceType: 'User',
      resourceId: id,
      severity: 'WARN',
    });

    this.logger.log(`Password reset for user: ${id}`);
    return { message: 'Password reset successfully' };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      user.passwordHash,
    );

    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    this.validatePasswordPolicy(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Revoke ALL existing refresh tokens (force re-login on all other sessions).
    // This matches the behavior of resetPasswordWithToken() in auth.service.ts.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(
      `Password changed for user ${userId} — ${revoked.count} refresh token(s) revoked`,
    );
    return { message: 'Password changed successfully' };
  }

  async getActivitySummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastLoginAt: true,
        department: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [documentsCount, ticketsCount, unreadNotificationsCount, quizAttempts, departments] =
      await Promise.all([
        this.prisma.document.count({
          where: { ownerId: userId, deletedAt: null },
        }),
        this.prisma.ticket.count({
          where: { creatorId: userId },
        }),
        this.prisma.notification.count({
          where: { userId, isRead: false },
        }),
        this.prisma.auditLog.findMany({
          where: { userId, action: 'QUIZ_COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { metadata: true },
        }),
        this.prisma.department.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    return {
      lastLoginAt: user.lastLoginAt,
      documentsCount,
      ticketsCount,
      unreadNotificationsCount,
      quizBestScore: quizAttempts.length > 0 ? (quizAttempts[0].metadata as any)?.percentage ?? null : null,
      department: user.department,
      departments,
    };
  }

  async updateProfile(
    userId: string,
    dto: { phone?: string; location?: string; skills?: string; languages?: string; teamsLink?: string },
  ) {
    await this.findById(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.skills !== undefined && { skills: dto.skills }),
        ...(dto.languages !== undefined && { languages: dto.languages }),
        ...(dto.teamsLink !== undefined && { teamsLink: dto.teamsLink }),
      },
      include: {
        department: true,
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
        subordinates: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });

    this.logger.log(`Profile updated for user: ${userId}`);
    return this.sanitizeUser(updated);
  }

  async updateAvatarUrl(userId: string, avatarUrl: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    this.logger.log(`Avatar updated for user: ${userId}`);
    return { avatarUrl };
  }

  private readonly DEFAULT_PREFERENCES = {
    darkMode: false,
    language: 'fr',
    dashboardWidgets: ['activity', 'documents', 'tickets', 'notifications'],
    notificationPrefs: {
      email: true,
      inApp: true,
      documentUpdates: true,
      ticketUpdates: true,
      securityAlerts: true,
    },
  };

  async getPreferences(userId: string) {
    const configKey = `user_prefs_${userId}`;
    const config = await this.prisma.appConfig.findUnique({
      where: { key: configKey },
    });

    if (!config) {
      return { ...this.DEFAULT_PREFERENCES };
    }

    try {
      const stored = JSON.parse(config.value);
      return { ...this.DEFAULT_PREFERENCES, ...stored };
    } catch {
      return { ...this.DEFAULT_PREFERENCES };
    }
  }

  async updatePreferences(
    userId: string,
    prefs: {
      darkMode?: boolean;
      language?: string;
      dashboardWidgets?: string[];
      notificationPrefs?: {
        email?: boolean;
        inApp?: boolean;
        documentUpdates?: boolean;
        ticketUpdates?: boolean;
        securityAlerts?: boolean;
      };
    },
  ) {
    const configKey = `user_prefs_${userId}`;

    // Merge with existing preferences
    const current = await this.getPreferences(userId);
    const merged = {
      ...current,
      ...prefs,
      notificationPrefs: {
        ...current.notificationPrefs,
        ...(prefs.notificationPrefs || {}),
      },
    };

    // Validate language
    const validLanguages = ['fr', 'en', 'de', 'es'];
    if (merged.language && !validLanguages.includes(merged.language)) {
      throw new BadRequestException(`Langue non supportée : ${merged.language}. Options : ${validLanguages.join(', ')}`);
    }

    // Validate dashboardWidgets
    const validWidgets = ['activity', 'documents', 'tickets', 'notifications', 'compliance', 'calendar', 'wiki'];
    if (merged.dashboardWidgets) {
      const invalid = merged.dashboardWidgets.filter((w: string) => !validWidgets.includes(w));
      if (invalid.length > 0) {
        throw new BadRequestException(`Widgets non reconnus : ${invalid.join(', ')}`);
      }
    }

    const value = JSON.stringify(merged);

    await this.prisma.appConfig.upsert({
      where: { key: configKey },
      update: { value, updatedById: userId },
      create: { key: configKey, value, description: `Préférences utilisateur ${userId}`, updatedById: userId },
    });

    this.logger.log(`Preferences updated for user: ${userId}`);
    return merged;
  }

  private readonly DEFAULT_NOTIFICATION_PREFS = {
    emailDocuments: true,
    emailTickets: true,
    emailSecurityAlerts: true, // always forced on
    emailNews: true,
    dailySummary: false,
    pushBrowser: false,
  };

  async getNotificationPreferences(userId: string) {
    const configKey = `notification_prefs_${userId}`;
    const config = await this.prisma.appConfig.findUnique({
      where: { key: configKey },
    });

    if (!config) {
      return { ...this.DEFAULT_NOTIFICATION_PREFS };
    }

    try {
      const stored = JSON.parse(config.value);
      return {
        ...this.DEFAULT_NOTIFICATION_PREFS,
        ...stored,
        emailSecurityAlerts: true, // always forced
      };
    } catch {
      return { ...this.DEFAULT_NOTIFICATION_PREFS };
    }
  }

  async updateNotificationPreferences(
    userId: string,
    prefs: {
      emailDocuments?: boolean;
      emailTickets?: boolean;
      emailNews?: boolean;
      dailySummary?: boolean;
      pushBrowser?: boolean;
    },
  ) {
    const configKey = `notification_prefs_${userId}`;

    const current = await this.getNotificationPreferences(userId);
    const merged = {
      ...current,
      ...prefs,
      emailSecurityAlerts: true, // always forced on
    };

    const value = JSON.stringify(merged);

    await this.prisma.appConfig.upsert({
      where: { key: configKey },
      update: { value, updatedById: userId },
      create: {
        key: configKey,
        value,
        description: `Préférences de notification utilisateur ${userId}`,
        updatedById: userId,
      },
    });

    this.logger.log(`Notification preferences updated for user: ${userId}`);
    return merged;
  }

  async requestGdprExport(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        jobTitle: true,
        phone: true,
        location: true,
        skills: true,
        languages: true,
        teamsLink: true,
        avatarUrl: true,
        isActive: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        department: { select: { id: true, name: true, code: true } },
        departmentMemberships: {
          select: { department: { select: { id: true, name: true } }, isPrimary: true },
        },
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [documents, tickets, notifications, auditLogs] = await Promise.all([
      this.prisma.document.findMany({
        where: { ownerId: userId, deletedAt: null },
        select: { id: true, title: true, status: true, category: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.ticket.findMany({
        where: { OR: [{ creatorId: userId }, { assigneeId: userId }] },
        select: { id: true, title: true, status: true, priority: true, category: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.notification.findMany({
        where: { userId },
        select: { id: true, title: true, body: true, type: true, isRead: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.auditLog.findMany({
        where: { userId },
        select: { id: true, action: true, resourceType: true, resourceId: true, metadata: true, severity: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ]);

    // Record the export request
    await this.prisma.dataExportRequest.create({
      data: { userId, processedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: 'GDPR_DATA_EXPORT',
      resourceType: 'User',
      resourceId: userId,
      severity: 'INFO',
    });

    this.logger.log(`GDPR export generated for user: ${userId}`);

    return {
      exportDate: new Date().toISOString(),
      user,
      documents,
      tickets,
      notifications,
      auditLogs,
    };
  }

  // ── Multi-departments ──────────────────────────────────────────────

  async getUserDepartments(userId: string) {
    await this.findById(userId);
    const memberships = await this.prisma.userDepartment.findMany({
      where: { userId },
      include: { department: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships;
  }

  async addUserDepartment(userId: string, departmentId: string) {
    await this.findById(userId);

    // Check department exists
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    // Check for existing membership
    const existing = await this.prisma.userDepartment.findUnique({
      where: { userId_departmentId: { userId, departmentId } },
    });
    if (existing) throw new BadRequestException('L\'utilisateur appartient déjà à ce département');

    const membership = await this.prisma.userDepartment.create({
      data: { userId, departmentId },
      include: { department: { select: { id: true, name: true, code: true } } },
    });

    this.logger.log(`Department ${departmentId} added to user ${userId}`);
    return membership;
  }

  async removeUserDepartment(userId: string, departmentId: string) {
    await this.findById(userId);

    const existing = await this.prisma.userDepartment.findUnique({
      where: { userId_departmentId: { userId, departmentId } },
    });
    if (!existing) throw new NotFoundException('Membership not found');

    await this.prisma.userDepartment.delete({
      where: { userId_departmentId: { userId, departmentId } },
    });

    this.logger.log(`Department ${departmentId} removed from user ${userId}`);
    return { deleted: true };
  }

  /**
   * Bulk-replace secondary departments for a user.
   * The primary department (user.departmentId) is NOT changed here.
   */
  async updateUserDepartments(userId: string, departmentIds: string[]) {
    const user = await this.findById(userId);

    // Validate all departments exist
    if (departmentIds.length > 0) {
      const found = await this.prisma.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true },
      });
      if (found.length !== departmentIds.length) {
        throw new NotFoundException('One or more departments not found');
      }
    }

    // Remove all existing memberships, then recreate
    await this.prisma.userDepartment.deleteMany({ where: { userId } });

    const toCreate: Array<{ userId: string; departmentId: string; isPrimary: boolean }> = [];

    // Always ensure the primary department is included if set
    if (user.departmentId) {
      toCreate.push({ userId, departmentId: user.departmentId, isPrimary: true });
    }

    for (const dId of departmentIds) {
      if (dId !== user.departmentId) {
        toCreate.push({ userId, departmentId: dId, isPrimary: false });
      }
    }

    if (toCreate.length > 0) {
      await this.prisma.userDepartment.createMany({ data: toCreate });
    }

    this.logger.log(`Departments updated for user ${userId}: ${departmentIds.join(', ')}`);
    return this.getUserDepartments(userId);
  }

  // ── SpaceAccessConfig (USER scope) ──────────────────────────────────

  async getUserSpaceAccessConfigs(userId: string) {
    await this.findById(userId);
    return this.prisma.spaceAccessConfig.findMany({
      where: { scopeType: 'USER', scopeValue: userId },
      orderBy: { module: 'asc' },
    });
  }

  async setUserSpaceAccess(userId: string, module: string, enabled: boolean, config?: Record<string, unknown>) {
    await this.findById(userId);

    const entry = await this.prisma.spaceAccessConfig.upsert({
      where: {
        module_scopeType_scopeValue: { module, scopeType: 'USER', scopeValue: userId },
      },
      update: { enabled, ...(config !== undefined && { config: config as any }) },
      create: {
        module,
        scopeType: 'USER',
        scopeValue: userId,
        enabled,
        ...(config !== undefined && { config: config as any }),
      },
    });

    this.logger.log(`SpaceAccessConfig USER/${userId} module=${module} enabled=${enabled}`);
    return entry;
  }

  async deleteUserSpaceAccess(userId: string, module: string) {
    await this.findById(userId);

    const existing = await this.prisma.spaceAccessConfig.findUnique({
      where: {
        module_scopeType_scopeValue: { module, scopeType: 'USER', scopeValue: userId },
      },
    });
    if (!existing) throw new NotFoundException('SpaceAccessConfig not found');

    await this.prisma.spaceAccessConfig.delete({ where: { id: existing.id } });

    this.logger.log(`SpaceAccessConfig deleted USER/${userId} module=${module}`);
    return { deleted: true };
  }

  async getAllModules(): Promise<string[]> {
    const configs = await this.prisma.spaceAccessConfig.findMany({
      select: { module: true },
      distinct: ['module'],
      orderBy: { module: 'asc' },
    });
    return configs.map((c) => c.module);
  }
}
