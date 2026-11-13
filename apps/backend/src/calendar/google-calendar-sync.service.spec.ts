import { Test, TestingModule } from "@nestjs/testing";
import axios from "axios";
import { GoogleCalendarSyncService } from "./google-calendar-sync.service";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { AuditService } from "../audit/audit.service";
import { OAuthCredsService } from "./oauth-creds.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("GoogleCalendarSyncService", () => {
  let service: GoogleCalendarSyncService;
  let prisma: any;
  let crypto: CryptoService;

  beforeEach(async () => {
    process.env.CRYPTO_SECRET =
      "test-crypto-secret-32-bytes-minimum-for-aes256-gcm-test";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
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
        GoogleCalendarSyncService,
        CryptoService,
        {
          provide: OAuthCredsService,
          useValue: { getGoogle: () => ({
            clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
            clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
          }) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(GoogleCalendarSyncService);
    crypto = module.get(CryptoService);

    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
    mockedAxios.delete.mockReset();
    mockedAxios.patch.mockReset();
  });

  describe("buildAuthorizeUrl", () => {
    it("returns a Google consent URL with required scopes", () => {
      const url = service.buildAuthorizeUrl("state-12345");
      expect(url).toContain("accounts.google.com");
      expect(url).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events");
      expect(url).toContain("state=state-12345");
      expect(url).toContain("access_type=offline");
    });

    it("rejects too-short state", () => {
      expect(() => service.buildAuthorizeUrl("123")).toThrow();
    });
  });

  describe("handleCallback", () => {
    it("exchanges code for tokens and stores encrypted connection", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: "test-access",
          refresh_token: "test-refresh",
          expires_in: 3600,
          scope: "calendar.events",
          token_type: "Bearer",
        },
      });
      prisma.calendarConnection.findUnique.mockResolvedValue(null);
      prisma.calendarConnection.create.mockResolvedValue({
        id: "conn-1",
        calendarId: "primary",
      });

      const res = await service.handleCallback("user-1", "auth-code-xyz");

      expect(res.connected).toBe(true);
      expect(prisma.calendarConnection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            provider: "GOOGLE",
            calendarId: "primary",
          }),
        }),
      );
      const data = prisma.calendarConnection.create.mock.calls[0][0].data;
      expect(data.accessTokenEnc).toMatch(/^v1:/);
      expect(crypto.decrypt(data.accessTokenEnc)).toBe("test-access");
      expect(crypto.decrypt(data.refreshTokenEnc)).toBe("test-refresh");
    });

    it("throws Unauthorized when Google returns no access_token", async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });
      await expect(service.handleCallback("user-1", "code")).rejects.toThrow();
    });

    it("rejects empty code", async () => {
      await expect(service.handleCallback("user-1", "")).rejects.toThrow();
    });
  });

  describe("pullChanges", () => {
    it("returns 0/0/0 when no active connection", async () => {
      prisma.calendarConnection.findUnique.mockResolvedValue(null);
      const res = await service.pullChanges("user-1");
      expect(res).toEqual({ updated: 0, deleted: 0, total: 0 });
    });

    it("uses syncToken for incremental sync and upserts events", async () => {
      const accessTokenEnc = crypto.encrypt("token-123");
      prisma.calendarConnection.findUnique.mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        accessTokenEnc,
        refreshTokenEnc: null,
        expiresAt: new Date(Date.now() + 3600_000),
        calendarId: "primary",
        syncToken: "sync-tok",
        syncEnabled: true,
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "g-1",
              status: "confirmed",
              summary: "Meeting",
              start: { dateTime: "2026-05-01T09:00:00Z" },
              end: { dateTime: "2026-05-01T10:00:00Z" },
            },
            {
              id: "g-2",
              status: "cancelled",
            },
          ],
          nextSyncToken: "next-tok",
        },
      });
      prisma.calendarEvent.findUnique.mockResolvedValue(null);
      prisma.calendarEvent.findFirst.mockResolvedValue({ id: "evt-2" });

      const res = await service.pullChanges("user-1");

      expect(res.total).toBe(2);
      expect(res.updated).toBe(1);
      expect(res.deleted).toBe(1);
      expect(prisma.calendarEvent.create).toHaveBeenCalled();
      expect(prisma.calendarConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ syncToken: "next-tok" }),
        }),
      );
    });

    it("clears syncToken when Google returns 410 (token expired)", async () => {
      const accessTokenEnc = crypto.encrypt("token-123");
      prisma.calendarConnection.findUnique.mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        accessTokenEnc,
        refreshTokenEnc: null,
        expiresAt: new Date(Date.now() + 3600_000),
        calendarId: "primary",
        syncToken: "stale-tok",
        syncEnabled: true,
        syncErrorCount: 0,
      });
      const err: any = new Error("gone");
      err.response = { status: 410, data: { error: { message: "Sync token expired" } } };
      mockedAxios.get.mockRejectedValueOnce(err);

      await service.pullChanges("user-1");

      // Should have been called twice: once to clear deltaLink, once to record error
      const updates = prisma.calendarConnection.update.mock.calls.map(
        (c: any[]) => c[0]?.data,
      );
      expect(
        updates.some((u: any) => u && u.syncToken === null),
      ).toBe(true);
    });
  });

  describe("disconnect", () => {
    it("deletes the connection and best-effort revokes the refresh token", async () => {
      const refreshTokenEnc = crypto.encrypt("rt-123");
      prisma.calendarConnection.findUnique.mockResolvedValue({
        id: "conn-1",
        refreshTokenEnc,
      });
      mockedAxios.post.mockResolvedValueOnce({ data: {} });
      await service.disconnect("user-1");
      expect(prisma.calendarConnection.delete).toHaveBeenCalledWith({
        where: { id: "conn-1" },
      });
    });

    it("throws when no connection exists", async () => {
      prisma.calendarConnection.findUnique.mockResolvedValue(null);
      await expect(service.disconnect("user-1")).rejects.toThrow();
    });
  });
});
