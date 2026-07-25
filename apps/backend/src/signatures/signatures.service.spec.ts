import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SignaturesService } from './signatures.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EvidenceService } from './evidence.service';

/**
 * Signature ENGAGEANTE = DocuSeal uniquement.
 *
 * Deux invariants testés ici :
 *  1. Aucune SignatureRequest fantôme : si DocuSeal ne renvoie pas de
 *     submission_id (API down, 5xx, réponse vide), on THROW — sinon la
 *     demande ne pourrait JAMAIS être complétée par le webhook et n'aurait
 *     aucune valeur probante.
 *  2. signDirectly (clic sans DocuSeal ni evidence) est désactivé par défaut
 *     et n'est réactivable que par SIGNATURES_ALLOW_DIRECT=true (rollback).
 */
describe('SignaturesService', () => {
  let service: SignaturesService;
  let prisma: any;
  let audit: any;
  let evidence: any;
  const originalFetch = global.fetch;
  const originalAllowDirect = process.env.SIGNATURES_ALLOW_DIRECT;

  const version = {
    id: 'ver-1',
    documentId: 'doc-1',
    document: { id: 'doc-1', title: 'PSSI', reference: 'POL_001' },
  };
  const signer = {
    id: 'user-1',
    email: 'jdoe@omnitech-security.fr',
    firstName: 'Jane',
    lastName: 'Doe',
    deletedAt: null,
  };

  const mockFetch = (impl: any) => {
    global.fetch = jest.fn(impl) as any;
  };

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    evidence = { captureEvidence: jest.fn().mockResolvedValue({ id: 'ev-1' }) };
    prisma = {
      documentVersion: { findUnique: jest.fn().mockResolvedValue(version) },
      user: { findUnique: jest.fn().mockResolvedValue(signer) },
      signatureRequest: {
        create: jest.fn().mockResolvedValue({ id: 'sig-1' }),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: 'sig-1',
          signer,
          documentVersion: version,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignaturesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EvidenceService, useValue: evidence },
      ],
    }).compile();

    service = module.get(SignaturesService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAllowDirect === undefined) {
      delete process.env.SIGNATURES_ALLOW_DIRECT;
    } else {
      process.env.SIGNATURES_ALLOW_DIRECT = originalAllowDirect;
    }
    jest.restoreAllMocks();
  });

  describe('createSignatureRequest — DocuSeal obligatoire', () => {
    it('crée la demande quand DocuSeal renvoie un submission_id', async () => {
      mockFetch(async () => ({
        ok: true,
        json: async () => [{ submission_id: 4242, slug: 'abcd' }],
      }));

      await service.createSignatureRequest('ver-1', 'user-1', 'admin-1');

      expect(prisma.signatureRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentVersionId: 'ver-1',
            signerId: 'user-1',
            requestedById: 'admin-1',
            docusealSubmissionId: '4242',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('THROW 503 si DocuSeal est injoignable (aucune demande fantôme)', async () => {
      mockFetch(async () => {
        throw new Error('ECONNREFUSED');
      });

      await expect(
        service.createSignatureRequest('ver-1', 'user-1', 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
    });

    it('THROW 503 si DocuSeal répond une erreur HTTP', async () => {
      mockFetch(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }));

      await expect(
        service.createSignatureRequest('ver-1', 'user-1', 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
    });

    it('THROW 503 si la réponse DocuSeal ne contient aucun identifiant', async () => {
      mockFetch(async () => ({ ok: true, json: async () => [{}] }));

      await expect(
        service.createSignatureRequest('ver-1', 'user-1', 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
    });

    it('refuse un signataire supprimé avant même d’appeler DocuSeal', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...signer,
        deletedAt: new Date(),
      });
      mockFetch(async () => {
        throw new Error('ne devrait pas être appelé');
      });

      await expect(
        service.createSignatureRequest('ver-1', 'user-1', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('signDirectly — désactivé par défaut', () => {
    it('refuse la signature au clic quand SIGNATURES_ALLOW_DIRECT est absent', async () => {
      delete process.env.SIGNATURES_ALLOW_DIRECT;

      await expect(service.signDirectly('sig-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      // Le refus est prononcé AVANT toute lecture de la demande.
      expect(prisma.signatureRequest.findUnique).not.toHaveBeenCalled();
    });

    it('refuse aussi avec SIGNATURES_ALLOW_DIRECT=false', async () => {
      process.env.SIGNATURES_ALLOW_DIRECT = 'false';
      await expect(service.signDirectly('sig-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('reste utilisable en rollback avec SIGNATURES_ALLOW_DIRECT=true', async () => {
      process.env.SIGNATURES_ALLOW_DIRECT = 'true';
      prisma.signatureRequest.findUnique.mockResolvedValue({
        id: 'sig-1',
        signerId: 'user-1',
        status: 'PENDING',
      });

      await service.signDirectly('sig-1', 'user-1');
      expect(prisma.signatureRequest.update).toHaveBeenCalled();
    });

    it('interdit de signer à la place d’un autre, même en mode rollback', async () => {
      process.env.SIGNATURES_ALLOW_DIRECT = 'true';
      prisma.signatureRequest.findUnique.mockResolvedValue({
        id: 'sig-1',
        signerId: 'someone-else',
        status: 'PENDING',
      });

      await expect(service.signDirectly('sig-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SIGNATURE_FORBIDDEN_ATTEMPT',
          severity: 'CRITICAL',
        }),
      );
    });
  });

  describe('handleWebhook — chaîne de responsabilité', () => {
    it('retourne handled=false sans submission_id (le handler campagnes prendra le relais)', async () => {
      const res = await service.handleWebhook({
        event_type: 'form.completed',
        data: {},
      });
      expect(res).toEqual({ handled: false });
    });

    it('retourne handled=false si aucune SignatureRequest ne correspond', async () => {
      prisma.signatureRequest.findFirst.mockResolvedValue(null);

      const res = await service.handleWebhook({
        event_type: 'form.completed',
        data: { submission_id: 99 },
      });
      expect(res).toEqual({ handled: false });
    });

    it('complète la demande et capture l’evidence sur form.completed', async () => {
      prisma.signatureRequest.findFirst.mockResolvedValue({
        id: 'sig-1',
        signerId: 'user-1',
        documentVersionId: 'ver-1',
        documentVersion: { documentId: 'doc-1', document: {} },
      });

      const res = await service.handleWebhook(
        {
          event_type: 'form.completed',
          data: { submission_id: 4242, documents: [{ url: 'http://pdf' }] },
        },
        { ipAddress: '10.0.0.1', userAgent: 'UA/1.0' },
      );

      expect(res).toEqual({ handled: true });
      expect(prisma.signatureRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SIGNED' }),
        }),
      );
      expect(evidence.captureEvidence).toHaveBeenCalledWith('sig-1', {
        ipAddress: '10.0.0.1',
        userAgent: 'UA/1.0',
      });
    });

    it('un échec de capture d’evidence ne fait pas échouer le webhook', async () => {
      prisma.signatureRequest.findFirst.mockResolvedValue({
        id: 'sig-1',
        signerId: 'user-1',
        documentVersionId: 'ver-1',
        documentVersion: { documentId: 'doc-1', document: {} },
      });
      evidence.captureEvidence.mockRejectedValue(new Error('DocuSeal 404'));

      const res = await service.handleWebhook({
        event_type: 'submission.completed',
        data: { submission_id: 4242 },
      });
      expect(res).toEqual({ handled: true });
    });

    it('marque REJECTED sur form.declined', async () => {
      prisma.signatureRequest.findFirst.mockResolvedValue({
        id: 'sig-1',
        signerId: 'user-1',
        documentVersionId: 'ver-1',
        documentVersion: { documentId: 'doc-1', document: {} },
      });

      const res = await service.handleWebhook({
        event_type: 'form.declined',
        data: { submission_id: 4242 },
      });

      expect(res).toEqual({ handled: true });
      expect(prisma.signatureRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
    });

    it('laisse passer les événements non terminaux (form.viewed) au handler campagnes', async () => {
      prisma.signatureRequest.findFirst.mockResolvedValue({
        id: 'sig-1',
        signerId: 'user-1',
        documentVersionId: 'ver-1',
        documentVersion: { documentId: 'doc-1', document: {} },
      });

      const res = await service.handleWebhook({
        event_type: 'form.viewed',
        data: { submission_id: 4242 },
      });

      expect(res).toEqual({ handled: false });
      expect(prisma.signatureRequest.update).not.toHaveBeenCalled();
    });
  });
});
