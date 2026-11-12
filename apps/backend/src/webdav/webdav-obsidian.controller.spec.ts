import { Test, TestingModule } from "@nestjs/testing";
import { WebDAVController } from "./webdav.controller";
import { WebDAVService } from "./webdav.service";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { AuditService } from "../audit/audit.service";

/**
 * Tests fonctionnels du controller WebDAV (item 16, Wave B).
 * On mocke Prisma + Audit pour valider les chemins critiques :
 *   - Auth Basic OK / KO (401)
 *   - PROPFIND racine retourne 207 multi-status
 *   - PUT crée une page wiki (201) et UPDATE renvoie 204
 *   - GET retourne le markdown
 *   - DELETE supprime
 */
describe("WebDAVController (Obsidian sync)", () => {
  let controller: WebDAVController;
  let service: WebDAVService;
  let prisma: any;
  let crypto: CryptoService;

  const mockUser = {
    id: "user-1",
    email: "alice@omnitech-security.fr",
    role: "COLLABORATEUR",
    departmentId: null,
    firstName: "Alice",
    lastName: "Martin",
    deletedAt: null,
    isActive: true,
    webdavEnabled: true,
  };

  const mockPage = {
    id: "page-1",
    title: "Mon runbook",
    slug: "mon-runbook",
    category: "Runbooks",
    content: "Hello world",
    authorId: "user-1",
    isPublished: true,
    createdAt: new Date("2026-04-25T10:00:00Z"),
    updatedAt: new Date("2026-04-26T10:00:00Z"),
  };

  beforeEach(async () => {
    process.env.CRYPTO_SECRET =
      "test-crypto-secret-32-bytes-minimum-for-aes256-gcm-test";

    prisma = {
      appConfig: { findUnique: jest.fn().mockResolvedValue({ value: "true" }) },
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where?.email === mockUser.email.toLowerCase()) return mockUser;
          if (where?.id === mockUser.id) return mockUser;
          return null;
        }),
      },
      wikiPage: {
        findFirst: jest.fn().mockResolvedValue(mockPage),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockPage]),
        create: jest
          .fn()
          .mockImplementation(async ({ data }) => ({
            ...mockPage,
            ...data,
            id: "page-2",
            updatedAt: new Date(),
          })),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...mockPage,
          ...data,
          updatedAt: new Date(),
        })),
        delete: jest.fn().mockResolvedValue(mockPage),
      },
      wikiPageVersion: { create: jest.fn() },
      webDAVToken: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "tok-1",
          ...data,
          createdAt: new Date(),
        })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebDAVController],
      providers: [
        WebDAVService,
        CryptoService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get(WebDAVController);
    service = module.get(WebDAVService);
    crypto = module.get(CryptoService);
  });

  function makeRes(): any {
    const headers: Record<string, string> = {};
    const res: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      set: jest.fn((kv: any) => {
        Object.assign(headers, typeof kv === "string" ? {} : kv);
        return res;
      }),
      headers,
      headersSent: false,
    };
    return res;
  }

  function makeReq(method: string, url: string, headers: any = {}, body?: any): any {
    return {
      method,
      url,
      originalUrl: url,
      headers: { host: "localhost:3000", ...headers },
      body,
      rawBody: body && typeof body === "string" ? Buffer.from(body, "utf8") : undefined,
    };
  }

  it("returns 401 when no Authorization header", async () => {
    const res = makeRes();
    const req = makeReq(
      "PROPFIND",
      "/api/v1/webdav/obsidian/user-1/",
    );
    await controller.handleWebdav(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.set).toHaveBeenCalledWith(
      "WWW-Authenticate",
      expect.stringContaining("Basic"),
    );
  });

  it("returns 401 with invalid token", async () => {
    prisma.webDAVToken.findUnique.mockResolvedValueOnce(null);
    const auth = "Basic " + Buffer.from(`${mockUser.email}:badtoken`).toString("base64");
    const res = makeRes();
    const req = makeReq("OPTIONS", "/api/v1/webdav/obsidian/user-1/", {
      authorization: auth,
    });
    await controller.handleWebdav(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("authenticates with valid token (OPTIONS returns 200 with DAV headers)", async () => {
    // Mint a token then auth with it
    const minted = await service.createToken("user-1");
    prisma.webDAVToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      userId: "user-1",
      tokenHash: crypto.hashToken(minted.token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const auth =
      "Basic " +
      Buffer.from(`${mockUser.email}:${minted.token}`).toString("base64");
    const res = makeRes();
    const req = makeReq("OPTIONS", "/api/v1/webdav/obsidian/user-1/", {
      authorization: auth,
    });
    await controller.handleWebdav(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        DAV: "1, 2",
        Allow: expect.stringContaining("PROPFIND"),
      }),
    );
  });

  it("PUT creates a wiki page from markdown body", async () => {
    prisma.wikiPage.findFirst.mockResolvedValueOnce(null); // no existing
    const minted = await service.createToken("user-1");
    prisma.webDAVToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      userId: "user-1",
      tokenHash: crypto.hashToken(minted.token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const auth =
      "Basic " +
      Buffer.from(`${mockUser.email}:${minted.token}`).toString("base64");
    const md = `---\ntitle: Nouvelle page\n---\n\n# Contenu`;
    const res = makeRes();
    const req = makeReq(
      "PUT",
      "/api/v1/webdav/obsidian/user-1/runbooks/nouvelle-page.md",
      { authorization: auth },
      md,
    );
    await controller.handleWebdav(req, res);
    expect(prisma.wikiPage.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("GET returns markdown with frontmatter", async () => {
    prisma.wikiPage.findFirst.mockResolvedValueOnce(mockPage);
    const minted = await service.createToken("user-1");
    prisma.webDAVToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      userId: "user-1",
      tokenHash: crypto.hashToken(minted.token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const auth =
      "Basic " +
      Buffer.from(`${mockUser.email}:${minted.token}`).toString("base64");
    const res = makeRes();
    const req = makeReq(
      "GET",
      "/api/v1/webdav/obsidian/user-1/runbooks/mon-runbook.md",
      { authorization: auth },
    );
    await controller.handleWebdav(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringMatching(/^---[\s\S]*Mon runbook[\s\S]*Hello world/),
    );
  });

  it("DELETE soft-deletes the wiki page", async () => {
    prisma.wikiPage.findFirst.mockResolvedValueOnce(mockPage);
    const minted = await service.createToken("user-1");
    prisma.webDAVToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      userId: "user-1",
      tokenHash: crypto.hashToken(minted.token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const auth =
      "Basic " +
      Buffer.from(`${mockUser.email}:${minted.token}`).toString("base64");
    const res = makeRes();
    const req = makeReq(
      "DELETE",
      "/api/v1/webdav/obsidian/user-1/runbooks/mon-runbook.md",
      { authorization: auth },
    );
    await controller.handleWebdav(req, res);
    expect(prisma.wikiPage.delete).toHaveBeenCalledWith({
      where: { id: "page-1" },
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("PROPFIND root returns 207 multi-status XML listing folders", async () => {
    const minted = await service.createToken("user-1");
    prisma.webDAVToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      userId: "user-1",
      tokenHash: crypto.hashToken(minted.token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const auth =
      "Basic " +
      Buffer.from(`${mockUser.email}:${minted.token}`).toString("base64");
    const res = makeRes();
    const req = makeReq(
      "PROPFIND",
      "/api/v1/webdav/obsidian/user-1/",
      { authorization: auth, depth: "1" },
    );
    await controller.handleWebdav(req, res);
    expect(res.status).toHaveBeenCalledWith(207);
    const xml = (res.send as jest.Mock).mock.calls[0]?.[0] ?? "";
    expect(xml).toContain("<D:multistatus");
    expect(xml).toContain("<D:collection/>");
  });

  it("rejects vault scope mismatch (403)", async () => {
    const minted = await service.createToken("user-1");
    prisma.webDAVToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      userId: "user-1",
      tokenHash: crypto.hashToken(minted.token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const auth =
      "Basic " +
      Buffer.from(`${mockUser.email}:${minted.token}`).toString("base64");
    const res = makeRes();
    const req = makeReq(
      "PROPFIND",
      "/api/v1/webdav/obsidian/other-user/",
      { authorization: auth },
    );
    await controller.handleWebdav(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
