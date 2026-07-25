import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CampaignsService } from "./campaigns.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

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
describe("CampaignsService", () => {
  let service: CampaignsService;
  let prisma: any;
  let notifications: any;
  const originalFetch = global.fetch;

  const users = [
    { id: "u1", email: "a@omnitech.fr", firstName: "A", lastName: "Un" },
    { id: "u2", email: "b@omnitech.fr", firstName: "B", lastName: "Deux" },
  ];

  const campaign = {
    id: "camp-1",
    title: "PSSI 2026",
    description: null,
    sourceType: "DOCUMENT_POLICY",
    sourceId: "doc-1",
    targetAllActiveUsers: true,
    targetRoles: [],
    targetDepartmentIds: [],
    docusealTemplateId: "7",
    dueAt: null,
    status: "DRAFT",
    createdById: "admin-1",
  };

  const pendingSignatures = [
    { id: "cs-1", userId: "u1", user: users[0] },
    { id: "cs-2", userId: "u2", user: users[1] },
  ];

  const mockFetch = (impl: any) => {
    global.fetch = jest.fn(impl) as any;
  };

  /** Réponse DocuSeal nominale : un tableau de submitters. */
  const docusealOk = (submissionId = 1000) =>
    jest.fn(async () => ({
      ok: true,
      json: async () => [{ submission_id: submissionId, slug: `slug-${submissionId}` }],
      text: async () => "",
    }));

  beforeEach(async () => {
    notifications = { create: jest.fn().mockResolvedValue({}) };
    prisma = {
      signatureCampaign: {
        findUnique: jest.fn().mockResolvedValue(campaign),
        update: jest.fn().mockResolvedValue({ ...campaign, status: "SENT" }),
      },
      user: { findMany: jest.fn().mockResolvedValue(users) },
      // Document source APPROVED avec version courante figée au lancement.
      document: {
        findUnique: jest.fn().mockResolvedValue({ status: "APPROVED", currentVersionId: "ver-9" }),
      },
      campaignSignature: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(pendingSignatures),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      documentVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: "ver-9" }),
      },
      signatureRequest: {
        create: jest.fn().mockResolvedValue({ id: "sr-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // $transaction reçoit un tableau d'opérations Prisma (déjà des promesses
      // dans nos mocks) et les résout — l'atomicité réelle est garantie en prod.
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
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

  describe("launch", () => {
    it("crée une CampaignSignature et une SignatureRequest par cible", async () => {
      let n = 1000;
      mockFetch(async () => ({
        ok: true,
        json: async () => [{ submission_id: n++, slug: "sl" }],
        text: async () => "",
      }));

      const res: any = await service.launch("camp-1");

      expect(prisma.campaignSignature.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.signatureRequest.create).toHaveBeenCalledTimes(2);
      expect(res.dispatch).toEqual({ dispatched: 2, failed: 0, skipped: 0 });
    });

    it("renseigne campaignId + submissionId sur chaque SignatureRequest", async () => {
      mockFetch(docusealOk(4242));
      await service.launch("camp-1");

      const data = prisma.signatureRequest.create.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          campaignId: "camp-1",
          documentVersionId: "ver-9",
          requestedById: "admin-1",
          docusealSubmissionId: "4242",
          status: "PENDING",
        }),
      );
    });

    it("notifie chaque cible", async () => {
      mockFetch(docusealOk());
      await service.launch("camp-1");
      expect(notifications.create).toHaveBeenCalledTimes(2);
    });

    it("refuse de relancer une campagne déjà lancée", async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        status: "SENT",
      });
      await expect(service.launch("camp-1")).rejects.toThrow(BadRequestException);
    });

    it("refuse une campagne sans cible", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.launch("camp-1")).rejects.toThrow(BadRequestException);
    });

    it("refuse une campagne inexistante", async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue(null);
      await expect(service.launch("nope")).rejects.toThrow(NotFoundException);
    });
  });

  describe("dispatchPendingSubmissions", () => {
    it("ne crée AUCUNE SignatureRequest si DocuSeal échoue (pas de fantôme)", async () => {
      mockFetch(async () => ({
        ok: false,
        status: 503,
        text: async () => "unavailable",
      }));

      const res = await service.dispatchPendingSubmissions("camp-1");

      expect(res).toEqual({ dispatched: 0, failed: 2, skipped: 0 });
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
      expect(prisma.campaignSignature.update).not.toHaveBeenCalled();
    });

    it("isole les échecs : une cible KO n’empêche pas les autres", async () => {
      let call = 0;
      mockFetch(async () => {
        call++;
        if (call === 1) {
          return { ok: false, status: 500, text: async () => "boom" };
        }
        return {
          ok: true,
          json: async () => [{ submission_id: 7, slug: "s7" }],
          text: async () => "",
        };
      });

      const res = await service.dispatchPendingSubmissions("camp-1");

      expect(res.dispatched).toBe(1);
      expect(res.failed).toBe(1);
      expect(prisma.signatureRequest.create).toHaveBeenCalledTimes(1);
    });

    it("ignore (skipped) les campagnes sans template DocuSeal", async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        docusealTemplateId: null,
      });

      const res = await service.dispatchPendingSubmissions("camp-1");

      expect(res).toEqual({ dispatched: 0, failed: 0, skipped: 2 });
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
    });

    it("ne dispatche rien quand aucune cible n’est en attente (idempotence)", async () => {
      prisma.campaignSignature.findMany.mockResolvedValue([]);
      const res = await service.dispatchPendingSubmissions("camp-1");
      expect(res).toEqual({ dispatched: 0, failed: 0, skipped: 0 });
    });

    it("pas de SignatureRequest pour une campagne CHARTE (aucune DocumentVersion)", async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        sourceType: "CHARTE",
        sourceId: "charte-1",
      });
      mockFetch(docusealOk());

      const res = await service.dispatchPendingSubmissions("camp-1");

      expect(res.dispatched).toBe(2);
      expect(prisma.documentVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
      // Le suivi reste porté par CampaignSignature.
      expect(prisma.campaignSignature.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("handleWebhook (rattachement strict par submissionId)", () => {
    it("ignore un payload sans submission_id (jamais de rattachement par email)", async () => {
      const res = await service.handleWebhook({
        event_type: "form.completed",
        data: { email: "a@omnitech.fr" },
      });

      expect(res).toEqual({ ignored: true });
      expect(prisma.campaignSignature.findFirst).not.toHaveBeenCalled();
    });

    it("ignore une submission qui n’appartient à aucune campagne", async () => {
      prisma.campaignSignature.findFirst.mockResolvedValue(null);
      const res = await service.handleWebhook({
        event_type: "form.completed",
        data: { submission_id: 999 },
      });
      expect(res).toEqual({ ignored: true });
    });

    it("marque SIGNED la CampaignSignature correspondante", async () => {
      prisma.campaignSignature.findFirst.mockResolvedValue({
        id: "cs-1",
        campaignId: "camp-1",
        status: "PENDING",
        openedAt: null,
      });
      prisma.campaignSignature.findMany.mockResolvedValue([{ status: "SIGNED" }]);

      const res = await service.handleWebhook({
        event_type: "form.completed",
        data: { submission_id: 4242 },
      });

      expect(res).toEqual({ updated: true, campaignSignatureId: "cs-1" });
      expect(prisma.campaignSignature.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "SIGNED" }),
        }),
      );
    });

    it("marque OPENED sur form.viewed sans écraser un openedAt existant", async () => {
      const openedAt = new Date("2026-01-01T00:00:00Z");
      prisma.campaignSignature.findFirst.mockResolvedValue({
        id: "cs-1",
        campaignId: "camp-1",
        status: "PENDING",
        openedAt,
      });

      await service.handleWebhook({
        event_type: "form.viewed",
        data: { submission_id: 4242 },
      });

      const data = prisma.campaignSignature.update.mock.calls[0][0].data;
      expect(data.status).toBe("OPENED");
      expect(data.openedAt).toBe(openedAt);
    });
  });

  // ---------------------------------------------------------------------------
  // Finding MAJEUR : écriture ATOMIQUE du dispatch (submission DocuSeal +
  // SignatureRequest jumelle dans la même transaction, jamais d'orpheline).
  // ---------------------------------------------------------------------------
  describe("atomicité du dispatch", () => {
    it("commit CampaignSignature et SignatureRequest dans UN SEUL $transaction", async () => {
      mockFetch(docusealOk(555));
      await service.dispatchPendingSubmissions("camp-1");

      // 2 cibles → 2 transactions, chacune = update CampaignSignature + create
      // SignatureRequest (2 opérations atomiques).
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      const firstBatch = prisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(firstBatch)).toBe(true);
      expect(firstBatch).toHaveLength(2);
    });

    it("idempotence : ne recrée pas de SignatureRequest si une PENDING existe déjà", async () => {
      prisma.signatureRequest.findFirst.mockResolvedValue({ id: "sr-existing" });
      mockFetch(docusealOk(777));

      await service.dispatchPendingSubmissions("camp-1");

      // La submission est rattachée à la CampaignSignature mais AUCUN doublon.
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
      const firstBatch = prisma.$transaction.mock.calls[0][0];
      expect(firstBatch).toHaveLength(1); // update CampaignSignature seul
    });

    it("persiste le slug DocuSeal sur la SignatureRequest (URL /s/:slug)", async () => {
      mockFetch(docusealOk(4242)); // slug = 'slug-4242'
      await service.dispatchPendingSubmissions("camp-1");

      const data = prisma.signatureRequest.create.mock.calls[0][0].data;
      expect(data.docusealSlug).toBe("slug-4242");
    });
  });

  // ---------------------------------------------------------------------------
  // Finding MAJEUR : version FIGÉE au lancement — toutes les cibles signent la
  // même version approuvée, jamais une version postérieure (brouillon...).
  // ---------------------------------------------------------------------------
  describe("figement de la version (resolveDocumentVersionId)", () => {
    it("launch fige documentVersionId depuis currentVersionId du document APPROVED", async () => {
      mockFetch(docusealOk());
      await service.launch("camp-1");

      const updateData = prisma.signatureCampaign.update.mock.calls[0][0].data;
      expect(updateData.documentVersionId).toBe("ver-9");
    });

    it("refuse le lancement si le document source n’est plus APPROVED", async () => {
      prisma.document.findUnique.mockResolvedValue({
        status: "DRAFT",
        currentVersionId: "ver-9",
      });
      await expect(service.launch("camp-1")).rejects.toThrow(BadRequestException);
    });

    it("dispatch : priorité à la version FIGÉE, jamais un findFirst par date", async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        status: "SENT",
        documentVersionId: "ver-frozen",
      });
      mockFetch(docusealOk());

      await service.dispatchPendingSubmissions("camp-1");

      const data = prisma.signatureRequest.create.mock.calls[0][0].data;
      expect(data.documentVersionId).toBe("ver-frozen");
      expect(prisma.documentVersion.findFirst).not.toHaveBeenCalled();
    });

    it("dispatch : REFUSE (skipped) si le document DOCUMENT_POLICY n’est plus APPROVED", async () => {
      prisma.signatureCampaign.findUnique.mockResolvedValue({
        ...campaign,
        status: "SENT",
        documentVersionId: null,
      });
      prisma.document.findUnique.mockResolvedValue({
        status: "DRAFT",
        currentVersionId: "ver-9",
      });
      mockFetch(docusealOk());

      const res = await service.dispatchPendingSubmissions("camp-1");

      expect(res).toEqual({ dispatched: 0, failed: 0, skipped: 2 });
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Finding MINEUR : reset d'un signataire → pas de doublon ni ancien lien.
  // ---------------------------------------------------------------------------
  describe("resetSignerStatus — clôt les demandes résiduelles", () => {
    it("passe les SignatureRequest PENDING jumelles en EXPIRED avant le reset", async () => {
      prisma.campaignSignature.findUnique.mockResolvedValue({
        id: "cs-1",
        campaignId: "camp-1",
        userId: "u1",
        status: "PENDING",
        docusealSubmissionId: "sub-1",
        signedAt: null,
        user: { email: "a@omnitech.fr" },
        campaign: { title: "PSSI" },
      });
      mockFetch(async () => ({ ok: true, json: async () => ({}), text: async () => "" }));

      await service.resetSignerStatus("camp-1", "u1", "admin-1");

      expect(prisma.signatureRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaignId: "camp-1",
            signerId: "u1",
            status: "PENDING",
          }),
          data: { status: "EXPIRED" },
        }),
      );
    });
  });
});
