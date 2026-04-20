import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IsoAnalyzerService } from '../../iso-analyzer/iso-analyzer.service';
import { UserRole, ROLE_HIERARCHY } from '../../common/enums';
import { DocumentsService } from '../documents.service';
import { MentionsService } from '../../mentions/mentions.service';

/**
 * Catalogue de suggestions pré-définies que le reviewer/approbateur peut
 * sélectionner (en plus du commentaire libre) lors d'un refus.
 * Ces suggestions servent à guider le rédacteur pour les modifications.
 */
export const REJECTION_SUGGESTIONS: Record<string, string> = {
  // Forme
  'fix-typos': "Corriger les fautes d'orthographe et de grammaire",
  'improve-clarity': 'Améliorer la clarté et la lisibilité du document',
  'fix-formatting': 'Corriger la mise en forme et la structure',
  'add-examples': "Ajouter des exemples concrets ou cas d'usage",
  'simplify-language': 'Simplifier le vocabulaire technique',
  // Fond
  'clarify-scope': 'Clarifier le périmètre et les objectifs du document',
  'add-definitions': 'Ajouter un glossaire ou des définitions',
  'detail-procedure': 'Détailler davantage la procédure étape par étape',
  'add-responsibilities': 'Préciser les rôles et responsabilités',
  'add-metrics': 'Ajouter des indicateurs mesurables / KPIs',
  // Conformité
  'add-iso-references': 'Référencer les contrôles ISO 27001 applicables',
  'add-legal-references': 'Ajouter les références légales et réglementaires (NIS2, RGPD, ANSSI)',
  'check-classification': 'Vérifier la classification (PUBLIC/INTERNE/CONFIDENTIEL/SECRET)',
  'add-retention': 'Préciser la politique de rétention (A.5.33)',
  'add-review-date': 'Définir la date de prochaine revue',
  // Sécurité
  'security-review': 'Faire valider par le RSSI avant soumission',
  'risk-analysis': 'Ajouter une analyse de risque (EBIOS RM)',
  'update-threats': 'Actualiser la liste des menaces couvertes',
  // Process
  'align-with-policy': 'Aligner avec la politique mère en vigueur',
  'check-cross-refs': 'Vérifier les références croisées entre documents',
  'update-version-history': "Compléter l'historique des versions et changelog",
  // Autre
  'other': 'Autre (voir commentaire ci-dessus)',
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
  ) {}

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
          `${author?.firstName ?? ''} ${author?.lastName ?? ''}`.trim() ||
          author?.email ||
          'Un utilisateur';
        await mentionsSvc.parseAndNotify({
          text: comment,
          authorId,
          authorName,
          sourceType: 'document',
          sourceId: document.id,
          sourceTitle: `${document.title} (${document.reference})`,
          link: `/documents/${document.id}`,
        });
      } catch (err: any) {
        this.logger.warn(`mention parsing failed: ${err?.message || err}`);
      }
    })();
  }

  async submitForReview(docId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: { reviewer: true },
      // isNative, content, currentVersionId are scalar fields — always returned
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document introuvable');
    }

    if (document.ownerId !== userId) {
      throw new ForbiddenException("Seul l'auteur du document peut le soumettre en revue.");
    }

    if (document.status !== 'DRAFT') {
      throw new BadRequestException("Le document doit être en statut 'Brouillon' pour être soumis en revue.");
    }

    if (!document.reviewerId) {
      throw new BadRequestException("Aucun reviewer n'est assigné à ce document. Désignez-en un (via 'Modifier') avant de soumettre en revue.");
    }

    if (!document.approverId) {
      throw new BadRequestException(
        "Aucun approbateur final n'est assigné à ce document. Le workflow complet "
        + "(Rédaction → Revue → Confirmation → Approbation) exige les DEUX rôles "
        + "avant la soumission. Modifiez le document pour désigner un approbateur "
        + "(via 'Modifier') avant de soumettre en revue.",
      );
    }

    // Native (inline) documents store content directly; uploaded documents
    // need at least one version. Both paths require something to review.
    if (!document.currentVersionId && !document.isNative) {
      throw new BadRequestException("Le document doit avoir au moins une version uploadée avant soumission en revue.");
    }
    if (document.isNative && (!document.content || document.content.trim().length === 0)) {
      throw new BadRequestException('Le document natif doit avoir du contenu avant soumission');
    }

    // Atomic: update status + create validation request + validation step
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: { status: 'IN_REVIEW' },
      });

      // ValidationRequest.documentVersionId is required by schema.
      // For native docs without a version, create a synthetic version
      // snapshot so the validation chain remains traceable (ISO 27001 A.5.28).
      let versionId = document.currentVersionId;
      if (!versionId && document.isNative) {
        const snapshot = await tx.documentVersion.create({
          data: {
            documentId: docId,
            versionNumber: '1.0',
            fileUrl: `inline://${docId}`,
            fileType: 'text/html',
            fileSizeBytes: Buffer.byteLength(document.content || '', 'utf8'),
            checksum: require('crypto')
              .createHash('sha256')
              .update(document.content || '')
              .digest('hex'),
            changeLog: 'Snapshot du contenu natif pour validation',
            uploadedById: userId,
          },
        });
        versionId = snapshot.id;
        await tx.document.update({
          where: { id: docId },
          data: { currentVersionId: snapshot.id },
        });
      }

      const validationRequest = await tx.validationRequest.create({
        data: {
          documentId: docId,
          documentVersionId: versionId!,
          requestedById: userId,
          currentStep: 'REVIEW',
          status: 'PENDING',
        },
      });

      await tx.validationStep.create({
        data: {
          requestId: validationRequest.id,
          stepType: 'REVIEW',
          assignedToId: document.reviewerId!,
        },
      });
    });

    // Notify reviewer with email approval links (time-limited HMAC)
    const crypto = await import('crypto');
    const secret = process.env.JWT_ACCESS_SECRET || 'fallback';
    const reviewerId = document.reviewerId!;
    const ts = Date.now().toString();
    const approveToken = crypto.createHmac('sha256', secret).update(`approve:${docId}:${reviewerId}:${ts}`).digest('hex');
    const rejectToken = crypto.createHmac('sha256', secret).update(`reject:${docId}:${reviewerId}:${ts}`).digest('hex');
    const baseUrl = process.env.APP_URL || 'http://localhost:3001';

    await this.notificationsService.create({
      userId: reviewerId,
      type: 'DOC_REVIEW_NEEDED',
      title: `Revue requise : ${document.title}`,
      body: `Le document "${document.title}" (${document.reference}) nécessite votre revue.\n\nApprouver : ${baseUrl}/api/workflow/email-action?action=approve&docId=${docId}&userId=${reviewerId}&token=${approveToken}&ts=${ts}\n\nRejeter : ${baseUrl}/api/workflow/email-action?action=reject&docId=${docId}&userId=${reviewerId}&token=${rejectToken}&ts=${ts}`,
      resourceType: 'Document',
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_SUBMITTED_FOR_REVIEW',
      resourceType: 'Document',
      resourceId: docId,
      metadata: { reviewerId: document.reviewerId },
    });

    this.logger.log(`Document ${document.reference} submitted for review`);
    return { message: 'Document submitted for review' };
  }

  /**
   * Étape 2 : le reviewer valide la revue.
   * Après validation, le document passe en REVIEW_APPROVED — il attend
   * que le RÉDACTEUR (owner) confirme et lance la demande d'approbation
   * finale. Cela garantit que le rédacteur a pu prendre en compte les
   * commentaires du reviewer avant l'étape approbation.
   */
  async approveReview(docId: string, userId: string, comment?: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document introuvable');
    }

    if (document.status !== 'IN_REVIEW') {
      throw new BadRequestException(
        `La revue ne peut être approuvée que si le document est en statut "En revue" (statut actuel : ${document.status}).`,
      );
    }

    if (document.reviewerId !== userId) {
      throw new ForbiddenException("Seul le reviewer assigné peut approuver la revue de ce document.");
    }

    if (!document.approverId) {
      throw new BadRequestException(
        "Aucun approbateur final n'est assigné à ce document. Demandez à l'auteur d'en désigner un (via 'Modifier') avant d'approuver la revue.",
      );
    }

    // Atomic: status → REVIEW_APPROVED + validation request + reviewer step
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: { status: 'REVIEW_APPROVED' },
      });

      const request = document.validationRequests[0];
      if (request) {
        // Ne change PAS currentStep : on reste à REVIEW jusqu'à ce que
        // le rédacteur appelle requestApproval()
        await tx.validationStep.create({
          data: {
            requestId: request.id,
            stepType: 'REVIEW',
            assignedToId: userId,
            action: 'APPROVED',
            comment,
            actionAt: new Date(),
          },
        });
      }
    });

    // Notifier le rédacteur (owner) : il doit maintenant confirmer
    // et lancer la demande d'approbation. L'approbateur n'est pas
    // encore notifié — il le sera via requestApproval().
    await this.notificationsService.create({
      userId: document.ownerId,
      type: 'DOC_APPROVED',
      title: 'Revue validée — à vous de lancer l\'approbation',
      body: `Le reviewer a validé la revue de "${document.title}" (${document.reference}).${
        comment ? ` Commentaire : ${comment}` : ''
      }\n\nVous pouvez maintenant prendre en compte les éventuels ajustements et lancer la demande d'approbation via "Demander l'approbation".`,
      resourceType: 'Document',
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_REVIEW_APPROVED',
      resourceType: 'Document',
      resourceId: docId,
      metadata: { comment, nextStep: 'OWNER_MUST_REQUEST_APPROVAL' },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: { id: document.id, title: document.title, reference: document.reference },
    });

    return { message: 'Revue validée. Le rédacteur doit confirmer pour lancer l\'approbation finale.' };
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
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document introuvable');
    }

    // Seul le rédacteur (owner) peut lancer la demande d'approbation
    if (document.ownerId !== userId) {
      throw new ForbiddenException(
        "Seul le rédacteur du document peut lancer la demande d'approbation",
      );
    }

    // Le document doit avoir été validé par le reviewer au préalable
    if (document.status !== 'REVIEW_APPROVED') {
      throw new BadRequestException(
        'Le document doit être en statut REVIEW_APPROVED (revue validée par le reviewer) pour lancer l\'approbation',
      );
    }

    if (!document.approverId) {
      throw new BadRequestException("Aucun approbateur n'est assigné au document");
    }

    // Atomic: status → PENDING_APPROVAL + validation step
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: { status: 'PENDING_APPROVAL' },
      });

      const request = document.validationRequests[0];
      if (request) {
        await tx.validationRequest.update({
          where: { id: request.id },
          data: { currentStep: 'APPROVAL' },
        });

        // Step "owner confirmed" pour traçabilité
        await tx.validationStep.create({
          data: {
            requestId: request.id,
            stepType: 'REVIEW',
            assignedToId: userId,
            action: 'APPROVED',
            comment: comment || 'Rédacteur confirme la prise en compte des retours reviewer',
            actionAt: new Date(),
          },
        });

        // Step "approval pending" pour l'approbateur
        await tx.validationStep.create({
          data: {
            requestId: request.id,
            stepType: 'APPROVAL',
            assignedToId: document.approverId!,
          },
        });
      }
    });

    // Notify approver
    await this.notificationsService.create({
      userId: document.approverId,
      type: 'DOC_APPROVAL_NEEDED',
      title: 'Approbation requise',
      body: `Le document "${document.title}" (${document.reference}) a été validé par le reviewer ET confirmé par le rédacteur. Votre approbation finale est requise.`,
      resourceType: 'Document',
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_APPROVAL_REQUESTED',
      resourceType: 'Document',
      resourceId: docId,
      metadata: { comment, approverId: document.approverId },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: { id: document.id, title: document.title, reference: document.reference },
    });

    this.logger.log(`Document ${document.reference} : rédacteur a lancé la demande d'approbation`);
    return { message: 'Demande d\'approbation envoyée à l\'approbateur.' };
  }

  /**
   * Refus du reviewer avec suggestions structurées.
   *
   * @param suggestions — tableau de catégories de suggestions (clés) ou commentaires
   *                      prédéfinis qui guident le rédacteur sur ce qu'il faut corriger.
   *                      Ex: ["clarify-scope", "add-iso-references", "fix-typos"]
   */
  async rejectReview(
    docId: string,
    userId: string,
    comment: string,
    suggestions?: string[],
  ) {
    if (!comment || comment.trim().length < 10) {
      throw new BadRequestException(
        'Un commentaire détaillé (10+ caractères) est requis pour un refus',
      );
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document introuvable');
    }

    if (document.status !== 'IN_REVIEW') {
      throw new BadRequestException("Le document doit être en statut 'En revue' pour rejeter la revue.");
    }

    if (document.reviewerId !== userId) {
      throw new ForbiddenException("Seul le reviewer assigné peut rejeter la revue de ce document.");
    }

    const enrichedComment = this.buildRejectionComment(comment, suggestions);

    // Atomic: revert status + update validation request + create rejection step
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: { status: 'DRAFT' },
      });

      const request = document.validationRequests[0];
      if (request) {
        await tx.validationRequest.update({
          where: { id: request.id },
          data: { status: 'REJECTED' },
        });

        await tx.validationStep.create({
          data: {
            requestId: request.id,
            stepType: 'REVIEW',
            assignedToId: userId,
            action: 'REJECTED',
            comment: enrichedComment,
            actionAt: new Date(),
          },
        });
      }
    });

    // Notify owner with actionable suggestions
    await this.notificationsService.create({
      userId: document.ownerId,
      type: 'DOC_REJECTED',
      title: 'Revue rejetée — modifications demandées',
      body: `Document "${document.title}" (${document.reference}) rejeté en revue.\n\n${enrichedComment}`,
      resourceType: 'Document',
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_REVIEW_REJECTED',
      resourceType: 'Document',
      resourceId: docId,
      metadata: { comment, suggestions: suggestions || [] },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: { id: document.id, title: document.title, reference: document.reference },
    });

    return { message: 'Revue rejetée — le document repasse en brouillon avec suggestions' };
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
      .join('\n');

    return `${comment}\n\n--- Suggestions d'amélioration ---\n${suggestionLabels}`;
  }

  async approveDocument(docId: string, userId: string, comment?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const userRole = user.role as UserRole;
    if (
      ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[UserRole.DIRECTION]
    ) {
      throw new ForbiddenException("Seule la DIRECTION (ou un rôle supérieur) peut approuver définitivement un document.");
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document introuvable');
    }

    if (document.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException("Le document doit être en statut 'En attente d'approbation' pour cette action.");
    }

    // Atomic: approve status + complete validation request + approval step
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: { status: 'APPROVED' },
      });

      const request = document.validationRequests[0];
      if (request) {
        await tx.validationRequest.update({
          where: { id: request.id },
          data: { status: 'COMPLETED' },
        });

        await tx.validationStep.create({
          data: {
            requestId: request.id,
            stepType: 'APPROVAL',
            assignedToId: userId,
            action: 'APPROVED',
            comment,
            actionAt: new Date(),
          },
        });
      }
    });

    // Notify owner
    await this.notificationsService.create({
      userId: document.ownerId,
      type: 'DOC_APPROVED',
      title: 'Document approved',
      body: `Document "${document.title}" (${document.reference}) has been approved.`,
      resourceType: 'Document',
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_APPROVED',
      resourceType: 'Document',
      resourceId: docId,
      severity: 'INFO',
      metadata: { comment },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: { id: document.id, title: document.title, reference: document.reference },
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
      const isoResult = await this.isoAnalyzerService.autoAssignControls(docId, 35);
      if (isoResult.assigned > 0) {
        this.logger.log(`ISO auto-assign on approval: ${document.reference} → ${isoResult.assigned} controls (${isoResult.controls.join(', ')})`);
      }
    } catch (err) {
      this.logger.warn(`ISO auto-assign failed for ${document.reference}: ${err instanceof Error ? err.message : err}`);
    }

    this.logger.log(`Document ${document.reference} approved by ${userId}`);
    return { message: 'Document approved' };
  }

  async rejectDocument(
    docId: string,
    userId: string,
    comment: string,
    suggestions?: string[],
  ) {
    if (!comment || comment.trim().length < 10) {
      throw new BadRequestException(
        'Un commentaire détaillé (10+ caractères) est requis pour un refus',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const userRole = user.role as UserRole;
    if (
      ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[UserRole.DIRECTION]
    ) {
      throw new ForbiddenException("Seule la DIRECTION (ou un rôle supérieur) peut rejeter un document en approbation.");
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        validationRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document introuvable');
    }

    if (document.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException("Le document doit être en statut 'En attente d'approbation' pour cette action.");
    }

    const enrichedComment = this.buildRejectionComment(comment, suggestions);

    // Atomic: revert status + reject validation request + rejection step
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: { status: 'DRAFT' },
      });

      const request = document.validationRequests[0];
      if (request) {
        await tx.validationRequest.update({
          where: { id: request.id },
          data: { status: 'REJECTED' },
        });

        await tx.validationStep.create({
          data: {
            requestId: request.id,
            stepType: 'APPROVAL',
            assignedToId: userId,
            action: 'REJECTED',
            comment: enrichedComment,
            actionAt: new Date(),
          },
        });
      }
    });

    await this.notificationsService.create({
      userId: document.ownerId,
      type: 'DOC_REJECTED',
      title: 'Approbation refusée — modifications demandées',
      body: `Document "${document.title}" (${document.reference}) refusé en approbation.\n\n${enrichedComment}`,
      resourceType: 'Document',
      resourceId: docId,
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_REJECTED',
      resourceType: 'Document',
      resourceId: docId,
      metadata: { comment, suggestions: suggestions || [] },
    });

    this.notifyMentionsForDocComment({
      comment,
      authorId: userId,
      document: { id: document.id, title: document.title, reference: document.reference },
    });

    return { message: 'Document rejeté — le rédacteur est notifié des suggestions' };
  }

  async markObsolete(docId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const userRole = user.role as UserRole;
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[UserRole.ADMIN]) {
      throw new ForbiddenException("Seul un ADMIN (ou rôle supérieur) peut marquer un document comme obsolète.");
    }

    const document = await this.prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document introuvable');
    }

    await this.prisma.document.update({
      where: { id: docId },
      data: { status: 'OBSOLETE' },
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_MARKED_OBSOLETE',
      resourceType: 'Document',
      resourceId: docId,
      severity: 'WARN',
      metadata: { title: document.title, reference: document.reference },
    });

    return { message: 'Document marked as obsolete' };
  }

  /**
   * Retourne les documents en attente d'action pour l'utilisateur :
   * - Rédacteur (owner) : documents REVIEW_APPROVED dont il est owner
   *   (doit lancer la demande d'approbation)
   * - Reviewer : documents IN_REVIEW dont il est reviewer
   * - Approbateur (DIRECTION+) : documents PENDING_APPROVAL
   * - Admin+ : voit tout (IN_REVIEW où il est reviewer, REVIEW_APPROVED, PENDING_APPROVAL)
   */
  async getPendingForUser(userId: string, role: UserRole) {
    const roleLevel = ROLE_HIERARCHY[role] ?? 0;

    // Conditions possibles selon le rôle
    const conditions: any[] = [];

    // TOUS les users avec rôle ≥ COLLABORATEUR voient les docs qu'ils possèdent
    // en REVIEW_APPROVED (ils doivent lancer l'approbation)
    conditions.push({ status: 'REVIEW_APPROVED', ownerId: userId });

    if (role === UserRole.REVIEWER || roleLevel >= ROLE_HIERARCHY[UserRole.REVIEWER]) {
      conditions.push({ status: 'IN_REVIEW', reviewerId: userId });
    }

    if (roleLevel >= ROLE_HIERARCHY[UserRole.DIRECTION]) {
      // Approbateurs : voient les docs en attente d'approbation
      conditions.push({ status: 'PENDING_APPROVAL', approverId: userId });
      conditions.push({ status: 'PENDING_APPROVAL', approverId: null });
    }

    if (roleLevel >= ROLE_HIERARCHY[UserRole.ADMIN]) {
      // Admin+ : voit tous les documents en workflow actif
      conditions.push({ status: 'IN_REVIEW' });
      conditions.push({ status: 'REVIEW_APPROVED' });
      conditions.push({ status: 'PENDING_APPROVAL' });
    }

    if (conditions.length === 0) {
      return [];
    }

    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: conditions,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviewer: {
          select: { id: true, firstName: true, lastName: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
