import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

/**
 * Tests ContentController (lecture publique intranet).
 *
 * Couvre :
 *  (a) Le contrôleur n'a PAS de @Roles(...) — seulement JwtAuthGuard.
 *  (b) getPage : refuse les slugs invalides + résout la locale.
 *  (c) getBlocks : parse "a,b,c", rejette si keys vide/absent, résout locale.
 */
describe("ContentController", () => {
  let controller: ContentController;
  let service: any;
  let reflector: Reflector;
  let res: { setHeader: jest.Mock };

  beforeEach(async () => {
    service = {
      getPublishedPage: jest.fn().mockResolvedValue({
        id: "page-1",
        slug: "mentions-legales",
        title: "Mentions legales",
      }),
      getPublishedBlocksByKeys: jest.fn().mockResolvedValue({}),
    };
    res = { setHeader: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [{ provide: ContentService, useValue: service }, Reflector],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get<ContentController>(ContentController);
    reflector = moduleRef.get<Reflector>(Reflector);
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC : public côté intranet (aucun @Roles)
  // ─────────────────────────────────────────────────────────────

  describe("RBAC metadata", () => {
    it("does not declare @Roles at class level (no admin restriction)", () => {
      const roles = reflector.get(ROLES_KEY, ContentController);
      expect(roles).toBeUndefined();
    });

    it("does not declare @Roles on getPage", () => {
      const roles = reflector.get(ROLES_KEY, controller.getPage);
      expect(roles).toBeUndefined();
    });

    it("does not declare @Roles on getBlocks", () => {
      const roles = reflector.get(ROLES_KEY, controller.getBlocks);
      expect(roles).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getPage
  // ─────────────────────────────────────────────────────────────

  describe("getPage", () => {
    it("rejects slugs with uppercase letters", async () => {
      await expect(
        controller.getPage("Mentions-Legales", undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
      expect(service.getPublishedPage).not.toHaveBeenCalled();
    });

    it("rejects slugs with spaces", async () => {
      await expect(
        controller.getPage("foo bar", undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects slugs with special characters", async () => {
      await expect(
        controller.getPage("foo$bar", undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects slugs starting/ending with a dash", async () => {
      await expect(
        controller.getPage("-foo", undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.getPage("foo-", undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("accepts a valid slug + defaults locale to 'fr' when missing", async () => {
      await controller.getPage(
        "mentions-legales",
        undefined as any,
        res as any,
      );
      expect(service.getPublishedPage).toHaveBeenCalledWith(
        "mentions-legales",
        "fr",
      );
    });

    it("forwards an explicitly supported locale (en)", async () => {
      await controller.getPage("about-us", "en", res as any);
      expect(service.getPublishedPage).toHaveBeenCalledWith("about-us", "en");
    });

    it("falls back to 'fr' when locale is not in SUPPORTED_LOCALES", async () => {
      await controller.getPage("mentions-legales", "es", res as any);
      expect(service.getPublishedPage).toHaveBeenCalledWith(
        "mentions-legales",
        "fr",
      );
    });

    it("sets Cache-Control header on success", async () => {
      await controller.getPage("mentions-legales", "fr", res as any);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, max-age=300, stale-while-revalidate=3600",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getBlocks
  // ─────────────────────────────────────────────────────────────

  describe("getBlocks", () => {
    it("rejects when keys query parameter is missing", async () => {
      await expect(
        controller.getBlocks(undefined as any, undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
      expect(service.getPublishedBlocksByKeys).not.toHaveBeenCalled();
    });

    it("rejects when keys is an empty string", async () => {
      await expect(
        controller.getBlocks("", undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when keys contains only commas/whitespace", async () => {
      await expect(
        controller.getBlocks(" , , ", undefined as any, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("splits comma-separated keys + trims whitespace", async () => {
      await controller.getBlocks("a.b, c.d ,e.f", undefined as any, res as any);
      expect(service.getPublishedBlocksByKeys).toHaveBeenCalledWith(
        ["a.b", "c.d", "e.f"],
        "fr",
      );
    });

    it("defaults locale to 'fr' when missing", async () => {
      await controller.getBlocks("welcome.hero", undefined as any, res as any);
      expect(service.getPublishedBlocksByKeys).toHaveBeenCalledWith(
        ["welcome.hero"],
        "fr",
      );
    });

    it("forwards an explicit supported locale (en)", async () => {
      await controller.getBlocks("welcome.hero", "en", res as any);
      expect(service.getPublishedBlocksByKeys).toHaveBeenCalledWith(
        ["welcome.hero"],
        "en",
      );
    });

    it("falls back to 'fr' when locale is unsupported", async () => {
      await controller.getBlocks("welcome.hero", "ja", res as any);
      expect(service.getPublishedBlocksByKeys).toHaveBeenCalledWith(
        ["welcome.hero"],
        "fr",
      );
    });

    it("sets Cache-Control header on success", async () => {
      await controller.getBlocks("welcome.hero", "fr", res as any);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "private, max-age=300, stale-while-revalidate=3600",
      );
    });
  });
});
