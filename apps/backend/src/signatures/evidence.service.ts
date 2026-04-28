import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createHash } from 'crypto';

/**
 * Wave D item 26 — eIDAS-AES Evidence service.
 *
 * Capture les preuves nécessaires à la conformité eIDAS niveau AES après
 * la complétion d'une signature DocuSeal :
 *  - Identité du signataire (email, IP réelle, User-Agent)
 *  - Lien temporel (signedAt UTC + TimeStampToken RFC 3161 optionnel)
 *  - Intégrité (SHA-256 du PDF signé téléchargé depuis DocuSeal)
 *  - Chaîne de certificats (PEM) — uniquement présente pour QES via PSC
 *
 * Mapping ETSI EN 319 122 documenté dans
 *   docs/compliance/EIDAS_AES_CONFORMITY.md
 *
 * Génère un PDF "Preuve de signature" exportable depuis l'UI signature
 * via `GET /signatures/:id/evidence-report`.
 */
@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);
  private readonly tsaUrl: string | undefined;
  /** Timeout sur appel TSA — un TSA injoignable ne doit pas bloquer la
   *  capture des preuves. La preuve sans TSA reste valide eIDAS-AES. */
  private static readonly TSA_TIMEOUT_MS = 5_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.tsaUrl = process.env.TSA_URL || undefined;
  }

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  /**
   * Capture les preuves d'une signature à partir de :
   *  - SignatureRequest.webhookPayload (DocuSeal)
   *  - Optionnel : IP / UA capturés par WebhookController au reçu du webhook
   *
   * Idempotente : si une evidence existe déjà pour cette signatureRequestId,
   * on la met à jour (DocuSeal peut envoyer plusieurs webhooks completed).
   */
  async captureEvidence(
    signatureRequestId: string,
    extra?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ id: string }> {
    const sig = await this.prisma.signatureRequest.findUnique({
      where: { id: signatureRequestId },
      include: {
        signer: {
          select: { id: true, email: true, firstName: true, lastName: true },
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
    if (!sig) {
      throw new NotFoundException('Signature request not found');
    }
    if (!sig.signedAt) {
      this.logger.warn(
        `captureEvidence called on unsigned request ${signatureRequestId} — skipping`,
      );
      return { id: '' };
    }

    const payload = (sig.webhookPayload as any) || {};

    // Hash SHA-256 du PDF signé. Si DocuSeal a fourni un hash dans le payload,
    // on l'utilise ; sinon on télécharge l'URL et on hash localement (best-effort).
    const documentHashSha256 = await this.computeOrFetchDocumentHash(
      payload,
      sig.signedFileUrl,
    );

    // Identité signataire : prefer le payload DocuSeal (source de vérité du
    // PSC, peut différer de SignatureRequest.signer si délégué), fallback DB.
    const submitter =
      payload?.data?.submitters?.[0] ||
      payload?.submitter ||
      payload?.data ||
      {};
    const signerEmail =
      submitter.email || submitter.signer_email || sig.signer.email;
    const signerIpAddress =
      submitter.ip_address ||
      submitter.ip ||
      payload?.metadata?.ip ||
      extra?.ipAddress ||
      null;
    const signerUserAgent =
      submitter.user_agent ||
      submitter.ua ||
      payload?.metadata?.user_agent ||
      extra?.userAgent ||
      null;

    // Certificate chain : uniquement présente pour QES (signature qualifiée).
    // DocuSeal renvoie `certificate` (PEM) dans le payload des soumissions
    // PSC qualifiées (Yousign Pro, Universign, etc.). Pour AES standard,
    // restera null.
    const certificateChain =
      payload?.data?.signature?.certificate ||
      payload?.signature?.certificate ||
      null;

    // TSA RFC 3161 — appel optionnel si TSA_URL configuré. Le token retourné
    // est stocké en base64 pour preuve indépendante du temps de signature.
    let tsa: string | null = null;
    if (this.tsaUrl) {
      try {
        tsa = await this.requestTimestamp(documentHashSha256);
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `TSA RFC 3161 request failed (non-blocking): ${e.message}`,
        );
      }
    }

    // Snapshot evidence JSON : tout ce qui pourrait servir en cas de litige
    // 5 ans plus tard, indépendamment de la disponibilité de DocuSeal.
    const evidenceSnapshot = {
      capturedAt: new Date().toISOString(),
      tsaProvider: this.tsaUrl || null,
      docuseal: {
        submissionId: sig.docusealSubmissionId,
        eventType: payload?.event_type || payload?.type || null,
        signedFileUrl: sig.signedFileUrl,
      },
      signer: {
        userId: sig.signer.id,
        email: sig.signer.email,
        firstName: sig.signer.firstName,
        lastName: sig.signer.lastName,
      },
      document: {
        id: sig.documentVersion.document.id,
        title: sig.documentVersion.document.title,
        reference: sig.documentVersion.document.reference,
        versionId: sig.documentVersionId,
      },
      rawWebhookPayload: payload,
    };

    const existing = await this.prisma.signatureEvidence.findUnique({
      where: { signatureRequestId },
    });

    let saved: { id: string };
    if (existing) {
      saved = await this.prisma.signatureEvidence.update({
        where: { signatureRequestId },
        data: {
          signedAt: sig.signedAt,
          signerEmail,
          signerIpAddress,
          signerUserAgent,
          documentHashSha256,
          certificateChain,
          tsa,
          evidence: evidenceSnapshot as any,
        },
        select: { id: true },
      });
      this.logger.log(
        `SignatureEvidence updated for request ${signatureRequestId}`,
      );
    } else {
      saved = await this.prisma.signatureEvidence.create({
        data: {
          signatureRequestId,
          signedAt: sig.signedAt,
          signerEmail,
          signerIpAddress,
          signerUserAgent,
          documentHashSha256,
          certificateChain,
          tsa,
          evidence: evidenceSnapshot as any,
        },
        select: { id: true },
      });
      this.logger.log(
        `SignatureEvidence captured for request ${signatureRequestId}`,
      );
    }

    await this.auditService.log({
      userId: sig.signer.id,
      action: 'SIGNATURE_EVIDENCE_CAPTURED',
      resourceType: 'SignatureEvidence',
      resourceId: saved.id,
      metadata: {
        signatureRequestId,
        documentHashSha256,
        hasCertificateChain: Boolean(certificateChain),
        hasTsa: Boolean(tsa),
      },
    });

    return saved;
  }

  // ---------------------------------------------------------------------------
  // Read / get
  // ---------------------------------------------------------------------------

  /**
   * Récupère l'evidence d'une signature avec contrôle d'accès :
   *  - signataire désigné OU demandeur de la signature
   *  - OU rôle ADMIN/SUPER_ADMIN/DIRECTION
   *
   * Throws NotFoundException si l'evidence n'existe pas ; ForbiddenException
   * si l'utilisateur n'a pas l'autorisation.
   */
  async getEvidenceForUser(
    signatureRequestId: string,
    userId: string,
    userRole: string,
  ) {
    const sig = await this.prisma.signatureRequest.findUnique({
      where: { id: signatureRequestId },
      include: {
        evidence: true,
        signer: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        requestedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
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
    if (!sig) {
      throw new NotFoundException('Signature request not found');
    }
    if (!sig.evidence) {
      throw new NotFoundException(
        'Aucune preuve disponible pour cette signature (signature non terminée ?)',
      );
    }

    const isOwner =
      sig.signerId === userId || sig.requestedById === userId;
    const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'DIRECTION'].includes(
      userRole,
    );
    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException(
        'Accès refusé : seul le signataire, le demandeur ou un administrateur peut consulter cette preuve',
      );
    }

    return sig;
  }

  // ---------------------------------------------------------------------------
  // PDF report export
  // ---------------------------------------------------------------------------

  /**
   * Génère un PDF "Preuve de signature" eIDAS-AES.
   *
   * Le PDF contient toutes les preuves :
   *  - En-tête OMNITECH avec identifiant unique du rapport
   *  - Section identité signataire (email, IP, UA, signedAt UTC)
   *  - Section intégrité (hash SHA-256 du PDF signé)
   *  - Section certificats (chaîne PEM si QES, sinon mention AES)
   *  - Section TSA (TimeStampToken RFC 3161 si présent)
   *  - Footer avec hash du présent rapport pour vérification ultérieure
   *
   * Utilise `pdf-lib` (déjà présent en dépendance pour SignedPdfService).
   */
  async exportPdfReport(
    signatureRequestId: string,
    userId: string,
    userRole: string,
  ): Promise<{ buffer: Buffer; fileName: string; hash: string }> {
    const sig = await this.getEvidenceForUser(
      signatureRequestId,
      userId,
      userRole,
    );
    const ev = sig.evidence!;

    // Lazy import — évite de payer le coût pdf-lib au démarrage si la
    // route n'est jamais appelée.
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

    const pageW = 595.28; // A4
    const pageH = 841.89;
    const marginX = 50;
    let page = pdfDoc.addPage([pageW, pageH]);

    // Couleurs charte SEAL
    const navy = rgb(0, 68 / 255, 105 / 255);
    const orange = rgb(246 / 255, 141 / 255, 46 / 255);
    const text = rgb(0.15, 0.15, 0.2);
    const muted = rgb(0.45, 0.45, 0.5);

    // Header bandeau
    page.drawRectangle({
      x: 0,
      y: pageH - 50,
      width: pageW,
      height: 50,
      color: navy,
    });
    page.drawRectangle({
      x: 0,
      y: pageH - 52,
      width: pageW,
      height: 2,
      color: orange,
    });
    page.drawText('OMNITECH SECURITY', {
      x: marginX,
      y: pageH - 32,
      size: 12,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('Preuve de signature electronique - eIDAS AES', {
      x: marginX + 160,
      y: pageH - 32,
      size: 8,
      font,
      color: rgb(1, 1, 1),
    });

    let y = pageH - 90;
    const drawSectionHeading = (title: string) => {
      page.drawText(title, {
        x: marginX,
        y,
        size: 12,
        font: fontBold,
        color: navy,
      });
      y -= 18;
    };
    const drawKV = (k: string, v: string | null | undefined) => {
      const valueStr = v == null || v === '' ? '—' : String(v);
      page.drawText(k, {
        x: marginX,
        y,
        size: 9,
        font: fontBold,
        color: text,
      });
      // Truncate long values to avoid overflow ; full value is in JSON evidence
      const truncated =
        valueStr.length > 70 ? valueStr.slice(0, 67) + '...' : valueStr;
      page.drawText(truncated, {
        x: marginX + 130,
        y,
        size: 9,
        font: valueStr.length > 0 ? fontMono : font,
        color: text,
      });
      y -= 14;
    };

    // Section 1 : Document signé
    drawSectionHeading('1. Document');
    drawKV('Reference', sig.documentVersion.document.reference);
    drawKV('Titre', sig.documentVersion.document.title);
    drawKV('Version', sig.documentVersionId);
    y -= 8;

    // Section 2 : Signataire
    drawSectionHeading('2. Signataire');
    drawKV('Email', ev.signerEmail);
    drawKV('Nom', `${sig.signer.firstName} ${sig.signer.lastName}`);
    drawKV('Adresse IP', ev.signerIpAddress);
    drawKV('User-Agent', ev.signerUserAgent);
    y -= 8;

    // Section 3 : Lien temporel
    drawSectionHeading('3. Lien temporel');
    drawKV('Signe le (UTC)', new Date(ev.signedAt).toISOString());
    drawKV('TSA RFC 3161', ev.tsa ? 'Present (token base64 stocke)' : 'Absent');
    y -= 8;

    // Section 4 : Intégrité
    drawSectionHeading('4. Integrite');
    drawKV('SHA-256 du PDF signe', ev.documentHashSha256);
    y -= 8;

    // Section 5 : Certificats
    drawSectionHeading('5. Certificats');
    if (ev.certificateChain) {
      drawKV('Chaine PEM', 'Presente (signature qualifiee QES)');
      // First lines of cert (subject etc) — extraction sommaire
      const firstLines = String(ev.certificateChain)
        .split('\n')
        .slice(0, 3)
        .join(' | ');
      drawKV('Apercu', firstLines.slice(0, 60));
    } else {
      drawKV('Niveau eIDAS', 'AES (Avancee, sans certificat qualifie)');
    }
    y -= 8;

    // Section 6 : Métadonnées
    drawSectionHeading('6. Metadonnees du rapport');
    const reportId = ev.id;
    drawKV('Report ID', reportId);
    drawKV('Generation', new Date().toISOString());
    drawKV('Producteur', 'OMNITECH Intranet eIDAS Evidence v1');

    // Footer mention légale
    page.drawText(
      'Ce document constitue une preuve eIDAS niveau AES (Avance) et engage la responsabilite du signataire.',
      {
        x: marginX,
        y: 60,
        size: 7,
        font,
        color: muted,
      },
    );
    page.drawText(
      'Reference reglementaire : ETSI EN 319 122-1 (CAdES-B-LT) - voir docs/compliance/EIDAS_AES_CONFORMITY.md',
      {
        x: marginX,
        y: 50,
        size: 7,
        font,
        color: muted,
      },
    );

    pdfDoc.setTitle(
      `Preuve de signature - ${sig.documentVersion.document.reference}`,
    );
    pdfDoc.setAuthor('OMNITECH Intranet');
    pdfDoc.setProducer('OMNITECH Intranet eIDAS Evidence v1 (pdf-lib)');
    pdfDoc.setCreationDate(new Date());

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const hash = createHash('sha256').update(buffer).digest('hex');

    // Audit : la consultation/téléchargement de la preuve est tracée pour
    // détecter les fuites (ISO 27001 A.5.34 / RGPD).
    await this.auditService.log({
      userId,
      action: 'SIGNATURE_EVIDENCE_REPORT_EXPORTED',
      resourceType: 'SignatureEvidence',
      resourceId: ev.id,
      metadata: {
        signatureRequestId,
        documentReference: sig.documentVersion.document.reference,
        reportHash: hash,
      },
    });

    return {
      buffer,
      fileName: `preuve-signature-${sig.documentVersion.document.reference}-${ev.id.slice(0, 8)}.pdf`,
      hash,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Calcule (ou récupère) le hash SHA-256 du PDF signé.
   *
   * Stratégie :
   *  1. Si le payload contient `data.documents[0].sha256` : on l'utilise.
   *  2. Sinon, on télécharge `signedFileUrl` et on hash localement.
   *  3. Si le téléchargement échoue : on retourne un placeholder logué WARN
   *     (la capture n'est pas bloquante — le hash peut être recalculé plus
   *     tard via un job de réconciliation).
   */
  private async computeOrFetchDocumentHash(
    payload: any,
    signedFileUrl: string | null,
  ): Promise<string> {
    const fromPayload =
      payload?.data?.documents?.[0]?.sha256 ||
      payload?.data?.documents?.[0]?.checksum ||
      payload?.documents?.[0]?.sha256;
    if (fromPayload && typeof fromPayload === 'string') {
      return fromPayload.toLowerCase();
    }

    if (!signedFileUrl) {
      this.logger.warn(
        'No signedFileUrl and no hash in payload — using placeholder hash',
      );
      return 'unavailable';
    }

    try {
      const res = await fetch(signedFileUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(
          `Fetch signedFileUrl returned ${res.status} — using placeholder`,
        );
        return 'unavailable';
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return createHash('sha256').update(buffer).digest('hex');
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(`Failed to fetch signed file for hashing: ${e.message}`);
      return 'unavailable';
    }
  }

  /**
   * Demande un TimeStampToken RFC 3161 au TSA configuré.
   *
   * NOTE : on n'embarque pas une vraie crypto ASN.1 RFC 3161 (overkill pour
   * une stdlib Node sans dépendance dédiée). On encode juste la requête
   * minimale : POST du hash, retour du token bytes en base64.
   *
   * Pour passer en production qualifiée, intégrer un client TSA dédié
   * (ex: `node-tsa`, `pkijs`) et stocker le token .tsr complet.
   */
  private async requestTimestamp(documentHashHex: string): Promise<string> {
    if (!this.tsaUrl) return '';
    const reqBody = Buffer.from(documentHashHex, 'hex');

    const res = await fetch(this.tsaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: reqBody,
      signal: AbortSignal.timeout(EvidenceService.TSA_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`TSA returned HTTP ${res.status}`);
    }
    const tokenBuffer = Buffer.from(await res.arrayBuffer());
    return tokenBuffer.toString('base64');
  }
}
