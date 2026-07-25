import { Test, TestingModule } from "@nestjs/testing";
import { CampaignsCron } from "./campaigns.cron";
import { CampaignsService } from "./campaigns.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Cron quotidien des campagnes.
 *
 * Le retry du dispatch DocuSeal est ce qui garantit qu'aucune cible ne reste
 * orpheline sans intervention manuelle : DocuSeal indisponible au moment du
 * launch, template renseigné après coup, signataires ajoutés hors ligne.
 * Il doit tourner AVANT (et indépendamment de) la logique d'échéance.
 */
describe("CampaignsCron", () => {
  let cron: CampaignsCron;
  let prisma: any;
  let campaigns: any;

  const sent = (over: Record<string, unknown> = {}) => ({
    id: "camp-1",
    status: "SENT",
    dueAt: null,
    remindersSent: 0,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      signatureCampaign: {
        findMany: jest.fn().mockResolvedValue([sent()]),
        update: jest.fn().mockResolvedValue({}),
      },
      campaignSignature: { updateMany: jest.fn().mockResolvedValue({}) },
      // markExpired propage désormais l'expiration aux SignatureRequest jumelles.
      signatureRequest: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    campaigns = {
      dispatchPendingSubmissions: jest
        .fn()
        .mockResolvedValue({ dispatched: 0, failed: 0, skipped: 0 }),
      sendReminders: jest.fn().mockResolvedValue({ sent: 0, total: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsCron,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignsService, useValue: campaigns },
      ],
    }).compile();

    cron = module.get(CampaignsCron);
  });

  it("retente le dispatch même sur une campagne sans échéance", async () => {
    await cron.dailyReminderSweep();
    expect(campaigns.dispatchPendingSubmissions).toHaveBeenCalledWith("camp-1");
    expect(campaigns.sendReminders).not.toHaveBeenCalled();
  });

  it("retente le dispatch avant de traiter les rappels", async () => {
    const due = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    prisma.signatureCampaign.findMany.mockResolvedValue([sent({ dueAt: due })]);

    await cron.dailyReminderSweep();

    expect(campaigns.dispatchPendingSubmissions).toHaveBeenCalled();
    expect(campaigns.sendReminders).toHaveBeenCalledWith("camp-1");
    expect(campaigns.dispatchPendingSubmissions.mock.invocationCallOrder[0]).toBeLessThan(
      campaigns.sendReminders.mock.invocationCallOrder[0],
    );
  });

  it("un dispatch en erreur n’empêche pas la suite du traitement", async () => {
    const due = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    prisma.signatureCampaign.findMany.mockResolvedValue([sent({ dueAt: due })]);
    campaigns.dispatchPendingSubmissions.mockRejectedValue(new Error("DocuSeal down"));

    await expect(cron.dailyReminderSweep()).resolves.toBeUndefined();
    expect(campaigns.sendReminders).toHaveBeenCalled();
  });

  it("marque EXPIRED une campagne en retard (sans envoyer de rappel)", async () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    prisma.signatureCampaign.findMany.mockResolvedValue([sent({ dueAt: past })]);

    await cron.dailyReminderSweep();

    expect(prisma.campaignSignature.updateMany).toHaveBeenCalled();
    expect(prisma.signatureCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED" } }),
    );
    expect(campaigns.sendReminders).not.toHaveBeenCalled();
  });

  it("ÉCHÉANCE D’ABORD : une campagne échue n’est JAMAIS dispatchée (aucun e-mail « merci de signer » avant expiration)", async () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    prisma.signatureCampaign.findMany.mockResolvedValue([sent({ dueAt: past })]);

    await cron.dailyReminderSweep();

    // Le dispatch (submissions DocuSeal + e-mails) ne doit PAS partir.
    expect(campaigns.dispatchPendingSubmissions).not.toHaveBeenCalled();
    // Et l'expiration est propagée aux SignatureRequest jumelles.
    expect(prisma.signatureRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
        data: { status: "EXPIRED" },
      }),
    );
  });

  it("ne propage JAMAIS d’exception (règle cron)", async () => {
    prisma.signatureCampaign.findMany.mockRejectedValue(new Error("DB down"));
    await expect(cron.dailyReminderSweep()).resolves.toBeUndefined();
  });
});
