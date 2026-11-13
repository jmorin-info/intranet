import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EvidenceService } from './evidence.service';

@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);
  private readonly docusealApiUrl: string;
  private readonly docusealApiKey: string;
  /** Timeout par défaut sur les appels DocuSeal — sans cela, fetch peut pendre indéfiniment
   *  si le service est down/lent et bloquer tout le pool de requêtes Nest. */
  private readonly DOCUSEAL_TIMEOUT_MS = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly evidenceService: EvidenceService,
  ) {
    this.docusealApiUrl =
      process.env.DOCUSEAL_API_URL || 'http://localhost:7000/api';
    this.docusealApiKey = process.env.DOCUSEAL_API_KEY || '';
  }

  /**
   * signDirectly (signature sans DocuSeal ni evidence) est désactivé par
   * défaut : une signature engageante passe TOUJOURS par DocuSeal.
   * SIGNATURES_ALLOW_DIRECT=true ne sert qu'au rollback d'urgence.
   * Lu à chaque appel (et non en constructeur) pour être testable et
   * réagir sans redémarrage à un changement d'env en dev.
   */
  private isDirectSignAllowed(): boolean {
    return (
      (process.env.SIGNATURES_ALLOW_DIRECT || 'false').toLowerCase() === 'true'
    );
  }

  async createSignatureRequest(
    documentVersionId: string,
    signerId: string,
    requestedById: string,
    templateId?: number,
  ) {
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      include: { document: true },
    });

    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    const signer = await this.prisma.user.findUnique({
      where: { id: signerId },
    });

    if (!signer || signer.deletedAt) {
      throw new NotFoundException('Signer not found');
    }

    let docusealSubmissionId: string | null = null;
    // docusealSlug : slug du submitter DocuSeal — PERSISTÉ, c'est lui qui
    // construit l'URL de signature (/s/:slug). Le submissionId numérique sert
    // aux callbacks mais donne un 404 en URL de formulaire.
    let docusealSlug: string | null = null;

    // Appel DocuSeal OBLIGATOIRE : si l'API échoue, on THROW au lieu de
    // créer une demande fantôme (docusealSubmissionId=null) que le webhook
    // ne pourra jamais compléter et qui n'aurait aucune valeur probante.
    try {
      const response = await fetch(`${this.docusealApiUrl}/submissions`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': this.docusealApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId || Number(process.env.DOCUSEAL_TEMPLATE_ID) || 1,
          send_email: true,
          submitters: [
            {
              name: `${signer.firstName} ${signer.lastName}`,
              email: signer.email,
              role: 'Signataire',
            },
          ],
        }),
        signal: AbortSignal.timeout(this.DOCUSEAL_TIMEOUT_MS),
        redirect: "error",
      });

      if (response.ok) {
        const data = (await response.json()) as Array<{
          submission_id?: number;
          id?: number;
          slug?: string;
        }>;
        docusealSubmissionId =
          data[0]?.submission_id?.toString() ||
          data[0]?.id?.toString() ||
          null;
        docusealSlug = data[0]?.slug || null;
      } else {
        this.logger.error(
          `DocuSeal API returned ${response.status}: ${await response.text()}`,
        );
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`DocuSeal API error: ${err.message}`, err.stack);
    }

    if (!docusealSubmissionId) {
      throw new ServiceUnavailableException(
        'Le service de signature électronique (DocuSeal) est indisponible ou a refusé la demande. Aucune demande de signature n\'a été créée — réessayez plus tard.',
      );
    }

    const signatureRequest = await this.prisma.signatureRequest.create({
      data: {
        documentVersionId,
        requestedById,
        signerId,
        docusealSubmissionId,
        docusealSlug,
        status: 'PENDING',
      },
      include: {
        signer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        documentVersion: {
          include: {
            document: {
              select: { id: true, title: true, reference: true },
            },
          },
        },
      },
    });

    await this.auditService.log({
      userId: requestedById,
      action: 'SIGNATURE_REQUESTED',
      resourceType: 'SignatureRequest',
      resourceId: signatureRequest.id,
      metadata: {
        documentVersionId,
        signerId,
        docusealSubmissionId,
      },
    });

    this.logger.log(
      `Signature request created for version ${documentVersionId}, signer ${signerId}`,
    );

    return signatureRequest;
  }

  async getStatus(id: string) {
    const request = await this.prisma.signatureRequest.findUnique({
      where: { id },
      include: {
        signer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        documentVersion: {
          include: {
            document: {
              select: { id: true, title: true, reference: true },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Signature request not found');
    }

    return request;
  }

  /**
   * @deprecated Signature "au clic" sans DocuSeal ni evidence — ne produit
   * AUCUNE preuve eIDAS. Désactivé par défaut (SIGNATURES_ALLOW_DIRECT=false),
   * conservé uniquement comme issue de secours de rollback. L'UI ne
   * l'expose plus.
   */
  async signDirectly(id: string, userId: string) {
    if (!this.isDirectSignAllowed()) {
      throw new ForbiddenException(
        'La signature directe (sans DocuSeal) est désactivée : utilisez le lien de signature électronique DocuSeal.',
      );
    }
    const request = await this.prisma.signatureRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Signature request not found');
    // Sécurité critique : impossible de signer à la place d'un autre user
    // (ISO 27001 A.5.10 — Acceptable use / A.5.15 — Access control)
    if (request.signerId !== userId) {
      // Audit l'attaque tentée
      await this.auditService.log({
        userId,
        action: 'SIGNATURE_FORBIDDEN_ATTEMPT',
        resourceType: 'SignatureRequest',
        resourceId: id,
        severity: 'CRITICAL',
        metadata: { reason: 'not_designated_signer', expectedSigner: request.signerId },
      });
      throw new ForbiddenException('Seul le signataire désigné peut signer ce document');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('La signature a déjà été traitée');
    }

    const updated = await this.prisma.signatureRequest.update({
      where: { id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
      },
      include: {
        signer: { select: { id: true, firstName: true, lastName: true, email: true } },
        documentVersion: { include: { document: { select: { id: true, title: true, reference: true } } } },
      },
    });

    await this.auditService.log({
      userId,
      action: 'DOCUMENT_SIGNED',
      resourceType: 'SignatureRequest',
      resourceId: id,
      metadata: {
        documentTitle: updated.documentVersion.document.title,
        documentRef: updated.documentVersion.document.reference,
      },
    });

    this.logger.log(`Document signed directly: ${updated.documentVersion.document.reference} by ${updated.signer.email}`);
    return updated;
  }

  async getMySignatures(userId: string) {
    const signatures = await this.prisma.signatureRequest.findMany({
      where: { signerId: userId },
      include: {
        signer: { select: { id: true, firstName: true, lastName: true, email: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        documentVersion: {
          include: { document: { select: { id: true, title: true, reference: true } } },
        },
        // Demandes issues d'une campagne : affichées avec un badge dédié.
        campaign: { select: { id: true, title: true, dueAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const pending = signatures.filter(s => s.status === 'PENDING');
    const completed = signatures.filter(s => s.status !== 'PENDING');

    return { pending, completed, pendingCount: pending.length, totalCount: signatures.length };
  }

  async getByDocument(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.prisma.signatureRequest.findMany({
      where: {
        documentVersion: { documentId },
      },
      include: {
        signer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        documentVersion: {
          select: { id: true, versionNumber: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listTemplates() {
    try {
      const response = await fetch(`${this.docusealApiUrl}/templates`, {
        headers: { 'X-Auth-Token': this.docusealApiKey },
        signal: AbortSignal.timeout(this.DOCUSEAL_TIMEOUT_MS),
        redirect: "error",
      });
      if (!response.ok) {
        this.logger.warn(
          `DocuSeal templates API returned ${response.status}`,
        );
        return [];
      }
      return (await response.json()) as Array<{
        id: number;
        name: string;
        created_at: string;
        updated_at: string;
        fields: unknown[];
      }>;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `DocuSeal templates fetch error: ${err.message}`,
        err.stack,
      );
      return [];
    }
  }

  async getSubmission(id: string) {
    if (typeof id !== "string" || !/^[1-9][0-9]{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new BadRequestException("Identifiant de soumission DocuSeal invalide.");
    const submissionId = Number(id);
    try {
      const response = await fetch(
        `${this.docusealApiUrl}/submissions/${submissionId}`,
        {
          headers: { 'X-Auth-Token': this.docusealApiKey },
          signal: AbortSignal.timeout(this.DOCUSEAL_TIMEOUT_MS),
        redirect: "error",
        },
      );
      if (!response.ok) {
        this.logger.warn(
          `DocuSeal submission API returned ${response.status}`,
        );
        return null;
      }
      return await response.json();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `DocuSeal submission fetch error: ${err.message}`,
        err.stack,
      );
      return null;
    }
  }

  async listSubmissions() {
    try {
      const response = await fetch(`${this.docusealApiUrl}/submissions`, {
        headers: { 'X-Auth-Token': this.docusealApiKey },
        signal: AbortSignal.timeout(this.DOCUSEAL_TIMEOUT_MS),
        redirect: "error",
      });
      if (!response.ok) {
        this.logger.warn(
          `DocuSeal submissions API returned ${response.status}`,
        );
        return [];
      }
      return await response.json();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `DocuSeal submissions fetch error: ${err.message}`,
        err.stack,
      );
      return [];
    }
  }

  async listAllSignatureRequests() {
    return this.prisma.signatureRequest.findMany({
      include: {
        signer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        documentVersion: {
          include: {
            document: {
              select: { id: true, title: true, reference: true },
            },
          },
        },
        campaign: { select: { id: true, title: true, dueAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Traite un événement webhook DocuSeal pour les SignatureRequest.
   *
   * Retourne `{ handled }` pour permettre la chaîne de responsabilité du
   * WebhookController : si aucune SignatureRequest ne correspond au
   * submissionId, le handler campagnes (legacy CampaignSignature) prend
   * le relais.
   */
  async handleWebhook(
    payload: any,
    extra?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ handled: boolean }> {
    const eventType = payload.event_type || payload.type;
    const submissionId = payload.data?.submission_id?.toString() || payload.data?.id?.toString();

    if (!submissionId) {
      this.logger.warn('Webhook payload missing submission ID');
      return { handled: false };
    }

    const signatureRequest = await this.prisma.signatureRequest.findFirst({
      where: { docusealSubmissionId: submissionId },
      include: {
        documentVersion: {
          include: { document: true },
        },
      },
    });

    if (!signatureRequest) {
      this.logger.warn(`No signature request found for submission ${submissionId}`);
      return { handled: false };
    }

    if (eventType === 'form.completed' || eventType === 'submission.completed') {
      await this.prisma.signatureRequest.update({
        where: { id: signatureRequest.id },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
          signedFileUrl: payload.data?.documents?.[0]?.url || null,
          webhookPayload: payload,
        },
      });

      await this.auditService.log({
        userId: signatureRequest.signerId,
        action: 'DOCUMENT_SIGNED',
        resourceType: 'SignatureRequest',
        resourceId: signatureRequest.id,
        metadata: {
          documentId: signatureRequest.documentVersion.documentId,
          submissionId,
        },
      });

      // Wave D item 26 — capture eIDAS-AES evidence (best-effort).
      // Une erreur de capture ne doit pas faire échouer le webhook : la
      // signature elle-même est valide, l'evidence peut être recapturée
      // ultérieurement via un job de réconciliation.
      try {
        await this.evidenceService.captureEvidence(signatureRequest.id, extra);
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        this.logger.error(
          `evidence capture failed for ${signatureRequest.id} (non-blocking): ${e.message}`,
          e.stack,
        );
      }

      this.logger.log(`Signature completed for request ${signatureRequest.id}`);
      return { handled: true };
    } else if (eventType === 'form.declined' || eventType === 'submission.declined') {
      await this.prisma.signatureRequest.update({
        where: { id: signatureRequest.id },
        data: {
          status: 'REJECTED',
          webhookPayload: payload,
        },
      });

      await this.auditService.log({
        userId: signatureRequest.signerId,
        action: 'SIGNATURE_REJECTED',
        resourceType: 'SignatureRequest',
        resourceId: signatureRequest.id,
        metadata: { submissionId },
      });
      return { handled: true };
    }

    // Événement non géré (form.viewed…) mais la demande correspond bien à
    // ce submissionId : on laisse le handler campagnes traiter l'ouverture
    // (openedAt sur CampaignSignature) — considéré non-terminal ici.
    return { handled: false };
  }
}
