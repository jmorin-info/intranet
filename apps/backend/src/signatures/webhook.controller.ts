import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  UnauthorizedException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { SignaturesService } from './signatures.service';
import { AuditService } from '../audit/audit.service';
import { CampaignsService } from '../signature-campaigns/campaigns.service';

/**
 * Webhook DocuSeal — POINT D'ENTRÉE UNIQUE des événements de signature.
 *
 * Chaîne de responsabilité (2026-07-24) : l'événement est routé par
 * submissionId vers SignaturesService.handleWebhook (SignatureRequest,
 * y compris celles générées par une campagne) PUIS, s'il n'a pas été
 * traité, vers CampaignsService.handleWebhook (CampaignSignature legacy).
 * L'ancien endpoint /signature-campaigns/webhook/docuseal répond 410 Gone.
 *
 * Sécurité (ISO 27001 A.8.26 — Application security requirements) :
 *  - Le header `X-DocuSeal-Signature` contient un HMAC-SHA256 du body brut
 *    signé avec `DOCUSEAL_WEBHOOK_SECRET`.
 *  - La vérification utilise `crypto.timingSafeEqual` pour prévenir les
 *    attaques par timing.
 *  - Fallback legacy (secret partagé en clair) : uniquement activé si
 *    `DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE=false`, avec log DEPRECATED, pour
 *    ne pas casser les intégrations en cours.
 *  - Tout échec de signature est journalisé via AuditService (WARN).
 *  - Tout succès est journalisé (INFO) pour traçabilité ISO 27001 A.5.36.
 *
 * Référence : https://www.docuseal.co/docs/api#webhook-signing
 */
@Controller('signatures')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly webhookSecret: string;
  private readonly hmacMode: boolean;

  constructor(
    private readonly signaturesService: SignaturesService,
    private readonly auditService: AuditService,
    private readonly campaignsService: CampaignsService,
  ) {
    this.webhookSecret = process.env.DOCUSEAL_WEBHOOK_SECRET || '';
    // Par défaut HMAC activé ; passer HMAC_MODE=false pour conserver l'ancien
    // comportement de comparaison en clair (transition / rollback d'urgence).
    this.hmacMode =
      (process.env.DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE || 'true').toLowerCase() !==
      'false';
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Body() payload: any,
    @Headers('x-docuseal-signature') signature: string,
    @Headers('x-docuseal-webhook-signature') signatureAlt: string,
  ) {
    // DocuSeal peut envoyer la signature sous plusieurs noms selon la version.
    const headerSignature = signature || signatureAlt;

    // Body brut pour le calcul HMAC : fourni par le middleware NestJS
    // (NestFactory.create({ rawBody: true })). Fallback JSON.stringify si
    // indisponible — logué en WARN car le hash risque d'être incohérent.
    const rawBody: string =
      (req?.rawBody && req.rawBody.toString && req.rawBody.toString('utf8')) ||
      JSON.stringify(payload || {});

    if (!req?.rawBody) {
      this.logger.warn(
        'req.rawBody manquant — activer { rawBody: true } dans NestFactory.create ; fallback JSON.stringify (potentiellement incohérent)',
      );
    }

    const ipAddress =
      (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req?.ip ||
      undefined;
    const userAgent = (req?.headers?.['user-agent'] as string) || undefined;

    if (!this.verifySignature(rawBody, headerSignature)) {
      this.logger.warn('Invalid webhook signature received');
      await this.auditService.log({
        action: 'WEBHOOK_SIGNATURE_INVALID',
        resourceType: 'DocuSealWebhook',
        severity: 'WARN',
        ipAddress,
        userAgent,
        metadata: {
          provider: 'docuseal',
          hmacMode: this.hmacMode,
          hasSignatureHeader: Boolean(headerSignature),
          eventType: payload?.event_type || payload?.type || null,
        },
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    await this.auditService.log({
      action: 'WEBHOOK_SIGNATURE_VALID',
      resourceType: 'DocuSealWebhook',
      severity: 'INFO',
      ipAddress,
      userAgent,
      metadata: {
        provider: 'docuseal',
        hmacMode: this.hmacMode,
        eventType: payload?.event_type || payload?.type || null,
      },
    });

    this.logger.log(
      `DocuSeal webhook received: ${payload?.event_type || payload?.type}`,
    );

    // IP/UA captures here are forwarded to EvidenceService.captureEvidence
    // (via SignaturesService.handleWebhook) for eIDAS-AES proof.
    const { handled } = await this.signaturesService.handleWebhook(payload, {
      ipAddress,
      userAgent,
    });

    // Chaîne de responsabilité : le handler campagnes (CampaignSignature
    // legacy, rattachement STRICT par submissionId) traite ce que le
    // handler SignatureRequest n'a pas consommé — et met aussi à jour les
    // stats CampaignSignature pour les submissions issues de campagnes.
    try {
      await this.campaignsService.handleWebhook(payload);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Campaign webhook handler failed (non-blocking): ${e.message}`,
        e.stack,
      );
    }

    return { received: true, handled };
  }

  /**
   * Vérifie la signature du webhook DocuSeal.
   *
   * - Si aucun secret n'est configuré : on laisse passer avec un log WARN
   *   (préserve le comportement historique pour ne pas bloquer les devs).
   * - Mode HMAC (par défaut) : calcule HMAC-SHA256(rawBody, secret) en hex
   *   et compare via `timingSafeEqual`. Accepte aussi le format `sha256=<hex>`
   *   envoyé par certaines versions de DocuSeal.
   * - Mode legacy (`DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE=false`) : comparaison
   *   `timingSafeEqual` sur le secret en clair — DEPRECATED.
   */
  private verifySignature(rawBody: string, headerSignature?: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        'DOCUSEAL_WEBHOOK_SECRET non configuré — vérification désactivée',
      );
      return true;
    }
    if (!headerSignature) return false;

    try {
      if (!this.hmacMode) {
        this.logger.warn(
          'DEPRECATED: DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE=false — comparaison en clair. Activer le mode HMAC dans DocuSeal admin.',
        );
        return this.safeEqual(headerSignature, this.webhookSecret);
      }

      // HMAC-SHA256 du body brut.
      const computed = createHmac('sha256', this.webhookSecret)
        .update(rawBody, 'utf8')
        .digest('hex');

      // Certaines versions de DocuSeal préfixent la signature par "sha256=".
      const received = headerSignature.startsWith('sha256=')
        ? headerSignature.slice('sha256='.length)
        : headerSignature;

      return this.safeEqual(computed, received);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Erreur vérification signature webhook: ${e.message}`,
        e.stack,
      );
      return false;
    }
  }

  /**
   * Comparaison constante en temps — nécessite que les deux buffers aient la
   * même longueur (sinon `timingSafeEqual` throw).
   */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
