import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';
import {
  AccessReviewCampaignTypeDto,
  CreateCampaignDto,
} from './dto/create-campaign.dto';
import { ReviewDecision } from './dto/review-decision.dto';

/**
 * AccessReviewsService — periodic user access review workflow (ISO 27001 A.5.18).
 *
 * Types de campagne supportés :
 *  - ACCESS_RIGHTS  (défaut) : revue des droits d'accès des utilisateurs actifs
 *  - PASSWORDS             : revue des mots de passe non renouvelés / absence MFA
 *  - INACTIVE_USERS        : revue des comptes inactifs (≥ 90 jours sans connexion)
 *
 * Core flow:
 *  1. An RSSI/SUPER_ADMIN creates a campaign (any type)
 *  2. The service auto-generates one AccessReview per in-scope user (filtrage selon le type)
 *  3. Managers / RSSI submit decisions (KEEP, REVOKE, CHANGE_ROLE, CHANGE_DEPT)
 *  4. Actions are logged in AuditLog
 *  5. Campaign can be closed, flagging any remaining PENDING reviews as EXPIRED
 */
@Injectable()
export class AccessReviewsService {
  private readonly logger = new Logger(AccessReviewsService.name);
  /**
   * Seuil d'inactivité (en jours) au-delà duquel un compte est proposé en revue.
   */
  private readonly INACTIVE_THRESHOLD_DAYS = 90;
  /**
   * Seuil de rotation des mots de passe (en mois) — utilise `createdAt`
   * comme fallback tant que `passwordChangedAt` n'existe pas sur User.
   */
  private readonly PASSWORD_ROTATION_MONTHS = 6;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates a new review campaign and auto-generates one AccessReview
   * per active user matching the campaign scope. Le champ `type` détermine
   * les critères de pré-sélection des utilisateurs.
   */
  async createCampaign(dto: CreateCampaignDto, createdById: string) {
    const dueDate = new Date(dto.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('dueDate invalide');
    }
    if (dueDate.getTime() < Date.now()) {
      throw new BadRequestException('dueDate doit être dans le futur');
    }

    const type = dto.type || AccessReviewCampaignTypeDto.ACCESS_RIGHTS;

    const campaign = await this.prisma.accessReviewCampaign.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        type: type as never,
        dueDate,
        status: 'ACTIVE',
        createdById,
        scopeDepartmentId: dto.scopeDepartmentId || null,
        scopeRoles: dto.scopeRoles && dto.scopeRoles.length > 0 ? dto.scopeRoles : [],
      },
    });

    const generated = await this.generateReviews(campaign.id);

    await this.audit.log({
      userId: createdById,
      action: 'ACCESS_REVIEW_CAMPAIGN_CREATED',
      resourceType: 'AccessReviewCampaign',
      resourceId: campaign.id,
      metadata: {
        name: campaign.name,
        type,
        dueDate: campaign.dueDate,
        scopeDepartmentId: campaign.scopeDepartmentId,
        scopeRoles: campaign.scopeRoles,
        generatedReviews: generated.count,
      },
      severity: 'WARN',
    });

    return {
      ...campaign,
      reviewsCount: generated.count,
    };
  }

  /**
   * Creates one AccessReview row per in-scope active user for this campaign.
   * Le type de campagne pilote le filtrage :
   *  - ACCESS_RIGHTS : tous les users actifs hors PRESTATAIRE
   *  - PASSWORDS     : users actifs dont createdAt > PASSWORD_ROTATION_MONTHS OU MFA désactivé
   *  - INACTIVE_USERS: users actifs dont lastLoginAt ≥ INACTIVE_THRESHOLD_DAYS (ou jamais connectés)
   */
  async generateReviews(campaignId: string) {
    const campaign = await this.prisma.accessReviewCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');

    const where: Record<string, unknown> = {
      isActive: true,
      deletedAt: null,
    };

    const type = (campaign as unknown as { type?: string }).type || 'ACCESS_RIGHTS';

    if (type === 'ACCESS_RIGHTS') {
      where.role = { not: UserRole.PRESTATAIRE };
    } else if (type === 'INACTIVE_USERS') {
      const threshold = new Date(
        Date.now() - this.INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
      );
      // lastLoginAt < seuil OU jamais connecté (null)
      where.OR = [
        { lastLoginAt: { lt: threshold } },
        { lastLoginAt: null },
      ];
    } else if (type === 'PASSWORDS') {
      const threshold = new Date();
      threshold.setMonth(threshold.getMonth() - this.PASSWORD_ROTATION_MONTHS);
      // Fallback : on cible users créés il y a plus de N mois OU sans MFA activée
      // (faute de champ `passwordChangedAt` sur User).
      where.OR = [
        { createdAt: { lt: threshold } },
        { mfaEnabled: false },
      ];
    }

    if (campaign.scopeDepartmentId) {
      where.departmentId = campaign.scopeDepartmentId;
    }
    if (campaign.scopeRoles && campaign.scopeRoles.length > 0) {
      where.role = { in: campaign.scopeRoles };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, managerId: true },
    });

    if (users.length === 0) {
      return { count: 0 };
    }

    // Avoid duplicates if generateReviews is called twice
    const existing = await this.prisma.accessReview.findMany({
      where: { campaignId },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((r) => r.userId));

    // Contexte par défaut selon le type — injecté dans le champ comments
    const defaultComment =
      type === 'PASSWORDS'
        ? 'Renouvellement MDP conseillé (rotation > 6 mois ou MFA absent)'
        : type === 'INACTIVE_USERS'
          ? 'Compte inactif ≥ 90 jours — envisager désactivation'
          : null;

    const toCreate = users
      .filter((u) => !existingIds.has(u.id))
      .map((u) => ({
        campaignId,
        userId: u.id,
        reviewerId: u.managerId || null,
        status: 'PENDING' as const,
        comments: defaultComment,
      }));

    if (toCreate.length === 0) {
      return { count: 0 };
    }

    const result = await this.prisma.accessReview.createMany({
      data: toCreate,
    });

    return { count: result.count };
  }

  /**
   * Campagne dédiée "PASSWORDS" — wrapper ergonomique.
   * Crée une campagne de type PASSWORDS avec une échéance par défaut à 30 jours.
   */
  async createPasswordReviewCampaign(
    createdById: string,
    overrides?: Partial<CreateCampaignDto>,
  ) {
    const dueDate = overrides?.dueDate
      ? overrides.dueDate
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const dto: CreateCampaignDto = {
      name:
        overrides?.name ||
        `Revue mots de passe — ${new Date().toISOString().slice(0, 10)}`,
      description:
        overrides?.description ||
        `Revue automatique des mots de passe : utilisateurs créés depuis plus de ${this.PASSWORD_ROTATION_MONTHS} mois ou sans MFA activée.`,
      type: AccessReviewCampaignTypeDto.PASSWORDS,
      dueDate,
      scopeDepartmentId: overrides?.scopeDepartmentId,
      scopeRoles: overrides?.scopeRoles,
    };
    return this.createCampaign(dto, createdById);
  }

  /**
   * Campagne dédiée "INACTIVE_USERS" — wrapper ergonomique.
   * Crée une campagne de type INACTIVE_USERS avec une échéance par défaut à 30 jours.
   */
  async createInactiveReviewCampaign(
    createdById: string,
    overrides?: Partial<CreateCampaignDto>,
  ) {
    const dueDate = overrides?.dueDate
      ? overrides.dueDate
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const dto: CreateCampaignDto = {
      name:
        overrides?.name ||
        `Revue comptes inactifs — ${new Date().toISOString().slice(0, 10)}`,
      description:
        overrides?.description ||
        `Revue automatique des comptes inactifs : dernière connexion ≥ ${this.INACTIVE_THRESHOLD_DAYS} jours. Action suggérée : désactivation, relance, ou suppression.`,
      type: AccessReviewCampaignTypeDto.INACTIVE_USERS,
      dueDate,
      scopeDepartmentId: overrides?.scopeDepartmentId,
      scopeRoles: overrides?.scopeRoles,
    };
    return this.createCampaign(dto, createdById);
  }

  /**
   * Cron mensuel — 1er du mois à 3h du matin.
   * Crée automatiquement une campagne INACTIVE_USERS si aucune active n'existe
   * pour ce type. Désactivable via ACCESS_REVIEW_AUTO_INACTIVE=false.
   */
  @Cron('0 3 1 * *')
  async autoInactiveCampaignCron() {
    const enabled =
      (process.env.ACCESS_REVIEW_AUTO_INACTIVE || 'true').toLowerCase() !== 'false';
    if (!enabled) {
      this.logger.log('Cron auto-inactive désactivé par ACCESS_REVIEW_AUTO_INACTIVE=false');
      return;
    }

    try {
      const existing = await this.prisma.accessReviewCampaign.findFirst({
        where: {
          status: 'ACTIVE',
          // on cible les campagnes de type INACTIVE_USERS
          // (cast because Prisma type not yet widened in runtime TS)
          ...( { type: 'INACTIVE_USERS' } as Record<string, unknown>),
        },
      });
      if (existing) {
        this.logger.log(
          `Cron auto-inactive : campagne déjà active (${existing.id}), aucune action.`,
        );
        return;
      }

      // SYSTEM user fallback : première SUPER_ADMIN disponible
      const systemAdmin = await this.prisma.user.findFirst({
        where: { role: UserRole.SUPER_ADMIN, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!systemAdmin) {
        this.logger.warn('Cron auto-inactive : aucun SUPER_ADMIN trouvé pour créer la campagne.');
        return;
      }

      const result = await this.createInactiveReviewCampaign(systemAdmin.id, {
        name: `Revue mensuelle comptes inactifs — ${new Date().toISOString().slice(0, 7)}`,
        description:
          'Campagne mensuelle automatique (cron) : comptes actifs sans connexion depuis au moins 90 jours.',
      });
      this.logger.log(
        `Cron auto-inactive : campagne créée (${result.id}) avec ${result.reviewsCount} revues.`,
      );
    } catch (err) {
      this.logger.error('Cron auto-inactive : erreur', err as Error);
    }
  }

  /**
   * Lists all campaigns with aggregated review status counts.
   */
  async findCampaigns() {
    const campaigns = await this.prisma.accessReviewCampaign.findMany({
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    const ids = campaigns.map((c) => c.id);
    if (ids.length === 0) return [];

    const grouped = await this.prisma.accessReview.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    });

    return campaigns.map((c) => {
      const counts = { PENDING: 0, APPROVED: 0, REVOKED: 0, MODIFIED: 0, EXPIRED: 0 };
      let total = 0;
      for (const g of grouped) {
        if (g.campaignId !== c.id) continue;
        const status = g.status as keyof typeof counts;
        counts[status] = g._count._all;
        total += g._count._all;
      }
      const completed = counts.APPROVED + counts.REVOKED + counts.MODIFIED + counts.EXPIRED;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        ...c,
        stats: { total, completed, progress, ...counts },
      };
    });
  }

  /**
   * Returns a single campaign with its reviews (including the reviewed user).
   */
  async findCampaignById(id: string) {
    const campaign = await this.prisma.accessReviewCampaign.findUnique({
      where: { id },
      include: {
        reviews: {
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');

    const userIds = Array.from(new Set(campaign.reviews.map((r) => r.userId)));
    const reviewerIds = Array.from(
      new Set(campaign.reviews.map((r) => r.reviewerId).filter((v): v is string => !!v)),
    );
    const allIds = Array.from(new Set([...userIds, ...reviewerIds]));

    const users = allIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: allIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            mfaEnabled: true,
            createdAt: true,
            department: { select: { id: true, name: true, code: true } },
          },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      ...campaign,
      reviews: campaign.reviews.map((r) => ({
        ...r,
        user: userMap.get(r.userId) || null,
        reviewer: r.reviewerId ? userMap.get(r.reviewerId) || null : null,
      })),
    };
  }

  /**
   * Returns the PENDING reviews that the connected user should act on.
   * - Managers see their subordinates' reviews
   * - SUPER_ADMIN / ADMIN see all PENDING reviews
   */
  async findMyReviews(userId: string, userRole: UserRole) {
    const isAdmin =
      (ROLE_HIERARCHY[userRole] || 0) >= ROLE_HIERARCHY[UserRole.ADMIN];

    let userIds: string[] | null = null;
    if (!isAdmin) {
      const subs = await this.prisma.user.findMany({
        where: { managerId: userId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      userIds = subs.map((s) => s.id);
      if (userIds.length === 0) return [];
    }

    const reviews = await this.prisma.accessReview.findMany({
      where: {
        status: 'PENDING',
        campaign: { status: 'ACTIVE' },
        ...(isAdmin
          ? {
              OR: [{ reviewerId: userId }, { reviewerId: null }],
            }
          : {
              userId: { in: userIds as string[] },
            }),
      },
      include: {
        campaign: { select: { id: true, name: true, dueDate: true, status: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    const targetIds = Array.from(new Set(reviews.map((r) => r.userId)));
    const users = targetIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: targetIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            mfaEnabled: true,
            createdAt: true,
            department: { select: { id: true, name: true, code: true } },
          },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return reviews.map((r) => ({
      ...r,
      user: userMap.get(r.userId) || null,
    }));
  }

  /**
   * Submits a decision on an AccessReview. Updates status and logs audit.
   * Note: this does NOT yet flip user.isActive — revocation is tracked,
   * the effective deactivation is a manual follow-up action.
   */
  async submitDecision(
    reviewId: string,
    decision: ReviewDecision,
    comments: string | undefined,
    reviewerId: string,
    reviewerRole: UserRole,
  ) {
    const review = await this.prisma.accessReview.findUnique({
      where: { id: reviewId },
      include: { campaign: true },
    });
    if (!review) throw new NotFoundException('Revue introuvable');
    if (review.campaign.status !== 'ACTIVE') {
      throw new BadRequestException('La campagne n’est pas active');
    }
    if (review.status !== 'PENDING') {
      throw new BadRequestException('Cette revue a déjà été traitée');
    }

    // Permission: admin+ can decide any review, others can only decide reviews
    // where they are the assigned reviewer.
    const isAdmin =
      (ROLE_HIERARCHY[reviewerRole] || 0) >= ROLE_HIERARCHY[UserRole.ADMIN];
    if (!isAdmin && review.reviewerId && review.reviewerId !== reviewerId) {
      throw new ForbiddenException(
        'Vous n’êtes pas le relecteur désigné pour cette revue',
      );
    }

    const statusMap: Record<ReviewDecision, 'APPROVED' | 'REVOKED' | 'MODIFIED'> = {
      [ReviewDecision.KEEP]: 'APPROVED',
      [ReviewDecision.REVOKE]: 'REVOKED',
      [ReviewDecision.CHANGE_ROLE]: 'MODIFIED',
      [ReviewDecision.CHANGE_DEPT]: 'MODIFIED',
    };

    const updated = await this.prisma.accessReview.update({
      where: { id: reviewId },
      data: {
        status: statusMap[decision],
        decision,
        comments: comments || null,
        reviewerId: reviewerId,
        reviewedAt: new Date(),
      },
    });

    await this.audit.log({
      userId: reviewerId,
      action: `ACCESS_REVIEW_${statusMap[decision]}`,
      resourceType: 'AccessReview',
      resourceId: reviewId,
      metadata: {
        campaignId: review.campaignId,
        targetUserId: review.userId,
        decision,
        comments: comments || null,
      },
      severity: decision === ReviewDecision.REVOKE ? 'WARN' : 'INFO',
    });

    return updated;
  }

  /**
   * Closes a campaign — flags all remaining PENDING reviews as EXPIRED,
   * then marks the campaign as COMPLETED.
   */
  async closeCampaign(campaignId: string, closedById: string) {
    const campaign = await this.prisma.accessReviewCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.status === 'COMPLETED') {
      throw new BadRequestException('Campagne déjà clôturée');
    }

    const expired = await this.prisma.accessReview.updateMany({
      where: { campaignId, status: 'PENDING' },
      data: { status: 'EXPIRED', reviewedAt: new Date() },
    });

    const updated = await this.prisma.accessReviewCampaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await this.audit.log({
      userId: closedById,
      action: 'ACCESS_REVIEW_CAMPAIGN_CLOSED',
      resourceType: 'AccessReviewCampaign',
      resourceId: campaignId,
      metadata: {
        name: campaign.name,
        expiredReviews: expired.count,
      },
      severity: 'WARN',
    });

    return {
      ...updated,
      expiredCount: expired.count,
    };
  }

  /**
   * Returns an aggregated report for a campaign (counts + completion rate).
   */
  async getCampaignReport(campaignId: string) {
    const campaign = await this.prisma.accessReviewCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');

    const grouped = await this.prisma.accessReview.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });

    const counts = { PENDING: 0, APPROVED: 0, REVOKED: 0, MODIFIED: 0, EXPIRED: 0 };
    let total = 0;
    for (const g of grouped) {
      const status = g.status as keyof typeof counts;
      counts[status] = g._count._all;
      total += g._count._all;
    }
    const completed = counts.APPROVED + counts.REVOKED + counts.MODIFIED + counts.EXPIRED;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      campaign,
      total,
      completed,
      completionRate,
      approved: counts.APPROVED,
      revoked: counts.REVOKED,
      modified: counts.MODIFIED,
      expired: counts.EXPIRED,
      pending: counts.PENDING,
    };
  }
}
