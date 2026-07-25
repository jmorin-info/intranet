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
    const storageMock = opts?.storage || {};
    const jwtMock = opts?.jwt || { sign: jest.fn().mockReturnValue("signed"), verify: jest.fn() };
    const svc = new OfficeService(prismaMock, storageMock, jwtMock);
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
        verify: jest.fn().mockReturnValue({ payload: { status: 6, key: "k2" } }),
      };
      const { service: svc } = makeService({ jwt });
      const result = svc.verifyIncomingCallbackJwt({ status: 6 }, "Bearer header-token");
      expect(result.ok).toBe(true);
      expect(result.data.key).toBe("k2");
      expect(jwt.verify).toHaveBeenCalledWith("header-token", { secret: "shared-ds-secret" });
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
        document: { update: jest.fn().mockResolvedValue(document) },
      };

      const prismaMock = {
        documentVersion: {
          findUnique: jest.fn().mockResolvedValue(currentVersion),
          update: jest
            .fn()
            .mockImplementation(({ data }: any) => Promise.resolve({ ...currentVersion, ...data })),
        },
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "user-1", role: "MANAGER", deletedAt: null }),
        },
        validationRequest: { findFirst: jest.fn().mockResolvedValue(null) },
        signatureRequest: { findFirst: jest.fn().mockResolvedValue(null) },
        notification: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn().mockImplementation((fn: any) => fn(txMocks)),
      };

      const storageMock = {
        upload: jest.fn().mockResolvedValue({ fileUrl: "documents/doc-1/new-file.docx" }),
        getFilePath: jest.fn().mockReturnValue("/nonexistent/old-file.docx"),
      };

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

    it("DRAFT : overwrite de la version courante (update, pas de nouvelle row)", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks({ status: "DRAFT" });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const dropSpy = jest.spyOn(svc, "dropSession").mockResolvedValue({ ok: true, message: "" });

      const result = await svc.handleCallback(
        { status: 2, url: `${DS_URL}/cache/f.docx`, key: "doc-1-ver-1-oldcheck" },
        "ver-1",
        "user-1",
      );

      expect(result).toEqual({ error: 0 });
      expect(storageMock.upload).toHaveBeenCalledTimes(1);
      expect(prismaMock.documentVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ver-1" } }),
      );
      // Pas de bump : aucune transaction de création de version
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      // status 2 = fin de session → purge du cache Docs Server (clé du callback)
      expect(dropSpy).toHaveBeenCalledWith("doc-1-ver-1-oldcheck");
    });

    it("APPROVED : bump mineur en transaction + currentVersionId + dropSession", async () => {
      const { prismaMock, storageMock, txMocks } = buildCallbackMocks({
        status: "APPROVED",
        ownerId: "user-1",
      });
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      const dropSpy = jest.spyOn(svc, "dropSession").mockResolvedValue({ ok: true, message: "" });

      const result = await svc.handleCallback(
        { status: 6, url: `${DS_URL}/cache/f.docx` },
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
      expect(txMocks.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentVersionId: "ver-2" } }),
      );
      expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
      // Bump → la clé de session de l'ancienne version est droppée
      expect(dropSpy).toHaveBeenCalled();
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

    it("status 3/7 (erreur de save Docs Server) → loggé, error 0 (pas de retry en boucle)", async () => {
      const { prismaMock, storageMock } = buildCallbackMocks();
      const { service: svc } = makeService({ prisma: prismaMock, storage: storageMock });
      expect(await svc.handleCallback({ status: 3 }, "ver-1", "user-1")).toEqual({ error: 0 });
      expect(await svc.handleCallback({ status: 7 }, "ver-1", "user-1")).toEqual({ error: 0 });
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
      expect(result.history[1].key).toBe("doc-1-ver-2-bbbbbbbb");
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
      expect(data.key).toBe("doc-1-ver-2-bbbbbbbb");
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
