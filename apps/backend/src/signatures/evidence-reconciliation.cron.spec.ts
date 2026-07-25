import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceReconciliationCron } from './evidence-reconciliation.cron';
import { PrismaService } from '../prisma/prisma.service';
import { SignaturesService } from './signatures.service';
import { EvidenceService } from './evidence.service';

/**
 * Réconciliation des preuves (toutes les 6 h).
 *
 * Invariant métier : une SignatureRequest SIGNED DOIT avoir une
 * SignatureEvidence. Ce cron rattrape les signatures historiques (les demandes
 * prod signées via l'ancien clic direct, sans webhook ni evidence) et les
 * captures échouées.
 *
 * Invariant technique : un cron ne throw JAMAIS — un échec sur une demande
 * n'interrompt pas les suivantes.
 */
describe('EvidenceReconciliationCron', () => {
  let cron: EvidenceReconciliationCron;
  let prisma: any;
  let signatures: any;
  let evidence: any;

  const orphan = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    docusealSubmissionId: 'sub-1',
    webhookPayload: null,
    signedFileUrl: null,
    ...extra,
  });

  beforeEach(async () => {
    prisma = {
      signatureRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    signatures = {
      getSubmission: jest
        .fn()
        .mockResolvedValue({ documents: [{ url: 'http://pdf/signed.pdf' }] }),
    };
    evidence = { captureEvidence: jest.fn().mockResolvedValue({ id: 'ev-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceReconciliationCron,
        { provide: PrismaService, useValue: prisma },
        { provide: SignaturesService, useValue: signatures },
        { provide: EvidenceService, useValue: evidence },
      ],
    }).compile();

    cron = module.get(EvidenceReconciliationCron);
  });

  it('ne cible que les demandes SIGNED sans evidence', async () => {
    await cron.reconcile();
    expect(prisma.signatureRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'SIGNED', evidence: { is: null } },
      }),
    );
  });

  it('re-interroge DocuSeal puis capture l’evidence a posteriori', async () => {
    prisma.signatureRequest.findMany.mockResolvedValue([orphan('sig-1')]);

    const res = await cron.reconcile();

    expect(signatures.getSubmission).toHaveBeenCalledWith('sub-1');
    expect(prisma.signatureRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sig-1' },
        data: expect.objectContaining({
          signedFileUrl: 'http://pdf/signed.pdf',
        }),
      }),
    );
    expect(evidence.captureEvidence).toHaveBeenCalledWith('sig-1');
    expect(res).toEqual({ total: 1, captured: 1, failed: 0 });
  });

  it('n’écrase pas un payload webhook déjà présent', async () => {
    prisma.signatureRequest.findMany.mockResolvedValue([
      orphan('sig-1', { webhookPayload: { event_type: 'form.completed' } }),
    ]);

    await cron.reconcile();

    expect(signatures.getSubmission).not.toHaveBeenCalled();
    expect(prisma.signatureRequest.update).not.toHaveBeenCalled();
    expect(evidence.captureEvidence).toHaveBeenCalledWith('sig-1');
  });

  it('capture quand même avec les données locales si DocuSeal ne connaît plus la submission', async () => {
    prisma.signatureRequest.findMany.mockResolvedValue([orphan('sig-1')]);
    signatures.getSubmission.mockResolvedValue(null);

    const res = await cron.reconcile();

    expect(prisma.signatureRequest.update).not.toHaveBeenCalled();
    expect(evidence.captureEvidence).toHaveBeenCalledWith('sig-1');
    expect(res.captured).toBe(1);
  });

  it('traite les demandes sans submissionId (signatures historiques au clic)', async () => {
    prisma.signatureRequest.findMany.mockResolvedValue([
      orphan('sig-1', { docusealSubmissionId: null }),
    ]);

    const res = await cron.reconcile();

    expect(signatures.getSubmission).not.toHaveBeenCalled();
    expect(evidence.captureEvidence).toHaveBeenCalledWith('sig-1');
    expect(res.captured).toBe(1);
  });

  it('isole les échecs : une demande KO n’interrompt pas les autres', async () => {
    prisma.signatureRequest.findMany.mockResolvedValue([
      orphan('sig-1'),
      orphan('sig-2'),
    ]);
    evidence.captureEvidence
      .mockRejectedValueOnce(new Error('hash indisponible'))
      .mockResolvedValueOnce({ id: 'ev-2' });

    const res = await cron.reconcile();

    expect(res).toEqual({ total: 2, captured: 1, failed: 1 });
  });

  it('compte en échec une capture ignorée (evidence non créée)', async () => {
    prisma.signatureRequest.findMany.mockResolvedValue([orphan('sig-1')]);
    evidence.captureEvidence.mockResolvedValue({ id: '' });

    const res = await cron.reconcile();
    expect(res).toEqual({ total: 1, captured: 0, failed: 1 });
  });

  it('run() ne propage JAMAIS d’exception', async () => {
    prisma.signatureRequest.findMany.mockRejectedValue(new Error('DB down'));
    await expect(cron.run()).resolves.toBeUndefined();
  });
});
