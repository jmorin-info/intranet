import { Test, TestingModule } from "@nestjs/testing";
import axios from "axios";
import { OutlookSyncService } from "./outlook-sync.service";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { AuditService } from "../audit/audit.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("OutlookSyncService", () => {
  let service: OutlookSyncService;
  let prisma: any;
  let crypto: CryptoService;

  beforeEach(async () => {
    process.env.CRYPTO_SECRET =
      "test-crypto-secret-32-bytes-minimum-for-aes256-gcm-test";
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "test-ms-client";
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "test-ms-secret";
    process.env.APP_URL = "https://intranet.test";

    prisma = {
      calendarConnection: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      calendarEvent: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookSyncService,
        CryptoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(OutlookSyncService);
    crypto = module.get(CryptoService);

    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
    mockedAxios.delete.mockReset();
    mockedAxios.patch.mockReset();
  });

  describe("buildAuthorizeUrl", () => {
    it("returns a Microsoft consent URL with required scopes", () => {
      const url = service.buildAuthorizeUrl("state-12345");
      expect(url).toContain("login.microsoftonline.com");
      expect(url).toContain("scope=offline_access+Calendars.ReadWrite");
      expect(url).toContain("state=state-12345");
    });
  });

  describe("handleCallback", () => {
    it("exchanges code for tokens and stores encrypted connection", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: "ms-access",
          refresh_token: "ms-refresh",
          expires_in: 3600,
        },
      });
      prisma.calendarConnection.findUnique.mockResolvedValue(null);
      prisma.calendarConnection.create.mockResolvedValue({
        id: "conn-2",
        calendarId: null,
      });

      const res = await service.handleCallback("user-1", "auth-code-xyz");

      expect(res.connected).toBe(true);
      const data = prisma.calendarConnection.create.mock.calls[0][0].data;
      expect(data.provider).toBe("OUTLOOK");
      expect(crypto.decrypt(data.accessTokenEnc)).toBe("ms-access");
    });

    it("propagates 401 when Microsoft rejects code", async () => {
      const err: any = new Error("bad request");
      err.response = { status: 400, data: { error: "invalid_grant" } };
      mockedAxios.post.mockRejectedValueOnce(err);
      await expect(service.handleCallback("user-1", "x")).rejects.toThrow();
    });
  });

  describe("pullChanges", () => {
    it("returns zeros when no active connection", async () => {
      prisma.calendarConnection.findUnique.mockResolvedValue(null);
      const res = await service.pullChanges("user-1");
      expect(res).toEqual({ updated: 0, deleted: 0, total: 0 });
    });

    it("processes delta query and stores deltaLink", async () => {
      const accessTokenEnc = crypto.encrypt("tok-abc");
      prisma.calendarConnection.findUnique.mockResolvedValue({
        id: "conn-2",
        userId: "user-1",
        accessTokenEnc,
        refreshTokenEnc: null,
        expiresAt: new Date(Date.now() + 3600_000),
        calendarId: null,
        deltaLink: null,
        syncEnabled: true,
        syncErrorCount: 0,
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            {
              id: "ms-evt-1",
              subject: "Réunion",
              start: { dateTime: "2026-05-01T09:00:00", timeZone: "UTC" },
              end: { dateTime: "2026-05-01T10:00:00", timeZone: "UTC" },
              isAllDay: false,
              isCancelled: false,
            },
          ],
          "@odata.deltaLink":
            "https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=abc",
        },
      });
      prisma.calendarEvent.findUnique.mockResolvedValue(null);

      const res = await service.pullChanges("user-1");

      expect(res.total).toBe(1);
      expect(res.updated).toBe(1);
      expect(prisma.calendarConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deltaLink: expect.stringContaining("$deltatoken="),
          }),
        }),
      );
    });

    it("clears deltaLink on 410", async () => {
      const accessTokenEnc = crypto.encrypt("tok-abc");
      prisma.calendarConnection.findUnique.mockResolvedValue({
        id: "conn-2",
        userId: "user-1",
        accessTokenEnc,
        refreshTokenEnc: null,
        expiresAt: new Date(Date.now() + 3600_000),
        calendarId: null,
        deltaLink: "stale",
        syncEnabled: true,
        syncErrorCount: 0,
      });
      const err: any = new Error("gone");
      err.response = { status: 410 };
      mockedAxios.get.mockRejectedValueOnce(err);

      await service.pullChanges("user-1");

      const updates = prisma.calendarConnection.update.mock.calls.map(
        (c: any[]) => c[0]?.data,
      );
      expect(
        updates.some((u: any) => u && u.deltaLink === null),
      ).toBe(true);
    });
  });

  describe("token refresh", () => {
    it("refreshes expired token and updates DB", async () => {
      const accessTokenEnc = crypto.encrypt("tok-old");
      const refreshTokenEnc = crypto.encrypt("rt-old");
      prisma.calendarConnection.findUnique.mockResolvedValue({
        id: "conn-2",
        userId: "user-1",
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt: new Date(Date.now() - 1000), // expired
        calendarId: null,
        deltaLink: null,
        syncEnabled: true,
        syncErrorCount: 0,
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: "tok-new",
          refresh_token: "rt-new",
          expires_in: 3600,
        },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { value: [], "@odata.deltaLink": "ok" },
      });
      await service.pullChanges("user-1");
      // 1) update on token refresh, 2) update at end of pull
      const updates = prisma.calendarConnection.update.mock.calls.map(
        (c: any[]) => c[0]?.data,
      );
      const refreshUpdate = updates.find((u: any) => u && u.accessTokenEnc);
      expect(refreshUpdate).toBeTruthy();
      expect(crypto.decrypt(refreshUpdate.accessTokenEnc)).toBe("tok-new");
    });

    it("disables sync if Microsoft rejects refresh", async () => {
      const accessTokenEnc = crypto.encrypt("tok-old");
      const refreshTokenEnc = crypto.encrypt("rt-old");
      prisma.calendarConnection.findUnique.mockResolvedValue({
        id: "conn-2",
        userId: "user-1",
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt: new Date(Date.now() - 1000),
        calendarId: null,
        syncEnabled: true,
        syncErrorCount: 0,
      });
      const err: any = new Error("invalid_grant");
      err.response = { status: 400 };
      mockedAxios.post.mockRejectedValueOnce(err);

      // pullChanges propage l'UnauthorizedException quand le refresh échoue,
      // mais avant cela il a marqué `syncEnabled = false` côté DB.
      await expect(service.pullChanges("user-1")).rejects.toThrow(
        /token refresh failed/i,
      );
      const updates = prisma.calendarConnection.update.mock.calls.map(
        (c: any[]) => c[0]?.data,
      );
      expect(
        updates.some((u: any) => u && u.syncEnabled === false),
      ).toBe(true);
    });
  });
});
