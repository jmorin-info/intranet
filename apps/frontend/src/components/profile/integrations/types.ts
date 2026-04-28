/**
 * Types partagés pour la page /profile/integrations.
 *
 * Reflète les formats de réponse des endpoints backend :
 *  - GET /calendar/integrations/status        (calendar.controller.ts:436)
 *  - POST/GET/DELETE /users/me/webdav-token   (webdav.controller.ts:42-77)
 */

export type CalendarProvider = "google" | "outlook";

export interface CalendarConnection {
  provider: "GOOGLE" | "OUTLOOK";
  syncEnabled: boolean;
  lastSyncAt: string | null;
  syncErrorCount: number;
  lastErrorMsg: string | null;
}

export interface CalendarProviderStatus {
  configured: boolean;
  connection: CalendarConnection | null;
}

export interface CalendarIntegrationsStatus {
  google: CalendarProviderStatus;
  outlook: CalendarProviderStatus;
}

export interface WebDAVTokenSummary {
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Réponse de POST /users/me/webdav-token — token clair affiché 1 seule fois. */
export interface WebDAVMintResponse {
  token: string;
  id: string;
  expiresAt: string;
  url: string;
  username: string;
}
