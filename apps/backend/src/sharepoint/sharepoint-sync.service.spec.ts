import { Test, TestingModule } from "@nestjs/testing";
import axios from "axios";
import { SharePointSyncService } from "./sharepoint-sync.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MsDriveItem } from "./types";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Tests unitaires SharePointSyncService.
 *
 * Pattern aligne sur wiki-tag.service.spec.ts (Nest TestingModule + Prisma mocke
 * avec jest.fn) et outlook-sync.service.spec.ts (jest.mock("axios") pour
 * intercepter les appels Graph / AAD).
 *
 * NB : le service utilise axios (pas global.fetch) et son
 * mapDriveItemToDocument se limite aux pointeurs externes — il n'y a pas de
 * mapping PATH_TO_CATEGORY ni de classification dans la version actuelle du
 * code. Les tests respectent strictement la surface reelle du service.
 */
describe("SharePointSyncService", () => {
  let service: SharePointSyncService;
  let prisma: any;
  let audit: { log: jest.Mock };

  // Snapshot des envs qu'on touche, pour pouvoir les restaurer apres chaque test.
  const ENV_KEYS = [
    "GED_SHAREPOINT_SYNC_ENABLED",
    "SP_TENANT_ID",
    "SP_CLIENT_ID",
    "SP_CLIENT_SECRET",
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  });

  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  beforeEach(async () => {
    process.env.GED_SHAREPOINT_SYNC_ENABLED = "true";
    process.env.SP_TENANT_ID = "tenant-fake";
    process.env.SP_CLIENT_ID = "client-fake";
    process.env.SP_CLIENT_SECRET = "secret-fake";

    prisma = {
      document: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharePointSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(SharePointSyncService);

    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
  });

  // -- isEnabled / isConfigured ------------------------------------------

  describe("isEnabled / isConfigured", () => {
    it("isEnabled is true when GED_SHAREPOINT_SYNC_ENABLED=true", () => {
      expect(service.isEnabled()).toBe(true);
    });

    it("isEnabled is false when flag is not 'true'", () => {
      process.env.GED_SHAREPOINT_SYNC_ENABLED = "false";
      expect(service.isEnabled()).toBe(false);
    });

    it("isConfigured is true when all SP_* envs are present", () => {
      expect(service.isConfigured()).toBe(true);
    });

    it("isConfigured is false when SP_CLIENT_SECRET is missing", () => {
      delete process.env.SP_CLIENT_SECRET;
      expect(service.isConfigured()).toBe(false);
    });
  });

  // -- getAppAccessToken --------------------------------------------------

  describe("getAppAccessToken", () => {
    it("calls AAD token endpoint and returns the access_token (first call)", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: "tok-1", expires_in: 3600 },
      });

      const token = await service.getAppAccessToken();

      expect(token).toBe("tok-1");
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, body] = mockedAxios.post.mock.calls[0];
      expect(url).toBe("https://login.microsoftonline.com/tenant-fake/oauth2/v2.0/token");
      // body est une URLSearchParams stringifiee
      expect(typeof body).toBe("string");
      expect(body).toContain("client_id=client-fake");
      expect(body).toContain("grant_type=client_credentials");
      expect(body).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    });

    it("reuses the cached token on a subsequent call (no refetch)", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: "tok-cached", expires_in: 3600 },
      });

      const t1 = await service.getAppAccessToken();
      const t2 = await service.getAppAccessToken();

      expect(t1).toBe("tok-cached");
      expect(t2).toBe("tok-cached");
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("refetches a new token when the cached one is near expiry", async () => {
      mockedAxios.post
        .mockResolvedValueOnce({
          data: { access_token: "tok-old", expires_in: 60 }, // < marge de 10min
        })
        .mockResolvedValueOnce({
          data: { access_token: "tok-fresh", expires_in: 3600 },
        });

      const t1 = await service.getAppAccessToken();
      const t2 = await service.getAppAccessToken();

      expect(t1).toBe("tok-old");
      expect(t2).toBe("tok-fresh");
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it("throws when feature flag is disabled", async () => {
      process.env.GED_SHAREPOINT_SYNC_ENABLED = "false";
      await expect(service.getAppAccessToken()).rejects.toThrow(/feature flag is disabled/i);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("throws when AAD credentials are missing", async () => {
      delete process.env.SP_TENANT_ID;
      await expect(service.getAppAccessToken()).rejects.toThrow(/not configured/i);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("propagates a clear error when AAD responds 401", async () => {
      const err: any = new Error("Request failed");
      err.response = {
        status: 401,
        data: { error_description: "AADSTS70011: invalid scope" },
      };
      mockedAxios.post.mockRejectedValueOnce(err);

      // Une seule invocation : on capture l'erreur et on verifie les deux
      // contraintes sur le meme message (le mock n'est rejete qu'une fois).
      await expect(service.getAppAccessToken()).rejects.toThrow(
        /app token request failed: AADSTS70011: invalid scope/i,
      );
    });
  });

  // -- listLibraryFiles ---------------------------------------------------

  describe("listLibraryFiles", () => {
    beforeEach(() => {
      // Pre-populate token cache to avoid noise.
      mockedAxios.post.mockResolvedValue({
        data: { access_token: "tok-graph", expires_in: 3600 },
      });
    });

    it("returns [] when feature flag is off", async () => {
      process.env.GED_SHAREPOINT_SYNC_ENABLED = "false";
      const res = await service.listLibraryFiles("site-1", "drive-1");
      expect(res).toEqual([]);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("returns the mapped items when Graph responds with 3 items", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            { id: "a", name: "a.docx", file: {} },
            { id: "b", name: "b.docx", file: {} },
            { id: "c", name: "c.pdf", file: {} },
          ],
        },
      });

      const items = await service.listLibraryFiles("site-1", "drive-1");

      expect(items).toHaveLength(3);
      expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const url = mockedAxios.get.mock.calls[0][0];
      expect(url).toBe("https://graph.microsoft.com/v1.0/drives/drive-1/root/children");
      // Header Authorization Bearer
      const cfg = mockedAxios.get.mock.calls[0][1];
      expect(cfg?.headers?.Authorization).toBe("Bearer tok-graph");
    });

    it("returns [] when Graph responds with an empty list", async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { value: [] } });
      const items = await service.listLibraryFiles("site-1", "drive-1");
      expect(items).toEqual([]);
    });

    it("follows @odata.nextLink pagination across multiple pages", async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            value: [{ id: "1" }, { id: "2" }],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/_next/page2",
          },
        })
        .mockResolvedValueOnce({
          data: {
            value: [{ id: "3" }],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/_next/page3",
          },
        })
        .mockResolvedValueOnce({
          data: { value: [{ id: "4" }] },
        });

      const items = await service.listLibraryFiles("site-1", "drive-1");

      expect(items.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
      expect(mockedAxios.get.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/_next/page2");
      expect(mockedAxios.get.mock.calls[2][0]).toBe("https://graph.microsoft.com/v1.0/_next/page3");
    });

    it("propagates a clear error when Graph fails", async () => {
      const err: any = new Error("Request failed");
      err.response = {
        status: 403,
        data: { error: { message: "Forbidden" } },
      };
      mockedAxios.get.mockRejectedValueOnce(err);

      await expect(service.listLibraryFiles("site-1", "drive-1")).rejects.toThrow(
        /listChildren failed: Forbidden/,
      );
    });
  });

  // -- mapDriveItemToDocument --------------------------------------------

  describe("mapDriveItemToDocument", () => {
    it("maps an item using eTag when present", () => {
      const item: MsDriveItem = {
        id: "drive-item-1",
        name: "policy.docx",
        webUrl: "https://contoso.sharepoint.com/x/policy.docx",
        eTag: '"etag-1"',
        cTag: '"ctag-1"',
        file: {},
      };

      const patch = service.mapDriveItemToDocument(item);

      expect(patch.externalStorageProvider).toBe("sharepoint");
      expect(patch.externalStorageItemId).toBe("drive-item-1");
      expect(patch.externalStorageUrl).toBe("https://contoso.sharepoint.com/x/policy.docx");
      expect(patch.externalEtag).toBe('"etag-1"');
      expect(patch.externalLastSyncAt).toBeInstanceOf(Date);
    });

    it("falls back to cTag when eTag is missing", () => {
      const item: MsDriveItem = {
        id: "drive-item-2",
        cTag: '"ctag-only"',
        file: {},
      };

      const patch = service.mapDriveItemToDocument(item);

      expect(patch.externalEtag).toBe('"ctag-only"');
    });

    it("uses nulls when eTag, cTag and webUrl are absent", () => {
      const item: MsDriveItem = { id: "drive-item-3", file: {} };

      const patch = service.mapDriveItemToDocument(item);

      expect(patch.externalEtag).toBeNull();
      expect(patch.externalStorageUrl).toBeNull();
    });
  });

  // -- syncLibrary --------------------------------------------------------

  describe("syncLibrary", () => {
    beforeEach(() => {
      // Token endpoint
      mockedAxios.post.mockResolvedValue({
        data: { access_token: "tok-sync", expires_in: 3600 },
      });
    });

    it("returns an empty structured result when feature flag is off (no Graph call)", async () => {
      process.env.GED_SHAREPOINT_SYNC_ENABLED = "false";

      const res = await service.syncLibrary("site-1", "drive-1");

      expect(res).toMatchObject({
        siteId: "site-1",
        libraryId: "drive-1",
        unmapped: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        total: 0,
      });
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it("throws when not configured", async () => {
      delete process.env.SP_CLIENT_SECRET;
      await expect(service.syncLibrary("site-1", "drive-1")).rejects.toThrow(/not configured/i);
    });

    it("counts an existing Document with a changed etag as updated", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            {
              id: "item-1",
              name: "doc1.docx",
              eTag: '"new-etag"',
              file: {},
              webUrl: "https://sp/doc1",
            },
          ],
        },
      });
      prisma.document.findFirst.mockResolvedValueOnce({
        id: "doc-uuid-1",
        externalEtag: '"old-etag"',
      });
      prisma.document.update.mockResolvedValueOnce({ id: "doc-uuid-1" });

      const res = await service.syncLibrary("site-1", "drive-1", {
        triggeredBy: "user-42",
      });

      expect(res.updated).toBe(1);
      expect(res.skipped).toBe(0);
      expect(res.unmapped).toBe(0);
      expect(res.errors).toEqual([]);
      expect(res.total).toBe(1);

      // Verifie l'appel update avec le patch externe
      expect(prisma.document.update).toHaveBeenCalledTimes(1);
      const updateArg = prisma.document.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: "doc-uuid-1" });
      expect(updateArg.data.externalStorageProvider).toBe("sharepoint");
      expect(updateArg.data.externalEtag).toBe('"new-etag"');
      expect(updateArg.data.externalStorageUrl).toBe("https://sp/doc1");

      // Audit fin de sync
      expect(audit.log).toHaveBeenCalledTimes(1);
      const auditArg = audit.log.mock.calls[0][0];
      expect(auditArg).toMatchObject({
        userId: "user-42",
        action: "SHAREPOINT_SYNC",
        resourceType: "SharePointLibrary",
        resourceId: "drive-1",
        severity: "INFO",
      });
      expect(auditArg.metadata.counts).toEqual({
        total: 1,
        updated: 1,
        skipped: 0,
        unmapped: 0,
        errors: 0,
      });
    });

    it("skips an existing Document when the etag is unchanged", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            {
              id: "item-2",
              name: "doc2.docx",
              eTag: '"same"',
              file: {},
            },
          ],
        },
      });
      prisma.document.findFirst.mockResolvedValueOnce({
        id: "doc-uuid-2",
        externalEtag: '"same"',
      });

      const res = await service.syncLibrary("site-1", "drive-1");

      expect(res.skipped).toBe(1);
      expect(res.updated).toBe(0);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it("counts a driveItem with no matching Document as unmapped (no creation)", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            {
              id: "orphan-1",
              name: "orphan.docx",
              eTag: '"x"',
              file: {},
            },
          ],
        },
      });
      prisma.document.findFirst.mockResolvedValueOnce(null);

      const res = await service.syncLibrary("site-1", "drive-1");

      expect(res.unmapped).toBe(1);
      expect(res.updated).toBe(0);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it("skips folders, deleted items, and items without file facet", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            { id: "folder-1", name: "Politiques", folder: { childCount: 3 } },
            {
              id: "deleted-1",
              name: "gone.docx",
              file: {},
              deleted: { state: "deleted" },
            },
            { id: "weird-1", name: "neither.docx" }, // ni file ni folder
          ],
        },
      });

      const res = await service.syncLibrary("site-1", "drive-1");

      expect(res.skipped).toBe(3);
      expect(res.updated).toBe(0);
      expect(res.unmapped).toBe(0);
      expect(res.total).toBe(3);
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
    });

    it("handles a mix: updated + skipped + unmapped + folder ignored", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            { id: "f1", name: "doc1.docx", eTag: '"new"', file: {} },
            { id: "f2", name: "doc2.docx", eTag: '"same"', file: {} },
            { id: "f3", name: "orphan.docx", eTag: '"x"', file: {} },
            { id: "f4", name: "Sub", folder: { childCount: 1 } },
          ],
        },
      });
      prisma.document.findFirst
        .mockResolvedValueOnce({ id: "d1", externalEtag: '"old"' })
        .mockResolvedValueOnce({ id: "d2", externalEtag: '"same"' })
        .mockResolvedValueOnce(null);
      prisma.document.update.mockResolvedValue({ id: "d1" });

      const res = await service.syncLibrary("site-1", "drive-1");

      expect(res.updated).toBe(1);
      expect(res.skipped).toBe(2); // doc2 same-etag + folder
      expect(res.unmapped).toBe(1);
      expect(res.errors).toEqual([]);
      expect(res.total).toBe(4);
    });

    it("records a per-item error without aborting the batch", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            { id: "f1", name: "boom.docx", eTag: '"x"', file: {} },
            { id: "f2", name: "ok.docx", eTag: '"y"', file: {} },
          ],
        },
      });
      prisma.document.findFirst
        .mockRejectedValueOnce(new Error("db boom"))
        .mockResolvedValueOnce({ id: "d2", externalEtag: '"old"' });
      prisma.document.update.mockResolvedValue({ id: "d2" });

      const res = await service.syncLibrary("site-1", "drive-1");

      expect(res.errors).toEqual([{ itemId: "f1", message: "db boom" }]);
      expect(res.updated).toBe(1);
      expect(res.total).toBe(2);

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log.mock.calls[0][0].severity).toBe("WARN");
    });

    it("audits a failed sync (Graph error) and re-throws", async () => {
      const err: any = new Error("Request failed");
      err.response = {
        status: 500,
        data: { error: { message: "ServerBlewUp" } },
      };
      mockedAxios.get.mockRejectedValueOnce(err);

      await expect(
        service.syncLibrary("site-1", "drive-1", { triggeredBy: "user-7" }),
      ).rejects.toThrow(/listChildren failed/);

      expect(audit.log).toHaveBeenCalledTimes(1);
      const auditArg = audit.log.mock.calls[0][0];
      expect(auditArg).toMatchObject({
        userId: "user-7",
        action: "SHAREPOINT_SYNC",
        resourceType: "SharePointLibrary",
        resourceId: "drive-1",
        severity: "WARN",
      });
      expect(auditArg.metadata.status).toBe("failed");
      expect(auditArg.metadata.error).toMatch(/listChildren failed/);
    });

    it("respects opts.maxItems by truncating the batch before processing", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            { id: "a", file: {}, eTag: '"1"' },
            { id: "b", file: {}, eTag: '"2"' },
            { id: "c", file: {}, eTag: '"3"' },
          ],
        },
      });
      prisma.document.findFirst.mockResolvedValue(null);

      const res = await service.syncLibrary("site-1", "drive-1", {
        maxItems: 2,
      });

      expect(res.total).toBe(2);
      expect(res.unmapped).toBe(2);
    });
  });

  // -- getStatus ----------------------------------------------------------

  describe("getStatus", () => {
    it("returns enabled/configured flags + lastSyncAt from DB", async () => {
      const lastSync = new Date("2026-06-10T10:00:00.000Z");
      prisma.document.findFirst.mockResolvedValueOnce({
        externalLastSyncAt: lastSync,
      });

      const status = await service.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.configured).toBe(true);
      expect(status.lastSyncAt).toBe(lastSync.toISOString());
      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: {
          externalStorageProvider: "sharepoint",
          externalLastSyncAt: { not: null },
        },
        orderBy: { externalLastSyncAt: "desc" },
        select: { externalLastSyncAt: true },
      });
    });

    it("returns lastSyncAt=null when there is no synced Document", async () => {
      prisma.document.findFirst.mockResolvedValueOnce(null);
      const status = await service.getStatus();
      expect(status.lastSyncAt).toBeNull();
    });

    it("does not hit DB when feature flag is off", async () => {
      process.env.GED_SHAREPOINT_SYNC_ENABLED = "false";
      const status = await service.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.lastSyncAt).toBeNull();
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
    });
  });
});
