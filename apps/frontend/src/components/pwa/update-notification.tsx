"use client";

import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Wrench } from "lucide-react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// 1. SW Update Toast — non-blocking notification instead of brutal reload
// ---------------------------------------------------------------------------

export function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SW_UPDATED") {
        setShowUpdate(true);
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);

    // Send current BUILD_VERSION to the SW so it can compare across deploys.
    const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION;
    if (buildVersion) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({
          type: "BUILD_VERSION",
          version: buildVersion,
        });
      });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, []);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-6 z-[60] animate-[slideInRight_0.3s_ease-out]">
      <div className="flex items-center gap-3 rounded-xl bg-[#F68D2E] text-white px-5 py-3 shadow-2xl border border-white/10">
        <RefreshCw className="h-5 w-5 animate-spin text-[#F9964A]" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Nouvelle version disponible</p>
          <p className="text-xs text-white/70">Cliquez pour mettre a jour.</p>
        </div>
        <button
          type="button"
          onClick={handleReload}
          className="shrink-0 rounded-lg bg-[#F9964A] hover:bg-[#F68D2E] px-4 py-1.5 text-sm font-semibold text-white transition-colors"
        >
          Mettre a jour
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Maintenance Guard — polls /api/health/maintenance and shows overlay
// ---------------------------------------------------------------------------

export function MaintenanceGuard() {
  const [state, setState] = useState<
    | { kind: "ok" }
    | { kind: "maintenance"; message: string; eta: string | null }
    | { kind: "down" }
  >({ kind: "ok" });

  useEffect(() => {
    let cancelled = false;
    let failures = 0;

    const check = async () => {
      try {
        // Endpoint public, 503 quand maintenance ON (middleware le laisse
        // passer en réalité, mais un 5xx du proxy reste un signal valide).
        const r = await fetch("/api/v1/maintenance/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (cancelled) return;
        if (r.ok) {
          const data = (await r.json()) as {
            enabled?: boolean;
            message?: string;
            estimatedReturnTime?: string | null;
          };
          failures = 0;
          if (data?.enabled) {
            setState({
              kind: "maintenance",
              message: data.message || "",
              eta: data.estimatedReturnTime ?? null,
            });
          } else {
            setState({ kind: "ok" });
          }
        } else {
          failures += 1;
          if (failures >= 3) setState({ kind: "down" });
        }
      } catch {
        if (cancelled) return;
        failures += 1;
        if (failures >= 3) setState({ kind: "down" });
      }
    };

    void check();
    // Polling rapproché : 5 s pour réagir vite à un toggle admin et au restart.
    const id = setInterval(check, 5_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state.kind === "ok") return null;

  const isDown = state.kind === "down";
  const message =
    state.kind === "maintenance"
      ? state.message ||
        "Nous revenons rapidement. Cette page se rafraichira automatiquement lorsque la maintenance sera terminee."
      : "Le serveur ne repond pas — sans doute un redemarrage en cours. Reconnexion automatique…";
  const eta = state.kind === "maintenance" ? state.eta : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-full.png"
        alt="OMNITECH Security"
        className="h-16 w-auto mb-8 drop-shadow-lg"
        style={{ height: 64 }}
      />

      <div className="flex items-center gap-3 mb-4">
        <Wrench className="h-6 w-6 text-amber-500 animate-pulse" />
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">
          {isDown ? "Reconnexion en cours…" : "Maintenance en cours"}
        </h1>
      </div>

      <p className="text-base text-slate-600 dark:text-slate-400 text-center max-w-md">
        {message}
      </p>

      {eta && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Retour estimé : {eta}
        </p>
      )}

      <p className="mt-8 text-xs text-slate-400 dark:text-slate-600">
        OMNITECH Security
      </p>
    </div>
  );
}
