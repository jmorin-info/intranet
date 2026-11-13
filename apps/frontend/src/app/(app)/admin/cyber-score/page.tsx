"use client";

/**
 * Page /admin/cyber-score — score cyber /100 basé sur 10 domaines ISO 27001:2022.
 *
 * Hero : score global en gros (jauge SVG inline), couleur seal selon seuil
 * (>=80 vert, 60-79 orange, <60 bordeaux), avec deltas 7j / 30j.
 *
 * Grille : 10 cartes (une par domaine) avec score + signaux.
 * Historique : sparkline SVG inline (90 jours).
 *
 * Bouton "Recalculer maintenant" → POST /cyber-score/recompute.
 */

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Skeleton,
  Badge,
} from "@omnitech/ui";
import { UserRole } from "@omnitech/shared";
import { RoleGuard } from "@/components/role-guard";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { PageHeader } from "@/components/layout/page-header";
import {
  ShieldCheck,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Minus,
  TrendingUp,
} from "lucide-react";

interface Signal {
  label: string;
  value: string;
  weight: number;
  score: number;
}

interface Domain {
  key: string;
  iso: string;
  name: string;
  score: number;
  signals: Signal[];
}

interface CyberScoreResponse {
  score: number;
  computedAt: string;
  domains: Domain[];
  trends: {
    delta7d: number | null;
    delta30d: number | null;
  };
}

interface HistoryPoint {
  createdAt: string;
  score: number;
}

// Palette SEAL ISO (orange/vert/bordeaux, respecte la charte)
const SEAL_GREEN = "#006233";
const SEAL_ORANGE = "#f9964a";
const SEAL_BORDEAUX = "#892034";
const SEAL_TAUPE = "#837274";

/**
 * Palette seal selon le niveau de score. Pas de red générique — on reste
 * sur la charte OMNITECH (bordeaux pour l'alerte).
 */
function scoreColor(score: number): string {
  if (score >= 80) return SEAL_GREEN;
  if (score >= 60) return SEAL_ORANGE;
  return SEAL_BORDEAUX;
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Bon";
  if (score >= 60) return "À surveiller";
  return "À corriger";
}

/**
 * Jauge circulaire SVG inline — aucune dépendance externe.
 */
function ScoreGauge({ score }: { score: number }) {
  const size = 220;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dashoffset = circumference * (1 - pct);
  const color = scoreColor(score);

  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={SEAL_TAUPE}
          strokeOpacity={0.18}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ color }}
      >
        <div className="text-5xl font-bold tabular-nums leading-none">
          {score}
        </div>
        <div className="text-xs uppercase tracking-wider opacity-70 mt-2">
          / 100
        </div>
      </div>
    </div>
  );
}

/**
 * Sparkline SVG inline — pas de librairie. Représente l'évolution du score
 * global sur les `history.length` derniers jours.
 */
function Sparkline({
  data,
  width = 600,
  height = 80,
}: {
  data: HistoryPoint[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-seal-gray-400"
        style={{ height }}
      >
        —
      </div>
    );
  }
  const pad = 4;
  const minScore = Math.min(...data.map((d) => d.score), 0);
  const maxScore = Math.max(...data.map((d) => d.score), 100);
  const range = Math.max(1, maxScore - minScore);
  const xStep = (width - pad * 2) / (data.length - 1);
  const points = data
    .map((d, i) => {
      const x = pad + i * xStep;
      const y =
        height - pad - ((d.score - minScore) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastScore = data[data.length - 1]!.score;
  const color = scoreColor(lastScore);
  const fillPath = `M${pad},${height - pad} L${points.replaceAll(" ", " L")} L${(width - pad).toFixed(1)},${height - pad} Z`;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <path d={fillPath} fill={color} fillOpacity={0.12} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendBadge({ label, delta }: { label: string; delta: number | null }) {
  const { t } = useTranslation();
  if (delta === null) {
    return (
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wider text-seal-gray-400">
          {label}
        </span>
        <span className="text-sm text-seal-gray-400">
          {t("cyberScore.noTrend")}
        </span>
      </div>
    );
  }
  const isUp = delta > 0;
  const isDown = delta < 0;
  const color = isUp ? SEAL_GREEN : isDown ? SEAL_BORDEAUX : SEAL_TAUPE;
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wider text-seal-gray-400">
        {label}
      </span>
      <span
        className="inline-flex items-center gap-1 text-sm font-medium tabular-nums"
        style={{ color }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {delta > 0 ? `+${delta}` : delta}
      </span>
    </div>
  );
}

function DomainCard({ domain }: { domain: Domain }) {
  const { t } = useTranslation();
  const color = scoreColor(domain.score);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-seal-navy dark:text-white truncate">
              {domain.name}
            </div>
            <div className="text-xs text-seal-gray-400 font-mono">
              {domain.iso}
            </div>
          </div>
          <div
            className="flex-shrink-0 rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums"
            style={{ color, backgroundColor: `${color}15` }}
          >
            {domain.score}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-1.5 w-full rounded-full bg-seal-gray-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${domain.score}%`, backgroundColor: color }}
          />
        </div>
        <ul className="mt-3 space-y-1.5">
          {domain.signals.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-seal-gray-500 dark:text-slate-400 truncate pr-2">
                {s.label}
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="font-medium text-seal-navy dark:text-white tabular-nums">
                  {s.value}
                </span>
                <Badge variant="info" className="text-[10px] tabular-nums">
                  {t("cyberScore.weight")} {s.weight}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function CyberScorePage() {
  return (
    <RoleGuard minRole={UserRole.SUPER_ADMIN}>
      <CyberScoreContent />
    </RoleGuard>
  );
}

function CyberScoreContent() {
  const { t } = useTranslation();
  const [data, setData] = useState<CyberScoreResponse | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scoreRes, histRes] = await Promise.all([
        api.get<CyberScoreResponse>("/cyber-score"),
        api
          .get<HistoryPoint[]>("/cyber-score/history", { params: { days: 90 } })
          .catch(() => ({ data: [] as HistoryPoint[] })),
      ]);
      setData(scoreRes.data);
      setHistory(histRes.data || []);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("cyber-score load error", err);
      setError(t("cyberScore.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const recompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const res = await api.post<CyberScoreResponse>("/cyber-score/recompute");
      setData(res.data);
      // Refresh history (new snapshot added).
      const h = await api
        .get<HistoryPoint[]>("/cyber-score/history", { params: { days: 90 } })
        .catch(() => ({ data: [] as HistoryPoint[] }));
      setHistory(h.data || []);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("cyber-score recompute error", err);
      setError(t("cyberScore.error"));
    } finally {
      setRecomputing(false);
    }
  }, [t]);

  const computedAtLabel = data
    ? new Date(data.computedAt).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("cyberScore.title")}
        subtitle={t("cyberScore.subtitle")}
        icon={ShieldCheck}
      />

      <AdminGroupTabs group="audit" />

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-[color:var(--seal-bordeaux)]">
            {error}
          </CardContent>
        </Card>
      )}

      {/* HERO : score global + tendances + recalculer */}
      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
            <div className="flex-shrink-0">
              {loading || !data ? (
                <Skeleton className="h-[220px] w-[220px] rounded-full" />
              ) : (
                <ScoreGauge score={data.score} />
              )}
            </div>

            <div className="flex-1 min-w-0 w-full">
              {loading || !data ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-semibold text-seal-navy dark:text-white">
                      {t("cyberScore.global")}
                    </h2>
                    <Badge
                      style={{
                        color: scoreColor(data.score),
                        borderColor: scoreColor(data.score),
                        backgroundColor: `${scoreColor(data.score)}15`,
                      }}
                      className="border"
                    >
                      {scoreLabel(data.score)}
                    </Badge>
                  </div>
                  <p className="text-xs text-seal-gray-400 mt-1">
                    {t("cyberScore.computedAt")} : {computedAtLabel}
                  </p>

                  <div className="mt-4 flex items-center gap-6 flex-wrap">
                    <TrendBadge
                      label={t("cyberScore.trend7d")}
                      delta={data.trends.delta7d}
                    />
                    <TrendBadge
                      label={t("cyberScore.trend30d")}
                      delta={data.trends.delta30d}
                    />
                    <div className="ml-auto">
                      <Button
                        onClick={recompute}
                        disabled={recomputing}
                        variant="primary"
                        className="gap-2"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${recomputing ? "animate-spin" : ""}`}
                          aria-hidden
                        />
                        {recomputing
                          ? t("cyberScore.recomputing")
                          : t("cyberScore.recompute")}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* HISTORIQUE 90j */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-seal-gray-500" aria-hidden />
            <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
              {t("cyberScore.history")}
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : history.length === 0 ? (
            <p className="text-xs text-seal-gray-400">
              {t("cyberScore.historyEmpty")}
            </p>
          ) : (
            <Sparkline data={history} />
          )}
        </CardContent>
      </Card>

      {/* GRILLE DES 10 DOMAINES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading || !data
          ? Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))
          : data.domains.map((d) => <DomainCard key={d.key} domain={d} />)}
      </div>
    </div>
  );
}
