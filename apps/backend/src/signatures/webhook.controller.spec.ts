import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhookController } from './webhook.controller';
import { SignaturesService } from './signatures.service';
import { AuditService } from '../audit/audit.service';
import { CampaignsService } from '../signature-campaigns/campaigns.service';

/**
 * POST /signatures/webhook — POINT D'ENTRÉE UNIQUE DocuSeal.
 *
 * Deux propriétés testées :
 *  1. Vérification HMAC-SHA256 stricte du body brut (l'ancien endpoint
 *     /signature-campaigns/webhook/docuseal, qui acceptait le secret en
 *     clair, répond désormais 410 Gone).
 *  2. Chaîne de responsabilité : SignaturesService.handleWebhook d'abord
 *     (SignatureRequest, y compris celles générées par une campagne), puis
 *     CampaignsService.handleWebhook (CampaignSignature legacy), sans que
 *     l'échec du second ne casse la réception.
 */
describe('WebhookController (routing unifié DocuSeal)', () => {
  let controller: WebhookController;
  let signatures: any;
  let campaigns: any;
  let audit: any;

  const SECRET = 'super-secret-docuseal';
  const payload = { event_type: 'form.completed', data: { submission_id: 42 } };
  const rawBody = JSON.stringify(payload);
  const validSignature = createHmac('sha256', SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');

  const buildReq = () => ({
    rawBody: Buffer.from(rawBody, 'utf8'),
    ip: '10.0.0.1',
    headers: { 'user-agent': 'DocuSeal/1.0' },
  });

  const build = async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: SignaturesService, useValue: signatures },
        { provide: AuditService, useValue: audit },
        { provide: CampaignsService, useValue: campaigns },
      ],
    }).compile();
    controller = module.get(WebhookController);
  };

  beforeEach(async () => {
    process.env.DOCUSEAL_WEBHOOK_SECRET = SECRET;
    delete process.env.DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE;

    signatures = {
      handleWebhook: jest.fn().mockResolvedValue({ handled: true }),
    };
    campaigns = { handleWebhook: jest.fn().mockResolvedValue({ ok: true }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    await build();
  });

  afterEach(() => {
    delete process.env.DOCUSEAL_WEBHOOK_SECRET;
    delete process.env.DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE;
  });

  describe('vérification HMAC', () => {
    it('rejette une signature invalide et ne route rien', async () => {
      await expect(
        controller.handleWebhook(buildReq(), payload, 'mauvaise-signature', ''),
      ).rejects.toThrow(UnauthorizedException);

      expect(signatures.handleWebhook).not.toHaveBeenCalled();
      expect(campaigns.handleWebhook).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WEBHOOK_SIGNATURE_INVALID',
          severity: 'WARN',
        }),
      );
    });

    it('rejette une requête sans header de signature', async () => {
      await expect(
        controller.handleWebhook(buildReq(), payload, '', ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepte le HMAC valide (header principal)', async () => {
      const res = await controller.handleWebhook(
        buildReq(),
        payload,
        validSignature,
        '',
      );
      expect(res).toEqual({ received: true, handled: true });
    });

    it('accepte le header alternatif x-docuseal-webhook-signature', async () => {
      const res = await controller.handleWebhook(
        buildReq(),
        payload,
        '',
        validSignature,
      );
      expect(res).toEqual({ received: true, handled: true });
    });

    it('accepte le préfixe sha256= utilisé par certaines versions DocuSeal', async () => {
      const res = await controller.handleWebhook(
        buildReq(),
        payload,
        `sha256=${validSignature}`,
        '',
      );
      expect(res).toEqual({ received: true, handled: true });
    });
  });

  describe('chaîne de responsabilité', () => {
    it('route vers SignaturesService PUIS CampaignsService', async () => {
      await controller.handleWebhook(buildReq(), payload, validSignature, '');

      expect(signatures.handleWebhook).toHaveBeenCalledWith(
        payload,
        expect.objectContaining({
          ipAddress: '10.0.0.1',
          userAgent: 'DocuSeal/1.0',
        }),
      );
      expect(campaigns.handleWebhook).toHaveBeenCalledWith(payload);

      const sigOrder = signatures.handleWebhook.mock.invocationCallOrder[0];
      const campOrder = campaigns.handleWebhook.mock.invocationCallOrder[0];
      expect(sigOrder).toBeLessThan(campOrder);
    });

    it('appelle le handler campagnes même quand aucune SignatureRequest ne correspond', async () => {
      signatures.handleWebhook.mockResolvedValue({ handled: false });

      const res = await controller.handleWebhook(
        buildReq(),
        payload,
        validSignature,
        '',
      );

      expect(campaigns.handleWebhook).toHaveBeenCalledWith(payload);
      expect(res).toEqual({ received: true, handled: false });
    });

    it('un échec du handler campagnes ne casse pas la réception', async () => {
      campaigns.handleWebhook.mockRejectedValue(new Error('DB down'));

      const res = await controller.handleWebhook(
        buildReq(),
        payload,
        validSignature,
        '',
      );
      expect(res).toEqual({ received: true, handled: true });
    });

    it('trace la réception valide dans l’audit log', async () => {
      await controller.handleWebhook(buildReq(), payload, validSignature, '');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WEBHOOK_SIGNATURE_VALID',
          severity: 'INFO',
        }),
      );
    });
  });

  describe('mode legacy (rollback d’urgence)', () => {
    it('compare le secret en clair uniquement si HMAC_MODE=false', async () => {
      process.env.DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE = 'false';
      await build();

      const res = await controller.handleWebhook(buildReq(), payload, SECRET, '');
      expect(res).toEqual({ received: true, handled: true });
    });

    it('en mode HMAC (défaut), le secret en clair est REFUSÉ', async () => {
      await expect(
        controller.handleWebhook(buildReq(), payload, SECRET, ''),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
