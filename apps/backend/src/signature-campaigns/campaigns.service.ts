import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { NotificationType, SignatureCampaignStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Service de gestion des campagnes de signature DocuSeal.
 * ISO 27001 A.5.1 (politiques) + A.6.2 (acceptation responsabilites).
 *
 * Refonte 2026-07-24 : une campagne est un GÉNÉRATEUR de SignatureRequest
 * individuelles (une par cible, submission DocuSeal individuelle,
 * campaignId renseigné). Les CampaignSignature sont conservées en compat
 * lecture/stats (page admin manage, KPIs) mais la source de vérité de la
 * signature est SignatureRequest + SignatureEvidence.
 *
 * Le webhook DocuSeal passe UNIQUEMENT par /signatures/webhook (HMAC
 * strict) qui chaîne SignaturesService.handleWebhook puis handleWebhook
 * ci-dessous — l'ancien endpoint /signature-campaigns/webhook/docuseal
 * répond 410 Gone.
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
  private readonly fetchTimeoutMs = 5000;
  /** Taille de lot pour la création des submissions DocuSeal individuelles. */
  private static readonly DISPATCH_BATCH_SIZE = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    this.docusealApiUrl =
      process.env.DOCUSEAL_API_URL || "http://localhost:7000/api";
    this.docusealApiKey = process.env.DOCUSEAL_API_KEY || "";
  }

  // ------------------------------------------------------------------
  // Creation depuis une charte / document de politique
  // ------------------------------------------------------------------

  async createFromCharte(charteId: string, options: CreateCampaignOptions) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
    });
    if (!charte) {
      throw new NotFoundException(`Charte ${charteId} introuvable`);
    }

    const campaign = await this.prisma.signatureCampaign.create({
      data: {
        title: options.title || `Signature : ${charte.title}`,
        description: options.description ?? null,
        sourceType: "CHARTE",
        sourceId: charteId,
        targetAllActiveUsers: options.targetAllActiveUsers ?? false,
        targetRoles: options.targetRoles ?? [],
        targetDepartmentIds: options.targetDepartmentIds ?? [],
        docusealTemplateId: options.docusealTemplateId ?? null,
        dueAt: options.dueAt ?? null,
        createdById: options.createdById,
        status: "DRAFT",
      },
    });
    this.logger.log(
      `Campagne creee depuis charte ${charteId} -> campaign ${campaign.id}`,
    );
    return campaign;
  }

  async createFromDocument(documentId: string, options: CreateCampaignOptions) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} introuvable`);
    }
    if (document.status !== "APPROVED") {
      throw new BadRequestException(
        "Seuls les documents APPROVED peuvent declencher une campagne",
      );
    }

    const campaign = await this.prisma.signatureCampaign.create({
      data: {
        title: options.title || `Signature : ${document.title}`,
        description: options.description ?? null,
        sourceType: "DOCUMENT_POLICY",
        sourceId: documentId,
        targetAllActiveUsers: options.targetAllActiveUsers ?? false,
        targetRoles: options.targetRoles ?? [],
        targetDepartmentIds: options.targetDepartmentIds ?? [],
        docusealTemplateId: options.docusealTemplateId ?? null,
        dueAt: options.dueAt ?? null,
        createdById: options.createdById,
        status: "DRAFT",
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

  /**
   * Lance la campagne : crée une CampaignSignature par cible (compat
   * lecture/stats + suivi des relances), puis délègue à
   * dispatchPendingSubmissions() la création des submissions DocuSeal
   * INDIVIDUELLES et des SignatureRequest associées (campaignId renseigné).
   *
   * Une cible en échec DocuSeal reste PENDING sans submission : elle est
   * re-tentée à chaque dispatch (cron quotidien / relance admin) — aucune
   * SignatureRequest fantôme n'est créée.
   */
  async launch(campaignId: string) {
    const campaign = await this.prisma.signatureCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campagne ${campaignId} introuvable`);
    }
    if (campaign.status !== "DRAFT") {
      throw new BadRequestException(
        `Campagne deja lancee (statut: ${campaign.status})`,
      );
    }

    const users = await this.resolveTargetUsers(campaign);
    if (users.length === 0) {
      throw new BadRequestException(
        "Aucun utilisateur cible pour cette campagne",
      );
    }

    if (!campaign.docusealTemplateId) {
      this.logger.warn(
        `Campagne ${campaignId} lancee sans docusealTemplateId — aucune submission DocuSeal ne sera creee tant qu'un template n'est pas renseigne`,
      );
    }

    // Insertion des CampaignSignature + notifications
    const now = new Date();
    for (const u of users) {
      try {
        await this.prisma.campaignSignature.upsert({
          where: {
            campaignId_userId: { campaignId, userId: u.id },
          },
          update: {},
          create: {
            campaignId,
            userId: u.id,
            status: "PENDING",
            sentAt: now,
          },
        });

        await this.notifications
          .create({
            userId: u.id,
            type: NotificationType.SIGNATURE_REQUEST,
            title: `Signature requise : ${campaign.title}`,
            body:
              campaign.description ||
              "Une nouvelle politique necessite votre signature.",
            resourceType: "SIGNATURE_CAMPAIGN",
            resourceId: campaignId,
          })
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

    const updated = await this.prisma.signatureCampaign.update({
      where: { id: campaignId },
      data: {
        status: "SENT",
        sentAt: now,
      },
    });

    // Submissions DocuSeal individuelles + SignatureRequest par cible.
    const dispatch = await this.dispatchPendingSubmissions(campaignId);

    this.logger.log(
      `Campagne ${campaignId} lancee — ${users.length} destinataires, dispatch DocuSeal: ${dispatch.dispatched} ok / ${dispatch.failed} echecs / ${dispatch.skipped} ignores`,
    );
    return { ...updated, dispatch };
  }

  // ------------------------------------------------------------------
  // Webhook DocuSeal
  // ------------------------------------------------------------------

  /**
   * Handler webhook (appelé par le WebhookController unifié de
   * /signatures/webhook, APRÈS vérification HMAC stricte).
   *
   * Rattachement STRICT par submissionId : le fallback historique par
   * email seul est supprimé — il pouvait attribuer une signature à la
   * mauvaise campagne (même personne ciblée par plusieurs campagnes).
   */
  async handleWebhook(payload: any) {
    const eventType: string = payload?.event_type || payload?.type || "unknown";
    const data = payload?.data || payload;

    const submissionId =
      data?.submission?.id || data?.submission_id || data?.id || null;

    if (!submissionId) {
      this.logger.warn(
        `Webhook campagne ${eventType} sans submission_id — rattachement par email refusé (risque de mauvaise attribution)`,
      );
      return { ignored: true };
    }

    const signature = await this.prisma.campaignSignature.findFirst({
      where: { docusealSubmissionId: String(submissionId) },
    });

    if (!signature) {
      // Cas nominal pour les submissions hors campagne (SignatureRequest
      // individuelles) — déjà traitées par SignaturesService.handleWebhook.
      return { ignored: true };
    }

    this.logger.log(
      `Webhook campagne signature : ${eventType} (submission ${submissionId})`,
    );

    const now = new Date();
    const patch: any = {};
    if (eventType === "form.viewed" || eventType === "submission.viewed") {
      patch.status =
        signature.status === "PENDING" ? "OPENED" : signature.status;
      patch.openedAt = signature.openedAt ?? now;
    } else if (
      eventType === "form.completed" ||
      eventType === "submission.completed"
    ) {
      patch.status = "SIGNED";
      patch.signedAt = now;
    } else if (eventType === "form.declined") {
      patch.status = "DECLINED";
    }

    if (Object.keys(patch).length === 0) {
      return { ignored: true };
    }

    await this.prisma.campaignSignature.update({
      where: { id: signature.id },
      data: patch,
    });

    // Mise a jour statut campagne si tout est signe
    if (patch.status === "SIGNED") {
      await this.refreshCampaignAggregate(signature.campaignId);
    }

    return { updated: true, campaignSignatureId: signature.id };
  }

  // NOTE : l'ancienne verifyWebhookSignature (fallback secret en clair
  // toujours actif) a été supprimée — la vérification HMAC stricte est
  // désormais centralisée dans signatures/webhook.controller.ts.

  // ------------------------------------------------------------------
  // Rappels
  // ------------------------------------------------------------------

  async sendReminders(campaignId: string) {
    const campaign = await this.prisma.signatureCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campagne ${campaignId} introuvable`);
    }

    const pending = await this.prisma.campaignSignature.findMany({
      where: {
        campaignId,
        status: { in: ["PENDING", "OPENED"] },
      },
      include: { user: { select: { id: true, email: true } } },
    });

    const now = new Date();
    let sent = 0;
    for (const sig of pending) {
      try {
        await this.notifications.create({
          userId: sig.userId,
          type: NotificationType.SIGNATURE_REMINDER,
          title: `Rappel : ${campaign.title}`,
          body: campaign.dueAt
            ? `Signature attendue avant le ${new Date(campaign.dueAt).toLocaleDateString("fr-FR")}.`
            : "Merci de proceder a la signature de ce document.",
          resourceType: "SIGNATURE_CAMPAIGN",
          resourceId: campaignId,
        });

        await this.prisma.campaignSignature.update({
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

    await this.prisma.signatureCampaign.update({
      where: { id: campaignId },
      data: {
        remindersSent: { increment: 1 },
        lastReminderAt: now,
      },
    });

    this.logger.log(
      `Rappels campagne ${campaignId} : ${sent}/${pending.length}`,
    );
    return { sent, total: pending.length };
  }

  // ------------------------------------------------------------------
  // KPIs
  // ------------------------------------------------------------------

  async getStatus(campaignId: string) {
    const campaign = await this.prisma.signatureCampaign.findUnique({
      where: { id: campaignId },
      include: { signatures: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campagne ${campaignId} introuvable`);
    }

    const total = campaign.signatures.length;
    const signed = campaign.signatures.filter(
      (s: any) => s.status === "SIGNED",
    ).length;
    const opened = campaign.signatures.filter(
      (s: any) => s.status === "OPENED",
    ).length;
    const declined = campaign.signatures.filter(
      (s: any) => s.status === "DECLINED",
    ).length;
    const expired = campaign.signatures.filter(
      (s: any) => s.status === "EXPIRED",
    ).length;
    const pending = total - signed - declined - expired;
    const now = new Date();
    const late =
      campaign.dueAt && campaign.dueAt < now
        ? campaign.signatures.filter((s: any) => s.status !== "SIGNED").length
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
    return this.prisma.signatureCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { signatures: true } } },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.signatureCampaign.findUnique({
      where: { id },
      include: {
        signatures: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
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
    return this.prisma.campaignSignature.findMany({
      where: {
        userId,
        status: { in: ["PENDING", "OPENED"] },
      },
      include: {
        campaign: true,
      },
      orderBy: { sentAt: "desc" },
    });
  }

  // ------------------------------------------------------------------
  // Helpers internes
  // ------------------------------------------------------------------

  async refreshCampaignAggregate(campaignId: string) {
    const sigs = await this.prisma.campaignSignature.findMany({
      where: { campaignId },
      select: { status: true },
    });
    if (sigs.length === 0) return;
    const allSigned = sigs.every(
      (s: any) => s.status === "SIGNED" || s.status === "DECLINED",
    );
    const anySigned = sigs.some((s: any) => s.status === "SIGNED");

    let newStatus: SignatureCampaignStatus | null = null;
    if (allSigned && sigs.every((s: any) => s.status === "SIGNED")) {
      newStatus = SignatureCampaignStatus.COMPLETED;
    } else if (anySigned) {
      newStatus = SignatureCampaignStatus.IN_PROGRESS;
    }
    if (newStatus) {
      await this.prisma.signatureCampaign.update({
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
          "Content-Type": "application/json",
          "X-Auth-Token": this.docusealApiKey,
          ...(init.headers || {}),
        },
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`DocuSeal ${resp.status}: ${txt}`);
      }
      return await resp.json().catch(() => ({}));
    } finally {
      clearTimeout(timer);
    }
  }

  // ===========================================================================
  // Actions individuelles sur les signataires d'une campagne
  // ===========================================================================

  /**
   * Retire un user d'une campagne (DELETE de la ligne CampaignSignature).
   * Si la signature était déjà SIGNED, refuse l'opération — il faut
   * d'abord utiliser resetSignerStatus() puis seulement supprimer.
   * Trace audit log.
   */
  async removeSigner(campaignId: string, userId: string, actorId: string) {
    const sig = await this.prisma.campaignSignature.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
      include: {
        user: { select: { email: true } },
        campaign: { select: { title: true } },
      },
    });
    if (!sig) throw new NotFoundException("Signature not found");
    if (sig.status === "SIGNED") {
      throw new BadRequestException(
        "Cannot remove a SIGNED signature — reset it first or keep history.",
      );
    }

    await this.prisma.campaignSignature.delete({ where: { id: sig.id } });

    await this.prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "CAMPAIGN_SIGNER_REMOVED",
        resourceType: "CampaignSignature",
        resourceId: sig.id,
        severity: "WARN",
        metadata: {
          campaignId,
          campaignTitle: sig.campaign.title,
          targetUserId: userId,
          targetUserEmail: sig.user.email,
          previousStatus: sig.status,
        },
      },
    });

    return { ok: true };
  }

  /**
   * Ajoute (ou ré-ajoute) un ou plusieurs users à une campagne existante.
   * Idempotent : un user déjà présent (SIGNED ou autre) est ignoré.
   * Lance la création des submissions DocuSeal si la campagne est SENT/IN_PROGRESS.
   */
  async addSigners(campaignId: string, userIds: string[], actorId: string) {
    if (!userIds?.length) throw new BadRequestException("userIds is required");

    const campaign = await this.prisma.signatureCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");

    const existing = await this.prisma.campaignSignature.findMany({
      where: { campaignId, userId: { in: userIds } },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((s) => s.userId));
    const toCreate = userIds.filter((u) => !existingSet.has(u));

    if (toCreate.length === 0) {
      return { created: 0, skipped: userIds.length };
    }

    const created = await this.prisma.campaignSignature.createMany({
      data: toCreate.map((userId) => ({
        campaignId,
        userId,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "CAMPAIGN_SIGNERS_ADDED",
        resourceType: "SignatureCampaign",
        resourceId: campaignId,
        severity: "INFO",
        metadata: {
          campaignTitle: campaign.title,
          addedUserIds: toCreate,
          count: toCreate.length,
        },
      },
    });

    // Si la campagne est active, on génère immédiatement les submissions
    // DocuSeal pour les nouveaux signataires. Sinon ils seront créés au launch.
    if (
      campaign.status === SignatureCampaignStatus.SENT ||
      campaign.status === SignatureCampaignStatus.IN_PROGRESS
    ) {
      await this.dispatchPendingSubmissions(campaignId);
    }

    return {
      created: created.count,
      skipped: userIds.length - toCreate.length,
    };
  }

  /**
   * Reset le status d'une signature à PENDING (l'user doit re-signer).
   * Préserve la signature précédente dans l'audit log — utile quand la
   * charte a été mise à jour ou pour une demande légale ponctuelle.
   * Si une submission DocuSeal existait, on l'invalide (clear submissionId).
   *
   * L'éventuelle SignatureRequest signée (et son SignatureEvidence) issue
   * de la campagne N'EST PAS supprimée : c'est une preuve historique. Le
   * prochain dispatch créera une NOUVELLE SignatureRequest avec une
   * nouvelle submission DocuSeal.
   */
  async resetSignerStatus(
    campaignId: string,
    userId: string,
    actorId: string,
    reason?: string,
  ) {
    const sig = await this.prisma.campaignSignature.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
      include: {
        user: { select: { email: true } },
        campaign: { select: { title: true } },
      },
    });
    if (!sig) throw new NotFoundException("Signature not found");

    await this.prisma.campaignSignature.update({
      where: { id: sig.id },
      data: {
        status: "PENDING",
        signedAt: null,
        openedAt: null,
        docusealSubmissionId: null,
        docusealSlug: null,
        sentAt: null,
        remindersSent: 0,
        lastReminderAt: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "CAMPAIGN_SIGNER_RESET",
        resourceType: "CampaignSignature",
        resourceId: sig.id,
        severity: "WARN",
        metadata: {
          campaignId,
          campaignTitle: sig.campaign.title,
          targetUserId: userId,
          targetUserEmail: sig.user.email,
          previousStatus: sig.status,
          previousSignedAt: sig.signedAt?.toISOString() ?? null,
          reason: reason ?? null,
        },
      },
    });

    return { ok: true };
  }

  /**
   * Relance ciblée vers un seul signataire (au lieu de tous les retardataires).
   * Délègue la création/réémission de la submission DocuSeal au flux normal.
   */
  async remindOne(campaignId: string, userId: string, actorId: string) {
    const sig = await this.prisma.campaignSignature.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
      include: {
        user: true,
        campaign: { select: { title: true } },
      },
    });
    if (!sig) throw new NotFoundException("Signature not found");
    if (sig.status === "SIGNED" || sig.status === "DECLINED") {
      throw new BadRequestException(`Cannot remind a ${sig.status} signature.`);
    }

    // Notification interne (le DocuSeal email de relance se fait via cron
    // ou si la submission n'existe pas encore via dispatch).
    await this.notifications.create({
      userId,
      type: NotificationType.SIGNATURE_REMINDER,
      title: `Signature requise : ${sig.campaign.title}`,
      body: "Un administrateur vous rappelle de signer ce document.",
      resourceType: "SignatureCampaign",
      resourceId: campaignId,
      metadata: { link: "/signatures" },
    });

    await this.prisma.campaignSignature.update({
      where: { id: sig.id },
      data: {
        remindersSent: { increment: 1 },
        lastReminderAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "CAMPAIGN_SIGNER_REMINDED",
        resourceType: "CampaignSignature",
        resourceId: sig.id,
        severity: "INFO",
        metadata: {
          campaignId,
          campaignTitle: sig.campaign.title,
          targetUserId: userId,
          targetUserEmail: sig.user.email,
          remindersBefore: sig.remindersSent,
        },
      },
    });

    return { ok: true, remindersSent: sig.remindersSent + 1 };
  }

  /**
   * Crée les submissions DocuSeal INDIVIDUELLES manquantes pour une
   * campagne, par lots de DISPATCH_BATCH_SIZE, avec gestion d'erreur par
   * cible (un échec n'interrompt pas le lot).
   *
   * Pour chaque cible dispatchée avec succès :
   *  - CampaignSignature.docusealSubmissionId/docusealSlug/sentAt renseignés ;
   *  - une SignatureRequest (campaignId renseigné, même submissionId) est
   *    créée si la campagne porte sur un document — c'est elle qui apparaît
   *    sur /signatures et qui portera la SignatureEvidence au retour du
   *    webhook. Les campagnes CHARTE (pas de DocumentVersion en schéma)
   *    restent suivies via CampaignSignature uniquement.
   *
   * Appelé par launch(), addSigners() sur campagne active, et le cron
   * quotidien (retry automatique des cibles en échec).
   */
  async dispatchPendingSubmissions(
    campaignId: string,
  ): Promise<{ dispatched: number; failed: number; skipped: number }> {
    const campaign = await this.prisma.signatureCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campagne ${campaignId} introuvable`);
    }

    const pending = await this.prisma.campaignSignature.findMany({
      where: {
        campaignId,
        status: "PENDING",
        docusealSubmissionId: null,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (pending.length === 0) {
      return { dispatched: 0, failed: 0, skipped: 0 };
    }

    if (!campaign.docusealTemplateId) {
      this.logger.warn(
        `Campagne ${campaignId} sans docusealTemplateId — ${pending.length} cible(s) non dispatchee(s)`,
      );
      return { dispatched: 0, failed: 0, skipped: pending.length };
    }

    const documentVersionId = await this.resolveDocumentVersionId(campaign);

    let dispatched = 0;
    let failed = 0;

    for (
      let i = 0;
      i < pending.length;
      i += CampaignsService.DISPATCH_BATCH_SIZE
    ) {
      const batch = pending.slice(i, i + CampaignsService.DISPATCH_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((sig) =>
          this.dispatchOne(campaign, sig, documentVersionId),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j]!;
        if (r.status === "fulfilled") {
          dispatched++;
        } else {
          failed++;
          const target = batch[j]!;
          this.logger.error(
            `Dispatch DocuSeal echoue pour ${target.user.email} (campagne ${campaignId}): ${r.reason?.message || r.reason} — retentee au prochain dispatch`,
          );
        }
      }
    }

    this.logger.log(
      `Dispatch campagne ${campaignId}: ${dispatched} submission(s) creee(s), ${failed} echec(s)`,
    );
    return { dispatched, failed, skipped: 0 };
  }

  /**
   * Crée la submission DocuSeal individuelle d'une cible et matérialise la
   * SignatureRequest associée. Throw en cas d'échec DocuSeal (géré par
   * l'appelant) — AUCUNE écriture n'a lieu si la submission n'existe pas.
   */
  private async dispatchOne(
    campaign: {
      id: string;
      title: string;
      createdById: string;
      docusealTemplateId: string | null;
    },
    sig: {
      id: string;
      userId: string;
      user: { email: string; firstName: string; lastName: string };
    },
    documentVersionId: string | null,
  ): Promise<void> {
    const resp = await this.docusealFetch("/submissions", {
      method: "POST",
      body: JSON.stringify({
        template_id: Number(campaign.docusealTemplateId),
        send_email: true,
        submitters: [
          {
            email: sig.user.email,
            name: `${sig.user.firstName} ${sig.user.lastName}`,
            role: "Signataire",
          },
        ],
      }),
    });

    const { submissionId, slug } = this.extractSubmissionInfo(resp);
    if (!submissionId) {
      throw new Error(
        `Reponse DocuSeal sans submission_id pour ${sig.user.email}`,
      );
    }

    const now = new Date();
    await this.prisma.campaignSignature.update({
      where: { id: sig.id },
      data: {
        docusealSubmissionId: submissionId,
        docusealSlug: slug,
        sentAt: now,
      },
    });

    // SignatureRequest jumelle (source de vérité signature + evidence).
    // Créée UNIQUEMENT avec un submissionId valide — jamais de fantôme.
    if (documentVersionId) {
      await this.prisma.signatureRequest.create({
        data: {
          documentVersionId,
          requestedById: campaign.createdById,
          signerId: sig.userId,
          campaignId: campaign.id,
          docusealSubmissionId: submissionId,
          status: "PENDING",
        },
      });
    }
  }

  /**
   * Résout la DocumentVersion à faire signer pour les campagnes
   * DOCUMENT_POLICY (dernière version du document source). Les campagnes
   * CHARTE n'ont pas de DocumentVersion : retourne null (suivi
   * CampaignSignature uniquement).
   */
  private async resolveDocumentVersionId(campaign: {
    id: string;
    sourceType: string;
    sourceId: string;
  }): Promise<string | null> {
    if (campaign.sourceType !== "DOCUMENT_POLICY") {
      return null;
    }
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId: campaign.sourceId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!version) {
      this.logger.warn(
        `Campagne ${campaign.id}: document source ${campaign.sourceId} sans version — pas de SignatureRequest generee`,
      );
      return null;
    }
    return version.id;
  }

  /**
   * Normalise la réponse DocuSeal POST /submissions : selon les versions,
   * l'API renvoie un tableau de submitters ou un objet submission.
   */
  private extractSubmissionInfo(resp: unknown): {
    submissionId: string | null;
    slug: string | null;
  } {
    if (Array.isArray(resp)) {
      const first = resp[0] as
        | { submission_id?: number | string; id?: number | string; slug?: string }
        | undefined;
      const submissionId = first?.submission_id ?? first?.id ?? null;
      return {
        submissionId: submissionId != null ? String(submissionId) : null,
        slug: first?.slug ?? null,
      };
    }
    if (resp && typeof resp === "object") {
      const obj = resp as DocusealSubmissionResponse & {
        submission_id?: number | string;
      };
      const submissionId = obj.id ?? obj.submission_id ?? null;
      const slug = obj.slug ?? obj.submitters?.[0]?.slug ?? null;
      return {
        submissionId: submissionId != null ? String(submissionId) : null,
        slug,
      };
    }
    return { submissionId: null, slug: null };
  }
}
