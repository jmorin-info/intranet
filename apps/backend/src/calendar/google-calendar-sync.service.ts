import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { AuditService } from "../audit/audit.service";

const GOOGLE_OAUTH_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];

const SYNC_ERRORS_THRESHOLD = 5;

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

interface GoogleEvent {
  id: string;
  status?: string; // "confirmed", "cancelled"
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  updated?: string;
  htmlLink?: string;
}

/**
 * Google Calendar OAuth2 + sync bidirectionnel (Wave B item 33).
 *
 * Flow OAuth :
 *  1. GET /api/v1/calendar/connect/google?state=<csrf>
 *     → 302 vers Google consent (scope calendar.events + email)
 *  2. Google redirige vers GET /api/v1/calendar/callback/google?code=...
 *     → on échange le code contre access+refresh, on stocke chiffré, on
 *       reproduit l'état "syncEnabled=true" + sync initiale.
 *
 * Sync :
 *  - Push (intranet → Google) : sur create/update/delete event intranet,
 *    on appelle pushEvent() qui propage au calendrier Google. Best-effort.
 *  - Pull (Google → intranet) : cron toutes les 10 min. Premier run :
 *    full sync ; runs suivants : incremental via syncToken.
 */
@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  // -- Configuration helpers -----------------------------------------------

  private get clientId(): string {
    const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
    return v;
  }

  private get clientSecret(): string {
    const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not configured");
    return v;
  }

  private get redirectUri(): string {
    const base = process.env.APP_URL || "http://localhost:3000";
    return `${base.replace(/\/$/, "")}/api/v1/calendar/callback/google`;
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
  }

  // -- OAuth ----------------------------------------------------------------

  /**
   * Construit l'URL de consent Google. `state` est un nonce CSRF que le
   * caller doit vérifier au callback.
   */
  buildAuthorizeUrl(state: string): string {
    if (!state || typeof state !== "string" || state.length < 8) {
      throw new BadRequestException("state required (CSRF)");
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: REQUIRED_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent", // force renvoi du refresh_token
      state,
      include_granted_scopes: "true",
    });
    return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Échange le code OAuth contre un (access_token, refresh_token), persiste
   * la connection chiffrée, et déclenche une première sync incrémentale.
   */
  async handleCallback(
    userId: string,
    code: string,
  ): Promise<{ connected: boolean; calendarId: string | null }> {
    if (!code) throw new BadRequestException("code required");

    let tokens: GoogleTokenResponse;
    try {
      const resp = await axios.post<GoogleTokenResponse>(
        GOOGLE_OAUTH_TOKEN_URL,
        new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: "authorization_code",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10_000,
        },
      );
      tokens = resp.data;
    } catch (err) {
      this.logger.error(
        `Google OAuth code exchange failed: ${(err as AxiosError)?.message}`,
      );
      throw new UnauthorizedException("Google OAuth exchange failed");
    }

    if (!tokens.access_token) {
      throw new UnauthorizedException("Google did not return access_token");
    }

    const accessTokenEnc = this.crypto.encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token
      ? this.crypto.encrypt(tokens.refresh_token)
      : null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Upsert (un user a au plus une connexion par provider)
    const existing = await (this.prisma as any).calendarConnection.findUnique({
      where: { userId_provider: { userId, provider: "GOOGLE" } },
    });

    let connection;
    if (existing) {
      connection = await (this.prisma as any).calendarConnection.update({
        where: { id: existing.id },
        data: {
          accessTokenEnc,
          // Garde le refreshTokenEnc précédent si Google n'en renvoie pas un
          // (cas d'un user qui re-connecte avec prompt=none).
          refreshTokenEnc: refreshTokenEnc ?? existing.refreshTokenEnc,
          expiresAt,
          syncEnabled: true,
          syncErrorCount: 0,
          lastErrorMsg: null,
        },
      });
    } else {
      connection = await (this.prisma as any).calendarConnection.create({
        data: {
          userId,
          provider: "GOOGLE",
          accessTokenEnc,
          refreshTokenEnc,
          expiresAt,
          calendarId: "primary",
          syncEnabled: true,
        },
      });
    }

    void this.audit.log({
      userId,
      action: "CALENDAR_CONNECTION_CREATED",
      resourceType: "CalendarConnection",
      resourceId: connection.id,
      severity: "INFO",
      metadata: { provider: "GOOGLE" },
    });

    return { connected: true, calendarId: connection.calendarId };
  }

  /**
   * Révoque la connexion Google (révoque le token côté Google + supprime
   * la ligne CalendarConnection localement).
   */
  async disconnect(userId: string): Promise<void> {
    const connection = await (
      this.prisma as any
    ).calendarConnection.findUnique({
      where: { userId_provider: { userId, provider: "GOOGLE" } },
    });
    if (!connection) throw new NotFoundException("Pas de connexion Google");

    // Révoque le refresh_token côté Google (best-effort)
    if (connection.refreshTokenEnc) {
      try {
        const refresh = this.crypto.decrypt(connection.refreshTokenEnc);
        await axios.post(
          `${GOOGLE_OAUTH_REVOKE_URL}?token=${encodeURIComponent(refresh)}`,
          null,
          { timeout: 5_000 },
        );
      } catch (err) {
        this.logger.warn(
          `Google token revoke failed (best-effort): ${(err as Error)?.message}`,
        );
      }
    }

    await (this.prisma as any).calendarConnection.delete({
      where: { id: connection.id },
    });

    void this.audit.log({
      userId,
      action: "CALENDAR_CONNECTION_REVOKED",
      resourceType: "CalendarConnection",
      resourceId: connection.id,
      severity: "WARN",
      metadata: { provider: "GOOGLE" },
    });
  }

  // -- Token refresh helper -------------------------------------------------

  private async getValidAccessToken(connection: any): Promise<string> {
    const now = Date.now();
    if (
      connection.expiresAt &&
      connection.expiresAt.getTime() - 60_000 > now
    ) {
      return this.crypto.decrypt(connection.accessTokenEnc);
    }
    if (!connection.refreshTokenEnc) {
      throw new UnauthorizedException(
        "No refresh token — user must reconnect Google",
      );
    }

    const refresh = this.crypto.decrypt(connection.refreshTokenEnc);
    let tokens: GoogleTokenResponse;
    try {
      const resp = await axios.post<GoogleTokenResponse>(
        GOOGLE_OAUTH_TOKEN_URL,
        new URLSearchParams({
          refresh_token: refresh,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: "refresh_token",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10_000,
        },
      );
      tokens = resp.data;
    } catch (err) {
      const e = err as AxiosError;
      if (e.response?.status === 400 || e.response?.status === 401) {
        // Refresh token révoqué côté Google — on désactive la sync
        await (this.prisma as any).calendarConnection.update({
          where: { id: connection.id },
          data: {
            syncEnabled: false,
            lastErrorMsg: "refresh_token rejected by Google (reconnect needed)",
          },
        });
      }
      throw new UnauthorizedException("Google token refresh failed");
    }

    const accessTokenEnc = this.crypto.encrypt(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await (this.prisma as any).calendarConnection.update({
      where: { id: connection.id },
      data: { accessTokenEnc, expiresAt },
    });

    return tokens.access_token;
  }

  // -- Push (intranet → Google) ---------------------------------------------

  async pushEvent(
    userId: string,
    event: {
      id: string;
      title: string;
      description?: string | null;
      location?: string | null;
      startDate: Date;
      endDate?: Date | null;
      allDay?: boolean;
      externalUid?: string | null;
    },
  ): Promise<string | null> {
    const connection = await this.getActiveConnection(userId);
    if (!connection) return null;

    const accessToken = await this.getValidAccessToken(connection);
    const calendarId = encodeURIComponent(connection.calendarId || "primary");

    const body = this.toGoogleEvent(event);

    try {
      // Si externalUid et préfixe `gcal:`, c'est qu'on a déjà un ID Google →
      // PATCH plutôt que POST pour éviter les doublons.
      if (event.externalUid?.startsWith("gcal:")) {
        const gid = event.externalUid.slice(5);
        const resp = await axios.patch<GoogleEvent>(
          `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(gid)}`,
          body,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10_000,
          },
        );
        return `gcal:${resp.data.id}`;
      }
      const resp = await axios.post<GoogleEvent>(
        `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`,
        body,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        },
      );
      return `gcal:${resp.data.id}`;
    } catch (err) {
      await this.recordSyncError(connection.id, err as Error);
      return null;
    }
  }

  async deleteRemoteEvent(
    userId: string,
    externalUid: string | null | undefined,
  ): Promise<boolean> {
    if (!externalUid?.startsWith("gcal:")) return false;
    const connection = await this.getActiveConnection(userId);
    if (!connection) return false;
    const accessToken = await this.getValidAccessToken(connection);
    const calendarId = encodeURIComponent(connection.calendarId || "primary");
    const gid = externalUid.slice(5);
    try {
      await axios.delete(
        `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(gid)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        },
      );
      return true;
    } catch (err) {
      await this.recordSyncError(connection.id, err as Error);
      return false;
    }
  }

  // -- Pull (Google → intranet) ---------------------------------------------

  async pullChanges(
    userId: string,
  ): Promise<{ updated: number; deleted: number; total: number }> {
    const connection = await this.getActiveConnection(userId);
    if (!connection) {
      return { updated: 0, deleted: 0, total: 0 };
    }
    const accessToken = await this.getValidAccessToken(connection);
    const calendarId = encodeURIComponent(connection.calendarId || "primary");

    let updated = 0;
    let deleted = 0;
    let total = 0;
    let pageToken: string | undefined = undefined;
    let nextSyncToken: string | undefined = undefined;

    try {
      do {
        const params: Record<string, string> = pageToken
          ? { pageToken }
          : connection.syncToken
            ? { syncToken: connection.syncToken }
            : { showDeleted: "true", singleEvents: "true" };

        const resp = await axios.get<{
          items?: GoogleEvent[];
          nextPageToken?: string;
          nextSyncToken?: string;
        }>(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, {
          params,
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15_000,
        });

        const items = resp.data.items ?? [];
        total += items.length;

        for (const ev of items) {
          if (ev.status === "cancelled") {
            // Soft-delete event localement matché par externalUid
            const local = await this.prisma.calendarEvent.findFirst({
              where: { externalUid: `gcal:${ev.id}`, userId },
            });
            if (local) {
              await this.prisma.calendarEvent.update({
                where: { id: local.id },
                data: { deletedAt: new Date() },
              });
              deleted += 1;
            }
            continue;
          }
          await this.upsertLocalEvent(userId, ev);
          updated += 1;
        }

        pageToken = resp.data.nextPageToken;
        nextSyncToken = resp.data.nextSyncToken ?? nextSyncToken;
      } while (pageToken);

      await (this.prisma as any).calendarConnection.update({
        where: { id: connection.id },
        data: {
          syncToken: nextSyncToken ?? connection.syncToken,
          lastSyncAt: new Date(),
          syncErrorCount: 0,
          lastErrorMsg: null,
        },
      });
    } catch (err) {
      const e = err as AxiosError;
      // 410 GONE = syncToken invalidé (Google nettoie après ~7 jours d'inactivité)
      if (e.response?.status === 410) {
        await (this.prisma as any).calendarConnection.update({
          where: { id: connection.id },
          data: { syncToken: null },
        });
      }
      await this.recordSyncError(connection.id, e);
    }

    return { updated, deleted, total };
  }

  // -- Helpers --------------------------------------------------------------

  private async getActiveConnection(userId: string) {
    const connection = await (
      this.prisma as any
    ).calendarConnection.findUnique({
      where: { userId_provider: { userId, provider: "GOOGLE" } },
    });
    if (!connection || !connection.syncEnabled) return null;
    return connection;
  }

  private toGoogleEvent(event: {
    title: string;
    description?: string | null;
    location?: string | null;
    startDate: Date;
    endDate?: Date | null;
    allDay?: boolean;
  }): Partial<GoogleEvent> {
    const out: Partial<GoogleEvent> = {
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
    };
    if (event.allDay) {
      out.start = { date: event.startDate.toISOString().slice(0, 10) };
      const endDate = event.endDate
        ? new Date(event.endDate)
        : new Date(event.startDate.getTime() + 24 * 3600 * 1000);
      out.end = { date: endDate.toISOString().slice(0, 10) };
    } else {
      out.start = {
        dateTime: event.startDate.toISOString(),
        timeZone: "Europe/Paris",
      };
      out.end = {
        dateTime: (event.endDate ?? event.startDate).toISOString(),
        timeZone: "Europe/Paris",
      };
    }
    return out;
  }

  private async upsertLocalEvent(
    userId: string,
    ev: GoogleEvent,
  ): Promise<void> {
    if (!ev.id) return;
    const externalUid = `gcal:${ev.id}`;
    const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
    const startDate = ev.start?.dateTime
      ? new Date(ev.start.dateTime)
      : ev.start?.date
        ? new Date(ev.start.date)
        : null;
    if (!startDate) return;
    const endDate = ev.end?.dateTime
      ? new Date(ev.end.dateTime)
      : ev.end?.date
        ? new Date(ev.end.date)
        : null;

    const data = {
      title: ev.summary?.slice(0, 200) || "(Sans titre)",
      description: ev.description?.slice(0, 2000) ?? null,
      location: ev.location?.slice(0, 200) ?? null,
      startDate,
      endDate,
      allDay,
      category: "GENERAL",
      visibility: "PRIVATE",
      externalUid,
      userId,
      createdById: userId,
    };

    const existing = await this.prisma.calendarEvent.findUnique({
      where: { externalUid },
    });
    if (existing) {
      await this.prisma.calendarEvent.update({
        where: { id: existing.id },
        data: {
          title: data.title,
          description: data.description,
          location: data.location,
          startDate: data.startDate,
          endDate: data.endDate,
          allDay: data.allDay,
          deletedAt: null,
        },
      });
    } else {
      await this.prisma.calendarEvent.create({ data });
    }
  }

  private async recordSyncError(
    connectionId: string,
    err: Error,
  ): Promise<void> {
    const msg =
      ((err as AxiosError).response?.data as any)?.error?.message ||
      err.message ||
      "Unknown sync error";
    const conn = await (this.prisma as any).calendarConnection.findUnique({
      where: { id: connectionId },
    });
    if (!conn) return;
    const newCount = (conn.syncErrorCount ?? 0) + 1;
    await (this.prisma as any).calendarConnection.update({
      where: { id: connectionId },
      data: {
        syncErrorCount: newCount,
        lastErrorMsg: msg.slice(0, 500),
        // Désactive la sync au-delà du seuil pour éviter le spam
        syncEnabled: newCount < SYNC_ERRORS_THRESHOLD,
      },
    });
    this.logger.warn(
      `Google sync error (#${newCount}) for connection ${connectionId}: ${msg}`,
    );
  }

  // -- Cron job (called by CalendarSyncCron) --------------------------------

  async runScheduledSyncs(): Promise<{
    pulled: number;
    skipped: number;
    errors: number;
  }> {
    const connections = await (
      this.prisma as any
    ).calendarConnection.findMany({
      where: { provider: "GOOGLE", syncEnabled: true },
      select: { userId: true, id: true },
    });

    let pulled = 0;
    let errors = 0;
    for (const c of connections) {
      try {
        await this.pullChanges(c.userId);
        pulled += 1;
      } catch (err) {
        errors += 1;
        this.logger.warn(
          `Scheduled Google sync failed for user ${c.userId}: ${(err as Error)?.message}`,
        );
      }
    }
    return { pulled, skipped: 0, errors };
  }
}
