"use client";

import React from "react";
import Link from "next/link";
import {
  RefreshCw,
  WifiOff,
  Wifi,
  FileText,
  Ticket,
  AlertTriangle,
  LayoutDashboard,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useNetworkStatus } from "@/hooks/use-network-status";

/**
 * Dedicated offline fallback page. Served by the service worker when
 * a navigation request fails and no cached version is available.
 *
 * - Live online/offline indicator via `useNetworkStatus`
 * - Retry button reloads the last intended route
 * - Shortcut list to pages likely to be pre-cached via stale-while-revalidate
 */

const CACHED_ROUTES: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
];

export default function OfflinePage() {
  const { t } = useTranslation();
  const { online } = useNetworkStatus();

  const handleRetry = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--seal-gray-100,#F5F5F5)] px-6 py-12">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[color:var(--seal-blue,#F68D2E)]/10">
          <WifiOff
            className="h-10 w-10 text-[color:var(--seal-blue,#F68D2E)]"
            aria-hidden="true"
          />
        </div>

        <h1 className="text-2xl font-semibold text-[color:var(--seal-gray-600,#001F33)] mb-2">
          Pas de connexion
        </h1>
        <p className="text-sm text-[color:var(--seal-gray-400,#6B6B6B)] mb-6 leading-relaxed">
          Impossible de joindre les serveurs OMNITECH Security. Vérifiez votre
          connexion Internet, puis relancez la page. Vos modifications en
          attente seront synchronisees des le retour en ligne.
        </p>

        <div
          className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border"
          style={{
            borderColor: online
              ? "var(--seal-green, #006233)"
              : "var(--seal-bordeaux, #892034)",
            color: online
              ? "var(--seal-green, #006233)"
              : "var(--seal-bordeaux, #892034)",
            backgroundColor: "white",
          }}
          aria-live="polite"
        >
          {online ? (
            <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{online ? "En ligne" : "Hors ligne"}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--seal-blue,#F68D2E)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--seal-blue,#F68D2E)]/90"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reessayer
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--seal-gray-300,#dadde2)] bg-white px-5 py-2.5 text-sm font-medium text-[color:var(--seal-gray-600,#001F33)] transition-colors hover:bg-[color:var(--seal-gray-100,#F5F5F5)]"
          >
            Tableau de bord
          </Link>
        </div>

        <div className="rounded-xl border border-[color:var(--seal-gray-300,#dadde2)] bg-white p-4 text-left">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--seal-gray-400,#6B6B6B)]">
            Pages disponibles hors ligne
          </p>
          <ul className="space-y-1">
            {CACHED_ROUTES.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[color:var(--seal-gray-600,#001F33)] transition-colors hover:bg-[color:var(--seal-gray-100,#F5F5F5)]"
                >
                  <Icon
                    className="h-4 w-4 text-[color:var(--seal-blue,#F68D2E)]"
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
