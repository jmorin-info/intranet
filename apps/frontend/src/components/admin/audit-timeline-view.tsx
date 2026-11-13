"use client";

/**
 * Audit Timeline View
 * -----------------------------------------------------------------------------
 * Extrait de `app/(app)/admin/audit-timeline/page.tsx` pour être ré-utilisé
 * dans la page unifiée `/admin/audit` (onglet « Chronologie »).
 *
 * Zero changement de logique métier par rapport au fichier d'origine : seuls
 * le wrapper bg-gray-50/min-h-screen, <AdminGroupTabs> et le header (h1)
 * ont été retirés (c'est le parent qui les pose) pour éviter double titre
 * et double tabs.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { PdfExportButton } from "@/components/ui/pdf-export-button";
import type { SignedPdfRequest } from "@/lib/export-pdf";
import { Skeleton, EmptyState } from "@omnitech/ui";
import { useTranslation } from "@/lib/i18n";

// --- Types ---

type Severity = "INFO" | "WARN" | "CRITICAL";

interface AuditEntry {
  id: string;
  userId: string | null;
  user?: { id: string; email: string; firstName: string; lastName: string } | null;
  ipAddress: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  severity: Severity;
  createdAt: string;
}

interface AuditListResponse {
  data: AuditEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface AuditStats {
  from: string;
  to: string;
  total: number;
  bySeverity: Record<Severity, number>;
  topActions: { action: string; count: number }[];
  criticalEvents: AuditEntry[];
  failedLogins: number;
  topFailedLoginIps: { ip: string; count: number }[];
}

type PeriodKey = "24h" | "7d" | "30d" | "quarter" | "year";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "24h", label: "Dernières 24h" },
  { value: "7d", label: "7 derniers jours" },
  { value: "30d", label: "30 derniers jours" },
  { value: "quarter", label: "Trimestre courant" },
  { value: "year", label: "Année courante" },
];

const ALL_SEVERITIES: Severity[] = ["INFO", "WARN", "CRITICAL"];

// --- Helpers ---

function computeRange(period: PeriodKey): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  switch (period) {
    case "24h":
      from.setDate(from.getDate() - 1);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "quarter": {
      const q = Math.floor(to.getMonth() / 3);
      return { from: new Date(to.getFullYear(), q * 3, 1), to };
    }
    case "year":
      return { from: new Date(to.getFullYear(), 0, 1), to };
  }
  return { from, to };
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const days = Math.floor(h / 24);
  return `il y a ${days}j`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function severityIcon(sev: Severity) {
  switch (sev) {
    case "CRITICAL":
      return <AlertOctagon className="h-5 w-5 text-red-600 dark:text-red-400" />;
    case "WARN":
      return <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
    default:
      return <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
  }
}

function severityBadgeClass(sev: Severity): string {
  switch (sev) {
    case "CRITICAL":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "WARN":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    default:
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
}

// --- Composant ---

export function AuditTimelineView() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [severities, setSeverities] = useState<Severity[]>(["WARN", "CRITICAL"]);
  const [actionFilter, setActionFilter] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const range = useMemo(() => computeRange(period), [period]);

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        // Si plusieurs severities sélectionnées, on fait un appel par severity
        // puis on merge, car l'endpoint ne supporte pas le multi-severity.
        const calls =
          severities.length > 0
            ? severities.map((sev) =>
                api.get<AuditListResponse>("/audit", {
                  params: {
                    severity: sev,
                    action: actionFilter || undefined,
                    dateFrom: range.from.toISOString(),
                    dateTo: range.to.toISOString(),
                    page: targetPage,
                    limit: 50,
                  },
                }),
              )
            : [
                api.get<AuditListResponse>("/audit", {
                  params: {
                    action: actionFilter || undefined,
                    dateFrom: range.from.toISOString(),
                    dateTo: range.to.toISOString(),
                    page: targetPage,
                    limit: 50,
                  },
                }),
              ];

        const responses = await Promise.all(calls);
        const merged: AuditEntry[] = [];
        let maxTotal = 0;
        let maxPages = 1;
        for (const r of responses) {
          merged.push(...r.data.data);
          maxTotal += r.data.meta.total;
          if (r.data.meta.totalPages > maxPages) maxPages = r.data.meta.totalPages;
        }
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setTotal(maxTotal);
        setTotalPages(maxPages);
        setEntries((prev) => (append ? [...prev, ...merged] : merged));
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || err?.message || "Impossible de charger les événements",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [severities, actionFilter, range],
  );

  const fetchStats = useCallback(async () => {
    setStatsError(false);
    try {
      const res = await api.get<AuditStats>("/audit/stats", {
        params: { from: range.from.toISOString(), to: range.to.toISOString() },
      });
      setStats(res.data);
    } catch (err: any) {
      // Fallback silencieux : la frise continue à fonctionner sans stats
      setStatsError(true);
      setStats(null);
      toast.warning("Statistiques indisponibles", {
        description: "Le rapport PDF sera généré sans agrégats.",
      });
    }
  }, [range]);

  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
    fetchStats();
  }, [fetchPage, fetchStats]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  };

  const toggleSeverity = (sev: Severity) => {
    setSeverities((prev) => (prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]));
  };

  // Groupement par jour
  const grouped = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of entries) {
      const dayKey = new Date(e.createdAt).toISOString().slice(0, 10);
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  // --- Payload PDF ---
  const pdfPayload = useCallback((): SignedPdfRequest => {
    const fromLabel = range.from.toLocaleDateString("fr-FR");
    const toLabel = range.to.toLocaleDateString("fr-FR");

    const sections: SignedPdfRequest["sections"] = [];

    if (stats) {
      sections.push({
        heading: "Synthèse",
        paragraphs: [
          `Nombre total d'événements : ${stats.total}`,
          `Répartition par sévérité : INFO ${stats.bySeverity.INFO ?? 0} • WARN ${stats.bySeverity.WARN ?? 0} • CRITICAL ${stats.bySeverity.CRITICAL ?? 0}`,
          `Top 5 actions : ${
            stats.topActions.length === 0
              ? "aucune"
              : stats.topActions.map((a) => `${a.action} (${a.count})`).join(", ")
          }`,
        ],
      });

      sections.push({
        heading: "Événements critiques",
        paragraphs:
          stats.criticalEvents.length === 0
            ? ["Aucun événement critique sur la période."]
            : stats.criticalEvents.slice(0, 50).map((e) => {
                const who = e.user?.email || e.userId || "système";
                return `${new Date(e.createdAt).toLocaleString("fr-FR")} — ${e.action} — ${e.resourceType}${
                  e.resourceId ? `#${e.resourceId.slice(0, 8)}` : ""
                } — ${who}`;
              }),
      });

      sections.push({
        heading: "Échecs de connexion",
        paragraphs: [
          `Nombre total d'échecs LOGIN_FAILED : ${stats.failedLogins}`,
          stats.topFailedLoginIps.length === 0
            ? "Aucune IP source identifiée."
            : `Top 10 IPs : ${stats.topFailedLoginIps.map((i) => `${i.ip} (${i.count})`).join(", ")}`,
        ],
      });
    } else {
      sections.push({
        heading: "Synthèse",
        paragraphs: [
          "Statistiques indisponibles au moment de la génération.",
          `Événements listés dans la frise : ${entries.length}`,
        ],
      });
    }

    return {
      title: "Rapport d'audit trimestriel",
      subtitle: `Période : ${fromLabel} → ${toLabel}`,
      reference: `AUDIT-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}`,
      context: "ISO 27001 A.5.36 — Revue du journal d'audit sécurité",
      sections,
    };
  }, [stats, entries.length, range]);

  // --- Rendu ---
  return (
    <div className="space-y-6">
      {/* Actions (rafraîchir + export PDF) */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setPage(1);
            fetchPage(1, false);
            fetchStats();
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Rafraîchir
        </button>
        <PdfExportButton payload={pdfPayload} label="Rapport trimestriel" />
      </div>

      {/* Filtres */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
              Période
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-seal-navy dark:text-white"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
              Sévérité
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_SEVERITIES.map((sev) => {
                const active = severities.includes(sev);
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => toggleSeverity(sev)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      active
                        ? `${severityBadgeClass(sev)} border-transparent`
                        : "bg-white dark:bg-slate-950 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700"
                    }`}
                  >
                    {severityIcon(sev)}
                    {sev}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
              Action (contient)
            </label>
            <input
              type="text"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder="LOGIN_FAILED, LDAP_, INCIDENT_…"
              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-seal-navy dark:text-white"
            />
          </div>
        </div>

        {/* Mini-stats rapide */}
        {stats && !statsError && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
            <span className="text-xs text-gray-600 dark:text-slate-400">
              Total : <strong className="text-seal-navy dark:text-white">{stats.total}</strong>
            </span>
            <span className="text-xs text-gray-600 dark:text-slate-400">
              CRITICAL :{" "}
              <strong className="text-red-600 dark:text-red-400">
                {stats.bySeverity.CRITICAL ?? 0}
              </strong>
            </span>
            <span className="text-xs text-gray-600 dark:text-slate-400">
              WARN :{" "}
              <strong className="text-amber-600 dark:text-amber-400">
                {stats.bySeverity.WARN ?? 0}
              </strong>
            </span>
            <span className="text-xs text-gray-600 dark:text-slate-400">
              Échecs login :{" "}
              <strong className="text-seal-navy dark:text-white">{stats.failedLogins}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Frise */}
      <div className="relative">
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && entries.length === 0 && (
          <EmptyState
            type="general"
            title="Aucun événement"
            description="Aucun événement ne correspond à la période et aux filtres sélectionnés."
          />
        )}

        {!loading && entries.length > 0 && (
          <div className="space-y-6">
            {grouped.map(([day, dayEvents]) => (
              <div key={day}>
                <div className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-950 py-2 mb-3">
                  <h2 className="text-sm font-semibold text-seal-navy dark:text-white capitalize">
                    {formatDate(day + "T00:00:00Z", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-slate-500">
                      ({dayEvents.length} événement{dayEvents.length > 1 ? "s" : ""})
                    </span>
                  </h2>
                </div>
                <ol className="relative border-l-2 border-gray-200 dark:border-slate-800 ml-4 space-y-4">
                  {dayEvents.map((e) => {
                    const isOpen = !!expanded[e.id];
                    return (
                      <li key={e.id} className="ml-6">
                        <span className="absolute -left-[11px] flex items-center justify-center w-5 h-5 rounded-full bg-white dark:bg-slate-900 ring-4 ring-gray-50 dark:ring-slate-950">
                          {severityIcon(e.severity)}
                        </span>
                        <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${severityBadgeClass(
                                    e.severity,
                                  )}`}
                                >
                                  {e.severity}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-seal-navy/10 dark:bg-slate-800 text-[11px] font-mono text-seal-navy dark:text-white">
                                  {e.action}
                                </span>
                                <span className="text-[11px] text-gray-500 dark:text-slate-500">
                                  {e.resourceType}
                                  {e.resourceId ? ` #${e.resourceId.slice(0, 8)}` : ""}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 dark:text-slate-400">
                                {e.user
                                  ? `${e.user.firstName} ${e.user.lastName} (${e.user.email})`
                                  : e.userId || "Système"}
                                {e.ipAddress ? ` • ${e.ipAddress}` : ""}
                              </div>
                            </div>
                            <div className="text-right text-[11px] text-gray-500 dark:text-slate-500 whitespace-nowrap">
                              <div>{formatTime(e.createdAt)}</div>
                              <div>{relativeTime(e.createdAt)}</div>
                            </div>
                          </div>

                          {e.metadata && Object.keys(e.metadata).length > 0 && (
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpanded((prev) => ({ ...prev, [e.id]: !prev[e.id] }))
                                }
                                className="inline-flex items-center gap-1 text-[11px] text-seal-navy dark:text-slate-300 hover:underline"
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                                Métadonnées
                              </button>
                              {isOpen && (
                                <pre className="mt-2 p-3 rounded-md bg-gray-50 dark:bg-slate-950 text-[11px] text-gray-700 dark:text-slate-300 overflow-x-auto border border-gray-100 dark:border-slate-800">
                                  {JSON.stringify(e.metadata, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && entries.length > 0 && page < totalPages && (
          <div className="flex justify-center pt-6">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Charger 50 événements de plus
            </button>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="text-center text-[11px] text-gray-500 dark:text-slate-500 pt-4">
            {entries.length} / {total} événements affichés
          </div>
        )}
      </div>
    </div>
  );
}
