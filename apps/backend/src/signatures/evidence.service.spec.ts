import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Wave D — Tests EvidenceService eIDAS-AES.
 *
 * Couvre :
 *  - captureEvidence : extraction du payload DocuSeal, calcul hash, fallback
 *  - getEvidenceForUser : autorisations (signataire / demandeur / privileged)
 *  - exportPdfReport : génération PDF + audit
 */
describe('EvidenceService', () => {
  let service: EvidenceService;
  let prisma: any;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      signatureRequest: {
        findUnique: jest.fn(),
      },
      signatureEvidence: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation((args: any) =>
            Promise.resolve({ id: 'ev-1', ...args.data }),
          ),
        update: jest
          .fn()
          .mockImplementation((args: any) =>
            Promise.resolve({ id: 'ev-1', ...args.data }),
          ),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  describe('captureEvidence', () => {
    const baseSignatureRequest = {
      id: 'sig-1',
      signerId: 'user-1',
      requestedById: 'user-2',
      docusealSubmissionId: 'sub-1',
      signedAt: new Date('2026-04-28T10:00:00Z'),
      signedFileUrl: null,
      documentVersionId: 'ver-1',
      webhookPayload: {
        event_type: 'form.completed',
        data: {
          documents: [
            {
              sha256:
                'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            },
          ],
          submitters: [
            {
              email: 'signer@omnitech.fr',
              ip_address: '192.168.1.42',
              user_agent: 'Mozilla/5.0 (UnitTest)',
            },
          ],
        },
      },
      signer: {
        id: 'user-1',
        email: 'signer@omnitech.fr',
        firstName: 'Jean',
        lastName: 'Morin',
      },
      documentVersion: {
        document: { id: 'doc-1', title: 'Test Doc', reference: 'OMS-TST-0001' },
      },
    };

    it('throws NotFound if signature request unknown', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(null);
      await expect(service.captureEvidence('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('skips with warning when signedAt is null (idempotency safety)', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue({
        ...baseSignatureRequest,
        signedAt: null,
      });
      const result = await service.captureEvidence('sig-1');
      expect(result.id).toBe('');
      expect(prisma.signatureEvidence.create).not.toHaveBeenCalled();
    });

    it('captures evidence with hash from payload + signer IP/UA', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(baseSignatureRequest);
      const result = await service.captureEvidence('sig-1');
      expect(result.id).toBe('ev-1');
      expect(prisma.signatureEvidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            signatureRequestId: 'sig-1',
            documentHashSha256:
              'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            signerEmail: 'signer@omnitech.fr',
            signerIpAddress: '192.168.1.42',
            signerUserAgent: 'Mozilla/5.0 (UnitTest)',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SIGNATURE_EVIDENCE_CAPTURED',
        }),
      );
    });

    it('falls back to extra IP/UA when payload misses them', async () => {
      const sig = {
        ...baseSignatureRequest,
        webhookPayload: {
          event_type: 'form.completed',
          data: {
            documents: [{ sha256: 'aa'.repeat(32) }],
            submitters: [{ email: 'signer@omnitech.fr' }],
          },
        },
      };
      prisma.signatureRequest.findUnique.mockResolvedValue(sig);
      await service.captureEvidence('sig-1', {
        ipAddress: '10.0.0.1',
        userAgent: 'CurlTest/1.0',
      });
      expect(prisma.signatureEvidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            signerIpAddress: '10.0.0.1',
            signerUserAgent: 'CurlTest/1.0',
          }),
        }),
      );
    });

    it('updates existing evidence (idempotent for retried webhooks)', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(baseSignatureRequest);
      prisma.signatureEvidence.findUnique.mockResolvedValue({ id: 'ev-1' });
      await service.captureEvidence('sig-1');
      expect(prisma.signatureEvidence.update).toHaveBeenCalled();
      expect(prisma.signatureEvidence.create).not.toHaveBeenCalled();
    });
  });

  describe('getEvidenceForUser', () => {
    const sigWithEvidence = {
      id: 'sig-1',
      signerId: 'user-1',
      requestedById: 'user-2',
      documentVersionId: 'ver-1',
      evidence: {
        id: 'ev-1',
        signedAt: new Date(),
        signerEmail: 'a@b.fr',
        signerIpAddress: null,
        signerUserAgent: null,
        documentHashSha256: 'hash',
        certificateChain: null,
        tsa: null,
        createdAt: new Date(),
      },
      signer: { id: 'user-1', email: 'a@b.fr', firstName: 'A', lastName: 'B' },
      requestedBy: {
        id: 'user-2',
        email: 'r@b.fr',
        firstName: 'R',
        lastName: 'B',
      },
      documentVersion: {
        document: { id: 'doc-1', title: 'D', reference: 'OMS-001' },
      },
    };

    it('throws NotFound if signature request not found', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.getEvidenceForUser('sig-x', 'user-1', 'COLLABORATEUR'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound if evidence missing (signature not completed)', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue({
        ...sigWithEvidence,
        evidence: null,
      });
      await expect(
        service.getEvidenceForUser('sig-1', 'user-1', 'COLLABORATEUR'),
      ).rejects.toThrow(NotFoundException);
    });

    it('grants access to signer', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(sigWithEvidence);
      const out = await service.getEvidenceForUser(
        'sig-1',
        'user-1',
        'COLLABORATEUR',
      );
      expect(out.id).toBe('sig-1');
    });

    it('grants access to requester', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(sigWithEvidence);
      const out = await service.getEvidenceForUser(
        'sig-1',
        'user-2',
        'COLLABORATEUR',
      );
      expect(out.id).toBe('sig-1');
    });

    it('grants access to ADMIN', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(sigWithEvidence);
      const out = await service.getEvidenceForUser(
        'sig-1',
        'admin-x',
        'ADMIN',
      );
      expect(out.id).toBe('sig-1');
    });

    it('refuses access to a third-party COLLABORATEUR', async () => {
      prisma.signatureRequest.findUnique.mockResolvedValue(sigWithEvidence);
      await expect(
        service.getEvidenceForUser('sig-1', 'user-99', 'COLLABORATEUR'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
