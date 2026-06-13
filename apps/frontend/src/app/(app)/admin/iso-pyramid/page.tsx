"use client";

/**
 * Page /admin/iso-pyramid — Vue Pyramide documentaire PRO_040 §7.1.
 *
 * Affiche la pyramide des 4 niveaux documentaires SMSI (GOVERNANCE,
 * OPERATIONAL, EVIDENCE, COMMUNICATION) avec compteurs par priorite,
 * indicateur de couverture (% APPROVED), classifications POL_015 §5
 * et totaux SMSI vivants (incluant la sync SharePoint).
 *
 * Endpoint backend : GET /rssi-dashboard/iso-pyramid (Agent dashboard).
 * Acces : UserRole.ADMIN minimum.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Layers, ArrowLeft, FileCheck2, ShieldAlert, Cloud } from "lucide-react";
import {
  DocumentLevel,
  DocumentPriority,
  DOCUMENT_LEVEL_LABELS,
  DOCUMENT_PRIORITY_LABELS,
  UserRole,
} from "@omnitech/shared";
import { Card, CardContent, Badge, Button } from "@omnitech/ui";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

type LevelKey = DocumentLevel | "UNCATEGORIZED";

interface PyramidLevel {
  level: LevelKey;
  total: number;
  approved: number;
  coveragePct: number;
  byPriority: Record<DocumentPriority, number>;
}

interface PyramidData {
  generatedAt: string;
  levels: PyramidLevel[];
  totals: {
    documents: number;
    approved: number;
    blocking: number;
    sharePointSync: number;
    coveragePct: number;
  };
  classifications: Record<string, number>;
}

const LEVEL_ORDER: LevelKey[] = [
  DocumentLevel.GOVERNANCE,
  DocumentLevel.OPERATIONAL,
  DocumentLevel.EVIDENCE,
  DocumentLevel.COMMUNICATION,
  "UNCATEGORIZED",
];

const LEVEL_LABEL_EXT: Record<LevelKey, string> = {
  ...DOCUMENT_LEVEL_LABELS,
  UNCATEGORIZED: "Non categorise",
};

const LEVEL_ACCENT: Record<LevelKey, { card: string; chip: string; bar: string }> = {
  [DocumentLevel.GOVERNANCE]: {
    card: "border-t-[3px] border-t-purple-500",
    chip: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    bar: "bg-purple-500",
  },
  [DocumentLevel.OPERATIONAL]: {
    card: "border-t-[3px] border-t-[#296DC1]",
    chip: "bg-[#296DC1]/10 text-[#1e5494] dark:bg-blue-900/30 dark:text-blue-300",
    bar: "bg-[#296DC1]",
  },
  [DocumentLevel.EVIDENCE]: {
    card: "border-t-[3px] border-t-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  [DocumentLevel.COMMUNICATION]: {
    card: "border-t-[3px] border-t-amber-500",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  UNCATEGORIZED: {
    card: "border-t-[3px] border-t-gray-300 dark:border-t-slate-600",
    chip: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400",
    bar: "bg-gray-400",
  },
};

const PRIORITY_ORDER: DocumentPriority[] = [
  DocumentPriority.CRITICAL,
  DocumentPriority.HIGH,
  DocumentPriority.MEDIUM,
  DocumentPriority.LOW,
];

const PRIORITY_CHIP: Record<DocumentPriority, string> = {
  [DocumentPriority.CRITICAL]:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/25 dark:text-red-300 dark:border-red-800",
  [DocumentPriority.HIGH]:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/25 dark:text-orange-300 dark:border-orange-800",
  [DocumentPriority.MEDIUM]:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/25 dark:text-blue-300 dark:border-blue-800",
  [DocumentPriority.LOW]:
    "bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

const CLASSIFICATION_ORDER = ["SECRET", "CONFIDENTIEL", "INTERNE", "PUBLIC"] as const;

const CLASSIFICATION_META: Record<
  (typeof CLASSIFICATION_ORDER)[number],
  { label: string; tier: string; chip: string }
> = {
  SECRET: {
    label: "SECRET",
    tier: "Niveau 1",
    chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/25 dark:text-red-300 dark:border-red-800",
  },
  CONFIDENTIEL: {
    label: "CONFIDENTIEL",
    tier: "Niveau 2",
    chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-800",
  },
  INTERNE: {
    label: "INTERNE",
    tier: "Niveau 3",
    chip: "bg-[#296DC1]/10 text-[#1e5494] border-[#296DC1]/20 dark:bg-blue-900/25 dark:text-blue-300 dark:border-blue-800",
  },
  PUBLIC: {
    label: "PUBLIC",
    tier: "Niveau 4",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-800",
  },
};

function coverageBadgeVariant(pct: number): "success" | "warning" {
  return pct >= 80 ? "success" : "warning";
}

interface LevelCardProps {
  level: PyramidLevel;
}

function LevelCard({ level }: LevelCardProps) {
  const accent = LEVEL_ACCENT[level.level];
  const label = LEVEL_LABEL_EXT[level.level];
  const pct = level.coveragePct;
  return (
    <Card className={accent.card}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-3xl font-semibold text-seal-navy dark:text-white tabular-nums">
              {level.total}
            </p>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">documents vivants</p>
          </div>
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent.chip}`}
          >
            <Layers className="h-4 w-4" />
          </span>
        </div>

        {/* Couverture (% approved) */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-seal-gray-500 dark:text-slate-400 mb-1">
            <span>Couverture (APPROVED)</span>
            <Badge variant={coverageBadgeVariant(pct)} size="sm">
              {pct}% &middot; {level.approved}/{level.total}
            </Badge>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`Couverture du niveau ${label}`}
          >
            <div
              className={`h-full ${accent.bar} transition-all`}
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
        </div>

        {/* Priorites (REG_016 col. H) */}
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400 mb-1.5">
            Par priorite
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_ORDER.map((p) => {
              const n = level.byPriority[p] ?? 0;
              return (
                <span
                  key={p}
                  title={`${DOCUMENT_PRIORITY_LABELS[p]} : ${n}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_CHIP[p]}`}
                >
                  <span>{DOCUMENT_PRIORITY_LABELS[p]}</span>
                  <span className="font-mono tabular-nums">{n}</span>
                </span>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LevelsGridSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Chargement de la pyramide"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-4">
            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-slate-800" />
            <div className="mt-3 h-7 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-slate-800" />
            <div className="mt-4 h-1.5 w-full animate-pulse rounded bg-gray-200 dark:bg-slate-800" />
            <div className="mt-4 flex gap-1.5">
              {Array.from({ length: 4 }).map((__, j) => (
                <span
                  key={j}
                  className="h-4 w-14 animate-pulse rounded-full bg-gray-200 dark:bg-slate-800"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminIsoPyramidPage() {
  const [data, setData] = useState<PyramidData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/rssi-dashboard/iso-pyramid");
      const payload = (res.data?.data ?? res.data ?? null) as PyramidData | null;
      setData(payload);
    } catch (err: unknown) {
      logger.error(err, { page: "admin/iso-pyramid", context: "load" });
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Impossible de charger la pyramide documentaire";
      toast.error(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Ordonne les niveaux selon LEVEL_ORDER (compense un ordre arbitraire backend)
  const orderedLevels: PyramidLevel[] = React.useMemo(() => {
    if (!data) return [];
    const byKey = new Map<LevelKey, PyramidLevel>();
    for (const lvl of data.levels) byKey.set(lvl.level, lvl);
    return LEVEL_ORDER.map(
      (k) =>
        byKey.get(k) ?? {
          level: k,
          total: 0,
          approved: 0,
          coveragePct: 0,
          byPriority: {
            [DocumentPriority.CRITICAL]: 0,
            [DocumentPriority.HIGH]: 0,
            [DocumentPriority.MEDIUM]: 0,
            [DocumentPriority.LOW]: 0,
          },
        },
    );
  }, [data]);

  return (
    <RoleGuard minRole={UserRole.ADMIN}>
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
        <PageHeader
          title="Pyramide ISO 27001"
          subtitle="Vue PRO_040 §7.1 — pyramide documentaire SMSI (4 niveaux + non categorises)."
          icon={Layers}
          hub="admin"
          actions={
            <Link href="/admin/registre">
              <Button type="button" variant="outline" size="md">
                <ArrowLeft className="h-4 w-4" />
                Retour au registre
              </Button>
            </Link>
          }
        />

        {loading || !data ? (
          <LevelsGridSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {orderedLevels
                .filter((lvl) => lvl.level !== "UNCATEGORIZED" || lvl.total > 0)
                .map((lvl) => (
                  <LevelCard key={lvl.level} level={lvl} />
                ))}
            </div>

            {/* Widgets bas de page : classifications + totaux SMSI */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                        Classifications POL_015 §5
                      </p>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-500 mt-0.5">
                        Echelle canonique a 4 niveaux (ISO 27001 A.5.12).
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-seal-navy/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300"
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CLASSIFICATION_ORDER.map((c) => {
                      const meta = CLASSIFICATION_META[c];
                      const n = data.classifications[c] ?? 0;
                      return (
                        <span
                          key={c}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.chip}`}
                          title={`${meta.tier} — ${meta.label} : ${n} documents`}
                        >
                          <span className="font-mono text-[10px] opacity-70">{meta.tier}</span>
                          <span>{meta.label}</span>
                          <span className="font-mono tabular-nums">{n}</span>
                        </span>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                        Totaux SMSI (vivants)
                      </p>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-500 mt-0.5">
                        Hors ARCHIVED / OBSOLETE.
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F9964A]/10 text-[#c46714] dark:bg-[#F9964A]/20 dark:text-[#FBC078]"
                    >
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                        Total
                      </dt>
                      <dd className="mt-1 text-xl font-semibold text-seal-navy dark:text-white tabular-nums">
                        {data.totals.documents}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                        Approuves
                      </dt>
                      <dd className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                        {data.totals.approved}
                        <span className="text-[11px] text-seal-gray-500 dark:text-slate-500 ml-1 font-normal">
                          ({data.totals.coveragePct}%)
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                        Bloquants
                      </dt>
                      <dd className="mt-1 text-xl font-semibold text-red-600 dark:text-red-300 tabular-nums">
                        {data.totals.blocking}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Cloud className="h-3 w-3" /> SharePoint
                        </span>
                      </dt>
                      <dd className="mt-1 text-xl font-semibold text-[#1e5494] dark:text-blue-300 tabular-nums">
                        {data.totals.sharePointSync}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>

            <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
              Genere le{" "}
              {new Date(data.generatedAt).toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
