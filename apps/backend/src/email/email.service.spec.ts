import { Test } from "@nestjs/testing";
import { EmailRenderService } from "./email-render.service";
import { EmailService } from "./email.service";

/**
 * Tests unitaires EmailService (Wave G).
 *
 * Couvre :
 *   - sendDirect retourne success:false quand SMTP non configur&eacute;
 *   - sendNotification d&eacute;l&egrave;gue &agrave; la queue si inject&eacute;e
 *   - logging structur&eacute; JSON contient l'event et le toDomain anonymis&eacute;
 *   - retry exhaust avec attempts comptabilis&eacute;s correctement
 *   - render error → success:false sans crash
 */

const ENV_BACKUP = { ...process.env };

describe("EmailService", () => {
  let service: EmailService;
  let render: EmailRenderService;

  beforeEach(async () => {
    process.env = { ...ENV_BACKUP };
    delete process.env.SMTP_HOST;
    const moduleRef = await Test.createTestingModule({
      providers: [EmailRenderService, EmailService],
    }).compile();
    render = moduleRef.get(EmailRenderService);
    service = moduleRef.get(EmailService);
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("sendDirect renvoie success:false si SMTP non configur&eacute; (no_smtp_configured)", async () => {
    const result = await service.sendDirect(
      "alice@example.com",
      "welcome",
      render.getSampleVars("welcome"),
      { noRetry: true },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no_smtp_configured/);
    expect(result.attempts).toBe(1);
  });

  it("sendDirect compte les tentatives sur retry exhaust", async () => {
    const result = await service.sendDirect(
      "alice@example.com",
      "welcome",
      render.getSampleVars("welcome"),
      { noRetry: false },
    );
    // 4 tentatives au total (1 + 3 retries)
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(4);
  }, 30_000);

  it("sendDirect renvoie success:false sur template inconnu (render error)", async () => {
    const result = await service.sendDirect(
      "alice@example.com",
      "no-such-template",
      {},
      { noRetry: true },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(result.log.event).toBe("render_failed");
  });

  it("log structur&eacute; expose event + toDomain anonymis&eacute;", async () => {
    const result = await service.sendDirect(
      "alice@omnitech-security.fr",
      "welcome",
      render.getSampleVars("welcome"),
      { noRetry: true, category: "test" },
    );
    expect(result.log).toMatchObject({
      event: "email.send_failed",
      toDomain: "omnitech-security.fr",
      category: "test",
    });
    // Pas de fuite de l'email complet dans les logs
    expect(JSON.stringify(result.log)).not.toContain("alice@omnitech-security.fr");
  });

  it("sendNotification d&eacute;l&egrave;gue &agrave; la queue si inject&eacute;e", async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailRenderService,
        EmailService,
        { provide: "EMAIL_QUEUE_INJECTOR", useValue: queue },
      ],
    }).compile();
    // Construct manuellement avec la queue (simule l'injection optionnelle)
    const emailRender = moduleRef.get(EmailRenderService);
    const emailService = new EmailService(emailRender, queue);
    const result = await emailService.sendNotification(
      "alice@example.com",
      "welcome",
      emailRender.getSampleVars("welcome"),
      { category: "onboarding" },
    );
    expect(queue.add).toHaveBeenCalledWith(
      "send-template",
      expect.objectContaining({ template: "welcome" }),
      expect.objectContaining({ attempts: 4 }),
    );
    expect(result.success).toBe(true);
    expect(result.log.queued).toBe(true);
  });

  it("sendNotification fallback sur sendDirect si la queue plante", async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error("redis down")) };
    const emailRender = render;
    const emailService = new EmailService(emailRender, queue);
    // On override les delays via DEFAULT_RETRY_DELAYS via noRetry false ; on
    // s'attend à ce que la queue soit tentée puis l'envoi direct prenne le
    // relais. Pour limiter la durée du test on simule directement le retry
    // direct via spyOn.
    const directSpy = jest
      .spyOn(emailService, "sendDirect")
      .mockResolvedValue({
        success: false,
        attempts: 1,
        durationMs: 5,
        error: "no_smtp_configured",
        log: { event: "email.send_failed" },
      });
    const result = await emailService.sendNotification(
      "alice@example.com",
      "welcome",
      emailRender.getSampleVars("welcome"),
    );
    expect(queue.add).toHaveBeenCalled();
    expect(directSpy).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no_smtp_configured/);
  });
});
