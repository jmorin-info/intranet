"use client";

/**
 * RegistreStats — bandeau de cartes statistiques pour /admin/registre.
 *
 * Donnees attendues du backend (GET /admin/registre/stats) :
 *   {
 *     total: number;
 *     blocking: number;
 *     critical: number;
 *     byLevel: Record<DocumentLevel, number>;
 *   }
 *
 * Affiche : Total, Bloquants, Critiques, et un pied de carte avec la
 * repartition par niveau de la pyramide PRO_040 §7.1.
 */

import React from "react";
import { DocumentLevel, DOCUMENT_LEVEL_LABELS } from "@omnitech/shared";
import { Card, CardContent, Skeleton } from "@omnitech/ui";
import { FileText, ShieldAlert, AlertTriangle, Layers, RefreshCw } from "lucide-react";

export interface RegistreStatsData {
  total: number;
  blocking: number;
  critical: number;
  byLevel: Partial<Record<DocumentLevel, number>>;
}

interface RegistreStatsProps {
  stats: RegistreStatsData | null;
  loading?: boolean;
  /** Optionnel : rappel pour relancer le chargement (fallback : reload de page). */
  onRetry?: () => void;
}

const LEVEL_ACCENT: Record<DocumentLevel, string> = {
  [DocumentLevel.GOVERNANCE]:
    "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  [DocumentLevel.OPERATIONAL]:
    "bg-seal-blue/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300",
  [DocumentLevel.EVIDENCE]:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  [DocumentLevel.COMMUNICATION]:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const LEVELS_ORDER: DocumentLevel[] = [
  DocumentLevel.GOVERNANCE,
  DocumentLevel.OPERATIONAL,
  DocumentLevel.EVIDENCE,
  DocumentLevel.COMMUNICATION,
];

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
  hint?: string;
}

function StatCard({ label, value, icon: Icon, accent, hint }: StatCardProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-seal-navy dark:text-white">{value}</p>
            {hint && (
              <p className="mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">{hint}</p>
            )}
          </div>
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function RegistreStats({ stats, loading, onRetry }: RegistreStatsProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Chargement des statistiques"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
    );
  }

  // Chargement termine mais aucune donnee : l'appel API a echoue (cf.
  // page.tsx `loadStats` — setStats(null) sans toast bloquant). On distingue
  // explicitement ce cas du chargement pour ne pas laisser un skeleton
  // "en cours" indefiniment.
  if (!stats) {
    return (
      <div
        role="alert"
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 px-4 py-4"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              Statistiques indisponibles
            </p>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
              Le chargement des statistiques du registre a echoue. Les filtres et le tableau restent
              utilisables.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => (onRetry ? onRetry() : window.location.reload())}
          className="inline-flex items-center gap-1.5 rounded-btn border border-amber-300 dark:border-amber-800 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex-shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total documents"
          value={stats.total}
          icon={FileText}
          accent="bg-seal-blue/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300"
          hint="REG_016 — perimetre SMSI"
        />
        <StatCard
          label="Bloquants"
          value={stats.blocking}
          icon={ShieldAlert}
          accent="bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"
          hint="Conformite ISO 27001:2022"
        />
        <StatCard
          label="Critiques"
          value={stats.critical}
          icon={AlertTriangle}
          accent="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          hint="Priorite CRITICAL (REG_016 col. H)"
        />
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                  Par niveau pyramide
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {LEVELS_ORDER.map((lvl) => {
                    const n = stats.byLevel[lvl] ?? 0;
                    return (
                      <span
                        key={lvl}
                        title={`${DOCUMENT_LEVEL_LABELS[lvl]} : ${n}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_ACCENT[lvl]}`}
                      >
                        <span className="truncate max-w-[80px]">
                          {DOCUMENT_LEVEL_LABELS[lvl].split(" ")[0]}
                        </span>
                        <span className="font-mono">{n}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-seal-navy/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300"
              >
                <Layers className="h-4 w-4" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
