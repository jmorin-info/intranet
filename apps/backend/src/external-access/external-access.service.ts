import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ExternalAccessService {
  private readonly logger = new Logger(ExternalAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createPrestaAccount(data: {
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
    contractRef?: string;
    accessExpiresAt?: string;
    sessionTimeout?: number;
  }, createdByUserId: string) {
    // Check email not already used
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ForbiddenException('Un compte avec cet email existe déjà');

    // Generate random password (16 chars)
    const crypto = await import('crypto');
    const rawPassword = crypto.randomBytes(12).toString('base64url').substring(0, 16);
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    // Create user with PRESTATAIRE role
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        role: 'PRESTATAIRE',
        isActive: true,
        gdprConsentAt: new Date(),
        gdprConsentIp: 'ADMIN_CREATED',
      },
    });

    // Create external access record
    const access = await this.prisma.externalAccess.create({
      data: {
        userId: user.id,
        companyName: data.companyName,
        contractRef: data.contractRef || null,
        accessExpiresAt: data.accessExpiresAt ? new Date(data.accessExpiresAt) : null,
        sessionTimeout: data.sessionTimeout || 1800,
        isActive: true,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.audit.log({
      userId: createdByUserId,
      action: 'PRESTATAIRE_ACCOUNT_CREATED',
      resourceType: 'ExternalAccess',
      resourceId: access.id,
      metadata: { email: data.email, companyName: data.companyName },
      severity: 'WARN',
    });

    // Return the password ONE TIME ONLY — it cannot be retrieved later
    return {
      success: true,
      message: 'Compte prestataire créé',
      account: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'PRESTATAIRE',
      },
      access: {
        id: access.id,
        companyName: access.companyName,
        contractRef: access.contractRef,
        accessExpiresAt: access.accessExpiresAt,
      },
      credentials: {
        email: user.email,
        password: rawPassword,
        warning: 'Ce mot de passe ne sera plus affiché. Notez-le et transmettez-le de manière sécurisée.',
      },
    };
  }

  async grantAccess(data: {
    userId: string;
    companyName: string;
    contractRef: string;
    accessExpiresAt?: Date;
    sessionTimeout?: number;
  }, grantedByUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'PRESTATAIRE') throw new ForbiddenException('User must have PRESTATAIRE role');

    const access = await this.prisma.externalAccess.create({
      data: {
        userId: data.userId,
        companyName: data.companyName,
        contractRef: data.contractRef,
        accessGrantedAt: new Date(),
        accessExpiresAt: data.accessExpiresAt ? new Date(data.accessExpiresAt) : null,
        sessionTimeout: data.sessionTimeout || 3600,
        isActive: true,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.audit.log({
      userId: grantedByUserId,
      action: 'EXTERNAL_ACCESS_GRANTED',
      resourceType: 'ExternalAccess',
      resourceId: access.id,
      metadata: {
        targetUserId: data.userId,
        companyName: data.companyName,
        contractRef: data.contractRef,
      },
    });

    return access;
  }

  async revokeAccess(id: string, userId: string) {
    const access = await this.prisma.externalAccess.findUnique({ where: { id } });
    if (!access) throw new NotFoundException('External access not found');

    const updated = await this.prisma.externalAccess.update({
      where: { id },
      data: { isActive: false },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.audit.log({
      userId,
      action: 'EXTERNAL_ACCESS_REVOKED',
      resourceType: 'ExternalAccess',
      resourceId: id,
      metadata: {
        targetUserId: access.userId,
        companyName: access.companyName,
        contractRef: access.contractRef,
      },
      severity: 'WARN',
    });

    return updated;
  }

  async listExternalAccess(filters?: {
    isActive?: boolean;
    companyName?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const where: any = {};

    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.companyName) {
      where.companyName = { contains: filters.companyName, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.externalAccess.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.externalAccess.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getByUserId(userId: string) {
    const access = await this.prisma.externalAccess.findFirst({
      where: { userId, isActive: true },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!access) throw new NotFoundException('External access not found for this user');
    return access;
  }

  async reviewAccess(accessId: string, reviewerId: string) {
    const access = await this.prisma.externalAccess.findUnique({ where: { id: accessId } });
    if (!access) throw new NotFoundException('External access not found');

    const updated = await this.prisma.externalAccess.update({
      where: { id: accessId },
      data: {
        lastReviewedAt: new Date(),
        lastReviewedBy: reviewerId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.audit.log({
      userId: reviewerId,
      action: 'EXTERNAL_ACCESS_REVIEWED',
      resourceType: 'ExternalAccess',
      resourceId: accessId,
      metadata: {
        targetUserId: access.userId,
        companyName: access.companyName,
        contractRef: access.contractRef,
      },
    });

    return updated;
  }

  async getExpiredAccess() {
    return this.prisma.externalAccess.findMany({
      where: {
        isActive: true,
        accessExpiresAt: { lt: new Date() },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { accessExpiresAt: 'asc' },
    });
  }

  async getAccessDueForReview() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.prisma.externalAccess.findMany({
      where: {
        isActive: true,
        OR: [
          { lastReviewedAt: null },
          { lastReviewedAt: { lt: thirtyDaysAgo } },
        ],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { lastReviewedAt: 'asc' },
    });
  }

  async getPrestataireDashboard(userId: string) {
    const access = await this.prisma.externalAccess.findFirst({
      where: { userId, isActive: true },
    });
    if (!access) throw new NotFoundException('External access not found');

    // Only tickets where user is creator or assignee
    const tickets = await this.prisma.ticket.findMany({
      where: {
        OR: [
          { creatorId: userId },
          { assigneeId: userId },
        ],
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Only documents with category CONTRACT that are approved or in review
    const documents = await this.prisma.document.findMany({
      where: {
        category: 'CONTRACT',
        status: { in: ['APPROVED', 'IN_REVIEW'] },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        reference: true,
        category: true,
        status: true,
        classification: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return {
      access: {
        companyName: access.companyName,
        contractRef: access.contractRef,
        accessGrantedAt: access.accessGrantedAt,
        accessExpiresAt: access.accessExpiresAt,
      },
      tickets,
      documents,
    };
  }

  /**
   * Monthly cron: runs at 09:00 on the 1st of each month.
   * Flags overdue reviews and generates EXTERNAL_ACCESS_REVIEW notifications
   * for ADMIN/SUPER_ADMIN users (RSSI monthly review).
   */
  @Cron('0 9 1 * *')
  async handleMonthlyReviewCheck() {
    this.logger.log('Running monthly external access review check');

    try {
      const dueForReview = await this.getAccessDueForReview();

      if (dueForReview.length === 0) {
        this.logger.log('No external accesses due for review');
        return;
      }

      // Notify all admins about overdue reviews
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, deletedAt: null },
      });

      for (const admin of admins) {
        await this.notifications.create({
          userId: admin.id,
          type: 'EXTERNAL_ACCESS_REVIEW',
          title: `Revue mensuelle des accès prestataires`,
          body: `${dueForReview.length} accès prestataire(s) nécessite(nt) une revue. Contrats concernés : ${dueForReview.map((a) => a.contractRef).join(', ')}`,
          resourceType: 'ExternalAccess',
        });
      }

      // Auto-revoke expired accesses
      const expired = await this.getExpiredAccess();
      for (const access of expired) {
        await this.prisma.externalAccess.update({
          where: { id: access.id },
          data: { isActive: false },
        });

        await this.audit.log({
          action: 'EXTERNAL_ACCESS_AUTO_REVOKED',
          resourceType: 'ExternalAccess',
          resourceId: access.id,
          metadata: {
            reason: 'Expiration automatique',
            companyName: access.companyName,
            contractRef: access.contractRef,
          },
          severity: 'WARN',
        });
      }

      this.logger.log(
        `Monthly review: ${dueForReview.length} due for review, ${expired.length} auto-revoked`,
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Monthly review check failed: ${err.message}`, err.stack);
    }
  }
}
