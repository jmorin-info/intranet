import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * CAMPAGNE = GÉNÉRATEUR de SignatureRequest.
 *
 * launch() crée une CampaignSignature par cible (compat lecture/stats) puis
 * dispatche une submission DocuSeal INDIVIDUELLE par cible et matérialise la
 * SignatureRequest correspondante (campaignId renseigné). Invariants :
 *  - aucune SignatureRequest n'est créée sans submission DocuSeal valide ;
 *  - un échec sur une cible n'interrompt pas les autres (retry au prochain
 *    dispatch, déclenché par le cron quotidien) ;
 *  - le webhook rattache STRICTEMENT par submissionId, jamais par email.
 */
describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: any;
  let notifications: any;
  const originalFetch = global.fetch;

  const users = [
    { id: 'u1', email: 'a@omnitech.fr', firstName: 'A', lastName: 'Un' },
    { id: 'u2', email: 'b@omnitech.fr', firstName: 'B', lastName: 'Deux' },
  ];

  const campaign = {
    id: 'camp-1',
    title: 'PSSI 2026',
    description: null,
    sourceType: 'DOCUMENT_POLICY',
    sourceId: 'doc-1',
    targetAllActiveUsers: true,
    targetRoles: [],
    targetDepartmentIds: [],
    docusealTemplateId: '7',
    dueAt: null,
    status: 'DRAFT',
    createdById: 'admin-1',
  };

  const pendingSignatures = [
    { id: 'cs-1', userId: 'u1', user: users[0] },
    { id: 'cs-2', userId: 'u2', user: users[1] },
  ];

  const mockFetch = (impl: any) => {
    global.fetch = jest.fn(impl) as any;
  };

  /** Réponse DocuSeal nominale : un tableau de submitters. */
  const docusealOk = (submissionId = 1000) =>
    jest.fn(async () => ({
      ok: true,
      json: async () => [
        { submission_id: submissionId, slug: `slug-${submissionId}` },
      ],
      text: async () => '',
    }));

  beforeEach(async () => {
    notifications = { create: jest.fn().mockResolvedValue({}) };
    prisma = {
      signatureCampaign: {
        findUnique: jest.fn().mockResolvedValue(campaign),
        update: jest
          .fn()
          .mockResolvedValue({ ...campaign, status: 'SENT' }),
      },
      user: { findMany: jest.fn().mockResolvedValue(users) },
      campaignSignature: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(pendingSignatures),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      documentVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ver-9' }),
      },
      signatureRequest: { create: jest.fn().mockResolvedValue({ id: 'sr-1' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(CampaignsService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('launch', () => {
    it('crée une CampaignSignature et une SignatureRequest par cible', async () => {
      let n = 1000;
      mockFetch(async () => ({
        ok: true,
        json: async () => [{ submission_id: n++, slug: 'sl' }],
        text: async () => '',
      }));

      const res: any = await service.launch('camp-1');

      expect(prisma.campaignSignature.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.signatureRequest.create).toHaveBeenCalledTimes(2);
      expect(res.dispatch).toEqual({ dispatched: 2, failed: 0, skipped: 0 });
    });

    it('renseigne campaignId + submissionId sur chaque SignatureRequest', async () => {
      mockFetch(docusealOk(4242));
      await service.launch('camp-1');

      const data = prisma.signatureRequest.create.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          campaignId: 'camp-1',
          documentVersionId: 'ver-9',
          requestedById: 'admin-1',
          docusealSubmissionId: '4242',
          status: 'PENDING',
        }),
      );
    });

    it('notifie chaque cible', async () => {
      mockFetch(docusealOk());
      await service.launch('camp-1');
      expect(notifications.create).toHaveBeenCalledTimes(2);
    });

    it('refuse de relancer une campagne déjà lancée', async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        status: 'SENT',
      });
      await expect(service.launch('camp-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuse une campagne sans cible', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.launch('camp-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuse une campagne inexistante', async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue(null);
      await expect(service.launch('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('dispatchPendingSubmissions', () => {
    it('ne crée AUCUNE SignatureRequest si DocuSeal échoue (pas de fantôme)', async () => {
      mockFetch(async () => ({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      }));

      const res = await service.dispatchPendingSubmissions('camp-1');

      expect(res).toEqual({ dispatched: 0, failed: 2, skipped: 0 });
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
      expect(prisma.campaignSignature.update).not.toHaveBeenCalled();
    });

    it('isole les échecs : une cible KO n’empêche pas les autres', async () => {
      let call = 0;
      mockFetch(async () => {
        call++;
        if (call === 1) {
          return { ok: false, status: 500, text: async () => 'boom' };
        }
        return {
          ok: true,
          json: async () => [{ submission_id: 7, slug: 's7' }],
          text: async () => '',
        };
      });

      const res = await service.dispatchPendingSubmissions('camp-1');

      expect(res.dispatched).toBe(1);
      expect(res.failed).toBe(1);
      expect(prisma.signatureRequest.create).toHaveBeenCalledTimes(1);
    });

    it('ignore (skipped) les campagnes sans template DocuSeal', async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        docusealTemplateId: null,
      });

      const res = await service.dispatchPendingSubmissions('camp-1');

      expect(res).toEqual({ dispatched: 0, failed: 0, skipped: 2 });
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
    });

    it('ne dispatche rien quand aucune cible n’est en attente (idempotence)', async () => {
      prisma.campaignSignature.findMany.mockResolvedValue([]);
      const res = await service.dispatchPendingSubmissions('camp-1');
      expect(res).toEqual({ dispatched: 0, failed: 0, skipped: 0 });
    });

    it('pas de SignatureRequest pour une campagne CHARTE (aucune DocumentVersion)', async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        sourceType: 'CHARTE',
        sourceId: 'charte-1',
      });
      mockFetch(docusealOk());

      const res = await service.dispatchPendingSubmissions('camp-1');

      expect(res.dispatched).toBe(2);
      expect(prisma.documentVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
      // Le suivi reste porté par CampaignSignature.
      expect(prisma.campaignSignature.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleWebhook (rattachement strict par submissionId)', () => {
    it('ignore un payload sans submission_id (jamais de rattachement par email)', async () => {
      const res = await service.handleWebhook({
        event_type: 'form.completed',
        data: { email: 'a@omnitech.fr' },
      });

      expect(res).toEqual({ ignored: true });
      expect(prisma.campaignSignature.findFirst).not.toHaveBeenCalled();
    });

    it('ignore une submission qui n’appartient à aucune campagne', async () => {
      prisma.campaignSignature.findFirst.mockResolvedValue(null);
      const res = await service.handleWebhook({
        event_type: 'form.completed',
        data: { submission_id: 999 },
      });
      expect(res).toEqual({ ignored: true });
    });

    it('marque SIGNED la CampaignSignature correspondante', async () => {
      prisma.campaignSignature.findFirst.mockResolvedValue({
        id: 'cs-1',
        campaignId: 'camp-1',
        status: 'PENDING',
        openedAt: null,
      });
      prisma.campaignSignature.findMany.mockResolvedValue([
        { status: 'SIGNED' },
      ]);

      const res = await service.handleWebhook({
        event_type: 'form.completed',
        data: { submission_id: 4242 },
      });

      expect(res).toEqual({ updated: true, campaignSignatureId: 'cs-1' });
      expect(prisma.campaignSignature.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SIGNED' }),
        }),
      );
    });

    it('marque OPENED sur form.viewed sans écraser un openedAt existant', async () => {
      const openedAt = new Date('2026-01-01T00:00:00Z');
      prisma.campaignSignature.findFirst.mockResolvedValue({
        id: 'cs-1',
        campaignId: 'camp-1',
        status: 'PENDING',
        openedAt,
      });

      await service.handleWebhook({
        event_type: 'form.viewed',
        data: { submission_id: 4242 },
      });

      const data = prisma.campaignSignature.update.mock.calls[0][0].data;
      expect(data.status).toBe('OPENED');
      expect(data.openedAt).toBe(openedAt);
    });
  });
});
