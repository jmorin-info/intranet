import * as fs from "fs";
import * as trustedDownloads from "../common/http/trusted-download";
import { Test, TestingModule } from "@nestjs/testing";
import { OfficeService } from "./office.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { JwtService } from "@nestjs/jwt";
import { ForbiddenException, NotFoundException } from "@nestjs/common";

describe("OfficeService", () => {
  let service: OfficeService;
  let prisma: any;

  // Save original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("isEnabled", () => {
    it("should return false when ONLYOFFICE_ENABLED is not set", async () => {
      delete process.env.ONLYOFFICE_ENABLED;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when ONLYOFFICE_ENABLED is "true"', async () => {
      process.env.ONLYOFFICE_ENABLED = "true";
      process.env.ONLYOFFICE_JWT_SECRET = "test-secret";

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe("buildEditorConfig", () => {
    it("should throw NotFoundException for non-existent document", async () => {
      process.env.ONLYOFFICE_ENABLED = "true";
      process.env.ONLYOFFICE_JWT_SECRET = "test-secret";

      prisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: prisma },
          { provide: StorageService, useValue: {} },
          {
            provide: JwtService,
            useValue: { sign: jest.fn().mockReturnValue("token"), verify: jest.fn() },
          },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);

      await expect(
        service.buildEditorConfig("nonexistent-id", {
          id: "user-1",
          email: "user@omnitech.fr",
          role: "ADMIN" as any,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException for soft-deleted document", async () => {
      process.env.ONLYOFFICE_ENABLED = "true";
      process.env.ONLYOFFICE_JWT_SECRET = "test-secret";

      prisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: "doc-1",
            deletedAt: new Date(),
            versions: [],
          }),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: prisma },
          { provide: StorageService, useValue: {} },
          {
            provide: JwtService,
            useValue: { sign: jest.fn().mockReturnValue("token"), verify: jest.fn() },
          },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);

      await expect(
        service.buildEditorConfig("doc-1", {
          id: "user-1",
          email: "user@omnitech.fr",
          role: "ADMIN" as any,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================================
  // Helpers pour les tests de logique critique (clé stable, anti-SSRF, JWT
  // callback, handleCallback). Instanciation directe — pas besoin du module
  // Nest complet, le constructeur ne lit que process.env.
  // ==========================================================================
  const DS_URL = "http://ds.example";
  const INTERNAL_DS_URL = "http://localhost:8082";

  function makeService(opts?: {
    prisma?: any;
    storage?: any;
    jwt?: any;
    env?: Record<string, string | undefined>;
    scanner?: any;
  }): { service: OfficeService; prisma: any; storage: any; jwt: any } {
    process.env.ONLYOFFICE_ENABLED = "true";
    process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = DS_URL;
    process.env.ONLYOFFICE_INTERNAL_DS_URL = INTERNAL_DS_URL;
    process.env.ONLYOFFICE_JWT_SECRET = "shared-ds-secret";
    process.env.JWT_ACCESS_SECRET = "file-token-secret";
    for (const [k, v] of Object.entries(opts?.env || {})) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const prismaMock = opts?.prisma || {};
    if (!prismaMock.appConfig) prismaMock.appConfig = { findUnique: jest.fn().mockResolvedValue(null) };
    const storageMock = opts?.storage || {};
    const jwtMock = opts?.jwt || { sign: jest.fn().mockReturnValue("signed"), verify: jest.fn() };
    const svc = new OfficeService(prismaMock, storageMock, jwtMock, undefined, opts?.scanner);
    return { service: svc, prisma: prismaMock, storage: storageMock, jwt: jwtMock };
  }

  describe("buildSessionKey (clé de session stable)", () => {
    it("génère documentId-versionId-checksum8, sans composante temporelle", () => {
      const { service: svc } = makeService();
      const version = {
        id: "ver-1",
        checksum: "abcdef0123456789abcdef0123456789",
      };
      const key1 = svc.buildSessionKey("doc-1", version);
      expect(key1).toBe("doc-1-ver-1-abcdef01");

      // La clé est STABLE dans le temps (le bug historique : un bucket de 60s
      // isolait chaque ouverture dans une session Docs Server distincte).
      jest.useFakeTimers();
      jest.advanceTimersByTime(10 * 60 * 1000);
      expect(svc.buildSessionKey("doc-1", version)).toBe(key1);
      jest.useRealTimers();
    });

    it("change quand le checksum change (nouveau contenu = nouvelle session)", () => {
      const { service: svc } = makeService();
      const k1 = svc.buildSessionKey("doc-1", { id: "ver-1", checksum: "aaaa1111bbbb" });
      const k2 = svc.buildSessionKey("doc-1", { id: "ver-1", checksum: "cccc2222dddd" });
      expect(k1).not.toBe(k2);
    });

    it('tolère un checksum absent (fallback "nochksum")', () => {
      const { service: svc } = makeService();
      expect(svc.buildSessionKey("doc-1", { id: "ver-1", checksum: null })).toBe(
        "doc-1-ver-1-nochksum",
      );
    });
  });

  describe("isAllowedDownloadUrl (anti-SSRF)", () => {
    it("accepte les URLs du Docs Server public et interne", () => {
      const { service: svc } = makeService();
      expect(svc.isAllowedDownloadUrl(`${DS_URL}/cache/files/doc.docx`)).toBe(true);
      expect(svc.isAllowedDownloadUrl(`${INTERNAL_DS_URL}/cache/files/doc.docx`)).toBe(true);
    });

    it("rejette les hosts hors liste blanche", () => {
      const { service: svc } = makeService();
      expect(svc.isAllowedDownloadUrl("http://evil.example/exfil.docx")).toBe(false);
      expect(svc.isAllowedDownloadUrl("http://10.33.120.55:3000/api/v1/health")).toBe(false);
      // Même hostname mais port différent = host différent → rejet
      expect(svc.isAllowedDownloadUrl("http://ds.example:9999/cache/f.docx")).toBe(false);
    });

    it("rejette les protocoles non-HTTP et les URLs invalides", () => {
      const { service: svc } = makeService();
      expect(svc.isAllowedDownloadUrl("file:///etc/passwd")).toBe(false);
      expect(svc.isAllowedDownloadUrl("ftp://ds.example/f.docx")).toBe(false);
      expect(svc.isAllowedDownloadUrl("pas-une-url")).toBe(false);
      expect(svc.isAllowedDownloadUrl("")).toBe(false);
    });
  });

  describe("verifyIncomingCallbackJwt (JWT entrant du Docs Server)", () => {
    it("mode unsigned (pas de secret) : accepte avec le body brut", () => {
      const { service: svc, jwt } = makeService({
        env: { ONLYOFFICE_JWT_SECRET: undefined },
      });
      const body = { status: 2, url: `${DS_URL}/cache/f.docx` };
      const result = svc.verifyIncomingCallbackJwt(body, undefined);
      expect(result.ok).toBe(true);
      expect(result.data).toEqual(body);
      expect(jwt.verify).not.toHaveBeenCalled();
    });

    it("secret défini + aucun token fourni : rejet", () => {
      const { service: svc } = makeService();
      const result = svc.verifyIncomingCallbackJwt({ status: 2 }, undefined);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("manquant");
    });

    it("secret défini + body.token valide : le payload vérifié fait autorité sur le body", () => {
      const verified = { status: 2, url: `${DS_URL}/cache/real.docx`, key: "k1" };
      const jwt = {
        sign: jest.fn(),
        verify: jest.fn().mockReturnValue(verified),
      };
      const { service: svc } = makeService({ jwt });
      // Un attaquant peut mettre ce qu'il veut dans le body : les champs
      // signés doivent écraser les champs forgés.
      const body = { status: 2, url: "http://evil.example/forged.docx", token: "jwt-token" };
      const result = svc.verifyIncomingCallbackJwt(body, undefined);
      expect(result.ok).toBe(true);
      expect(result.data.url).toBe(`${DS_URL}/cache/real.docx`);
      expect(jwt.verify).toHaveBeenCalledWith("jwt-token", { secret: "shared-ds-secret" });
    });

    it("secret défini + header Authorization Bearer : déballe l'enveloppe { payload }", () => {
      const jwt = {
        sign: jest.fn(),
        verify: jest
          .fn()
          .mockReturnValue({ payload: { status: 6, url: `${DS_URL}/cache/f.docx`, key: "k2" } }),
      };
      const { service: svc } = makeService({ jwt });
      const result = svc.verifyIncomingCallbackJwt({ status: 6 }, "Bearer header-token");
      expect(result.ok).toBe(true);
      expect(result.data.key).toBe("k2");
      expect(jwt.verify).toHaveBeenCalledWith("header-token", { secret: "shared-ds-secret" });
    });

    it("liaison purpose : rejette un payload de CONFIG rejoué comme callback", () => {
      // signConfig() signe { document, documentType, editorConfig } avec le même
      // secret et l'expose au navigateur. Rejoué comme token de callback, il ne
      // doit PAS être accepté (sinon status/url/key du body — contrôlés par
      // l'attaquant — pilotent dropSession et le fetch backend).
      const jwt = {
        sign: jest.fn(),
        verify: jest.fn().mockReturnValue({
          document: { key: "k", url: "u" },
          documentType: "word",
          editorConfig: { mode: "edit" },
        }),
      };
      const { service: svc } = makeService({ jwt });
      const result = svc.verifyIncomingCallbackJwt(
        { status: 2, url: "http://evil.example/x.docx", key: "victim-key", token: "config-jwt" },
        undefined,
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("configuration");
    });

    it("liaison purpose : rejette un payload signé sans `status`", () => {
      const jwt = {
        sign: jest.fn(),
        verify: jest.fn().mockReturnValue({ foo: "bar" }),
      };
      const { service: svc } = makeService({ jwt });
      const result = svc.verifyIncomingCallbackJwt({ status: 2, token: "t" }, undefined);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("status");
    });

    it("liaison purpose : rejette un save (status 2) sans `url` signée", () => {
      const jwt = {
        sign: jest.fn(),
        verify: jest.fn().mockReturnValue({ status: 2 }),
      };
      const { service: svc } = makeService({ jwt });
      const result = svc.verifyIncomingCallbackJwt(
        { status: 2, url: "http://evil.example/x.docx", token: "t" },
        undefined,
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("url");
    });

    it("secret défini + signature invalide : rejet", () => {
      const jwt = {
        sign: jest.fn(),
        verify: jest.fn().mockImplementation(() => {
          throw new Error("invalid signature");
        }),
      };
      const { service: svc } = makeService({ jwt });
      const result = svc.verifyIncomingCallbackJwt({ status: 2, token: "forged" }, undefined);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("invalid signature");
    });
  });

  describe("verifyCallbackToken / verifyFileAccessToken (purposes distincts)", () => {
    it("verifyCallbackToken accepte les purposes onlyoffice-callback ET legacy file-access", () => {
      const jwt = {
        sign: jest.fn(),
        verify: jest
          .fn()
          .mockReturnValueOnce({
            purpose: "onlyoffice-callback",
            documentVersionId: "v1",
            userId: "u1",
          })
          .mockReturnValueOnce({
            purpose: "onlyoffice-file-access",
            documentVersionId: "v1",
            userId: "u1",
          }),
      };
      const { service: svc } = makeService({ jwt });
      expect(svc.verifyCallbackToken("t1")?.documentVersionId).toBe("v1");
      expect(svc.verifyCallbackToken("t2")?.documentVersionId).toBe("v1");
    });

    it("verifyFileAccessToken refuse un token de callback (pas de download avec)", () => {
      const jwt = {
        sign: jest.fn(),
        verify: jest.fn().mockReturnValue({
          purpose: "onlyoffice-callback",
          documentVersionId: "v1",
          userId: "u1",
        }),
      };
      const { service: svc } = makeService({ jwt });
      expect(svc.verifyFileAccessToken("t")).toBeNull();
    });
  });

  describe("handleCallback (status 2/6 — sauvegarde)", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
      jest.restoreAllMocks();
    });

    /** Fabrique le mock Prisma complet du chemin nominal handleCallback. */
    function buildCallbackMocks(docOverrides: Record<string, any> = {}) {
      const currentVersion: any = {
        id: "ver-1",
        documentId: "doc-1",
        versionNumber: "1.0",
        fileUrl: "documents/doc-1/v1.0/file.docx",
        fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSizeBytes: 100,
        checksum: "old-checksum",
        changeLog: null,
        uploadedById: "user-1",
        createdAt: new Date("2026-01-01"),
      };
      const document: any = {
        id: "doc-1",
        reference: "PGS-001",
        title: "Procédure test",
        status: "DRAFT",
        deletedAt: null,
        ownerId: "user-1",
        reviewerId: null,
        approverId: null,
        currentVersionId: "ver-1",
        updatedAt: new Date("2026-01-01"),
        scanStatus: "CLEAN",
        versions: [currentVersion],
        ...docOverrides,
      };
      currentVersion.document = document;

      const txMocks = {
        documentVersion: {
          create: jest
            .fn()
            .mockImplementation(({ data }: any) =>
              Promise.resolve({ id: "ver-2", createdAt: new Date(), ...data }),
            ),
        },
        document: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        appConfig: { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        approvalInstance: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        approvalStepInstance: { updateMany: jest.fn() },
        approvalAuditLog: { createMany: jest.fn() },
        validationRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };

      const prismaMock: any = {
        documentVersion: {
          findUnique: jest.fn().mockResolvedValue(currentVersion),
          update: jest
            .fn()
            .mockImplementation(({ data }: any) => Promise.resolve({ ...currentVersion, ...data })),
        },
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "user-1", role: "MANAGER", isActive: true, deletedAt: null }),
        },
        validationRequest: { findFirst: jest.fn().mockResolvedValue(null) },
        signatureRequest: { findFirst: jest.fn().mockResolvedValue(null) },
        notification: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn().mockImplementation((fn: any) => fn(txMocks)),
      };

      const storageMock = {
        upload: jest.fn().mockResolvedValue({ fileUrl: "documents/doc-1/new-file.docx" }),
        getFilePath: jest.fn().mockReturnValue("/nonexistent/old-file.docx"),
        deleteFile: jest.fn().mockResolvedValue(undefined),
      };

      jest.spyOn(trustedDownloads, "downloadTrustedBuffer").mockResolvedValue(Buffer.from("NOUVEAU CONTENU"));

      // Téléchargement du fichier modifié depuis le Docs Server.
      // NB : slice() pour obtenir un ArrayBuffer EXACT (Buffer.from utilise un
      // pool partagé — .buffer brut contiendrait des octets parasites).
      const content = Buffer.from("NOUVEAU CONTENU");
      const exactArrayBuffer = content.buffer.slice(
        content.byteOffset,
        content.byteOffset + content.byteLength,
      );
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(exactArrayBuffer),
        text: () => Promise.resolve('{"error":0}'),
      }) as any;

      return { prismaMock, storageMock, txMocks, currentVersion, document };
    }

    it("status 1/4 : aucune action, error 0", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks();
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      expect(await svc.handleCallback({ status: 1 }, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(await svc.handleCallback({ status: 4 }, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(prismaMock.documentVersion.findUnique).not.toHaveBeenCalled();
    });

    it("anti-SSRF : URL de téléchargement hors liste blanche → error 1, pas de fetch", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks();
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const result = await svc.handleCallback(
        { status: 2, url: "http://attacker.example/payload.docx" },
        "ver-1",
        "user-1",
      );
      expect(result).toEqual({ error: 1 });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(storageMock.upload).not.toHaveBeenCalled();
    });

    it("droits révoqués entre ouverture et save → error 1, rien n'est écrit", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks({
        ownerId: "someone-else",
        reviewerId: null,
      });
      // Utilisateur simple, ni owner ni reviewer ni admin
      prismaMock.user.findUnique.mockResolvedValue({
        id: "user-1",
        role: "EMPLOYEE",
        deletedAt: null,
      });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const result = await svc.handleCallback(
        { status: 2, url: `${DS_URL}/cache/f.docx` },
        "ver-1",
        "user-1",
      );
      expect(result).toEqual({ error: 1 });
      expect(storageMock.upload).not.toHaveBeenCalled();
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
    });

    it("workflow de validation PENDING → error 1, save refusé", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks();
      prismaMock.validationRequest.findFirst.mockResolvedValue({ id: "val-1" });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const result = await svc.handleCallback(
        { status: 2, url: `${DS_URL}/cache/f.docx` },
        "ver-1",
        "user-1",
      );
      expect(result).toEqual({ error: 1 });
      expect(storageMock.upload).not.toHaveBeenCalled();
    });

    it("DRAFT : nouvelle version immuable, DRAFT/PENDING et CAS du pointeur", async () => {
      const { prismaMock, storageMock, txMocks } = buildCallbackMocks({ status: "DRAFT" });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const dropSpy = jest.spyOn(svc, "dropSession").mockResolvedValue({ ok: true, message: "" });

      const result = await svc.handleCallback(
        // La clé fournie dans le body est CONTRÔLABLE par l'appelant : elle doit
        // être IGNORÉE. Le backend recalcule toujours la clé côté serveur.
        { status: 2, url: `${DS_URL}/cache/f.docx`, key: "doc-9-forged-key" },
        "ver-1",
        "user-1",
      );

      expect(result).toEqual({ error: 0 });
      expect(storageMock.upload).toHaveBeenCalledTimes(1);
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
      expect(txMocks.documentVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ versionNumber: "1.1" }) }));
      expect(txMocks.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currentVersionId: "ver-1" }), data: { currentVersionId: "ver-2", status: "DRAFT", scanStatus: "PENDING" } }));
      expect(storageMock.deleteFile).not.toHaveBeenCalled();
      // status 2 = fin de session → purge du cache Docs Server avec la clé
      // RECALCULÉE (documentId-versionId-checksum8), jamais celle du body.
      expect(dropSpy).toHaveBeenCalledWith("doc-1-ver-1-old-chec");
    });

    it("APPROVED : bump mineur en transaction + currentVersionId + dropSession", async () => {
      const { prismaMock, storageMock, txMocks } = buildCallbackMocks({
        status: "APPROVED",
        ownerId: "user-1",
      });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const dropSpy = jest.spyOn(svc, "dropSession").mockResolvedValue({ ok: true, message: "" });

      // status 2 (fin de session) sur un doc APPROVED = bump mineur + drop.
      const result = await svc.handleCallback(
        { status: 2, url: `${DS_URL}/cache/f.docx` },
        "ver-1",
        "user-1",
      );

      expect(result).toEqual({ error: 0 });
      // Nouvelle version mineure 1.1 créée, l'ancienne row n'est pas touchée
      expect(txMocks.documentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ versionNumber: "1.1", uploadedById: "user-1" }),
        }),
      );
      expect(txMocks.document.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentVersionId: "ver-2", status: "DRAFT", scanStatus: "PENDING" } }),
      );
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
      // Fin de session (status 2) → la clé de session de l'ancienne version est droppée
      expect(dropSpy).toHaveBeenCalled();
    });

    it("force-save (status 6) : ne drop PAS la session encore ouverte", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks({ status: "DRAFT" });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const dropSpy = jest.spyOn(svc, "dropSession").mockResolvedValue({ ok: true, message: "" });

      const result = await svc.handleCallback(
        { status: 6, url: `${DS_URL}/cache/f.docx` },
        "ver-1",
        "user-1",
      );

      expect(result).toEqual({ error: 0 });
      // Un force-save signifie que la session est TOUJOURS ouverte : pas de drop.
      expect(dropSpy).not.toHaveBeenCalled();
    });

    it("session périmée : le pointeur de version a bougé (restauration) → save refusé", async () => {
      // Le token référence ver-1, mais le document pointe désormais ver-2 (une
      // restauration a créé une nouvelle version courante). Un overwrite
      // brouillon écraserait la version restaurée → on refuse.
      const { prismaMock, storageMock } = buildCallbackMocks({
        status: "DRAFT",
        currentVersionId: "ver-2",
      });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const result = await svc.handleCallback(
        { status: 2, url: `${DS_URL}/cache/f.docx` },
        "ver-1",
        "user-1",
      );
      expect(result).toEqual({ error: 1 });
      // Rien n'est écrit : ni upload, ni update de version.
      expect(storageMock.upload).not.toHaveBeenCalled();
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
    });

    it("contenu identique (même checksum) → error 0 sans écriture", async () => {
      const { prismaMock, storageMock, currentVersion } = buildCallbackMocks();
      // Checksum de la version courante = sha256 du contenu téléchargé
      const crypto = require("crypto");
      currentVersion.checksum = crypto
        .createHash("sha256")
        .update(Buffer.from("NOUVEAU CONTENU"))
        .digest("hex");
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const result = await svc.handleCallback(
        { status: 2, url: `${DS_URL}/cache/f.docx` },
        "ver-1",
        "user-1",
      );
      expect(result).toEqual({ error: 0 });
      expect(storageMock.upload).not.toHaveBeenCalled();
    });

    it("ne lance le scan que sur le nouvel identifiant immuable", async () => {
      const { prismaMock, storageMock, txMocks } = buildCallbackMocks({ status: "APPROVED" });
      txMocks.approvalInstance.findMany.mockResolvedValue([{ id: "approval-1" }]);
      const scanner = { scanDocumentVersion: jest.fn().mockResolvedValue({ status: "CLEAN", clean: true }) };
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock, scanner });
      expect(await svc.handleCallback({ status: 6, url: `${DS_URL}/cache/f.docx` }, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(scanner.scanDocumentVersion).toHaveBeenCalledWith("doc-1", "ver-2", "/nonexistent/old-file.docx");
      expect(txMocks.approvalInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
      expect(txMocks.approvalStepInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decision: "SKIPPED" }) }));
      expect(txMocks.validationRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CANCELLED" } }));
      expect(txMocks.approvalAuditLog.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ action: "APPROVAL_CANCELLED", actorId: "user-1" })] }));
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
    });

    it("conflit concurrent après téléchargement : purge seulement le nouvel upload, aucun scan", async () => {
      const { prismaMock, storageMock, txMocks } = buildCallbackMocks();
      txMocks.document.updateMany.mockResolvedValue({ count: 0 });
      const scanner = { scanDocumentVersion: jest.fn() };
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock, scanner });
      expect(await svc.handleCallback({ status: 6, url: `${DS_URL}/cache/f.docx` }, "ver-1", "user-1")).toEqual({ error: 1 });
      expect(storageMock.deleteFile).toHaveBeenCalledTimes(1);
      expect(storageMock.deleteFile).toHaveBeenCalledWith("documents/doc-1/new-file.docx");
      expect(txMocks.approvalInstance.findMany).not.toHaveBeenCalled();
      expect(scanner.scanDocumentVersion).not.toHaveBeenCalled();
    });

    it("antivirus indisponible : la sauvegarde reste PENDING et ne reçoit jamais CLEAN", async () => {
      const { prismaMock, storageMock, txMocks } = buildCallbackMocks();
      const scanner = { scanDocumentVersion: jest.fn().mockRejectedValue(new Error("offline")) };
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock, scanner });
      expect(await svc.handleCallback({ status: 6, url: `${DS_URL}/cache/f.docx` }, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(txMocks.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scanStatus: "PENDING" }) }));
      expect(txMocks.document.updateMany).toHaveBeenCalledTimes(1);
    });

    it("deux force-saves de la même session conservent les deux versions et une origine stable", async () => {
      const { prismaMock, storageMock, txMocks, document, currentVersion } = buildCallbackMocks();
      let session: any = null;
      const versions = new Map([[currentVersion.id, currentVersion]]);
      let count = 1;
      prismaMock.appConfig = { findUnique: jest.fn(async () => session) };
      txMocks.appConfig.upsert.mockImplementation(async ({ create }: any) => { session = create; });
      txMocks.documentVersion.create.mockImplementation(async ({ data }: any) => {
        const version = { id: `ver-${++count}`, ...data, document };
        versions.set(version.id, version); return version;
      });
      txMocks.document.updateMany.mockImplementation(async ({ data }: any) => { Object.assign(document, data); return { count: 1 }; });
      prismaMock.documentVersion.findUnique.mockImplementation(async ({ where }: any) => versions.get(where.id));
      const download = jest.spyOn(trustedDownloads, "downloadTrustedBuffer");
      download.mockResolvedValueOnce(Buffer.from("first edit")).mockResolvedValueOnce(Buffer.from("second edit"));
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const callback = { status: 6, url: `${DS_URL}/cache/f.docx` };
      expect(await svc.handleCallback(callback, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(await svc.handleCallback(callback, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(document.currentVersionId).toBe("ver-3");
      expect([...versions.values()].map(v => v.versionNumber)).toEqual(["1.0", "1.1", "1.2"]);
      expect(JSON.parse(session.value)).toMatchObject({ originVersionId: "ver-1", latestVersionId: "ver-3" });
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
      // A canonical upload/restore invalidates this mapping by changing the pointer.
      document.currentVersionId = "restored-version";
      expect(await svc.handleCallback(callback, "ver-1", "user-1")).toEqual({ error: 1 });
      expect(storageMock.upload).toHaveBeenCalledTimes(2);
    });

    it("chevauchement de sauvegardes : le second callback demande une nouvelle tentative", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks();
      let finish!: (value: Buffer) => void;
      jest.spyOn(trustedDownloads, "downloadTrustedBuffer").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const first = svc.handleCallback({ status: 6, url: `${DS_URL}/cache/f.docx` }, "ver-1", "user-1");
      while (!finish) await new Promise(resolve => setImmediate(resolve));
      expect(await svc.handleCallback({ status: 6, url: `${DS_URL}/cache/f.docx` }, "ver-1", "user-1")).toEqual({ error: 1 });
      finish(Buffer.from("saved"));
      expect(await first).toEqual({ error: 0 });
      expect(storageMock.upload).toHaveBeenCalledTimes(1);
    });

    it("restaurer une version approuvée crée un brouillon PENDING, recalcule le hash et invalide la session", async () => {
      const { prismaMock, storageMock, txMocks, document, currentVersion } = buildCallbackMocks({ status: "APPROVED" });
      const target = { ...currentVersion, id: "old-version", versionNumber: "0.9", fileUrl: "/storage/documents/history.docx", checksum: "untrusted-old-metadata" };
      Object.assign(prismaMock, { document: { findUnique: jest.fn().mockResolvedValue(document) } });
      prismaMock.documentVersion.findUnique.mockImplementation(async ({ where }: any) => where.id === target.id ? target : currentVersion);
      jest.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("restored bytes"));
      const scanner = { scanDocumentVersion: jest.fn().mockResolvedValue({ clean: true, status: "CLEAN" }) };
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock, scanner });
      jest.spyOn(svc, "dropSession").mockResolvedValue({ ok: true, message: "" });
      expect(await svc.restoreVersion("doc-1", target.id, { id: "user-1", role: "COLLABORATEUR" } as any)).toMatchObject({ newVersionId: "ver-2" });
      expect(txMocks.documentVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ checksum: require("crypto").createHash("sha256").update("restored bytes").digest("hex") }) }));
      expect(txMocks.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currentVersionId: "ver-1", status: "APPROVED" }), data: { currentVersionId: "ver-2", status: "DRAFT", scanStatus: "PENDING" } }));
      expect(txMocks.appConfig.deleteMany).toHaveBeenCalledWith({ where: { key: "office.active-session.doc-1" } });
      expect(txMocks.validationRequest.updateMany).toHaveBeenCalled();
      expect(scanner.scanDocumentVersion).toHaveBeenCalledWith("doc-1", "ver-2", "/nonexistent/old-file.docx");
      expect(storageMock.deleteFile).not.toHaveBeenCalled();
    });

    it("restauration concurrente : l'ancienne version et son fichier restent intacts", async () => {
      const { prismaMock, storageMock, txMocks, document, currentVersion } = buildCallbackMocks();
      const target = { ...currentVersion, id: "old-version", fileUrl: "/storage/documents/history.docx" };
      Object.assign(prismaMock, { document: { findUnique: jest.fn().mockResolvedValue(document) } });
      prismaMock.documentVersion.findUnique.mockImplementation(async ({ where }: any) => where.id === target.id ? target : currentVersion);
      jest.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("restored bytes"));
      txMocks.document.updateMany.mockResolvedValue({ count: 0 });
      const scanner = { scanDocumentVersion: jest.fn() };
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock, scanner });
      await expect(svc.restoreVersion("doc-1", target.id, { id: "user-1", role: "COLLABORATEUR" } as any)).rejects.toThrow("Le document a changé");
      expect(storageMock.deleteFile).toHaveBeenCalledWith("documents/doc-1/new-file.docx");
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
      expect(scanner.scanDocumentVersion).not.toHaveBeenCalled();
      expect(txMocks.appConfig.deleteMany).not.toHaveBeenCalled();
    });

    it("status 3/7 (erreur de save Docs Server) → loggé, error 0 (pas de retry en boucle)", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks();
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      expect(await svc.handleCallback({ status: 3 }, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(await svc.handleCallback({ status: 7 }, "ver-1", "user-1")).toEqual({ error: 0 });
    });
  });

  describe("forceSave (Ctrl+S → clé de session de l'éditeur)", () => {
    function buildForceSaveMocks() {
      const currentVersion: any = {
        id: "ver-1",
        documentId: "doc-1",
        versionNumber: "1.0",
        checksum: "new-checksum-after-save",
      };
      const document: any = {
        id: "doc-1",
        deletedAt: null,
        ownerId: "user-1",
        reviewerId: null,
        currentVersionId: null,
        versions: [currentVersion],
      };
      const prismaMock = {
        document: { findUnique: jest.fn().mockResolvedValue(document) },
        documentVersion: { findUnique: jest.fn().mockResolvedValue(currentVersion) },
      };
      return { prismaMock };
    }

    it("utilise la clé fournie par le client (évite l'échec au 2e Ctrl+S)", async () => {
      const { prismaMock } = buildForceSaveMocks();
      const { service: svc } = makeService({ prisma: prismaMock });
      const cmdSpy = jest
        .spyOn(svc as any, "callCommandService")
        .mockResolvedValue({ httpOk: true, error: 0, raw: '{"error":0}' });

      // La clé du navigateur reflète le checksum d'OUVERTURE, différent de celui
      // recalculé depuis la DB (qui a changé au premier save).
      const clientKey = "doc-1-ver-1-openchk";
      const res = await svc.forceSave("doc-1", { id: "user-1", role: "MANAGER" } as any, clientKey);

      expect(res.ok).toBe(true);
      expect(cmdSpy).toHaveBeenCalledWith(
        expect.objectContaining({ c: "forcesave", key: clientKey }),
      );
    });

    it("recalcule la clé si le client n'en fournit pas / préfixe invalide", async () => {
      const { prismaMock } = buildForceSaveMocks();
      const { service: svc } = makeService({ prisma: prismaMock });
      const cmdSpy = jest
        .spyOn(svc as any, "callCommandService")
        .mockResolvedValue({ httpOk: true, error: 0, raw: '{"error":0}' });

      // Clé d'un AUTRE document → rejetée, on retombe sur buildSessionKey.
      await svc.forceSave("doc-1", { id: "user-1", role: "MANAGER" } as any, "doc-9-ver-9-x");

      expect(cmdSpy).toHaveBeenCalledWith(expect.objectContaining({ key: "doc-1-ver-1-new-chec" }));
    });
  });

  describe("getAvailability (disponibilité dynamique + cache 30s)", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("disponible quand le Docs Server répond true, puis servi depuis le cache", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("true"),
      });
      global.fetch = fetchMock as any;
      const { service: svc } = makeService();

      expect(await svc.getAvailability()).toEqual({ available: true });
      expect(await svc.getAvailability()).toEqual({ available: true });
      // 2e appel servi par le cache 30s → un seul healthcheck
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("indisponible avec la raison quand le healthcheck échoue", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as any;
      const { service: svc } = makeService();
      const result = await svc.getAvailability();
      expect(result.available).toBe(false);
      expect(result.reason).toContain("ECONNREFUSED");
    });

    it("indisponible (sans appel réseau) si le secret manque et que l'unsigned n'est pas autorisé", async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as any;
      const { service: svc } = makeService({
        env: { ONLYOFFICE_JWT_SECRET: undefined, ONLYOFFICE_ALLOW_UNSIGNED: undefined },
      });
      const result = await svc.getAvailability();
      expect(result.available).toBe(false);
      expect(result.reason).toContain("ONLYOFFICE_JWT_SECRET");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("assertCanReadDocument (contrôle d'accès en lecture)", () => {
    /** Prisma minimal pour le chemin « aucune permission explicite ». */
    function noPermissionPrisma() {
      return {
        user: { findUnique: jest.fn().mockResolvedValue({ departmentId: null }) },
        userDepartment: { findMany: jest.fn().mockResolvedValue([]) },
        documentPermission: { findFirst: jest.fn().mockResolvedValue(null) },
      };
    }

    const secretDoc = {
      id: "doc-1",
      ownerId: "owner-1",
      reviewerId: null,
      approverId: null,
      status: "APPROVED",
      classification: "SECRET",
      category: "PROCEDURE",
      isPublic: false,
    };

    it("refuse un COLLABORATEUR sur un document SECRET (fuite de confidentialité)", async () => {
      const { service: svc } = makeService({ prisma: noPermissionPrisma() });
      await expect(
        svc.assertCanReadDocument(secretDoc, {
          id: "u-1",
          email: "u@omnitech.fr",
          role: "COLLABORATEUR" as any,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("refuse un COLLABORATEUR sur un document INTERNE non approuvé", async () => {
      const { service: svc } = makeService({ prisma: noPermissionPrisma() });
      await expect(
        svc.assertCanReadDocument(
          { ...secretDoc, classification: "INTERNE", status: "DRAFT" },
          { id: "u-1", email: "u@omnitech.fr", role: "COLLABORATEUR" as any },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("refuse un PRESTATAIRE sur un document non contractuel", async () => {
      const { service: svc } = makeService({ prisma: noPermissionPrisma() });
      await expect(
        svc.assertCanReadDocument(
          { ...secretDoc, classification: "INTERNE" },
          { id: "u-1", email: "u@omnitech.fr", role: "PRESTATAIRE" as any },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("autorise le propriétaire, le relecteur et l'approbateur même en SECRET", async () => {
      const { service: svc } = makeService({ prisma: noPermissionPrisma() });
      const doc = { ...secretDoc, reviewerId: "rev-1", approverId: "app-1" };
      await expect(
        svc.assertCanReadDocument(doc, {
          id: "owner-1",
          email: "o@omnitech.fr",
          role: "COLLABORATEUR" as any,
        }),
      ).resolves.toBeUndefined();
      await expect(
        svc.assertCanReadDocument(doc, {
          id: "rev-1",
          email: "r@omnitech.fr",
          role: "REVIEWER" as any,
        }),
      ).resolves.toBeUndefined();
      await expect(
        svc.assertCanReadDocument(doc, {
          id: "app-1",
          email: "a@omnitech.fr",
          role: "REVIEWER" as any,
        }),
      ).resolves.toBeUndefined();
    });

    it("autorise ADMIN sans requête de permission explicite", async () => {
      const prismaMock = noPermissionPrisma();
      const { service: svc } = makeService({ prisma: prismaMock });
      await expect(
        svc.assertCanReadDocument(secretDoc, {
          id: "adm-1",
          email: "adm@omnitech.fr",
          role: "ADMIN" as any,
        }),
      ).resolves.toBeUndefined();
      expect(prismaMock.documentPermission.findFirst).not.toHaveBeenCalled();
    });

    it("autorise via une permission GED explicite non expirée", async () => {
      const prismaMock = noPermissionPrisma();
      prismaMock.documentPermission.findFirst.mockResolvedValue({ id: "perm-1" });
      const { service: svc } = makeService({ prisma: prismaMock });
      await expect(
        svc.assertCanReadDocument(secretDoc, {
          id: "u-1",
          email: "u@omnitech.fr",
          role: "COLLABORATEUR" as any,
        }),
      ).resolves.toBeUndefined();
    });

    it("buildEditorConfig refuse un document hors périmètre de lecture", async () => {
      const prismaMock: any = {
        ...noPermissionPrisma(),
        document: {
          findUnique: jest.fn().mockResolvedValue({
            ...secretDoc,
            deletedAt: null,
            currentVersionId: "ver-1",
            title: "Secret",
            reference: "SEC-001",
            versions: [
              {
                id: "ver-1",
                documentId: "doc-1",
                versionNumber: "1.0",
                fileUrl: "documents/doc-1/f.docx",
                checksum: "abcdef0123",
                createdAt: new Date(),
              },
            ],
          }),
        },
        documentVersion: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const { service: svc } = makeService({ prisma: prismaMock });
      await expect(
        svc.buildEditorConfig("doc-1", {
          id: "u-1",
          email: "u@omnitech.fr",
          role: "COLLABORATEUR" as any,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getHistory / getHistoryVersionData (ordinaux DocsAPI)", () => {
    function historyPrisma() {
      const versions = [
        {
          id: "ver-1",
          documentId: "doc-1",
          versionNumber: "1.0",
          fileUrl: "documents/doc-1/a.docx",
          checksum: "aaaaaaaa1111",
          changeLog: "Création",
          uploadedById: "user-1",
          createdAt: new Date("2026-01-01T08:00:00Z"),
          uploadedBy: {
            id: "user-1",
            firstName: "Jean",
            lastName: "Morin",
            email: "jm@omnitech.fr",
          },
        },
        {
          id: "ver-2",
          documentId: "doc-1",
          versionNumber: "1.1",
          fileUrl: "documents/doc-1/b.docx",
          checksum: "bbbbbbbb2222",
          changeLog: "Correction",
          uploadedById: "user-1",
          createdAt: new Date("2026-02-01T09:30:00Z"),
          uploadedBy: {
            id: "user-1",
            firstName: "Jean",
            lastName: "Morin",
            email: "jm@omnitech.fr",
          },
        },
      ];
      return {
        versions,
        prismaMock: {
          user: { findUnique: jest.fn().mockResolvedValue({ departmentId: null }) },
          userDepartment: { findMany: jest.fn().mockResolvedValue([]) },
          documentPermission: { findFirst: jest.fn().mockResolvedValue(null) },
          document: {
            findUnique: jest.fn().mockResolvedValue({
              id: "doc-1",
              reference: "PGS-001",
              deletedAt: null,
              ownerId: "user-1",
              reviewerId: null,
              approverId: null,
              status: "DRAFT",
              classification: "INTERNE",
              category: "PROCEDURE",
              isPublic: false,
              currentVersionId: "ver-1",
              versions,
            }),
          },
          documentVersion: { findMany: jest.fn().mockResolvedValue(versions) },
        },
      };
    }

    const owner = { id: "user-1", email: "jm@omnitech.fr", role: "COLLABORATEUR" as any };

    it("renvoie des ordinaux entiers + le numéro métier, currentVersion suit currentVersionId", async () => {
      const { prismaMock } = historyPrisma();
      const { service: svc } = makeService({ prisma: prismaMock });
      const result = await svc.getHistory("doc-1", owner);

      expect(result.currentVersion).toBe(1); // currentVersionId = ver-1
      expect(result.history.map((h: any) => h.version)).toEqual([1, 2]);
      expect(result.history[0].created).toBe("2026-01-01 08:00:00");
      expect(result.history[0].user.name).toBe("Jean Morin");
      // La clé d'historique est la clé de session stable de CETTE version
      expect(result.history[1].key).toBe("history-doc-1-ver-2-bbbbbbbb");
      expect(result.versions).toEqual([
        { version: 1, versionId: "ver-1", versionNumber: "1.0", changeLog: "Création" },
        { version: 2, versionId: "ver-2", versionNumber: "1.1", changeLog: "Correction" },
      ]);
    });

    it("getHistoryVersionData renvoie le MÊME ordinal que getHistory + une URL tokenisée", async () => {
      const { prismaMock } = historyPrisma();
      const jwt = { sign: jest.fn().mockReturnValue("signed-token"), verify: jest.fn() };
      const { service: svc } = makeService({ prisma: prismaMock, jwt });
      const data = await svc.getHistoryVersionData("doc-1", "ver-2", owner);

      expect(data.version).toBe(2);
      expect(data.key).toBe("history-doc-1-ver-2-bbbbbbbb");
      expect(data.url).toContain("/api/v1/office/file?token=");
      expect(data.fileType).toBe("docx");
      // Secret DS défini → payload signé pour setHistoryData
      expect(data.token).toBe("signed-token");
    });

    it("getHistoryVersionData refuse une version d'un autre document", async () => {
      const { prismaMock } = historyPrisma();
      const { service: svc } = makeService({ prisma: prismaMock });
      await expect(svc.getHistoryVersionData("doc-1", "ver-999", owner)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("getHistory refuse un utilisateur hors périmètre de lecture", async () => {
      const { prismaMock } = historyPrisma();
      prismaMock.document.findUnique.mockResolvedValue({
        id: "doc-1",
        reference: "PGS-001",
        deletedAt: null,
        ownerId: "someone-else",
        reviewerId: null,
        approverId: null,
        status: "DRAFT",
        classification: "CONFIDENTIEL",
        category: "PROCEDURE",
        isPublic: false,
        currentVersionId: "ver-1",
        versions: [],
      });
      const { service: svc } = makeService({ prisma: prismaMock });
      await expect(
        svc.getHistory("doc-1", {
          id: "u-2",
          email: "x@omnitech.fr",
          role: "COLLABORATEUR" as any,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("fichier tokenisé : droits et antivirus vérifiés au téléchargement", () => {
    function fileMocks() {
      const version = { id: "ver-1", documentId: "doc-1", fileUrl: "/storage/documents/a.docx", fileType: "application/octet-stream" };
      const document = { id: "doc-1", ownerId: "user-1", classification: "SECRET", status: "DRAFT", currentVersionId: "ver-1", scanStatus: "CLEAN", deletedAt: null };
      const account = { id: "user-1", role: "COLLABORATEUR", isActive: true, deletedAt: null };
      const prisma = { documentVersion: { findUnique: jest.fn().mockResolvedValue(version) }, document: { findUnique: jest.fn().mockResolvedValue(document) }, user: { findUnique: jest.fn().mockResolvedValue(account) } };
      const storage = { getFileStream: jest.fn().mockReturnValue("stream"), getFilePath: jest.fn().mockReturnValue("/immutable/a.docx") };
      const scanner = { scanFile: jest.fn().mockResolvedValue({ clean: true, status: "CLEAN" }) };
      const { service } = makeService({ prisma, storage, scanner });
      return { service, version, document, account, prisma, storage, scanner };
    }
    it("la version courante CLEAN est accessible au propriétaire actif", async () => {
      const { service, storage, scanner } = fileMocks();
      await service.getFileStreamForOnlyOffice("ver-1", "user-1", "doc-1");
      expect(storage.getFileStream).toHaveBeenCalledTimes(1);
      expect(scanner.scanFile).not.toHaveBeenCalled();
    });
    it.each(["PENDING", "ERROR", "INFECTED"])("refuse le fichier courant %s même avec un token signé", async scanStatus => {
      const { service, document, storage } = fileMocks(); document.scanStatus = scanStatus;
      await expect(service.getFileStreamForOnlyOffice("ver-1", "user-1", "doc-1")).rejects.toThrow(ForbiddenException);
      expect(storage.getFileStream).not.toHaveBeenCalled();
    });
    it.each(["deleted", "inactive", "wrong-document"])("refuse un token précédemment émis : %s", async mode => {
      const { service, document, account, storage } = fileMocks();
      if (mode === "deleted") (document as any).deletedAt = new Date();
      if (mode === "inactive") account.isActive = false;
      await expect(service.getFileStreamForOnlyOffice("ver-1", "user-1", mode === "wrong-document" ? "other" : "doc-1")).rejects.toThrow(ForbiddenException);
      expect(storage.getFileStream).not.toHaveBeenCalled();
    });
    it("refuse après révocation des droits sans utiliser un faux rôle administrateur", async () => {
      const { service, document, prisma, storage } = fileMocks(); document.ownerId = "other";
      Object.assign(prisma, { userDepartment: { findMany: jest.fn().mockResolvedValue([]) }, documentPermission: { findFirst: jest.fn().mockResolvedValue(null) } });
      await expect(service.getFileStreamForOnlyOffice("ver-1", "user-1", "doc-1")).rejects.toThrow(ForbiddenException);
      expect(storage.getFileStream).not.toHaveBeenCalled();
    });
    it("ne réutilise jamais le statut antivirus courant pour un historique", async () => {
      const { service, document, scanner, storage } = fileMocks(); document.currentVersionId = "new-version";
      scanner.scanFile.mockResolvedValueOnce({ clean: false, status: "ERROR" });
      await expect(service.getFileStreamForOnlyOffice("ver-1", "user-1", "doc-1")).rejects.toThrow(ForbiddenException);
      expect(storage.getFileStream).not.toHaveBeenCalled();
      await service.getFileStreamForOnlyOffice("ver-1", "user-1", "doc-1");
      expect(scanner.scanFile).toHaveBeenCalledTimes(2);
      expect(storage.getFileStream).toHaveBeenCalledTimes(1);
    });
  });

  describe("healthCheck", () => {
    it("should return ok:false when service is disabled", async () => {
      delete process.env.ONLYOFFICE_ENABLED;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      const result = await service.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.message).toContain("désactivé");
    });

    it("should return ok:false when fetch fails", async () => {
      process.env.ONLYOFFICE_ENABLED = "true";
      process.env.ONLYOFFICE_JWT_SECRET = "test-secret";
      process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = "http://localhost:99999";

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficeService,
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        ],
      }).compile();

      service = module.get<OfficeService>(OfficeService);
      const result = await service.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });
});
