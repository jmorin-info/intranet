import { Test } from "@nestjs/testing";
import { EmailRenderService, SEAL_COLORS } from "./email-render.service";

/**
 * Tests unitaires EmailRenderService (Wave G).
 *
 * Couvre :
 *   - listTemplates renvoie les templates attendus (sans partials/_layout)
 *   - render(template) substitue les variables et g&eacute;n&egrave;re un HTML non-vide
 *   - extraction du sujet par locale (fr/en)
 *   - subject override
 *   - text plain pr&eacute;sent et non-vide
 *   - getSampleVars couvre tous les templates
 *   - rendu d'un template inconnu l&egrave;ve une erreur
 *   - couleurs SEAL pr&eacute;sentes dans le HTML rendu
 */

describe("EmailRenderService", () => {
  let service: EmailRenderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EmailRenderService],
    }).compile();
    service = moduleRef.get(EmailRenderService);
  });

  it("listTemplates renvoie les templates attendus", () => {
    const list = service.listTemplates();
    const expected = [
      "calendar-sync-failed",
      "digest",
      "document-approval-request",
      "document-to-sign",
      "mention",
      "mfa-enforced",
      "password-reset",
      "security-alert",
      "ticket-assigned",
      "ticket-comment",
      "ticket-resolved",
      "welcome",
    ];
    for (const name of expected) {
      expect(list).toContain(name);
    }
    // Pas de partial ni layout dans la liste
    expect(list).not.toContain("_layout");
    expect(list).not.toContain("greeting");
  });

  it("render(welcome) substitue les variables et g&eacute;n&egrave;re HTML+text", async () => {
    const result = await service.render(
      "welcome",
      {
        firstName: "Alice",
        managerName: "Bob",
        temporaryPassword: "TempPass123!",
        firstLoginUrl: "https://example.com/login",
        appUrl: "https://example.com",
        preferencesUrl: "https://example.com/prefs",
      },
      { locale: "fr" },
    );
    expect(result.html).toContain("Alice");
    expect(result.html).toContain("Bob");
    expect(result.html).toContain("TempPass123!");
    expect(result.text).toContain("Alice");
    expect(result.text.length).toBeGreaterThan(20);
    expect(result.subject).toMatch(/Bienvenue/i);
    expect(result.subject).toContain("Alice");
  });

  it("subject extrait par locale", async () => {
    const fr = await service.render(
      "ticket-assigned",
      service.getSampleVars("ticket-assigned"),
      { locale: "fr" },
    );
    const en = await service.render(
      "ticket-assigned",
      service.getSampleVars("ticket-assigned"),
      { locale: "en" },
    );
    expect(fr.subject).toMatch(/Nouveau ticket/);
    expect(en.subject).toMatch(/New ticket/);
  });

  it("subjectOverride est respect&eacute;", async () => {
    const result = await service.render(
      "welcome",
      service.getSampleVars("welcome"),
      { subjectOverride: "Custom subject 42" },
    );
    expect(result.subject).toBe("Custom subject 42");
  });

  it("getSampleVars renvoie des donn&eacute;es de base pour chaque template connu", () => {
    for (const name of service.listTemplates()) {
      const vars = service.getSampleVars(name);
      expect(vars.firstName).toBeDefined();
      expect(vars.appUrl).toBeDefined();
      expect(vars.preferencesUrl).toBeDefined();
    }
  });

  it("render(template-inconnu) l&egrave;ve une erreur", async () => {
    await expect(service.render("does-not-exist", {})).rejects.toThrow(
      /not found/i,
    );
  });

  it("template digest avec each rend les modules", async () => {
    const sample = service.getSampleVars("digest");
    const result = await service.render("digest", sample);
    // Au moins 1 module et 1 item rendus
    expect(result.html).toMatch(/Tickets/i);
    expect(result.html).toContain("Ticket #142 assigné".replace(/é/g, "&eacute;").length > 0
      ? "Ticket #142"
      : "Ticket");
  });

  it("rend la couleur PANTONE navy SEAL dans le layout", async () => {
    const result = await service.render(
      "welcome",
      service.getSampleVars("welcome"),
    );
    // Couleur navy sur header (insensible &agrave; la casse)
    expect(result.html.toLowerCase()).toContain(SEAL_COLORS.navy.toLowerCase());
  });

  it("preview() est un wrapper autour de render() avec sample data", async () => {
    const result = await service.preview("mention", "fr");
    expect(result.html).toContain("Bob");
    expect(result.subject).toMatch(/mentionn/i);
  });

  it("&eacute;chappement HTML par d&eacute;faut sur {{ var }}", async () => {
    const result = await service.render("welcome", {
      ...service.getSampleVars("welcome"),
      managerName: '<script>alert("xss")</script>',
    });
    expect(result.html).not.toContain('<script>alert("xss")</script>');
    expect(result.html).toContain("&lt;script&gt;");
  });
});
