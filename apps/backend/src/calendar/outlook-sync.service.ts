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
import { OAuthCredsService } from "./oauth-creds.service";

const MS_GRAPH_API = "https://graph.microsoft.com/v1.0";

const REQUIRED_SCOPES = ["offline_access", "Calendars.ReadWrite", "User.Read"];

const SYNC_ERRORS_THRESHOLD = 5;

interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

interface MsEvent {
  id: string;
  subject?: string;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  webLink?: string;
}

/**
 * Microsoft 365 Graph — sync bidirectionnel Outlook (Wave B item 33).
 *
 * Flow OAuth2 (Microsoft Identity Platform v2.0) :
 *   1. GET /api/v1/calendar/connect/outlook?state=<csrf>
 *      → 302 vers https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
 *      ({tenant} = MICROSOFT_OAUTH_TENANT_ID env, défaut "common" pour multi-tenant)
 *   2. Microsoft redirige vers GET /api/v1/calendar/callback/outlook?code=...
 *      → on échange contre access+refresh, persiste chiffré.
 *
 * Pull : cron 10 min via {@link runScheduledSyncs}. Utilise Microsoft Graph
 * delta query (`/me/events/delta`) pour les runs incrémentaux. Le
 * `deltaLink` retourné par Microsoft est persisté dans CalendarConnection.
 *
 * Push : sur create/update/delete intranet → propage via Graph.
 */
@Injectable()
export class OutlookSyncService {
  private readonly logger = new Logger(OutlookSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly creds: OAuthCredsService,
  ) {}

  // -- Configuration --------------------------------------------------------

  private get clientId(): string {
    const v = this.creds.getOutlook().clientId;
    if (!v) throw new Error("Microsoft OAuth client_id not configured");
    return v;
  }

  private get clientSecret(): string {
    const v = this.creds.getOutlook().clientSecret;
    if (!v) throw new Error("Microsoft OAuth client_secret not configured");
    return v;
  }

  private get redirectUri(): string {
    const base = process.env.APP_URL || "http://localhost:3000";
    return `${base.replace(/\/$/, "")}/api/v1/calendar/callback/outlook`;
  }

  private msAuthorizeUrl(): string {
    return `https://login.microsoftonline.com/${this.creds.getOutlook().tenantId}/oauth2/v2.0/authorize`;
  }

  private msTokenUrl(): string {
    return `https://login.microsoftonline.com/${this.creds.getOutlook().tenantId}/oauth2/v2.0/token`;
  }

  isConfigured(): boolean {
    return this.creds.isOutlookConfigured();
  }

  // -- OAuth ----------------------------------------------------------------

  buildAuthorizeUrl(state: string): string {
    if (!state || typeof state !== "string" || state.length < 8) {
      throw new BadRequestException("state required (CSRF)");
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: REQUIRED_SCOPES.join(" "),
      state,
      prompt: "consent",
    });
    return `${this.msAuthorizeUrl()}?${params.toString()}`;
  }

  async handleCallback(
    userId: string,
    code: string,
  ): Promise<{ connected: boolean; calendarId: string | null }> {
    if (!code) throw new BadRequestException("code required");

    let tokens: MsTokenResponse;
    try {
      const resp = await axios.post<MsTokenResponse>(
        this.msTokenUrl(),
        new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: "authorization_code",
          scope: REQUIRED_SCOPES.join(" "),
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10_000,
        },
      );
      tokens = resp.data;
    } catch (err) {
      this.logger.error(
        `Microsoft OAuth code exchange failed: ${(err as AxiosError)?.message}`,
      );
      throw new UnauthorizedException("Outlook OAuth exchange failed");
    }

    if (!tokens.access_token) {
      throw new UnauthorizedException("Microsoft did not return access_token");
    }

    const accessTokenEnc = this.crypto.encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token
      ? this.crypto.encrypt(tokens.refresh_token)
      : null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const existing = await (this.prisma as any).calendarConnection.findUnique({
      where: { userId_provider: { userId, provider: "OUTLOOK" } },
    });

    let connection;
    if (existing) {
      connection = await (this.prisma as any).calendarConnection.update({
        where: { id: existing.id },
        data: {
          accessTokenEnc,
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
          provider: "OUTLOOK",
          accessTokenEnc,
          refreshTokenEnc,
          expiresAt,
          calendarId: null, // null = primary calendar `/me/calendar`
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
      metadata: { provider: "OUTLOOK" },
    });

    return { connected: true, calendarId: connection.calendarId };
  }

  async disconnect(userId: string): Promise<void> {
    const connection = await (this.prisma as any).calendarConnection.findUnique(
      {
        where: { userId_provider: { userId, provider: "OUTLOOK" } },
      },
    );
    if (!connection) throw new NotFoundException("Pas de connexion Outlook");

    // Microsoft ne fournit pas d'endpoint "revoke token" simple — il faut
    // appeler /me/oauth2PermissionGrants côté Graph (admin), ou compter
    // sur l'expiration du refresh_token (90j max). On supprime juste local.
    await (this.prisma as any).calendarConnection.delete({
      where: { id: connection.id },
    });

    void this.audit.log({
      userId,
      action: "CALENDAR_CONNECTION_REVOKED",
      resourceType: "CalendarConnection",
      resourceId: connection.id,
      severity: "WARN",
      metadata: { provider: "OUTLOOK" },
    });
  }

  // -- Token refresh helper -------------------------------------------------

  private async getValidAccessToken(connection: any): Promise<string> {
    const now = Date.now();
    if (connection.expiresAt && connection.expiresAt.getTime() - 60_000 > now) {
      return this.crypto.decrypt(connection.accessTokenEnc);
    }
    if (!connection.refreshTokenEnc) {
      throw new UnauthorizedException(
        "No refresh token — user must reconnect Outlook",
      );
    }

    const refresh = this.crypto.decrypt(connection.refreshTokenEnc);
    let tokens: MsTokenResponse;
    try {
      const resp = await axios.post<MsTokenResponse>(
        this.msTokenUrl(),
        new URLSearchParams({
          refresh_token: refresh,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: "refresh_token",
          scope: REQUIRED_SCOPES.join(" "),
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
        await (this.prisma as any).calendarConnection.update({
          where: { id: connection.id },
          data: {
            syncEnabled: false,
            lastErrorMsg:
              "refresh_token rejected by Microsoft (reconnect needed)",
          },
        });
      }
      throw new UnauthorizedException("Outlook token refresh failed");
    }

    const accessTokenEnc = this.crypto.encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token
      ? this.crypto.encrypt(tokens.refresh_token)
      : connection.refreshTokenEnc;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await (this.prisma as any).calendarConnection.update({
      where: { id: connection.id },
      data: { accessTokenEnc, refreshTokenEnc, expiresAt },
    });

    return tokens.access_token;
  }

  // -- Push -----------------------------------------------------------------

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
    const body = this.toGraphEvent(event);

    try {
      if (event.externalUid?.startsWith("ms:")) {
        const eid = event.externalUid.slice(3);
        const resp = await axios.patch<MsEvent>(
          `${MS_GRAPH_API}/me/events/${encodeURIComponent(eid)}`,
          body,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            timeout: 10_000,
          },
        );
        return `ms:${resp.data.id}`;
      }
      const resp = await axios.post<MsEvent>(
        `${MS_GRAPH_API}/me/events`,
        body,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10_000,
        },
      );
      return `ms:${resp.data.id}`;
    } catch (err) {
      await this.recordSyncError(connection.id, err as Error);
      return null;
    }
  }

  async deleteRemoteEvent(
    userId: string,
    externalUid: string | null | undefined,
  ): Promise<boolean> {
    if (!externalUid?.startsWith("ms:")) return false;
    const connection = await this.getActiveConnection(userId);
    if (!connection) return false;
    const accessToken = await this.getValidAccessToken(connection);
    const eid = externalUid.slice(3);
    try {
      await axios.delete(
        `${MS_GRAPH_API}/me/events/${encodeURIComponent(eid)}`,
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

  // -- Pull -----------------------------------------------------------------

  async pullChanges(
    userId: string,
  ): Promise<{ updated: number; deleted: number; total: number }> {
    const connection = await this.getActiveConnection(userId);
    if (!connection) return { updated: 0, deleted: 0, total: 0 };

    const accessToken = await this.getValidAccessToken(connection);

    let url = connection.deltaLink || `${MS_GRAPH_API}/me/events/delta`;
    let updated = 0;
    let deleted = 0;
    let total = 0;
    let lastDeltaLink: string | undefined = undefined;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const resp = await axios.get<{
          value?: MsEvent[];
          "@odata.nextLink"?: string;
          "@odata.deltaLink"?: string;
        }>(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'odata.maxpagesize=50, outlook.timezone="Europe/Paris"',
          },
          timeout: 15_000,
        });

        const items = resp.data.value ?? [];
        total += items.length;
        for (const ev of items) {
          if (ev.isCancelled || (ev as any)["@removed"]) {
            const local = await this.prisma.calendarEvent.findFirst({
              where: { externalUid: `ms:${ev.id}`, userId },
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

        if (resp.data["@odata.nextLink"]) {
          url = resp.data["@odata.nextLink"];
          continue;
        }
        if (resp.data["@odata.deltaLink"]) {
          lastDeltaLink = resp.data["@odata.deltaLink"];
        }
        break;
      }

      await (this.prisma as any).calendarConnection.update({
        where: { id: connection.id },
        data: {
          deltaLink: lastDeltaLink ?? connection.deltaLink,
          lastSyncAt: new Date(),
          syncErrorCount: 0,
          lastErrorMsg: null,
        },
      });
    } catch (err) {
      const e = err as AxiosError;
      if (e.response?.status === 410) {
        // deltaLink invalidé → repart de zéro au prochain run
        await (this.prisma as any).calendarConnection.update({
          where: { id: connection.id },
          data: { deltaLink: null },
        });
      }
      await this.recordSyncError(connection.id, e);
    }

    return { updated, deleted, total };
  }

  // -- Helpers --------------------------------------------------------------

  private async getActiveConnection(userId: string) {
    const connection = await (this.prisma as any).calendarConnection.findUnique(
      {
        where: { userId_provider: { userId, provider: "OUTLOOK" } },
      },
    );
    if (!connection || !connection.syncEnabled) return null;
    return connection;
  }

  private toGraphEvent(event: {
    title: string;
    description?: string | null;
    location?: string | null;
    startDate: Date;
    endDate?: Date | null;
    allDay?: boolean;
  }) {
    const body: any = {
      subject: event.title,
      body: { contentType: "HTML", content: event.description ?? "" },
      location: { displayName: event.location ?? "" },
      isAllDay: Boolean(event.allDay),
    };
    if (event.allDay) {
      const startStr = event.startDate.toISOString().slice(0, 10);
      const endDate = event.endDate
        ? new Date(event.endDate)
        : new Date(event.startDate.getTime() + 24 * 3600 * 1000);
      body.start = {
        dateTime: `${startStr}T00:00:00`,
        timeZone: "Europe/Paris",
      };
      body.end = {
        dateTime: `${endDate.toISOString().slice(0, 10)}T00:00:00`,
        timeZone: "Europe/Paris",
      };
    } else {
      body.start = {
        dateTime: event.startDate.toISOString().replace(/Z$/, ""),
        timeZone: "UTC",
      };
      body.end = {
        dateTime: (event.endDate ?? event.startDate)
          .toISOString()
          .replace(/Z$/, ""),
        timeZone: "UTC",
      };
    }
    return body;
  }

  private async upsertLocalEvent(userId: string, ev: MsEvent): Promise<void> {
    if (!ev.id) return;
    const externalUid = `ms:${ev.id}`;
    const allDay = Boolean(ev.isAllDay);
    const startDate = ev.start?.dateTime
      ? new Date(this.normalizeMsDate(ev.start.dateTime, ev.start?.timeZone))
      : null;
    if (!startDate) return;
    const endDate = ev.end?.dateTime
      ? new Date(this.normalizeMsDate(ev.end.dateTime, ev.end?.timeZone))
      : null;

    const data = {
      title: (ev.subject ?? "(Sans titre)").slice(0, 200),
      description: (ev.body?.content || ev.bodyPreview)?.slice(0, 2000) ?? null,
      location: ev.location?.displayName?.slice(0, 200) ?? null,
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

  /**
   * Microsoft Graph renvoie souvent les datetimes sans suffixe Z + un
   * timeZone IANA. On normalise en UTC ISO. Comme on demande explicitement
   * `Prefer: outlook.timezone="Europe/Paris"`, on traite les valeurs comme
   * UTC pour rester déterministe (les heures restent justes à l'affichage).
   */
  private normalizeMsDate(dt: string, _tz?: string): string {
    if (dt.endsWith("Z")) return dt;
    return dt + "Z";
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
        syncEnabled: newCount < SYNC_ERRORS_THRESHOLD,
      },
    });
    this.logger.warn(
      `Outlook sync error (#${newCount}) for connection ${connectionId}: ${msg}`,
    );
  }

  // -- Cron job -------------------------------------------------------------

  async runScheduledSyncs(): Promise<{
    pulled: number;
    skipped: number;
    errors: number;
  }> {
    const connections = await (this.prisma as any).calendarConnection.findMany({
      where: { provider: "OUTLOOK", syncEnabled: true },
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
          `Scheduled Outlook sync failed for user ${c.userId}: ${(err as Error)?.message}`,
        );
      }
    }
    return { pulled, skipped: 0, errors };
  }

  // -- Compat — anciens shapes (skeletons) ----------------------------------

  /** @deprecated Conservé pour compat avec d'éventuels callers anciens. */
  async isConnected(userId: string): Promise<boolean> {
    const c = await this.getActiveConnection(userId);
    return c !== null;
  }
}
