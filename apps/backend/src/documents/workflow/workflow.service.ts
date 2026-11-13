import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { IsoAnalyzerService } from "../../iso-analyzer/iso-analyzer.service";
import { UserRole, ROLE_HIERARCHY } from "../../common/enums";
import { DocumentsService } from "../documents.service";
import { MentionsService } from "../../mentions/mentions.service";
import { AppMetricsService } from "../../health/app-metrics.service";
import { WorkflowRulesService } from '../../workflow-rules/workflow-rules.service';
import { workflowTransaction } from '../../approval-workflows/workflow-transaction';
import type { Document, Prisma, ValidationStepType } from '@prisma/client';

/**
 * Catalogue de suggestions pré-définies que le reviewer/approbateur peut
 * sélectionner (en plus du commentaire libre) lors d'un refus.
 * Ces suggestions servent à guider le rédacteur pour les modifications.
 */
export const REJECTION_SUGGESTIONS: Record<string, string> = {
  // Forme
  "fix-typos": "Corriger les fautes d'orthographe et de grammaire",
  "improve-clarity": "Améliorer la clarté et la lisibilité du document",
  "fix-formatting": "Corriger la mise en forme et la structure",
  "add-examples": "Ajouter des exemples concrets ou cas d'usage",
  "simplify-language": "Simplifier le vocabulaire technique",
  // Fond
  "clarify-scope": "Clarifier le périmètre et les objectifs du document",
  "add-definitions": "Ajouter un glossaire ou des définitions",
  "detail-procedure": "Détailler davantage la procédure étape par étape",
  "add-responsibilities": "Préciser les rôles et responsabilités",
  "add-metrics": "Ajouter des indicateurs mesurables / KPIs",
  // Conformité
  "add-iso-references": "Référencer les contrôles ISO 27001 applicables",
  "add-legal-references": "Ajouter les références légales et réglementaires (NIS2, RGPD, ANSSI)",
  "check-classification": "Vérifier la classification (PUBLIC/INTERNE/CONFIDENTIEL/SECRET)",
  "add-retention": "Préciser la politique de rétention (A.5.33)",
  "add-review-date": "Définir la date de prochaine revue",
  // Sécurité
  "security-review": "Faire valider par le RSSI avant soumission",
  "risk-analysis": "Ajouter une analyse de risque (EBIOS RM)",
  "update-threats": "Actualiser la liste des menaces couvertes",
  // Process
  "align-with-policy": "Aligner avec la politique mère en vigueur",
  "check-cross-refs": "Vérifier les références croisées entre documents",
  "update-version-history": "Compléter l'historique des versions et changelog",
  // Autre
  other: "Autre (voir commentaire ci-dessus)",
};

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly isoAnalyzerService: IsoAnalyzerService,
    private readonly documentsService: DocumentsService,
    @Optional() private readonly mentions?: MentionsService,
    @Optional() private readonly metrics?: AppMetricsService,
    @Optional() private readonly workflowRules?: WorkflowRulesService,
  ) {}

  private assertDecisionSnapshot(document: Document, actorId: string) {
    if (document.ownerId === actorId) throw new ForbiddenException('Le rédacteur ne peut pas valider son propre document.');
    if (!document.currentVersionId || document.scanStatus !== 'CLEAN') throw new BadRequestException('Une version figée et contrôlée est requise avant toute validation.');
  }

  private async approveQualityStep(db: Prisma.TransactionClient, document: Document,
    request: { id: string; documentVersionId: string; currentStep: ValidationStepType; steps: Array<{ id: string; stepType: ValidationStepType }> } | undefined,
    stepType: 'VERIFICATION' | 'REVIEW', actorId: string, comment?: string) {
    const step = request?.steps.find(item => item.stepType === stepType);
    if (!request || request.currentStep !== stepType || request.documentVersionId !== document.currentVersionId || !step) throw new ConflictException('Cette étape de validation a changé. Rechargez le document.');
    if (stepType === 'REVIEW' && document.verifierId && !await db.validationStep.findFirst({ where: { requestId: request.id, stepType: 'VERIFICATION', action: 'APPROVED' }, select: { id: true } })) throw new BadRequestException('La vérification technique doit précéder la revue.');
    const changed = await db.document.updateMany({ where: { id: document.id, status: 'IN_REVIEW', currentVersionId: document.currentVersionId, updatedAt: document.updatedAt, scanStatus: 'CLEAN', deletedAt: null }, data: { status: stepType === 'REVIEW' ? 'REVIEW_APPROVED' : 'IN_REVIEW' } });
    const decided = await db.validationStep.updateMany({ where: { id: step.id, action: null }, data: { action: 'APPROVED', decidedById: actorId, comment, actionAt: new Date() } });
    const moved = await db.validationRequest.updateMany({ where: { id: request.id, status: 'PENDING', currentStep: stepType }, data: { currentStep: 'REVIEW' } });
    if (changed.count !== 1 || decided.count !== 1 || moved.count !== 1) throw new ConflictException('Une autre décision a déjà modifié ce circuit.');
    if (stepType === 'VERIFICATION') await db.validationStep.create({ data: { requestId: request.id, stepType: 'REVIEW', assignedToId: document.reviewerId! } });
  }

  private async returnForCorrection(db: Prisma.TransactionClient, document: Document, request: { id: string; documentVersionId: string; currentStep: ValidationStepType; steps: Array<{ id: string; stepType: ValidationStepType }> } | undefined,
    stepType: ValidationStepType, actorId: string, comment: string) {
    const step = request?.steps.find(item => item.stepType === stepType);
    if (!request || request.currentStep !== stepType || request.documentVersionId !== document.currentVersionId || !step) {
      throw new ConflictException('Cette étape de validation a changé. Rechargez le document.');
    }
    const changed = await db.document.updateMany({ where: { id: document.id, status: document.status, currentVersionId: document.currentVersionId, updatedAt: document.updatedAt, deletedAt: null }, data: { status: 'DRAFT' } });
    const closed = await db.validationRequest.updateMany({ where: { id: request.id, status: 'PENDING', currentStep: stepType }, data: { status: 'REJECTED' } });
    const decided = await db.validationStep.updateMany({ where: { id: step.id, action: null }, data: { action: 'REJECTED', decidedById: actorId, comment, actionAt: new Date() } });
    if (changed.count !== 1 || closed.count !== 1 || decided.count !== 1) throw new ConflictException('Une autre décision a déjà modifié ce circuit.');
    const circuits = await db.approvalInstance.findMany({ where: { documentId: document.id, status: 'PENDING' }, select: { id: true } });
    for (const circuit of circuits) {
      await db.approvalInstance.update({ where: { id: circuit.id }, data: { status: 'CANCELLED', completedAt: new Date() } });
      await db.approvalStepInstance.updateMany({ where: { instanceId: circuit.id, decision: 'PENDING' }, data: { decision: 'SKIPPED', decidedAt: new Date(), comment: 'Retour du document pour correction.' } });
      await db.approvalAuditLog.create({ data: { action: 'APPROVAL_CANCELLED_FOR_CORRECTION', actorId, approvalInstanceId: circuit.id, metadata: { documentId: document.id, documentVersionId: document.currentVersionId, reason: comment } } });
    }
  }

  /**
   * Parse the given comment for @mentions and notify the cited users.
   * Non-blocking: failures are logged but never bubble up.
   */
  private notifyMentionsForDocComment(params: {
    comment?: string;
    authorId: string;
    document: { id: string; title: string; reference: string };
  }): void {
    const { comment, authorId, document } = params;
    if (!this.mentions || !comment || !comment.trim()) return;
    const mentionsSvc = this.mentions;
    void (async () => {
      try {
        const author = await this.prisma.user.findUnique({
          where: { id: authorId },
          select: { firstName: true, lastName: true, email: true },
        });
        const authorName =
          `${author?.firstName ?? ""} ${author?.lastName ?? ""}`.trim() ||
          author?.email ||
          "Un utilisateur";
        await mentionsSvc.parseAndNotify({
          text: comment,
          authorId,
          authorName,
          sourceType: "document",
          sourceId: document.id,
          sourceTitle: `${document.title} (${document.reference})`,
          link: `/documents/${document.id}`,
        });
      } catch (err: any) {
        this.logger.warn(`mention parsing failed: ${err?.message || err}`);
      }
    })();
  }

  /**
   * Vérifie que `userId` a le droit de décider d'une étape assignée à
   * `assignedId`. Renvoie { isDerogation: true } si l'acteur n'est pas
   * l'assigné mais agit via une dérogation ADMIN/SUPER_ADMIN (à tracer en
   * audit + ValidationStep.decidedById). Lève une ForbiddenException sinon.
   */
  private resolveDecisionActor(
    assignedId: string | null | undefined,
    userId: string,
    userRole: UserRole,
    roleLabel: string,
  ): { isDerogation: boolean } {
    if (assignedId && assignedId === userId) return { isDerogation: false };
    if (ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[UserRole.ADMIN]) {
      return { isDerogation: true };
    }
    if (!assignedId) {
      throw new ForbiddenException(
        `Aucun ${roleLabel} n'est assigné à ce document. Désignez-en un (via « Modifier ») avant cette action.`,
      );
    }
    throw new ForbiddenException(
      `Seul le ${roleLabel} assigné peut effectuer cette action. Une dérogation nécessite un rôle ADMIN.`,
    );
  }

  /**
   * Notifie le relecteur avec des liens d'action email (HMAC, validité 72h).
   * Utilisé au démarrage direct à REVIEW (pas de vérificateur) OU au passage
   * VERIFICATION → REVIEW.
   */
  private async notifyReviewerWithEmailLinks(document: {
    id: string;
    title: string;
    reference: string;
    reviewerId: string;
  }): Promise<void> {
    const crypto = await import("crypto");
    const secret = process.env.JWT_ACCESS_SECRET || "fallback";
    const reviewerId = document.reviewerId;
    const ts = Date.now().toString();
    const approveToken = crypto
      .createHmac("sha256", secret)
      .update(`approve:${document.id}:${reviewerId}:${ts}`)
      .digest("hex");
    const rejectToken = crypto
      .createHmac("sha256", secret)
      .update(`reject:${document.id}:${reviewerId}:${ts}`)
      .digest("hex");
    const baseUrl = process.env.APP_URL || "http://localhost:3001";

    await this.notificationsService.create({
      userId: reviewerId,
      type: "DOC_REVIEW_NEEDED",
      title: `Revue requise : ${document.title}`,
      body: `Le document "${document.title}" (${document.reference}) nécessite votre revue.\n\nApprouver : ${baseUrl}/api/workflow/email-action?action=approve&docId=${document.id}&userId=${reviewerId}&token=${approveToken}&ts=${ts}\n\nRejeter : ${baseUrl}/api/workflow/email-action?action=reject&docId=${document.id}&userId=${reviewerId}&token=${rejectToken}&ts=${ts}`,
      resourceType: "Document",
      resourceId: document.id,
    });
  }

  async submitForReview(docId: string, userId: string) {
    let document = await this.prisma.document.findUnique({
      where: { id: docId },
      // isNative, content, currentVersionId, verifierId are scalar fields
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (document.ownerId !== userId) {
      throw new ForbiddenException("Seul l'auteur du document peut le soumettre en revue.");
    }

    if (document.status !== "DRAFT") {
      throw new BadRequestException(
        "Le document doit être en statut 'Brouillon' pour être soumis en revue.",
      );
    }

    if (!document.reviewerId) {
      throw new BadRequestException(
        "Aucun reviewer n'est assigné à ce document. Désignez-en un (via 'Modifier') avant de soumettre en revue.",
      );
    }

    if (!document.approverId) {
      throw new BadRequestException(
        "Aucun approbateur final n'est assigné à ce document. Le workflow complet " +
          "(Rédaction → Revue → Confirmation → Approbation) exige les DEUX rôles " +
          "avant la soumission. Modifiez le document pour désigner un approbateur " +
          "(via 'Modifier') avant de soumettre en revue.",
      );
    }

    // Native (inline) documents store content directly; uploaded documents
    // need at least one version. Both paths require something to review.
    if (!document.currentVersionId && !document.isNative) {
      throw new BadRequestException(
        "Le document doit avoir au moins une version uploadée avant soumission en revue.",
      );
    }
    if (document.isNative && (!document.content || document.content.trim().length === 0)) {
      throw new BadRequestException("Le document natif doit avoir du contenu avant soumission");
    }
    if (document.isNative) document = await this.documentsService.ensureNativeVersion(docId, userId);
    if (!document.reviewerId || !document.approverId || !document.currentVersionId) throw new BadRequestException("Le document doit avoir une version figée, un relecteur et un approbateur.");
    if (document.scanStatus !== 'CLEAN') throw new BadRequestException('Le contrôle antimalware doit être terminé avant la soumission.');
    if (document.reviewerId === document.ownerId || document.approverId === document.ownerId || document.verifierId === document.ownerId) {
      throw new BadRequestException('Le rédacteur doit être distinct des vérificateurs, relecteurs et approbateurs.');
    }

    // Cycle qualité 5 rôles : si un vérificateur est désigné, le workflow
    // démarre par l'étape VERIFICATION (contrôle technique) ; sinon il démarre
    // directement à REVIEW. Le statut Document reste IN_REVIEW dans les deux cas
    // (aucun nouveau statut = zéro migration).
    const startStep: "VERIFICATION" | "REVIEW" = document.verifierId ? "VERIFICATION" : "REVIEW";
    const firstAssigneeId = document.verifierId ?? document.reviewerId;

    // Atomic: update status + create validation request + validation step
    await workflowTransaction(this.prisma, async (tx) => {
      const claimed = await tx.document.updateMany({
        where: { id: docId, status: 'DRAFT', updatedAt: document.updatedAt, currentVersionId: document.currentVersionId, content: document.content, title: document.title, scanStatus: 'CLEAN', deletedAt: null },
        data: { status: "IN_REVIEW" },
      });
      if (claimed.count !== 1) throw new ConflictException('Le document a été modifié ou soumis simultanément. Rechargez la page.');
      await this.workflowRules?.applyAtSubmission(tx, document, userId);

      const validationRequest = await tx.validationRequest.create({
        data: {
          documentId: docId,
          documentVersionId: document.currentVersionId!,
          requestedById: userId,
          currentStep: startStep,
          status: "PENDING",
        },
      });

      await tx.validationStep.create({
        data: {
          requestId: validationRequest.id,
          stepType: startStep,
          assignedToId: firstAssigneeId!,
        },
      });
    });

    // Notifier le premier acteur du cycle.
    if (document.verifierId) {
      await this.notificationsService.create({
        userId: document.verifierId,
        type: "DOC_REVIEW_NEEDED",
        title: `Vérification requise : ${document.title}`,
        body: `Le document "${document.title}" (${document.reference}) nécessite votre vérification technique — 1re étape du cycle qualité (Vérification → Revue → Approbation).`,
        resourceType: "Document",
        resourceId: docId,
      });
    } else {
      await this.notifyReviewerWithEmailLinks({
        id: docId,
        title: document.title,
        reference: document.reference,
        reviewerId: document.reviewerId,
      });
    }

    await this.auditService.log({
      userId,
      action: "DOCUMENT_SUBMITTED_FOR_REVIEW",
      resourceType: "Document",
      resourceId: docId,
      metadata: {
        verifierId: document.verifierId,
        reviewerId: document.reviewerId,
        startStep,
      },
    });

    this.logger.log(`Document ${document.reference} submitted for review (start: ${startStep})`);
    return { message: "Document submitted for review" };
  }

  /**
   * Étape 1 bis (cycle 5 rôles) : le VÉRIFICATEUR valide le contrôle technique.
   * Enchaîne automatiquement sur l'étape REVIEW (relecteur). Le statut Document
   * reste IN_REVIEW. L'acteur réel est enregistré dans decidedById.
   */
  async approveVerification(docId: string, userId: string, comment?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException("Utilisateur indisponible ou désactivé.");
    const userRole = user.role as UserRole;

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { steps: { where: { action: null } } },
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }
    if (document.status !== "IN_REVIEW") {
      throw new BadRequestException(
        `La vérification ne peut être validée que si le document est « En revue » (statut actuel : ${document.status}).`,
      );
    }
    const request = document.validationRequests[0];
    if (!request || request.currentStep !== "VERIFICATION") {
      throw new BadRequestException("Ce document n'est pas à l'étape de vérification.");
    }
    if (!document.reviewerId) {
      throw new BadRequestException(
        "Aucun relecteur n'est assigné : impossible d'enchaîner sur la revue. Désignez-en un avant de valider la vérification.",
      );
    }
    // Capture en const local : le narrowing de propriété est perdu dans les
    // closures (transaction, helper) — un const local le conserve.
    const reviewerId = document.reviewerId;
    const { isDerogation } = this.resolveDecisionActor(
      document.verifierId,
      userId,
      userRole,
      "vérificateur",
    );

    this.assertDecisionSnapshot(document, userId);
    await workflowTransaction(this.prisma, tx => this.approveQualityStep(tx, document, request, "VERIFICATION", userId, comment));

    await this.notifyReviewerWithEmailLinks({
      id: docId,
      title: document.title,
      reference: document.reference,
      reviewerId,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_VERIFICATION_APPROVED",
      resourceType: "Document",
      resourceId: docId,
      severity: isDerogation ? "WARN" : "INFO",
      metadata: {
        comment,
        assignedVerifierId: document.verifierId,
        derogation: isDerogation,
        nextStep: "REVIEW",
      },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
      },
    });

    return {
      message: "Vérification validée. Le document passe en revue technique.",
    };
  }

  /**
   * Refus à l'étape VERIFICATION : retour DRAFT (comme un refus de revue).
   */
  async rejectVerification(docId: string, userId: string, comment: string, suggestions?: string[]) {
    if (!comment || comment.trim().length < 10) {
      throw new BadRequestException(
        "Un commentaire détaillé (10+ caractères) est requis pour un refus",
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException("Utilisateur indisponible ou désactivé.");
    const userRole = user.role as UserRole;

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { steps: { where: { action: null } } },
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }
    if (document.status !== "IN_REVIEW") {
      throw new BadRequestException(
        "Le document doit être en statut 'En revue' pour rejeter la vérification.",
      );
    }
    const request = document.validationRequests[0];
    if (!request || request.currentStep !== "VERIFICATION") {
      throw new BadRequestException("Ce document n'est pas à l'étape de vérification.");
    }
    const { isDerogation } = this.resolveDecisionActor(
      document.verifierId,
      userId,
      userRole,
      "vérificateur",
    );

    const enrichedComment = this.buildRejectionComment(comment, suggestions);

    await workflowTransaction(this.prisma, tx => this.returnForCorrection(tx, document, request, "VERIFICATION", userId, enrichedComment));

    await this.notificationsService.create({
      userId: document.ownerId,
      type: "DOC_REJECTED",
      title: "Vérification rejetée — modifications demandées",
      body: `Document "${document.title}" (${document.reference}) rejeté à l'étape de vérification.\n\n${enrichedComment}`,
      resourceType: "Document",
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_VERIFICATION_REJECTED",
      resourceType: "Document",
      resourceId: docId,
      severity: isDerogation ? "WARN" : "INFO",
      metadata: { comment, suggestions: suggestions || [], derogation: isDerogation },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
      },
    });

    return {
      message: "Vérification rejetée — le document repasse en brouillon.",
    };
  }

  /**
   * Étape 2 : le reviewer valide la revue.
   * Après validation, le document passe en REVIEW_APPROVED — il attend
   * que le RÉDACTEUR (owner) confirme et lance la demande d'approbation
   * finale. Cela garantit que le rédacteur a pu prendre en compte les
   * commentaires du reviewer avant l'étape approbation.
   */
  async approveReview(docId: string, userId: string, comment?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException("Utilisateur indisponible ou désactivé.");
    const userRole = user.role as UserRole;

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { steps: { where: { action: null } } },
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (document.status !== "IN_REVIEW") {
      throw new BadRequestException(
        `La revue ne peut être approuvée que si le document est en statut "En revue" (statut actuel : ${document.status}).`,
      );
    }

    const request = document.validationRequests[0];
    // Si un vérificateur est en cours (currentStep VERIFICATION), la revue
    // n'est pas encore ouverte : on refuse pour éviter de sauter l'étape.
    if (request && request.currentStep === "VERIFICATION") {
      throw new BadRequestException(
        "La vérification technique doit d'abord être validée avant la revue.",
      );
    }

    const { isDerogation } = this.resolveDecisionActor(
      document.reviewerId,
      userId,
      userRole,
      "relecteur",
    );

    if (!document.approverId) {
      throw new BadRequestException(
        "Aucun approbateur final n'est assigné à ce document. Demandez à l'auteur d'en désigner un (via 'Modifier') avant d'approuver la revue.",
      );
    }

    // Atomic: status → REVIEW_APPROVED + close reviewer step (real decider)
    this.assertDecisionSnapshot(document, userId);
    await workflowTransaction(this.prisma, tx => this.approveQualityStep(tx, document, request, "REVIEW", userId, comment));

    if (isDerogation) {
      await this.auditService.log({
        userId,
        action: "DOCUMENT_REVIEW_APPROVED_DEROGATION",
        resourceType: "Document",
        resourceId: docId,
        severity: "WARN",
        metadata: { assignedReviewerId: document.reviewerId, actualDeciderId: userId },
      });
    }

    // Notifier le rédacteur (owner) : il doit maintenant confirmer
    // et lancer la demande d'approbation. L'approbateur n'est pas
    // encore notifié — il le sera via requestApproval().
    await this.notificationsService.create({
      userId: document.ownerId,
      type: "DOC_APPROVED",
      title: "Revue validée — à vous de lancer l'approbation",
      body: `Le reviewer a validé la revue de "${document.title}" (${document.reference}).${
        comment ? ` Commentaire : ${comment}` : ""
      }\n\nVous pouvez maintenant prendre en compte les éventuels ajustements et lancer la demande d'approbation via "Demander l'approbation".`,
      resourceType: "Document",
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_REVIEW_APPROVED",
      resourceType: "Document",
      resourceId: docId,
      metadata: { comment, nextStep: "OWNER_MUST_REQUEST_APPROVAL" },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
      },
    });

    return {
      message: "Revue validée. Le rédacteur doit confirmer pour lancer l'approbation finale.",
    };
  }

  /**
   * Étape 3 : le rédacteur (owner) confirme que le document est prêt
   * pour l'approbation finale. Cette étape ne peut être lancée QUE par
   * le rédacteur et SEULEMENT si le reviewer a déjà validé la revue.
   * ISO 27001 A.5.1 / A.5.2 — séparation des responsabilités.
   */
  async requestApproval(docId: string, userId: string, comment?: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    // Seul le rédacteur (owner) peut lancer la demande d'approbation
    if (document.ownerId !== userId) {
      throw new ForbiddenException(
        "Seul le rédacteur du document peut lancer la demande d'approbation",
      );
    }

    // Le document doit avoir été validé par le reviewer au préalable
    if (document.status !== "REVIEW_APPROVED") {
      throw new BadRequestException(
        "Le document doit être en statut REVIEW_APPROVED (revue validée par le reviewer) pour lancer l'approbation",
      );
    }

    if (!document.approverId) {
      throw new BadRequestException("Aucun approbateur n'est assigné au document");
    }

    const request = document.validationRequests[0];
    if (!request || request.currentStep !== 'REVIEW' || request.documentVersionId !== document.currentVersionId) throw new ConflictException('La revue ne correspond pas à la version courante.');
    await workflowTransaction(this.prisma, async tx => {
      if (!await tx.validationStep.findFirst({ where: { requestId: request.id, stepType: 'REVIEW', action: 'APPROVED' }, select: { id: true } })) throw new BadRequestException('La revue doit être approuvée avant la demande finale.');
      const changed = await tx.document.updateMany({ where: { id: docId, status: 'REVIEW_APPROVED', currentVersionId: document.currentVersionId, updatedAt: document.updatedAt, scanStatus: 'CLEAN' }, data: { status: 'PENDING_APPROVAL' } });
      const moved = await tx.validationRequest.updateMany({ where: { id: request.id, status: 'PENDING', currentStep: 'REVIEW' }, data: { currentStep: 'APPROVAL' } });
      if (changed.count !== 1 || moved.count !== 1) throw new ConflictException('Une autre action a déjà modifié ce circuit.');
      await tx.validationStep.create({ data: { requestId: request.id, stepType: 'APPROVAL', assignedToId: document.approverId! } });
    });

    // Notify approver
    await this.notificationsService.create({
      userId: document.approverId,
      type: "DOC_APPROVAL_NEEDED",
      title: "Approbation requise",
      body: `Le document "${document.title}" (${document.reference}) a été validé par le reviewer ET confirmé par le rédacteur. Votre approbation finale est requise.`,
      resourceType: "Document",
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_APPROVAL_REQUESTED",
      resourceType: "Document",
      resourceId: docId,
      metadata: { comment, approverId: document.approverId },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
      },
    });

    this.logger.log(`Document ${document.reference} : rédacteur a lancé la demande d'approbation`);
    return { message: "Demande d'approbation envoyée à l'approbateur." };
  }

  /**
   * Refus du reviewer avec suggestions structurées.
   *
   * @param suggestions — tableau de catégories de suggestions (clés) ou commentaires
   *                      prédéfinis qui guident le rédacteur sur ce qu'il faut corriger.
   *                      Ex: ["clarify-scope", "add-iso-references", "fix-typos"]
   */
  async rejectReview(docId: string, userId: string, comment: string, suggestions?: string[]) {
    if (!comment || comment.trim().length < 10) {
      throw new BadRequestException(
        "Un commentaire détaillé (10+ caractères) est requis pour un refus",
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException("Utilisateur indisponible ou désactivé.");
    const userRole = user.role as UserRole;

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { steps: { where: { action: null } } },
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (document.status !== "IN_REVIEW") {
      throw new BadRequestException(
        "Le document doit être en statut 'En revue' pour rejeter la revue.",
      );
    }

    const pendingRequest = document.validationRequests[0];
    if (pendingRequest && pendingRequest.currentStep === "VERIFICATION") {
      throw new BadRequestException(
        "Ce document est à l'étape de vérification : utilisez le refus de vérification.",
      );
    }

    const { isDerogation } = this.resolveDecisionActor(
      document.reviewerId,
      userId,
      userRole,
      "relecteur",
    );

    const enrichedComment = this.buildRejectionComment(comment, suggestions);

    await workflowTransaction(this.prisma, tx => this.returnForCorrection(tx, document, pendingRequest, "REVIEW", userId, enrichedComment));

    if (isDerogation) {
      await this.auditService.log({
        userId,
        action: "DOCUMENT_REVIEW_REJECTED_DEROGATION",
        resourceType: "Document",
        resourceId: docId,
        severity: "WARN",
        metadata: { assignedReviewerId: document.reviewerId, actualDeciderId: userId },
      });
    }

    // Notify owner with actionable suggestions
    await this.notificationsService.create({
      userId: document.ownerId,
      type: "DOC_REJECTED",
      title: "Revue rejetée — modifications demandées",
      body: `Document "${document.title}" (${document.reference}) rejeté en revue.\n\n${enrichedComment}`,
      resourceType: "Document",
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_REVIEW_REJECTED",
      resourceType: "Document",
      resourceId: docId,
      metadata: { comment, suggestions: suggestions || [] },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
      },
    });

    return {
      message: "Revue rejetée — le document repasse en brouillon avec suggestions",
    };
  }

  /**
   * Construit un commentaire enrichi en combinant le texte libre
   * et les suggestions prédéfinies sélectionnées par le reviewer.
   */
  private buildRejectionComment(comment: string, suggestions?: string[]): string {
    if (!suggestions || suggestions.length === 0) return comment;

    const suggestionLabels = suggestions
      .map((key) => REJECTION_SUGGESTIONS[key] || key)
      .map((label) => `• ${label}`)
      .join("\n");

    return `${comment}\n\n--- Suggestions d'amélioration ---\n${suggestionLabels}`;
  }

  async approveDocument(docId: string, userId: string, comment?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException("Utilisateur indisponible ou désactivé.");

    const userRole = user.role as UserRole;
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[UserRole.DIRECTION]) {
      throw new ForbiddenException(
        "Seule la DIRECTION (ou un rôle supérieur) peut approuver définitivement un document.",
      );
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { steps: { where: { action: null } } },
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (document.status !== "PENDING_APPROVAL") {
      throw new BadRequestException(
        "Le document doit être en statut 'En attente d'approbation' pour cette action.",
      );
    }

    if (document.ownerId === userId) throw new ForbiddenException("Le rédacteur ne peut pas approuver définitivement son document.");
    if (!document.currentVersionId || document.scanStatus !== "CLEAN") throw new BadRequestException("Une version figée et contrôlée doit précéder l’approbation.");
    const request = document.validationRequests[0];
    const pendingStep = request?.steps.find(step => step.stepType === "APPROVAL");
    if (!request || request.currentStep !== "APPROVAL" || request.documentVersionId !== document.currentVersionId || !pendingStep) {
      throw new BadRequestException("Le circuit qualité n’a pas terminé ses étapes préalables sur cette version.");
    }

    // Contrôle approbateur (ISO 27001 A.5.1) : seul l'approbateur ASSIGNÉ peut
    // approuver ; une dérogation ADMIN/SUPER_ADMIN est autorisée mais tracée
    // (audit WARN + decidedById ≠ approverId assigné).
    const { isDerogation } = this.resolveDecisionActor(
      document.approverId,
      userId,
      userRole,
      "approbateur",
    );

    await workflowTransaction(this.prisma, async tx => {
      const latest = await tx.approvalInstance.findFirst({
        where: { documentId: docId, documentVersionId: document.currentVersionId! },
        orderBy: { startedAt: "desc" }, select: { status: true },
      });
      if (latest && latest.status !== "APPROVED") throw new BadRequestException("Terminez le circuit d’approbation additionnel avant la publication définitive.");
      const review = await tx.validationStep.findFirst({ where: { requestId: request.id, stepType: "REVIEW", action: "APPROVED" }, select: { id: true } });
      if (!review) throw new BadRequestException("La revue de cette version n’a pas été approuvée.");
      if (document.verifierId && !await tx.validationStep.findFirst({ where: { requestId: request.id, stepType: "VERIFICATION", action: "APPROVED" }, select: { id: true } })) {
        throw new BadRequestException("La vérification technique de cette version n’a pas été approuvée.");
      }
      const changed = await tx.document.updateMany({
        where: { id: docId, status: "PENDING_APPROVAL", currentVersionId: document.currentVersionId, updatedAt: document.updatedAt, scanStatus: "CLEAN", deletedAt: null },
        data: { status: "APPROVED" },
      });
      if (changed.count !== 1) throw new ConflictException("Le document a changé pendant l’approbation. Rechargez la page.");
      const decision = await tx.validationStep.updateMany({ where: { id: pendingStep.id, action: null }, data: { action: "APPROVED", decidedById: userId, comment, actionAt: new Date() } });
      const closed = await tx.validationRequest.updateMany({ where: { id: request.id, status: "PENDING", currentStep: "APPROVAL" }, data: { status: "COMPLETED" } });
      if (decision.count !== 1 || closed.count !== 1) throw new ConflictException("Une autre décision a déjà modifié ce circuit.");
    });

    // Notify owner
    await this.notificationsService.create({
      userId: document.ownerId,
      type: "DOC_APPROVED",
      title: "Document approved",
      body: `Document "${document.title}" (${document.reference}) has been approved.`,
      resourceType: "Document",
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_APPROVED",
      resourceType: "Document",
      resourceId: docId,
      severity: isDerogation ? "WARN" : "INFO",
      metadata: {
        comment,
        assignedApproverId: document.approverId,
        actualDeciderId: userId,
        derogation: isDerogation,
      },
    });

    try {
      this.metrics?.documentsApprovedTotal.inc();
    } catch {
      /* noop */
    }

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
      },
    });

    // Broadcast "new document available" to all concerned users
    // (classification-aware — ISO 27001 A.5.12)
    try {
      await this.documentsService.notifyNewDocumentAvailable(
        {
          id: document.id,
          title: document.title,
          reference: document.reference,
          category: document.category as unknown as string,
          classification: document.classification,
        },
        false,
      );
    } catch (err) {
      this.logger.warn(
        `notifyNewDocumentAvailable failed for ${document.reference}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    // Auto-scan for ISO 27001 control mapping on approval
    try {
      const isoResult = await this.isoAnalyzerService.autoAssignControls(docId, 35, { id: user.id, email: user.email, role: userRole, departmentId: user.departmentId });
      if (isoResult.assigned > 0) {
        this.logger.log(
          `ISO auto-assign on approval: ${document.reference} → ${isoResult.assigned} controls (${isoResult.controls.join(", ")})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `ISO auto-assign failed for ${document.reference}: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.logger.log(`Document ${document.reference} approved by ${userId}`);
    return { message: "Document approved" };
  }

  async rejectDocument(docId: string, userId: string, comment: string, suggestions?: string[]) {
    if (!comment || comment.trim().length < 10) {
      throw new BadRequestException(
        "Un commentaire détaillé (10+ caractères) est requis pour un refus",
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException("Utilisateur indisponible ou désactivé.");

    const userRole = user.role as UserRole;
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[UserRole.DIRECTION]) {
      throw new ForbiddenException(
        "Seule la DIRECTION (ou un rôle supérieur) peut rejeter un document en approbation.",
      );
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { steps: { where: { action: null } } },
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    if (document.status !== "PENDING_APPROVAL") {
      throw new BadRequestException(
        "Le document doit être en statut 'En attente d'approbation' pour cette action.",
      );
    }

    // Contrôle approbateur (dérogation ADMIN tracée) — cf. approveDocument.
    const { isDerogation } = this.resolveDecisionActor(
      document.approverId,
      userId,
      userRole,
      "approbateur",
    );

    const enrichedComment = this.buildRejectionComment(comment, suggestions);

    // Atomic: revert status + reject validation request + rejection step
    await workflowTransaction(this.prisma, tx => this.returnForCorrection(tx, document, document.validationRequests[0], "APPROVAL", userId, enrichedComment));

    await this.notificationsService.create({
      userId: document.ownerId,
      type: "DOC_REJECTED",
      title: "Approbation refusée — modifications demandées",
      body: `Document "${document.title}" (${document.reference}) refusé en approbation.\n\n${enrichedComment}`,
      resourceType: "Document",
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_REJECTED",
      resourceType: "Document",
      resourceId: docId,
      severity: isDerogation ? "WARN" : "INFO",
      metadata: {
        comment,
        suggestions: suggestions || [],
        assignedApproverId: document.approverId,
        actualDeciderId: userId,
        derogation: isDerogation,
      },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
      },
    });

    return {
      message: "Document rejeté — le rédacteur est notifié des suggestions",
    };
  }

  async markObsolete(docId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException("Utilisateur indisponible ou désactivé.");

    const userRole = user.role as UserRole;
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[UserRole.ADMIN]) {
      throw new ForbiddenException(
        "Seul un ADMIN (ou rôle supérieur) peut marquer un document comme obsolète.",
      );
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }

    await this.prisma.document.update({
      where: { id: docId },
      data: { status: "OBSOLETE" },
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_MARKED_OBSOLETE",
      resourceType: "Document",
      resourceId: docId,
      severity: "WARN",
      metadata: { title: document.title, reference: document.reference },
    });

    return { message: "Document marked as obsolete" };
  }

  /**
   * Retourne les documents en attente d'action POUR l'utilisateur, sans
   * condition de rôle minimum — l'assignation fait foi (un collaborateur
   * désigné vérificateur/relecteur/approbateur a donc bien sa file). La vérité
   * terrain est l'étape PENDING (action null) qui lui est assignée :
   *  - IN_REVIEW  : étape courante VERIFICATION (vérificateur) ou REVIEW (relecteur)
   *  - PENDING_APPROVAL : étape APPROVAL (approbateur)
   *  - REVIEW_APPROVED : ses propres docs à confirmer (rédacteur) → onglet « À confirmer »
   */
  async getPendingForUser(userId: string, _role: UserRole) {
    // Un document est « pour moi » si sa demande de validation PENDING porte une
    // étape non encore décidée qui m'est assignée. Cela suit automatiquement les
    // réassignations (documents.service.update) et l'enchaînement des étapes.
    // La step pendante qui m'est assignée doit correspondre à l'étape
    // RÉELLEMENT en cours (currentStep + stepType), sinon les steps REVIEW
    // héritées (l'ancien approveReview ne clôturait pas la step d'origine)
    // font remonter des documents PENDING_APPROVAL dans la file du relecteur :
    // il clique « Approuver » → 403 garanti (RolesGuard DIRECTION), file
    // définitivement polluée. On type donc la jointure par étape.
    const reviewStepAssignedToMe = {
      validationRequests: {
        some: {
          status: "PENDING",
          currentStep: { in: ["VERIFICATION", "REVIEW"] },
          steps: {
            some: {
              action: null,
              assignedToId: userId,
              stepType: { in: ["VERIFICATION", "REVIEW"] },
            },
          },
        },
      },
    } as const;
    const approvalStepAssignedToMe = {
      validationRequests: {
        some: {
          status: "PENDING",
          currentStep: "APPROVAL",
          steps: {
            some: { action: null, assignedToId: userId, stepType: "APPROVAL" },
          },
        },
      },
    } as const;

    const conditions: any[] = [
      // Rédacteur : revue validée, à confirmer pour lancer l'approbation.
      { status: "REVIEW_APPROVED", ownerId: userId },
      // Vérificateur / relecteur : l'étape courante leur est assignée.
      { status: "IN_REVIEW", ...reviewStepAssignedToMe },
      // Approbateur : l'étape d'approbation leur est assignée.
      { status: "PENDING_APPROVAL", ...approvalStepAssignedToMe },
    ];

    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: conditions,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        verifier: {
          select: { id: true, firstName: true, lastName: true },
        },
        reviewer: {
          select: { id: true, firstName: true, lastName: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true },
        },
        // Étape courante (type + assigné) pour l'affichage « à vous d'agir ».
        validationRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            currentStep: true,
            steps: {
              where: { action: null },
              select: { stepType: true, assignedToId: true },
            },
          },
        },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}
