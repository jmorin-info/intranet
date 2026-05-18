import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ContentStatus } from "@prisma/client";
import { ContentService, AuditContext } from "./content.service";
import { ContentRepository } from "./content.repository";
import { AuditService } from "../audit/audit.service";

/**
 * Tests unitaires ContentService.
 *
 * Couvre :
 *  - createPage  : sanitization, slug auto / conflit, révision v1, audit
 *  - updatePage  : snapshot avant écrasement, slug unique, publishedAt
 *                  uniquement au 1er passage PUBLISHED, audit UPDATED
 *  - publishPage : DRAFT→PUBLISHED + publishedAt, idempotent
 *  - unpublish   : PUBLISHED→ARCHIVED, audit
 *  - deletePage  : soft delete + audit severity WARN
 *  - restoreRevision : snapshot puis applique l'état cible, audit RESTORED
 *  - getPublishedPage : 404 si non publié
 *  - Blocks (create / update / delete / getPublishedBlocksByKeys)
 *
 * On mocke ContentRepository et AuditService via `jest.fn()`. Le service
 * réel est instancié par Nest TestingModule pour rester fidèle au DI runtime.
 */
describe("ContentService", () => {
  let service: ContentService;
  let repo: jest.Mocked<ContentRepository>;
  let audit: { log: jest.Mock };

  const ctx: AuditContext = {
    userId: "user-1",
    ipAddress: "10.0.0.1",
    userAgent: "jest-agent",
  };

  const mockPage = {
    id: "page-1",
    slug: "mentions-legales",
    locale: "fr",
    title: "Mentions legales",
    excerpt: null,
    content: "<p>Contenu</p>",
    status: ContentStatus.DRAFT,
    seoTitle: null,
    seoDescription: null,
    publishedAt: null as Date | null,
    deletedAt: null as Date | null,
    authorId: "user-1",
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBlock = {
    id: "block-1",
    key: "welcome.hero.title",
    locale: "fr",
    title: null,
    body: "Bienvenue",
    data: null,
    status: ContentStatus.PUBLISHED,
    deletedAt: null as Date | null,
    updatedById: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<ContentRepository>> = {
      findManyPages: jest
        .fn()
        .mockResolvedValue({ data: [mockPage], total: 1 }),
      findPageById: jest.fn().mockResolvedValue(mockPage),
      findPublishedBySlug: jest.fn().mockResolvedValue(null),
      isSlugTaken: jest.fn().mockResolvedValue(false),
      createPage: jest.fn().mockResolvedValue(mockPage),
      updatePage: jest.fn().mockImplementation(async (id, data) => ({
        ...mockPage,
        ...data,
        id,
      })),
      softDeletePage: jest
        .fn()
        .mockResolvedValue({ ...mockPage, deletedAt: new Date() }),
      nextRevisionVersion: jest.fn().mockResolvedValue(2),
      createRevision: jest.fn().mockResolvedValue({ id: "rev-1" }),
      findRevisions: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findRevision: jest.fn().mockResolvedValue(null),
      findManyBlocks: jest
        .fn()
        .mockResolvedValue({ data: [mockBlock], total: 1 }),
      findBlockById: jest.fn().mockResolvedValue(mockBlock),
      findBlocksByKeys: jest.fn().mockResolvedValue([mockBlock]),
      isBlockKeyTaken: jest.fn().mockResolvedValue(false),
      createBlock: jest.fn().mockResolvedValue(mockBlock),
      updateBlock: jest.fn().mockImplementation(async (id, data) => ({
        ...mockBlock,
        ...data,
        id,
      })),
      softDeleteBlock: jest
        .fn()
        .mockResolvedValue({ ...mockBlock, deletedAt: new Date() }),
    };

    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: ContentRepository, useValue: repoMock },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
    repo = module.get(ContentRepository) as jest.Mocked<ContentRepository>;
  });

  // ═══════════════════════════════════════════════════════════════════
  // createPage
  // ═══════════════════════════════════════════════════════════════════

  describe("createPage", () => {
    it("strips <script> tags from the title via sanitizePlainText", async () => {
      await service.createPage(
        {
          title: "Hello<script>x</script>World",
          content: "<p>ok</p>",
        },
        ctx,
      );
      const call = repo.createPage.mock.calls[0][0];
      // sanitizePlainText retire les balises HTML mais conserve le texte entre,
      // donc on vérifie l'absence des balises plutôt qu'un strict equality.
      expect(call.title).not.toContain("<script");
      expect(call.title).not.toContain("</script");
      expect(call.title).toContain("Hello");
      expect(call.title).toContain("World");
    });

    it("sanitizes rich-text content (strips dangerous tags but keeps whitelist)", async () => {
      await service.createPage(
        {
          title: "Page propre",
          content:
            "<p>Hello <strong>world</strong></p><script>steal()</script>",
        },
        ctx,
      );
      const call = repo.createPage.mock.calls[0][0];
      expect(call.content).toContain("<strong>world</strong>");
      expect(call.content).not.toContain("<script");
      expect(call.content).not.toContain("steal()");
    });

    it("auto-generates slug from title when none provided", async () => {
      await service.createPage(
        {
          title: "Politique de confidentialité",
          content: "<p>x</p>",
        },
        ctx,
      );
      const call = repo.createPage.mock.calls[0][0];
      expect(call.slug).toBe("politique-de-confidentialite");
    });

    it("rejects when the explicit slug is already taken", async () => {
      repo.isSlugTaken.mockResolvedValueOnce(true);
      await expect(
        service.createPage(
          { title: "Doublon", slug: "doublon", content: "<p>x</p>" },
          ctx,
        ),
      ).rejects.toThrow(ConflictException);
      expect(repo.createPage).not.toHaveBeenCalled();
    });

    it("creates revision v1 with comment 'Création initiale'", async () => {
      repo.createPage.mockResolvedValueOnce({
        ...mockPage,
        id: "page-new",
      } as any);
      await service.createPage({ title: "Nouvelle", content: "<p>x</p>" }, ctx);
      const revArg = repo.createRevision.mock.calls[0][0];
      expect(revArg.version).toBe(1);
      expect(revArg.comment).toBe("Création initiale");
      expect((revArg.page as any).connect.id).toBe("page-new");
    });

    it("calls audit.log with action CONTENT_PAGE_CREATED and resource info", async () => {
      repo.createPage.mockResolvedValueOnce({
        ...mockPage,
        id: "page-new",
      } as any);
      await service.createPage({ title: "Audit", content: "<p>ok</p>" }, ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          ipAddress: "10.0.0.1",
          userAgent: "jest-agent",
          action: "CONTENT_PAGE_CREATED",
          resourceType: "ContentPage",
          resourceId: "page-new",
        }),
      );
    });

    it("sets publishedAt when created directly as PUBLISHED", async () => {
      await service.createPage(
        {
          title: "Direct publication",
          content: "<p>x</p>",
          status: ContentStatus.PUBLISHED,
        },
        ctx,
      );
      const call = repo.createPage.mock.calls[0][0];
      expect(call.publishedAt).toBeInstanceOf(Date);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // updatePage
  // ═══════════════════════════════════════════════════════════════════

  describe("updatePage", () => {
    it("snapshots existing content into a new revision BEFORE updating", async () => {
      await service.updatePage("page-1", { title: "Nouveau titre" }, ctx);

      // ordre des appels : createRevision avant updatePage.
      const revOrder = repo.createRevision.mock.invocationCallOrder[0];
      const updOrder = repo.updatePage.mock.invocationCallOrder[0];
      expect(revOrder).toBeLessThan(updOrder);

      const revArg = repo.createRevision.mock.calls[0][0];
      // La révision contient l'ÉTAT EXISTANT, pas le nouveau titre.
      expect(revArg.title).toBe(mockPage.title);
      expect(revArg.content).toBe(mockPage.content);
      expect(revArg.version).toBe(2);
    });

    it("accepts a new slug when free", async () => {
      repo.isSlugTaken.mockResolvedValueOnce(false);
      await service.updatePage("page-1", { slug: "nouveau-slug" }, ctx);
      expect(repo.updatePage).toHaveBeenCalledWith(
        "page-1",
        expect.objectContaining({ slug: "nouveau-slug" }),
      );
    });

    it("rejects when the new slug is already taken", async () => {
      repo.isSlugTaken.mockResolvedValueOnce(true);
      await expect(
        service.updatePage("page-1", { slug: "deja-pris" }, ctx),
      ).rejects.toThrow(ConflictException);
      expect(repo.updatePage).not.toHaveBeenCalled();
    });

    it("sets publishedAt the FIRST time the page transitions to PUBLISHED", async () => {
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.DRAFT,
        publishedAt: null,
      } as any);

      await service.updatePage(
        "page-1",
        { status: ContentStatus.PUBLISHED },
        ctx,
      );

      const updArg = repo.updatePage.mock.calls[0][1] as any;
      expect(updArg.publishedAt).toBeInstanceOf(Date);
    });

    it("does NOT overwrite publishedAt when already published once", async () => {
      const original = new Date("2025-01-01T00:00:00Z");
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.PUBLISHED,
        publishedAt: original,
      } as any);

      await service.updatePage(
        "page-1",
        { title: "Patch léger", status: ContentStatus.PUBLISHED },
        ctx,
      );

      const updArg = repo.updatePage.mock.calls[0][1] as any;
      expect(updArg.publishedAt).toBeUndefined();
    });

    it("calls audit.log with action CONTENT_PAGE_UPDATED", async () => {
      await service.updatePage("page-1", { title: "Patch" }, ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CONTENT_PAGE_UPDATED",
          resourceType: "ContentPage",
          resourceId: "page-1",
        }),
      );
    });

    it("throws NotFoundException when page does not exist", async () => {
      repo.findPageById.mockResolvedValueOnce(null);
      await expect(
        service.updatePage("missing", { title: "x" }, ctx),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // publishPage
  // ═══════════════════════════════════════════════════════════════════

  describe("publishPage", () => {
    it("transitions DRAFT to PUBLISHED and sets publishedAt", async () => {
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.DRAFT,
        publishedAt: null,
      } as any);

      await service.publishPage("page-1", ctx);

      const updArg = repo.updatePage.mock.calls[0][1] as any;
      expect(updArg.status).toBe(ContentStatus.PUBLISHED);
      expect(updArg.publishedAt).toBeInstanceOf(Date);
    });

    it("is idempotent : returns existing page without calling update again", async () => {
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      } as any);

      await service.publishPage("page-1", ctx);
      expect(repo.updatePage).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it("calls audit.log with action CONTENT_PAGE_PUBLISHED", async () => {
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.DRAFT,
      } as any);
      await service.publishPage("page-1", ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CONTENT_PAGE_PUBLISHED" }),
      );
    });

    it("keeps the previous publishedAt if already set (no double-publication)", async () => {
      const first = new Date("2024-06-01T00:00:00Z");
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.ARCHIVED,
        publishedAt: first,
      } as any);

      await service.publishPage("page-1", ctx);
      const updArg = repo.updatePage.mock.calls[0][1] as any;
      expect(updArg.publishedAt).toBe(first);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // unpublishPage
  // ═══════════════════════════════════════════════════════════════════

  describe("unpublishPage", () => {
    it("transitions PUBLISHED → ARCHIVED", async () => {
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.PUBLISHED,
      } as any);

      await service.unpublishPage("page-1", ctx);
      const updArg = repo.updatePage.mock.calls[0][1] as any;
      expect(updArg.status).toBe(ContentStatus.ARCHIVED);
    });

    it("calls audit.log with CONTENT_PAGE_UNPUBLISHED", async () => {
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.PUBLISHED,
      } as any);
      await service.unpublishPage("page-1", ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CONTENT_PAGE_UNPUBLISHED" }),
      );
    });

    it("noop when the page is not currently PUBLISHED", async () => {
      repo.findPageById.mockResolvedValueOnce({
        ...mockPage,
        status: ContentStatus.DRAFT,
      } as any);
      await service.unpublishPage("page-1", ctx);
      expect(repo.updatePage).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // deletePage
  // ═══════════════════════════════════════════════════════════════════

  describe("deletePage", () => {
    it("soft-deletes the page (deletedAt set via repo.softDeletePage)", async () => {
      await service.deletePage("page-1", ctx);
      expect(repo.softDeletePage).toHaveBeenCalledWith("page-1");
    });

    it("logs the deletion with severity WARN", async () => {
      await service.deletePage("page-1", ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CONTENT_PAGE_DELETED",
          resourceType: "ContentPage",
          severity: "WARN",
        }),
      );
    });

    it("throws NotFoundException when page is missing", async () => {
      repo.findPageById.mockResolvedValueOnce(null);
      await expect(service.deletePage("missing", ctx)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // restoreRevision
  // ═══════════════════════════════════════════════════════════════════

  describe("restoreRevision", () => {
    const targetRev = {
      id: "rev-target",
      pageId: "page-1",
      version: 3,
      title: "Ancien titre",
      content: "<p>Ancien contenu</p>",
      excerpt: "ancien excerpt",
      seoTitle: "old seo",
      seoDescription: "old seo desc",
      status: ContentStatus.PUBLISHED,
    };

    it("throws NotFoundException when the revision does not exist", async () => {
      repo.findRevision.mockResolvedValueOnce(null);
      await expect(service.restoreRevision("page-1", 99, ctx)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("snapshots the current state then applies the target revision", async () => {
      repo.findRevision.mockResolvedValueOnce(targetRev as any);

      await service.restoreRevision("page-1", 3, ctx);

      // Le snapshot enregistre l'état COURANT.
      const snapshot = repo.createRevision.mock.calls[0][0];
      expect(snapshot.title).toBe(mockPage.title);
      expect(snapshot.content).toBe(mockPage.content);
      expect(snapshot.comment).toBe("Snapshot avant restauration v3");

      // Puis l'updatePage applique le contenu cible.
      const updArg = repo.updatePage.mock.calls[0][1] as any;
      expect(updArg.title).toBe(targetRev.title);
      expect(updArg.content).toBe(targetRev.content);
    });

    it("calls audit.log with CONTENT_PAGE_RESTORED + restoredVersion metadata", async () => {
      repo.findRevision.mockResolvedValueOnce(targetRev as any);
      await service.restoreRevision("page-1", 3, ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CONTENT_PAGE_RESTORED",
          resourceType: "ContentPage",
          metadata: expect.objectContaining({ restoredVersion: 3 }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // getPublishedPage
  // ═══════════════════════════════════════════════════════════════════

  describe("getPublishedPage", () => {
    it("returns the page when it exists in PUBLISHED state", async () => {
      const published = { ...mockPage, status: ContentStatus.PUBLISHED };
      repo.findPublishedBySlug.mockResolvedValueOnce(published as any);
      const result = await service.getPublishedPage("mentions-legales", "fr");
      expect(result).toBe(published);
    });

    it("throws NotFoundException when the repository returns null (DRAFT/ARCHIVED/missing)", async () => {
      repo.findPublishedBySlug.mockResolvedValueOnce(null);
      await expect(
        service.getPublishedPage("does-not-exist", "fr"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Blocks
  // ═══════════════════════════════════════════════════════════════════

  describe("createBlock", () => {
    it("rejects when the key is already taken for the locale", async () => {
      repo.isBlockKeyTaken.mockResolvedValueOnce(true);
      await expect(
        service.createBlock({ key: "welcome.hero.title", body: "x" }, ctx),
      ).rejects.toThrow(ConflictException);
      expect(repo.createBlock).not.toHaveBeenCalled();
    });

    it("sanitizes body through sanitizeRichText", async () => {
      await service.createBlock(
        {
          key: "trust.iso",
          body: "<p>Safe</p><script>x()</script>",
        },
        ctx,
      );
      const call = repo.createBlock.mock.calls[0][0];
      expect(call.body).toContain("<p>Safe</p>");
      expect(call.body).not.toContain("<script");
    });

    it("calls audit.log with CONTENT_BLOCK_CREATED", async () => {
      await service.createBlock({ key: "welcome.hero", body: "hi" }, ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CONTENT_BLOCK_CREATED",
          resourceType: "ContentBlock",
        }),
      );
    });
  });

  describe("updateBlock", () => {
    it("applies partial updates (title / body / data / status)", async () => {
      await service.updateBlock(
        "block-1",
        {
          title: "Nouveau titre",
          body: "<p>new</p>",
          status: ContentStatus.DRAFT,
        },
        ctx,
      );
      const updArg = repo.updateBlock.mock.calls[0][1] as any;
      expect(updArg.title).toBe("Nouveau titre");
      expect(updArg.body).toContain("<p>new</p>");
      expect(updArg.status).toBe(ContentStatus.DRAFT);
    });

    it("does not touch fields that are absent from the DTO", async () => {
      await service.updateBlock("block-1", { title: "Only title" }, ctx);
      const updArg = repo.updateBlock.mock.calls[0][1] as any;
      expect(updArg.body).toBeUndefined();
      expect(updArg.status).toBeUndefined();
    });

    it("calls audit.log with CONTENT_BLOCK_UPDATED", async () => {
      await service.updateBlock("block-1", { title: "t" }, ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CONTENT_BLOCK_UPDATED",
          resourceType: "ContentBlock",
          resourceId: "block-1",
        }),
      );
    });
  });

  describe("deleteBlock", () => {
    it("soft-deletes the block and logs WARN", async () => {
      await service.deleteBlock("block-1", ctx);
      expect(repo.softDeleteBlock).toHaveBeenCalledWith("block-1");
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CONTENT_BLOCK_DELETED",
          severity: "WARN",
        }),
      );
    });
  });

  describe("getPublishedBlocksByKeys", () => {
    it("returns an empty object when no keys are requested", async () => {
      const out = await service.getPublishedBlocksByKeys([], "fr");
      expect(out).toEqual({});
      expect(repo.findBlocksByKeys).not.toHaveBeenCalled();
    });

    it("rejects when more than 50 keys are requested", async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `k.${i}`);
      await expect(
        service.getPublishedBlocksByKeys(tooMany, "fr"),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns a Record indexed by key (excluding non-PUBLISHED via repo filter)", async () => {
      repo.findBlocksByKeys.mockResolvedValueOnce([
        { ...mockBlock, key: "welcome.hero.title", body: "Hello" },
        { ...mockBlock, key: "welcome.footer", body: "Bye", id: "block-2" },
      ] as any);

      const out = await service.getPublishedBlocksByKeys(
        ["welcome.hero.title", "welcome.footer", "missing.key"],
        "fr",
      );

      expect(Object.keys(out)).toEqual(
        expect.arrayContaining(["welcome.hero.title", "welcome.footer"]),
      );
      expect(out["welcome.hero.title"].body).toBe("Hello");
      expect(out["missing.key"]).toBeUndefined();
    });

    it("propagates the locale to the repository", async () => {
      await service.getPublishedBlocksByKeys(["a", "b"], "en");
      expect(repo.findBlocksByKeys).toHaveBeenCalledWith(["a", "b"], "en");
    });
  });
});
