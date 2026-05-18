"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

const STALE_DEPLOY_KEY = "omnitech:stale-deploy-recovery-at";
const STALE_COOLDOWN_MS = 60_000;

function isStaleDeployError(err: Error): boolean {
  const msg = err.message || "";
  return (
    /Failed to find Server Action/i.test(msg) ||
    /older or newer deployment/i.test(msg)
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [staleDeploy, setStaleDeploy] = useState(false);

  useEffect(() => {
    // Cas 1 : déploiement obsolète (Server Action hash périmé après rebuild).
    // On informe l'utilisateur et on recharge automatiquement (avec cooldown
    // pour éviter les boucles si la page d'arrivée plante aussi).
    if (isStaleDeployError(error)) {
      setStaleDeploy(true);
      try {
        const last = Number(sessionStorage.getItem(STALE_DEPLOY_KEY) || "0");
        if (Date.now() - last > STALE_COOLDOWN_MS) {
          sessionStorage.setItem(STALE_DEPLOY_KEY, String(Date.now()));
          const url = new URL(window.location.href);
          url.searchParams.set("_r", String(Date.now()));
          // Laisse 1.2s pour que l'utilisateur voie le message avant le reload.
          const t = setTimeout(
            () => window.location.replace(url.toString()),
            1200,
          );
          return () => clearTimeout(t);
        }
      } catch {
        /* sessionStorage indisponible */
      }
      return;
    }

    // Cas 2 : autres erreurs — pipeline observabilité.
    try {
      const { captureError } = require("@/lib/observability");
      captureError(error, {
        severity: "error",
        metadata: { digest: error?.digest },
      });
    } catch {
      logger.error(error, { digest: error?.digest });
    }
  }, [error]);

  if (staleDeploy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F68D2E]/10 via-white to-[#F68D2E]/5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-6">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F68D2E]/15 text-slate-900 mb-6 ring-4 ring-[#F68D2E]/10">
            <svg
              className="h-8 w-8 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-seal-navy dark:text-white">
            Nouvelle version disponible
          </h1>
          <p className="mt-3 text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
            L'intranet a été mis à jour pendant que vous étiez ici. Rechargement
            automatique en cours…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50/50 via-white to-[#F68D2E]/5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-6 ring-4 ring-red-50 dark:ring-red-900/20">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-seal-navy dark:text-white">
          Une erreur est survenue
        </h1>
        <p className="mt-3 text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          Cette section a rencontré un problème inattendu. Essayez de rafraîchir
          la page ou de revenir au tableau de bord.
        </p>
        {error.message && (
          <p className="mt-2 text-xs text-red-400 dark:text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 font-mono">
            {error.message.substring(0, 120)}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={reset}
            aria-label="Réessayer le chargement de la page"
            className="inline-flex items-center gap-2 rounded-xl bg-seal-navy px-6 py-3 text-sm font-semibold text-white hover:bg-seal-navy/90 transition-all hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Réessayer
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Tableau de bord
          </Link>
        </div>
        <p className="mt-6 text-xs text-seal-gray-500 dark:text-slate-500">
          Le problème persiste ?{" "}
          <Link
            href="/helpdesk"
            className="font-semibold text-seal-blue hover:underline dark:text-seal-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Contacter le support
          </Link>
        </p>
      </div>
    </div>
  );
}
