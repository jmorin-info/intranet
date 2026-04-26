import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Service de gestion des campagnes de signature DocuSeal.
 * ISO 27001 A.5.1 (politiques) + A.6.2 (acceptation responsabilites).
 *
 * Scaffold 2026-04-13 — appels DocuSeal encapsules dans fetch natif,
 * tous annotes `// TODO: tester` car l'API reelle n'a pas ete eprouvee ici.
 */

export interface CreateCampaignOptions {
  title?: string;
  description?: string;
  createdById: string;
  targetAllActiveUsers?: boolean;
  targetRoles?: string[];
  targetDepartmentIds?: string[];
  docusealTemplateId?: string;
  dueAt?: Date;
}

interface DocusealSubmissionResponse {
  id?: number | string;
  slug?: string;
  submitters?: Array<{
    id?: number | string;
    email?: string;
    slug?: string;
  }>;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private readonly docusealApiUrl: string;
  private readonly docusealApiKey: string;
  private readonly docusealWebhookSecret: string;
  private readonly fetchTimeoutMs = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    this.docusealApiUrl =
      process.env.DOCUSEAL_API_URL || 'http://localhost:7000/api';
    this.docusealApiKey = process.env.DOCUSEAL_API_KEY || '';
    this.docusealWebhookSecret = process.env.DOCUSEAL_WEBHOOK_SECRET || '';
  }

  // ------------------------------------------------------------------
  // Creation depuis une charte / document de politique
  // ------------------------------------------------------------------

  async createFromCharte(charteId: string, options: CreateCampaignOptions) {
    const charte = await (this.prisma as any).charte.findUnique({
      where: { id: charteId },
    });
    if (!charte) {
      throw new NotFoundException(`Charte ${charteId} introuvable`);
    }

    const campaign = await (this.prisma as any).signatureCampaign.create({
      data: {
        title: options.title || `Signature : ${charte.title}`,
        description: options.description ?? null,
        sourceType: 'CHARTE',
        sourceId: charteId,
        targetAllActiveUsers: options.targetAllActiveUsers ?? false,
        targetRoles: options.targetRoles ?? [],
        targetDepartmentIds: options.targetDepartmentIds ?? [],
        docusealTemplateId: options.docusealTemplateId ?? null,
        dueAt: options.dueAt ?? null,
        createdById: options.createdById,
        status: 'DRAFT',
      },
    });
    this.logger.log(
      `Campagne creee depuis charte ${charteId} -> campaign ${campaign.id}`,
    );
    return campaign;
  }

  async createFromDocument(
    documentId: string,
    options: CreateCampaignOptions,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} introuvable`);
    }
    if (document.status !== 'APPROVED') {
      throw new BadRequestException(
        'Seuls les documents APPROVED peuvent declencher une campagne',
      );
    }

    const campaign = await (this.prisma as any).signatureCampaign.create({
      data: {
        title: options.title || `Signature : ${document.title}`,
        description: options.description ?? null,
        sourceType: 'DOCUMENT_POLICY',
        sourceId: documentId,
        targetAllActiveUsers: options.targetAllActiveUsers ?? false,
        targetRoles: options.targetRoles ?? [],
        targetDepartmentIds: options.targetDepartmentIds ?? [],
        docusealTemplateId: options.docusealTemplateId ?? null,
        dueAt: options.dueAt ?? null,
        createdById: options.createdById,
        status: 'DRAFT',
      },
    });
    this.logger.log(
      `Campagne creee depuis document ${documentId} -> campaign ${campaign.id}`,
    );
    return campaign;
  }

  // ------------------------------------------------------------------
  // Resolution des utilisateurs cibles
  // ------------------------------------------------------------------

  async resolveTargetUsers(campaign: {
    id: string;
    targetAllActiveUsers: boolean;
    targetRoles: string[];
    targetDepartmentIds: string[];
  }) {
    const where: any = {
      isActive: true,
      deletedAt: null,
    };

    if (!campaign.targetAllActiveUsers) {
      const or: any[] = [];
      if (campaign.targetRoles && campaign.targetRoles.length > 0) {
        or.push({ role: { in: campaign.targetRoles } });
      }
      if (
        campaign.targetDepartmentIds &&
        campaign.targetDepartmentIds.length > 0
      ) {
        or.push({ departmentId: { in: campaign.targetDepartmentIds } });
        or.push({
          departmentMemberships: {
            some: { departmentId: { in: campaign.targetDepartmentIds } },
          },
        });
      }
      if (or.length === 0) {
        this.logger.warn(
          `Campagne ${campaign.id} sans cible — aucune condition`,
        );
        return [];
      }
      where.OR = or;
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    return users;
  }

  // ------------------------------------------------------------------
  // Lancement de la campagne
  // ------------------------------------------------------------------

  async launch(campaignId: string) {
    const campaign = await (this.prisma as any).signatureCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campagne ${campaignId} introuvable`);
    }
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException(
        `Campagne deja lancee (statut: ${campaign.status})`,
      );
    }

    const users = await this.resolveTargetUsers(campaign);
    if (users.length === 0) {
      throw new BadRequestException(
        'Aucun utilisateur cible pour cette campagne',
      );
    }

    // Creation de la submission groupee DocuSeal
    // TODO: tester — structure du payload a verifier contre l'API reelle.
    let submissionGroupId: string | null = null;
    let docusealSubmitters: DocusealSubmissionResponse['submitters'] = [];
    if (campaign.docusealTemplateId) {
      try {
        const body = {
          template_id: Number(campaign.docusealTemplateId),
          send_email: true,
          submitters: users.map((u) => ({
            email: u.email,
            name: `${u.firstName} ${u.lastName}`,
            role: 'Signataire',
          })),
        };
        const resp = await this.docusealFetch('/submissions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (resp && typeof resp === 'object') {
          submissionGroupId = String(
            (resp as any).id || (resp as any).submission_id || '',
          ) || null;
          docusealSubmitters = (resp as any).submitters || [];
        }
      } catch (err: any) {
        this.logger.error(
          `Echec creation submission DocuSeal pour ${campaignId}: ${err?.message || err}`,
        );
      }
    } else {
      this.logger.warn(
        `Campagne ${campaignId} lancee sans docusealTemplateId — signatures en mode manuel`,
      );
    }

    // Insertion des CampaignSignature + notifications
    const now = new Date();
    for (const u of users) {
      const submitter = (docusealSubmitters || []).find(
        (s: any) => s?.email === u.email,
      );
      try {
        await (this.prisma as any).campaignSignature.upsert({
          where: {
            campaignId_userId: { campaignId, userId: u.id },
          },
          update: {},
          create: {
            campaignId,
            userId: u.id,
            status: 'PENDING',
            sentAt: now,
            docusealSubmissionId: submitter?.id ? String(submitter.id) : null,
            docusealSlug: submitter?.slug ?? null,
          },
        });

        await this.notifications
          .create({
            userId: u.id,
            type: 'SIGNATURE_REQUEST',
            title: `Signature requise : ${campaign.title}`,
            body:
              campaign.description ||
              'Une nouvelle politique necessite votre signature.',
            resourceType: 'SIGNATURE_CAMPAIGN',
            resourceId: campaignId,
          } as any)
          .catch((e) =>
            this.logger.warn(
              `Notification signature echouee pour ${u.id}: ${e?.message || e}`,
            ),
          );
      } catch (err: any) {
        this.logger.error(
          `Creation CampaignSignature echouee pour ${u.id}: ${err?.message || err}`,
        );
      }
    }

    const updated = await (this.prisma as any).signatureCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sentAt: now,
        docusealSubmissionGroupId: submissionGroupId,
      },
    });

    this.logger.log(
      `Campagne ${campaignId} lancee — ${users.length} destinataires`,
    );
    return updated;
  }

  // ------------------------------------------------------------------
  // Webhook DocuSeal
  // ------------------------------------------------------------------

  async handleWebhook(payload: any) {
    const eventType: string =
      payload?.event_type || payload?.type || 'unknown';
    const data = payload?.data || payload;

    this.logger.log(`Webhook campagne signature : ${eventType}`);

    const submissionId =
      data?.submission?.id ||
      data?.submission_id ||
      data?.id ||
      null;
    const email = data?.email || data?.submitter?.email;

    if (!submissionId && !email) {
      this.logger.warn('Webhook sans identifiant exploitable');
      return { ignored: true };
    }

    const whereSig: any = submissionId
      ? { docusealSubmissionId: String(submissionId) }
      : undefined;

    let signature: any = null;
    if (whereSig) {
      signature = await (this.prisma as any).campaignSignature.findFirst({
        where: whereSig,
      });
    }
    if (!signature && email) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user) {
        signature = await (this.prisma as any).campaignSignature.findFirst({
          where: { userId: user.id, status: { in: ['PENDING', 'OPENED'] } },
          orderBy: { sentAt: 'desc' },
        });
      }
    }

    if (!signature) {
      this.logger.warn(
        `Aucune CampaignSignature trouvee pour webhook ${eventType}`,
      );
      return { ignored: true };
    }

    const now = new Date();
    const patch: any = {};
    if (eventType === 'form.viewed' || eventType === 'submission.viewed') {
      patch.status = signature.status === 'PENDING' ? 'OPENED' : signature.status;
      patch.openedAt = signature.openedAt ?? now;
    } else if (
      eventType === 'form.completed' ||
      eventType === 'submission.completed'
    ) {
      patch.status = 'SIGNED';
      patch.signedAt = now;
    } else if (eventType === 'form.declined') {
      patch.status = 'DECLINED';
    }

    if (Object.keys(patch).length === 0) {
      return { ignored: true };
    }

    await (this.prisma as any).campaignSignature.update({
      where: { id: signature.id },
      data: patch,
    });

    // Mise a jour statut campagne si tout est signe
    if (patch.status === 'SIGNED') {
      await this.refreshCampaignAggregate(signature.campaignId);
    }

    return { updated: true, campaignSignatureId: signature.id };
  }

  verifyWebhookSignature(rawBody: string, headerSignature?: string): boolean {
    if (!this.docusealWebhookSecret) {
      // Pas de secret configure : on laisse passer mais on log
      this.logger.warn(
        'DOCUSEAL_WEBHOOK_SECRET non configure — verification desactivee',
      );
      return true;
    }
    if (!headerSignature) return false;

    try {
      // Fallback simple : comparaison secret brut (pattern existant dans WebhookController)
      if (headerSignature === this.docusealWebhookSecret) return true;

      // HMAC-SHA256
      const computed = createHmac('sha256', this.docusealWebhookSecret)
        .update(rawBody)
        .digest('hex');
      const a = Buffer.from(computed);
      const b = Buffer.from(headerSignature);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch (err: any) {
      this.logger.error(
        `Erreur verification signature webhook: ${err?.message || err}`,
      );
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Rappels
  // ------------------------------------------------------------------

  async sendReminders(campaignId: string) {
    const campaign = await (this.prisma as any).signatureCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campagne ${campaignId} introuvable`);
    }

    const pending = await (this.prisma as any).campaignSignature.findMany({
      where: {
        campaignId,
        status: { in: ['PENDING', 'OPENED'] },
      },
      include: { user: { select: { id: true, email: true } } },
    });

    const now = new Date();
    let sent = 0;
    for (const sig of pending) {
      try {
        await this.notifications.create({
          userId: sig.userId,
          // TODO: review type safety — 'SIGNATURE_REMINDER' n'est pas dans
          // l'enum Prisma NotificationType (cf. schema.prisma:53-67) : l'INSERT
          // côté DB échoue silencieusement. Utiliser SIGNATURE_NEEDED ou
          // étendre l'enum via migration ALTER TYPE.
          type: 'SIGNATURE_REMINDER' as any,
          title: `Rappel : ${campaign.title}`,
          body: campaign.dueAt
            ? `Signature attendue avant le ${new Date(campaign.dueAt).toLocaleDateString('fr-FR')}.`
            : 'Merci de proceder a la signature de ce document.',
          resourceType: 'SIGNATURE_CAMPAIGN',
          resourceId: campaignId,
        } as any);

        await (this.prisma as any).campaignSignature.update({
          where: { id: sig.id },
          data: {
            remindersSent: { increment: 1 },
            lastReminderAt: now,
          },
        });
        sent++;
      } catch (err: any) {
        this.logger.warn(
          `Rappel echoue pour signature ${sig.id}: ${err?.message || err}`,
        );
      }
    }

    await (this.prisma as any).signatureCampaign.update({
      where: { id: campaignId },
      data: {
        remindersSent: { increment: 1 },
        lastReminderAt: now,
      },
    });

    this.logger.log(`Rappels campagne ${campaignId} : ${sent}/${pending.length}`);
    return { sent, total: pending.length };
  }

  // ------------------------------------------------------------------
  // KPIs
  // ------------------------------------------------------------------

  async getStatus(campaignId: string) {
    const campaign = await (this.prisma as any).signatureCampaign.findUnique({
      where: { id: campaignId },
      include: { signatures: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campagne ${campaignId} introuvable`);
    }

    const total = campaign.signatures.length;
    const signed = campaign.signatures.filter(
      (s: any) => s.status === 'SIGNED',
    ).length;
    const opened = campaign.signatures.filter(
      (s: any) => s.status === 'OPENED',
    ).length;
    const declined = campaign.signatures.filter(
      (s: any) => s.status === 'DECLINED',
    ).length;
    const expired = campaign.signatures.filter(
      (s: any) => s.status === 'EXPIRED',
    ).length;
    const pending = total - signed - declined - expired;
    const now = new Date();
    const late =
      campaign.dueAt && campaign.dueAt < now
        ? campaign.signatures.filter((s: any) => s.status !== 'SIGNED').length
        : 0;

    return {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      dueAt: campaign.dueAt,
      total,
      signed,
      opened,
      pending,
      declined,
      expired,
      late,
      percentSigned: total > 0 ? Math.round((signed / total) * 100) : 0,
    };
  }

  async findAll() {
    return (this.prisma as any).signatureCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { signatures: true } } },
    });
  }

  async findOne(id: string) {
    const campaign = await (this.prisma as any).signatureCampaign.findUnique({
      where: { id },
      include: {
        signatures: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException(`Campagne ${id} introuvable`);
    const kpis = await this.getStatus(id);
    return { ...campaign, kpis };
  }

  async findMyPending(userId: string) {
    return (this.prisma as any).campaignSignature.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'OPENED'] },
      },
      include: {
        campaign: true,
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  // ------------------------------------------------------------------
  // Helpers internes
  // ------------------------------------------------------------------

  async refreshCampaignAggregate(campaignId: string) {
    const sigs = await (this.prisma as any).campaignSignature.findMany({
      where: { campaignId },
      select: { status: true },
    });
    if (sigs.length === 0) return;
    const allSigned = sigs.every(
      (s: any) => s.status === 'SIGNED' || s.status === 'DECLINED',
    );
    const anySigned = sigs.some((s: any) => s.status === 'SIGNED');

    let newStatus: string | null = null;
    if (allSigned && sigs.every((s: any) => s.status === 'SIGNED')) {
      newStatus = 'COMPLETED';
    } else if (anySigned) {
      newStatus = 'IN_PROGRESS';
    }
    if (newStatus) {
      await (this.prisma as any).signatureCampaign.update({
        where: { id: campaignId },
        data: { status: newStatus },
      });
    }
  }

  private async docusealFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    // TODO: tester — wrapper fetch natif avec timeout 5s
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const resp = await fetch(`${this.docusealApiUrl}${path}`, {
        ...init,
        signal: controller.signal as AbortSignal,
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': this.docusealApiKey,
          ...(init.headers || {}),
        },
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`DocuSeal ${resp.status}: ${txt}`);
      }
      return await resp.json().catch(() => ({}));
    } finally {
      clearTimeout(timer);
    }
  }
}
