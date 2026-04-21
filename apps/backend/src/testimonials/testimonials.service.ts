import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/interfaces';
import { ROLE_HIERARCHY, UserRole } from '../common/enums';
import { SubmitTestimonialDto, RejectTestimonialDto } from './dto/submit.dto';

const MIN_APPROVED_FOR_PUBLIC_DISPLAY = 3;
const SUBMISSION_COOLDOWN_DAYS = 90;

@Injectable()
export class TestimonialsService {
  private readonly logger = new Logger(TestimonialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isAdmin(user: RequestUser): boolean {
    return ROLE_HIERARCHY[user.role as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN];
  }

  /**
   * Un utilisateur peut soumettre un témoignage tous les SUBMISSION_COOLDOWN_DAYS.
   * Évite le spam et encourage le témoignage réfléchi.
   */
  private async canSubmit(userId: string): Promise<{ allowed: boolean; nextAllowedAt?: Date }> {
    const lastSubmission = await this.prisma.testimonial.findFirst({
      where: { submittedById: userId },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    });
    if (!lastSubmission) return { allowed: true };

    const daysSince = (Date.now() - lastSubmission.submittedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= SUBMISSION_COOLDOWN_DAYS) return { allowed: true };

    const nextAllowedAt = new Date(
      lastSubmission.submittedAt.getTime() + SUBMISSION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );
    return { allowed: false, nextAllowedAt };
  }

  async submit(user: RequestUser, dto: SubmitTestimonialDto) {
    const check = await this.canSubmit(user.id);
    if (!check.allowed) {
      throw new ConflictException(
        `Vous avez déjà soumis un témoignage récemment. Prochaine soumission possible à partir du ${check.nextAllowedAt?.toISOString().slice(0, 10)}.`,
      );
    }

    // Récupère département + rôle actuels pour snapshot dans le témoignage
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { department: { select: { name: true } } },
    });

    const testimonial = await this.prisma.testimonial.create({
      data: {
        quote: dto.quote.trim(),
        department: (dto.department?.trim() || dbUser?.department?.name || null),
        role: dbUser?.role ?? null,
        submittedById: user.id,
        isApproved: false,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'TESTIMONIAL_SUBMITTED',
      resourceType: 'Testimonial',
      resourceId: testimonial.id,
      metadata: { quoteLength: testimonial.quote.length } as unknown as Record<string, unknown>,
      severity: 'INFO',
    });

    return testimonial;
  }

  /**
   * Témoignages approuvés, ordonnés par date d'approbation décroissante.
   * Affichage /welcome : on ne montre la section QUE si >= 3 approuvés,
   * sinon fallback silencieux (pas de section vide). Limite à 12 max.
   */
  async listApproved(limit = 12) {
    const approved = await this.prisma.testimonial.findMany({
      where: { isApproved: true },
      orderBy: { approvedAt: 'desc' },
      take: Math.min(limit, 30),
      select: {
        id: true,
        quote: true,
        department: true,
        role: true,
        approvedAt: true,
      },
    });
    return {
      visible: approved.length >= MIN_APPROVED_FOR_PUBLIC_DISPLAY,
      count: approved.length,
      items: approved.length >= MIN_APPROVED_FOR_PUBLIC_DISPLAY ? approved : [],
    };
  }

  async listMine(user: RequestUser) {
    return this.prisma.testimonial.findMany({
      where: { submittedById: user.id },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        quote: true,
        department: true,
        isApproved: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        rejectionReason: true,
      },
    });
  }

  async listPending(user: RequestUser) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Réservé aux administrateurs.');
    }
    return this.prisma.testimonial.findMany({
      where: { isApproved: false, rejectedAt: null },
      orderBy: { submittedAt: 'asc' },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async listAll(user: RequestUser) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Réservé aux administrateurs.');
    }
    return this.prisma.testimonial.findMany({
      orderBy: { submittedAt: 'desc' },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async approve(user: RequestUser, id: string) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Réservé aux administrateurs.');
    }
    const existing = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Témoignage introuvable.');
    if (existing.isApproved) {
      throw new BadRequestException('Déjà approuvé.');
    }

    const updated = await this.prisma.testimonial.update({
      where: { id },
      data: {
        isApproved: true,
        approvedAt: new Date(),
        approvedById: user.id,
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'TESTIMONIAL_APPROVED',
      resourceType: 'Testimonial',
      resourceId: id,
      severity: 'INFO',
    });

    return updated;
  }

  async reject(user: RequestUser, id: string, dto: RejectTestimonialDto) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Réservé aux administrateurs.');
    }
    const existing = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Témoignage introuvable.');

    const updated = await this.prisma.testimonial.update({
      where: { id },
      data: {
        isApproved: false,
        approvedAt: null,
        approvedById: null,
        rejectedAt: new Date(),
        rejectionReason: dto.reason ?? null,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'TESTIMONIAL_REJECTED',
      resourceType: 'Testimonial',
      resourceId: id,
      metadata: { reason: dto.reason ?? null } as unknown as Record<string, unknown>,
      severity: 'INFO',
    });

    return updated;
  }

  async remove(user: RequestUser, id: string) {
    const existing = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Témoignage introuvable.');

    const isOwner = existing.submittedById === user.id && !existing.isApproved;
    if (!this.isAdmin(user) && !isOwner) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres témoignages en attente.');
    }

    await this.prisma.testimonial.delete({ where: { id } });

    await this.audit.log({
      userId: user.id,
      action: 'TESTIMONIAL_DELETED',
      resourceType: 'Testimonial',
      resourceId: id,
      severity: 'WARN',
    });

    return { message: 'Témoignage supprimé.' };
  }
}
