import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

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
  ) {
    this.docusealApiUrl =
      process.env.DOCUSEAL_API_URL || 'http://localhost:7000/api';
    this.docusealApiKey = process.env.DOCUSEAL_API_KEY || '';
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
    // docusealSlug est capture pour debug uniquement — non persiste cote DB
    // (on n'utilise que submission_id pour les callbacks).
    let _docusealSlug: string | null = null;

    // Call DocuSeal API to create submission
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
        _docusealSlug = data[0]?.slug || null;
      } else {
        this.logger.warn(
          `DocuSeal API returned ${response.status}: ${await response.text()}`,
        );
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`DocuSeal API error: ${err.message}`, err.stack);
      // Continue without DocuSeal if API is unavailable
    }

    const signatureRequest = await this.prisma.signatureRequest.create({
      data: {
        documentVersionId,
        requestedById,
        signerId,
        docusealSubmissionId,
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
   * Sign a document directly (without DocuSeal) — for internal signatures
   */
  async signDirectly(id: string, userId: string) {
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
    try {
      const response = await fetch(
        `${this.docusealApiUrl}/submissions/${id}`,
        {
          headers: { 'X-Auth-Token': this.docusealApiKey },
          signal: AbortSignal.timeout(this.DOCUSEAL_TIMEOUT_MS),
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async handleWebhook(payload: any) {
    const eventType = payload.event_type || payload.type;
    const submissionId = payload.data?.submission_id?.toString() || payload.data?.id?.toString();

    if (!submissionId) {
      this.logger.warn('Webhook payload missing submission ID');
      return;
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
      return;
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

      this.logger.log(`Signature completed for request ${signatureRequest.id}`);
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
    }
  }
}
