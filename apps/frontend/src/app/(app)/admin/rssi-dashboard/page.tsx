"use client";

/**
 * Tableau de bord RSSI — refonte ISO 27001:2022.
 *
 * Sections :
 *  1. Header avec cyber-score (ring SVG + delta 7j/30j)
 *  2. État du SMSI (politiques, actifs, risques, revues)
 *  3. Incidents 30j (sparkline SVG inline + top 3)
 *  4. Conformité (avancement chantiers ISO)
 *  5. Indicateurs MTTR / MTTD / EDR / MFA
 *  6. Bouton "Générer rapport SMSI PDF" en haut à droite
 *
 * Toutes les requêtes sont parallélisées et tolérantes aux pannes :
 * un endpoint en erreur n'empêche pas les autres widgets de s'afficher.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Skeleton,
} from "@omnitech/ui";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { PageHeader } from "@/components/layout/page-header";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  FileDown,
  RefreshCw,
  Flame,
  KeyRound,
  Clock,
  Target,
  ClipboardCheck,
  ListChecks,
  Layers,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────── */
/* Types                                                                */
/* ─────────────────────────────────────────────────────────────────── */

interface CyberScore {
  score: number;
  trends: {
    delta7d: number | null;
    delta30d: number | null;
  };
  domains?: Array<{ key: string; iso: string; name: string; score: number }>;
}

interface SmsiState {
  activePolicies: number;
  criticalAssets: number;
  openRisks: number;
  lastReview: { date: string | null; title: string } | null;
  nextReview: { date: string | null; title: string } | null;
  activeFrameworks: number;
}

interface IncidentTrend {
  windowDays: number;
  total: number;
  buckets: number[];
  top: Array<{
    id: string;
    reference: string;
    title: string;
    severity: string;
    status: string;
    detectedAt: string;
  }>;
}

interface ComplianceProgress {
  controls: { total: number; covered: number; pct: number };
  tasks: { total: number; completed: number; overdue: number };
  byDomain: Record<string, { total: number; covered: number; pct: number }>;
}

interface OperationalIndicators {
  mttrHours: number | null;
  mttdHours: number | null;
  edrPct: number | null;
  edrSampleSize: number;
  mfaPct: number;
  mfaActiveUsers: number;
  mfaEnabledUsers: number;
}

const AUTO_REFRESH_MS = 60_000;

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function deltaIcon(delta: number | null) {
  if (delta == null) return Minus;
  if (delta > 0) return TrendingUp;
  if (delta < 0) return TrendingDown;
  return Minus;
}

function deltaColorClass(delta: number | null): string {
  if (delta == null) return "text-seal-gray-500 dark:text-slate-400";
  if (delta > 0) return "text-emerald-600";
  if (delta < 0) return "text-red-600";
  return "text-seal-gray-500 dark:text-slate-400";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

const SEVERITY_BADGE: Record<
  string,
  { variant: "error" | "warning" | "info"; label: string; color: string }
> = {
  CRITICAL: { variant: "error", label: "Critique", color: "#cc0000" },
  HIGH: { variant: "warning", label: "Haute", color: "#892034" },
  MEDIUM: { variant: "info", label: "Moyenne", color: "#c68200" },
  LOW: { variant: "info", label: "Faible", color: "#70916a" },
};

/* ─────────────────────────────────────────────────────────────────── */
/* Sparkline SVG inline (sans recharts)                                  */
/* ─────────────────────────────────────────────────────────────────── */

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}

function Sparkline({
  values,
  width = 280,
  height = 60,
  stroke = "#004469",
  fill = "rgba(246, 141, 46, 0.2)",
}: SparklineProps) {
  if (!values || values.length === 0) {
    return (
      <svg width={width} height={height} className="block">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#e5e7eb"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      </svg>
    );
  }
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 4) - 2;
    return [x, y] as [number, number];
  });
  const linePath = points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const fillPath = `${linePath} L${width},${height} L0,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      className="block"
      role="img"
      aria-label={`Sparkline ${values.length} points, max ${max}`}
    >
      <path d={fillPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={1.5} fill={stroke} />
      ))}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Cyber-score Ring (header)                                            */
/* ─────────────────────────────────────────────────────────────────── */

interface CyberRingProps {
  score: number;
}

function CyberRing({ score }: CyberRingProps) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);
  return (
    <div className="relative flex-shrink-0">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        className="rotate-[-90deg]"
        role="img"
        aria-label={`Cyber-score ${score} sur 100`}
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-gray-200 dark:text-slate-700"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
        <span className="text-3xl font-medium text-seal-navy dark:text-white leading-none tabular-nums">
          {score}
        </span>
        <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 mt-0.5">
          / 100
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Page                                                                  */
/* ─────────────────────────────────────────────────────────────────── */

export default function RSSIDashboardPage() {
  const [cyber, setCyber] = useState<CyberScore | null>(null);
  const [smsi, setSmsi] = useState<SmsiState | null>(null);
  const [trend, setTrend] = useState<IncidentTrend | null>(null);
  const [compliance, setCompliance] = useState<ComplianceProgress | null>(null);
  const [indicators, setIndicators] = useState<OperationalIndicators | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(() => {
    Promise.allSettled([
      api.get("/cyber-score"),
      api.get("/rssi-dashboard/smsi-state"),
      api.get("/rssi-dashboard/incidents-trend"),
      api.get("/rssi-dashboard/compliance-progress"),
      api.get("/rssi-dashboard/indicators"),
    ])
      .then(([cyberR, smsiR, trendR, compR, indR]) => {
        if (cyberR.status === "fulfilled") setCyber(cyberR.value.data);
        if (smsiR.status === "fulfilled") setSmsi(smsiR.value.data);
        if (trendR.status === "fulfilled") setTrend(trendR.value.data);
        if (compR.status === "fulfilled") setCompliance(compR.value.data);
        if (indR.status === "fulfilled") setIndicators(indR.value.data);
        setLastRefresh(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * Génère et télécharge le rapport SMSI ISO 27001 (PDF, 9 chapitres).
   */
  const downloadSmsiPdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      const response = await api.post(
        "/rssi-dashboard/report.pdf",
        {},
        {
          responseType: "blob",
        },
      );
      const blob = new Blob([response.data as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().split("T")[0];
      a.download = `rapport-smsi-iso27001-${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error(err, {
        page: "admin/rssi-dashboard",
        context: "smsi pdf download",
      });
      if (typeof window !== "undefined") {
        window.alert(
          "Impossible de générer le rapport SMSI. Vérifiez vos droits (ADMIN / SUPER_ADMIN).",
        );
      }
    } finally {
      setPdfLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    intervalRef.current = setInterval(loadAll, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadAll]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  const Delta7Icon = deltaIcon(cyber?.trends?.delta7d ?? null);
  const Delta30Icon = deltaIcon(cyber?.trends?.delta30d ?? null);

  return (
    <div className="space-y-6">
      <div className="no-print">
        <AdminGroupTabs group="audit" />
      </div>

      <div className="animate-fade-in-up stagger-item">
        <PageHeader
          title="Tableau de bord RSSI"
          subtitle={`SMSI ISO 27001:2022 • Refresh auto 60s • ${lastRefresh.toLocaleTimeString("fr-FR")}`}
          icon={ShieldCheck}
          hub="rssi"
          actions={
            <div className="flex gap-2 print:hidden">
              <Button
                variant="secondary"
                size="sm"
                onClick={loadAll}
                title="Actualiser"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={downloadSmsiPdf}
                disabled={pdfLoading}
                title="Rapport SMSI structuré ISO 27001 (9 chapitres) signé SHA-256"
              >
                <FileDown className="h-4 w-4" />
                {pdfLoading
                  ? "Génération..."
                  : "Générer rapport SMSI PDF"}
              </Button>
            </div>
          }
        />
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* HEADER : cyber-score                                           */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Card accent className="animate-fade-in-up stagger-item">
        <CardContent>
          {cyber ? (
            <div className="flex items-center gap-6 flex-wrap">
              <CyberRing score={cyber.score} />
              <div className="flex-1 min-w-[240px]">
                <h2 className="text-xl font-medium text-seal-navy dark:text-white">
                  Cyber-score global
                </h2>
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
                  Évaluation pondérée /100 sur 10 domaines ISO 27001:2022.
                </p>
                <div className="flex gap-6 mt-3">
                  <div
                    className={`flex items-center gap-1.5 text-sm font-medium ${deltaColorClass(cyber.trends?.delta7d ?? null)}`}
                  >
                    <Delta7Icon className="h-4 w-4" />
                    <span>
                      Δ7j {cyber.trends?.delta7d ?? "n/a"}
                      {cyber.trends?.delta7d != null ? " pts" : ""}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 text-sm font-medium ${deltaColorClass(cyber.trends?.delta30d ?? null)}`}
                  >
                    <Delta30Icon className="h-4 w-4" />
                    <span>
                      Δ30j {cyber.trends?.delta30d ?? "n/a"}
                      {cyber.trends?.delta30d != null ? " pts" : ""}
                    </span>
                  </div>
                </div>
              </div>
              {cyber.domains && cyber.domains.length > 0 && (
                <div className="flex-1 min-w-[240px] space-y-1">
                  {cyber.domains.slice(0, 4).map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="w-32 truncate text-seal-gray-500 dark:text-slate-400">
                        {d.name}
                      </span>
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${d.score}%`,
                            background: scoreColor(d.score),
                          }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums text-seal-navy dark:text-white font-medium">
                        {d.score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-seal-gray-500 dark:text-slate-400 py-3">
              Cyber-score indisponible (droits SUPER_ADMIN requis pour cet
              endpoint).
            </div>
          )}
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* GRID 12 COLONNES                                              */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4 animate-fade-in-up stagger-item">
        {/* État du SMSI ─ 4 col */}
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <h2 className="font-medium text-seal-navy dark:text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" /> État du SMSI
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <SmsiKpiRow
              label="Politiques actives"
              value={smsi?.activePolicies}
              icon={ClipboardCheck}
            />
            <SmsiKpiRow
              label="Actifs critiques"
              value={smsi?.criticalAssets}
              icon={ShieldAlert}
              tone={smsi && smsi.criticalAssets > 0 ? "amber" : "default"}
            />
            <SmsiKpiRow
              label="Risques ouverts"
              value={smsi?.openRisks}
              icon={Flame}
              tone={smsi && smsi.openRisks > 0 ? "red" : "green"}
            />
            <SmsiKpiRow
              label="Frameworks actifs"
              value={smsi?.activeFrameworks}
              icon={Layers}
            />
            <div className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-seal-gray-500 dark:text-slate-400">
                  Dernière revue de direction
                </span>
                <span className="text-seal-navy dark:text-white font-medium">
                  {formatDate(smsi?.lastReview?.date)}
                </span>
              </div>
              {smsi?.lastReview?.title && (
                <p className="text-seal-gray-500 dark:text-slate-500 truncate">
                  « {smsi.lastReview.title} »
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-seal-gray-500 dark:text-slate-400">
                  Prochaine revue
                </span>
                <span className="text-seal-navy dark:text-white font-medium">
                  {formatDate(smsi?.nextReview?.date)}
                </span>
              </div>
              {smsi?.nextReview?.title && (
                <p className="text-seal-gray-500 dark:text-slate-500 truncate">
                  « {smsi.nextReview.title} »
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Incidents 30j ─ 8 col */}
        <Card className="col-span-12 md:col-span-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-seal-navy dark:text-white flex items-center gap-2">
                <Flame className="h-5 w-5 text-red-500" /> Incidents 30 jours
              </h2>
              <Link
                href="/incidents"
                className="text-xs text-primary hover:underline"
              >
                Voir tous →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-6 mb-4 flex-wrap">
              <div>
                <p className="text-3xl font-medium text-seal-navy dark:text-white tabular-nums">
                  {trend?.total ?? 0}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  incidents détectés
                </p>
              </div>
              <div className="flex-1 min-w-[260px]">
                <Sparkline values={trend?.buckets ?? []} />
                <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">
                  J-30 → aujourd'hui
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-slate-700 pt-3">
              <p className="text-xs font-medium text-seal-gray-500 dark:text-slate-400 mb-2">
                Top {trend?.top.length ?? 0} par sévérité
              </p>
              {!trend?.top || trend.top.length === 0 ? (
                <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                  Aucun incident critique ou élevé en cours.
                </p>
              ) : (
                <div className="space-y-2">
                  {trend.top.map((inc) => {
                    const sev =
                      SEVERITY_BADGE[inc.severity] ?? SEVERITY_BADGE.LOW!;
                    return (
                      <Link
                        key={inc.id}
                        href={`/incidents/${inc.id}`}
                        className="block"
                      >
                        <div
                          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors border border-gray-100 dark:border-slate-700"
                        >
                          <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ background: sev.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-seal-navy dark:text-white truncate">
                              {inc.title}
                            </p>
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                              {inc.reference} • {inc.status}
                            </p>
                          </div>
                          <Badge
                            variant={sev.variant}
                            className="text-[10px] flex-shrink-0"
                          >
                            {sev.label}
                          </Badge>
                          <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
                            {formatDate(inc.detectedAt)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Conformité ─ 8 col */}
        <Card className="col-span-12 md:col-span-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-seal-navy dark:text-white flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" /> Conformité ISO 27001
              </h2>
              <Link
                href="/admin/compliance"
                className="text-xs text-primary hover:underline"
              >
                Détail →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {compliance ? (
              <>
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  <div className="text-center">
                    <p className="text-3xl font-medium text-seal-navy dark:text-white tabular-nums">
                      {compliance.controls.pct}%
                    </p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                      {compliance.controls.covered}/{compliance.controls.total}{" "}
                      contrôles
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-medium text-emerald-600 tabular-nums">
                      {compliance.tasks.completed}
                    </p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                      tâches réalisées
                    </p>
                  </div>
                  <div className="text-center">
                    <p
                      className={`text-2xl font-medium tabular-nums ${compliance.tasks.overdue > 0 ? "text-red-600" : "text-seal-gray-500 dark:text-slate-400"}`}
                    >
                      {compliance.tasks.overdue}
                    </p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                      en retard
                    </p>
                  </div>
                  <div className="flex-1" />
                </div>

                <div className="space-y-2">
                  {Object.entries(compliance.byDomain).map(([dom, v]) => (
                    <div
                      key={dom}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="w-32 truncate text-seal-gray-500 dark:text-slate-400 font-medium">
                        {dom}
                      </span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${v.pct}%`,
                            background: scoreColor(v.pct),
                          }}
                        />
                      </div>
                      <span className="w-12 text-right tabular-nums text-seal-navy dark:text-white">
                        {v.covered}/{v.total}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                Données de conformité indisponibles.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Indicateurs MTTR/MTTD/EDR/MFA ─ 4 col */}
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <h2 className="font-medium text-seal-navy dark:text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Indicateurs SOC
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <IndicatorRow
              label="MTTR"
              hint="Mean Time To Resolve (30j)"
              value={
                indicators?.mttrHours != null
                  ? `${indicators.mttrHours}h`
                  : "—"
              }
              icon={Clock}
            />
            <IndicatorRow
              label="MTTD"
              hint="Mean Time To Detect (30j)"
              value={
                indicators?.mttdHours != null
                  ? `${indicators.mttdHours}h`
                  : "—"
              }
              icon={AlertTriangle}
            />
            <IndicatorRow
              label="EDR < 1h"
              hint={`endpoints contenus (${indicators?.edrSampleSize ?? 0} ech.)`}
              value={
                indicators?.edrPct != null ? `${indicators.edrPct}%` : "—"
              }
              icon={ShieldCheck}
              tone={
                indicators?.edrPct != null
                  ? indicators.edrPct >= 80
                    ? "green"
                    : indicators.edrPct >= 50
                      ? "amber"
                      : "red"
                  : "default"
              }
            />
            <IndicatorRow
              label="MFA"
              hint={`${indicators?.mfaEnabledUsers ?? 0}/${indicators?.mfaActiveUsers ?? 0} utilisateurs`}
              value={
                indicators?.mfaPct != null ? `${indicators.mfaPct}%` : "—"
              }
              icon={KeyRound}
              tone={
                indicators?.mfaPct != null
                  ? indicators.mfaPct >= 80
                    ? "green"
                    : indicators.mfaPct >= 50
                      ? "amber"
                      : "red"
                  : "default"
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* LIENS RAPIDES                                                  */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 print:hidden animate-fade-in-up stagger-item">
        {[
          { href: "/admin/compliance", label: "Conformité", icon: ShieldCheck },
          { href: "/incidents", label: "Incidents", icon: Flame },
          { href: "/veille", label: "Veille cyber", icon: AlertTriangle },
          { href: "/admin/audit", label: "Journal audit", icon: ListChecks },
          { href: "/admin/users", label: "Utilisateurs", icon: KeyRound },
        ].map((it) => (
          <Link key={it.href} href={it.href}>
            <Card hoverable>
              <CardContent className="text-center py-5">
                <it.icon className="h-7 w-7 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-seal-navy dark:text-white">
                  {it.label}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Sub-components                                                       */
/* ─────────────────────────────────────────────────────────────────── */

function SmsiKpiRow({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  tone?: "default" | "red" | "green" | "amber";
}) {
  const colorMap: Record<string, string> = {
    default: "text-seal-navy dark:text-white",
    red: "text-red-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
  };
  const bgMap: Record<string, string> = {
    default: "bg-gray-100 dark:bg-slate-800",
    red: "bg-red-50 dark:bg-red-900/20",
    green: "bg-emerald-50 dark:bg-emerald-900/20",
    amber: "bg-amber-50 dark:bg-amber-900/20",
  };
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center ${bgMap[tone] ?? bgMap.default}`}
      >
        <Icon className={`h-4 w-4 ${colorMap[tone] ?? colorMap.default}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-seal-gray-500 dark:text-slate-400">
          {label}
        </p>
      </div>
      <p
        className={`text-lg font-medium tabular-nums ${colorMap[tone] ?? colorMap.default}`}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

function IndicatorRow({
  label,
  hint,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  hint: string;
  value: string;
  icon: React.ElementType;
  tone?: "default" | "red" | "green" | "amber";
}) {
  const colorMap: Record<string, string> = {
    default: "text-seal-navy dark:text-white",
    red: "text-red-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
  };
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-seal-navy dark:text-white">
          {label}
        </p>
        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
          {hint}
        </p>
      </div>
      <p
        className={`text-lg font-medium tabular-nums ${colorMap[tone] ?? colorMap.default}`}
      >
        {value}
      </p>
    </div>
  );
}
