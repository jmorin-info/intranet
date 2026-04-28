"use client";

/**
 * Card "Google Calendar" / "Microsoft Outlook" — Wave B item enrichissement F1.
 *
 * Affiche, pour un provider donné :
 *  - statut (configuré côté serveur ? connecté ? depuis quand ? lastSync ?)
 *  - boutons "Connecter" (redirect OAuth via window.location), "Sync maintenant",
 *    "Déconnecter" (avec confirm).
 *
 * Backend (déjà mergé, cf calendar.controller.ts) :
 *  - GET  /calendar/integrations/status
 *  - GET  /calendar/connect/{google,outlook}     (redirect 302 OAuth)
 *  - DELETE /calendar/connect/{google,outlook}
 *  - POST /calendar/sync/{google,outlook}
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Power,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Skeleton,
} from "@omnitech/ui";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { formatRelativeTime } from "@/lib/utils";
import type {
  CalendarIntegrationsStatus,
  CalendarProviderStatus,
} from "./types";

export interface CalendarIntegrationCardProps {
  provider: "google" | "outlook";
}

/**
 * URL absolue du backend pour redirect OAuth (le backend renvoie un 302 vers
 * Google/Microsoft). On bypass `axios` qui ne suit pas un redirect cross-origin
 * en mode CORS — il faut un `window.location.href` direct.
 */
function buildConnectUrl(provider: "google" | "outlook"): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, "/api/v1")
    : "http://localhost:3000/api/v1";
  return `${apiBase}/calendar/connect/${provider}`;
}

export function CalendarIntegrationCard({
  provider,
}: CalendarIntegrationCardProps): React.ReactElement {
  const t = useTranslations("profile.integrations.calendar");
  const [status, setStatus] = useState<CalendarProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const providerKey = provider; // 'google' | 'outlook'
  const providerLabel = provider === "google" ? t("google") : t("outlook");
  const Icon = Calendar;
  // Couleur d'accent par provider (Google = bleu Google #4285F4 ; Outlook =
  // bleu M365 #0078D4). On reste dans la palette charte SEAL en utilisant
  // `seal-blue` (PANTONE #296DC1) pour Outlook et primary pour Google.
  const accentClass =
    provider === "outlook"
      ? "text-[#0078D4]"
      : "text-primary";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CalendarIntegrationsStatus>(
        "/calendar/integrations/status",
      );
      setStatus(data[providerKey] ?? null);
    } catch (err) {
      logger.error("calendar.status.failed", {
        provider: providerKey,
        error: String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [providerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConnect = () => {
    // Le backend renvoie un 302 vers Google/MS — on doit donc faire un
    // navigation top-level (pas un fetch), pour que le navigateur suive le
    // redirect et atterrisse sur l'écran de consent.
    window.location.href = buildConnectUrl(providerKey);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post(`/calendar/sync/${providerKey}`);
      toast.success(t("syncSuccess"));
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? t("syncError"));
      logger.error("calendar.sync.failed", {
        provider: providerKey,
        error: String(err),
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(t("disconnectConfirm"))) return;
    setDisconnecting(true);
    try {
      await api.delete(`/calendar/connect/${providerKey}`);
      toast.success(t("disconnectSuccess"));
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? t("disconnectError"));
    } finally {
      setDisconnecting(false);
    }
  };

  // -------- Render --------

  if (loading) {
    return (
      <Card data-testid={`calendar-card-${providerKey}`}>
        <CardHeader>
          <h3 className="text-base font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <Icon className={`h-5 w-5 ${accentClass}`} />
            {providerLabel}
          </h3>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const configured = status?.configured ?? false;
  const connection = status?.connection ?? null;
  const isConnected = connection !== null;

  return (
    <Card data-testid={`calendar-card-${providerKey}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <Icon className={`h-5 w-5 ${accentClass}`} />
            {providerLabel}
          </h3>
          {!configured ? (
            <Badge variant="warning">{t("notConfigured")}</Badge>
          ) : isConnected ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connecté
            </Badge>
          ) : (
            <Badge variant="info">{t("notConnected")}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Provider non configuré côté serveur */}
        {!configured && (
          <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
            {t("notConfigured")}
          </p>
        )}

        {/* Pas de connexion → CTA "Connecter" */}
        {configured && !isConnected && (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              onClick={handleConnect}
              data-testid={`calendar-connect-${providerKey}`}
              aria-label={
                providerKey === "google"
                  ? t("connectGoogle")
                  : t("connectOutlook")
              }
            >
              {providerKey === "google"
                ? t("connectGoogle")
                : t("connectOutlook")}
            </Button>
          </div>
        )}

        {/* Connexion active */}
        {configured && isConnected && connection && (
          <div className="space-y-2 text-sm">
            <div className="text-seal-navy dark:text-slate-200">
              {connection.lastSyncAt ? (
                <p>
                  {t("lastSync", {
                    when: formatRelativeTime(connection.lastSyncAt),
                  })}
                </p>
              ) : (
                <p className="italic text-seal-gray-500 dark:text-slate-400">
                  {t("neverSynced")}
                </p>
              )}
              {connection.syncErrorCount > 0 && (
                <p className="text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("errorCount", { count: connection.syncErrorCount })}
                </p>
              )}
              {connection.lastErrorMsg && (
                <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                  {t("lastError", { message: connection.lastErrorMsg })}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing || disconnecting}
                data-testid={`calendar-sync-${providerKey}`}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
                />
                {syncing ? t("syncing") : t("syncNow")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={syncing || disconnecting}
                data-testid={`calendar-disconnect-${providerKey}`}
              >
                <Power className="h-3.5 w-3.5" />
                {t("disconnect")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

