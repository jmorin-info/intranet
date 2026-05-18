import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ContentStatus } from "@prisma/client";
import { AdminContentController } from "./admin-content.controller";
import { ContentService } from "./content.service";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { RequestUser } from "../common/interfaces";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import type { Request } from "express";

/**
 * Tests AdminContentController :
 *  (a) RBAC : @Roles(ADMIN, SUPER_ADMIN) appliqué au niveau classe.
 *  (b) listPages : validation page/limit, status invalide → undefined.
 *  (c) createPage / updatePage : transmission de l'AuditContext (IP + UA).
 *  (d) deletePage : décorateur @HttpCode(204) appliqué.
 *  (e) listRevisions / restoreRevision : validation des paramètres.
 *
 * Tous les guards/throttlers sont compilés mais désactivés (Nest les exige
 * en runtime, pas en compile-time). On reste sur la délégation au service.
 */
describe("AdminContentController", () => {
  let controller: AdminContentController;
  let service: any;
  let reflector: Reflector;

  const adminUser: RequestUser = {
    id: "admin-1",
    email: "admin@omnitech.fr",
    role: UserRole.ADMIN,
  };

  const buildReq = (overrides: Partial<Request> = {}): Request => {
    return {
      ip: "192.168.1.10",
      headers: { "user-agent": "test-agent/1.0" },
      ...overrides,
    } as unknown as Request;
  };

  beforeEach(async () => {
    service = {
      listPages: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      }),
      getPageById: jest.fn().mockResolvedValue({ id: "page-1" }),
      createPage: jest.fn().mockResolvedValue({ id: "page-new" }),
      updatePage: jest.fn().mockResolvedValue({ id: "page-1" }),
      publishPage: jest.fn().mockResolvedValue({ id: "page-1" }),
      unpublishPage: jest.fn().mockResolvedValue({ id: "page-1" }),
      deletePage: jest.fn().mockResolvedValue(undefined),
      listRevisions: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      }),
      restoreRevision: jest.fn().mockResolvedValue({ id: "page-1" }),
      listBlocks: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 1 },
      }),
      getBlockById: jest.fn().mockResolvedValue({ id: "block-1" }),
      createBlock: jest.fn().mockResolvedValue({ id: "block-new" }),
      updateBlock: jest.fn().mockResolvedValue({ id: "block-1" }),
      deleteBlock: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminContentController],
      providers: [{ provide: ContentService, useValue: service }, Reflector],
    })
      // Auth + throttler guards sont testés ailleurs ; ici on désactive le
      // pipeline pour ne tester que la délégation contrôleur → service.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get<AdminContentController>(AdminContentController);
    reflector = moduleRef.get<Reflector>(Reflector);
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC metadata
  // ─────────────────────────────────────────────────────────────

  describe("RBAC", () => {
    it("@Roles(ADMIN, SUPER_ADMIN) est posé au niveau classe", () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        AdminContentController,
      );
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
      );
      expect(roles).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // listPages
  // ─────────────────────────────────────────────────────────────

  describe("listPages", () => {
    it("forwards valid status / locale / search / pagination to the service", async () => {
      await controller.listPages(
        ContentStatus.PUBLISHED,
        "fr",
        "mention",
        "2",
        "50",
      );
      expect(service.listPages).toHaveBeenCalledWith({
        status: ContentStatus.PUBLISHED,
        locale: "fr",
        search: "mention",
        page: 2,
        limit: 50,
      });
    });

    it("coerces an invalid status to undefined (no DB filter)", async () => {
      await controller.listPages(
        "BOGUS_STATUS",
        undefined as any,
        undefined as any,
        "1",
        "20",
      );
      expect(service.listPages).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });

    it("throws BadRequestException when page < 1", () => {
      expect(() =>
        controller.listPages(
          undefined as any,
          undefined as any,
          undefined as any,
          "0",
          "20",
        ),
      ).toThrow(BadRequestException);
    });

    it("throws BadRequestException when limit > 100", () => {
      expect(() =>
        controller.listPages(
          undefined as any,
          undefined as any,
          undefined as any,
          "1",
          "200",
        ),
      ).toThrow(BadRequestException);
    });

    it("throws BadRequestException when limit < 1", () => {
      expect(() =>
        controller.listPages(
          undefined as any,
          undefined as any,
          undefined as any,
          "1",
          "0",
        ),
      ).toThrow(BadRequestException);
    });

    it("uses defaults when page/limit query strings are missing", async () => {
      await controller.listPages(
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );
      expect(service.listPages).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // createPage / updatePage — propagation AuditContext
  // ─────────────────────────────────────────────────────────────

  describe("createPage", () => {
    it("forwards the DTO + AuditContext (userId + IP + UA) to the service", async () => {
      const dto = { title: "Test", content: "<p>x</p>" } as any;
      const req = buildReq();
      await controller.createPage(dto, adminUser, req);

      expect(service.createPage).toHaveBeenCalledWith(dto, {
        userId: "admin-1",
        ipAddress: "192.168.1.10",
        userAgent: "test-agent/1.0",
      });
    });

    it("falls back to undefined userAgent when header missing", async () => {
      const req = buildReq({ headers: {} } as any);
      await controller.createPage(
        { title: "x", content: "y" } as any,
        adminUser,
        req,
      );
      const callCtx = service.createPage.mock.calls[0][1];
      expect(callCtx.userAgent).toBeUndefined();
    });
  });

  describe("updatePage", () => {
    it("forwards id + DTO + AuditContext", async () => {
      const dto = { title: "Patch" } as any;
      const req = buildReq();
      await controller.updatePage("uuid-1", dto, adminUser, req);

      expect(service.updatePage).toHaveBeenCalledWith("uuid-1", dto, {
        userId: "admin-1",
        ipAddress: "192.168.1.10",
        userAgent: "test-agent/1.0",
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // publishPage / unpublishPage — propagation AuditContext
  // ─────────────────────────────────────────────────────────────

  describe("publish/unpublish", () => {
    it("publishPage forwards id + AuditContext", async () => {
      await controller.publishPage("uuid-1", adminUser, buildReq());
      expect(service.publishPage).toHaveBeenCalledWith(
        "uuid-1",
        expect.objectContaining({ userId: "admin-1" }),
      );
    });

    it("unpublishPage forwards id + AuditContext", async () => {
      await controller.unpublishPage("uuid-1", adminUser, buildReq());
      expect(service.unpublishPage).toHaveBeenCalledWith(
        "uuid-1",
        expect.objectContaining({ userId: "admin-1" }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // deletePage — @HttpCode(204)
  // ─────────────────────────────────────────────────────────────

  describe("deletePage", () => {
    it("delegates to service.deletePage and returns void (204)", async () => {
      const result = await controller.deletePage(
        "uuid-1",
        adminUser,
        buildReq(),
      );
      expect(result).toBeUndefined();
      expect(service.deletePage).toHaveBeenCalledWith(
        "uuid-1",
        expect.objectContaining({ userId: "admin-1" }),
      );
    });

    it("has @HttpCode(204) metadata on the method", () => {
      // Nest stocke le HTTP status sous la clé __httpCode__.
      const code = Reflect.getMetadata("__httpCode__", controller.deletePage);
      expect(code).toBe(204);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // listRevisions
  // ─────────────────────────────────────────────────────────────

  describe("listRevisions", () => {
    it("forwards id + pagination to the service", async () => {
      await controller.listRevisions("uuid-1", "2", "10");
      expect(service.listRevisions).toHaveBeenCalledWith("uuid-1", 2, 10);
    });

    it("throws BadRequestException when page < 1", () => {
      expect(() => controller.listRevisions("uuid-1", "0", "10")).toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when limit > 100", () => {
      expect(() => controller.listRevisions("uuid-1", "1", "999")).toThrow(
        BadRequestException,
      );
    });

    it("applies default page=1 limit=20 when missing", async () => {
      await controller.listRevisions(
        "uuid-1",
        undefined as any,
        undefined as any,
      );
      expect(service.listRevisions).toHaveBeenCalledWith("uuid-1", 1, 20);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // restoreRevision
  // ─────────────────────────────────────────────────────────────

  describe("restoreRevision", () => {
    it("forwards id + version + AuditContext", async () => {
      await controller.restoreRevision("uuid-1", 3, adminUser, buildReq());
      expect(service.restoreRevision).toHaveBeenCalledWith(
        "uuid-1",
        3,
        expect.objectContaining({ userId: "admin-1" }),
      );
    });

    it("throws BadRequestException when version < 1", () => {
      expect(() =>
        controller.restoreRevision("uuid-1", 0, adminUser, buildReq()),
      ).toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Blocks
  // ─────────────────────────────────────────────────────────────

  describe("blocks endpoints", () => {
    it("listBlocks forwards prefix / locale / pagination", async () => {
      await controller.listBlocks(
        "welcome.",
        "fr",
        undefined as any,
        "1",
        "50",
      );
      expect(service.listBlocks).toHaveBeenCalledWith({
        prefix: "welcome.",
        locale: "fr",
        search: undefined,
        page: 1,
        limit: 50,
      });
    });

    it("listBlocks rejects limit > 200", () => {
      expect(() =>
        controller.listBlocks(
          undefined as any,
          undefined as any,
          undefined as any,
          "1",
          "999",
        ),
      ).toThrow(BadRequestException);
    });

    it("createBlock forwards DTO + AuditContext", async () => {
      const dto = { key: "x.y", body: "hi" } as any;
      await controller.createBlock(dto, adminUser, buildReq());
      expect(service.createBlock).toHaveBeenCalledWith(
        dto,
        expect.objectContaining({ userId: "admin-1" }),
      );
    });

    it("updateBlock forwards id + DTO + AuditContext", async () => {
      await controller.updateBlock(
        "block-uuid",
        { title: "t" } as any,
        adminUser,
        buildReq(),
      );
      expect(service.updateBlock).toHaveBeenCalledWith(
        "block-uuid",
        { title: "t" },
        expect.objectContaining({ userId: "admin-1" }),
      );
    });

    it("deleteBlock returns void (204) and delegates", async () => {
      const result = await controller.deleteBlock(
        "block-uuid",
        adminUser,
        buildReq(),
      );
      expect(result).toBeUndefined();
      expect(service.deleteBlock).toHaveBeenCalledWith(
        "block-uuid",
        expect.objectContaining({ userId: "admin-1" }),
      );
    });
  });
});
