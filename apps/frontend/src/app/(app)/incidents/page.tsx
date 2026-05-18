"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useDebounce } from "@/hooks/use-debounce";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { toast } from "sonner";
import { isRoleAtLeast, UserRole } from "@omnitech/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  Select,
  StatusBadge,
  Textarea,
} from "@omnitech/ui";
import type { Column } from "@omnitech/ui";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter as FilterIcon,
  Plus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { PdfExportButton } from "@/components/ui/pdf-export-button";
import { useEntityEvents } from "@/lib/events";
import { useAISuggestions } from "@/lib/ai-ux";
import { AISuggestionBar } from "@/components/ai/ai-suggestion-bar";
import { useAIOrchestrator } from "@/lib/ai-orchestrator";
import { AIOrchestratedLayout } from "@/components/ai/ai-orchestrated-layout";
import { useTranslation } from "@/lib/i18n";
import { logger } from "@/lib/logger";

// --- Animated counter hook ---------------------------------------------------
function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

// --- Constants (kept in sync with backend DTO enums) ---------------------

const SEVERITY_OPTIONS = [
  { value: "", label: "Toutes les sévérités" },
  { value: "CRITICAL", label: "Critique (P1)" },
  { value: "HIGH", label: "Haute (P2)" },
  { value: "MEDIUM", label: "Moyenne (P3)" },
  { value: "LOW", label: "Faible (P4)" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "DETECTED", label: "Détecté" },
  { value: "UNDER_INVESTIGATION", label: "Investigation" },
  { value: "CONTAINED", label: "Contenu" },
  { value: "ERADICATED", label: "Éradiqué" },
  { value: "RECOVERED", label: "Rétabli" },
  { value: "CLOSED", label: "Clôturé" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Toutes catégories" },
  { value: "MALWARE", label: "Malware" },
  { value: "PHISHING", label: "Phishing" },
  { value: "DATA_BREACH", label: "Fuite de données" },
  { value: "UNAUTHORIZED_ACCESS", label: "Accès non autorisé" },
  { value: "DENIAL_OF_SERVICE", label: "Déni de service" },
  { value: "PHYSICAL_SECURITY", label: "Sécurité physique" },
  { value: "CONFIGURATION_ERROR", label: "Erreur de configuration" },
  { value: "LOST_STOLEN_DEVICE", label: "Appareil perdu / volé" },
  { value: "USER_ERROR", label: "Erreur utilisateur" },
  { value: "THIRD_PARTY", label: "Tiers" },
  { value: "OTHER", label: "Autre" },
];

// SEAL palette severity colors
const SEVERITY_STYLE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  CRITICAL: {
    bg: "bg-[#cc0000]/10",
    text: "text-[#cc0000]",
    label: "Critique",
  },
  HIGH: { bg: "bg-[#892034]/10", text: "text-[#892034]", label: "Haute" },
  MEDIUM: { bg: "bg-[#c68200]/10", text: "text-[#c68200]", label: "Moyenne" },
  LOW: { bg: "bg-[#70916a]/15", text: "text-[#70916a]", label: "Faible" },
};

const STATUS_LABEL: Record<string, string> = {
  DETECTED: "Détecté",
  UNDER_INVESTIGATION: "Investigation",
  CONTAINED: "Contenu",
  ERADICATED: "Éradiqué",
  RECOVERED: "Rétabli",
  CLOSED: "Clôturé",
};

const STATUS_BADGE_VARIANT: Record<
  string,
  "error" | "warning" | "info" | "navy" | "primary" | "success"
> = {
  DETECTED: "error",
  UNDER_INVESTIGATION: "warning",
  CONTAINED: "info",
  ERADICATED: "primary",
  RECOVERED: "success",
  CLOSED: "navy",
};

// --- Types ----------------------------------------------------------------

interface IncidentRow {
  id: string;
  reference: string;
  title: string;
  severity: keyof typeof SEVERITY_STYLE;
  status: string;
  category: string;
  detectedAt: string;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  reporter: { id: string; firstName: string; lastName: string } | null;
  _count: { remediations: number; timeline: number };
}

interface IncidentsResponse {
  data: IncidentRow[];
  meta: { total: number; page: number; totalPages: number };
}

interface DashboardKpis {
  open: number;
  critical: number;
  thisMonth: number;
  mttrHours: number;
  byCategory: { category: string; count: number }[];
}

// --- Animated Stats Cards ---------------------------------------------------

function IncidentStatsCards({ kpis }: { kpis: DashboardKpis | null }) {
  const openCount = useCountUp(kpis?.open ?? 0);
  const criticalCount = useCountUp(kpis?.critical ?? 0);
  const mttr = useCountUp(kpis?.mttrHours ?? 0);
  const thisMonth = useCountUp(kpis?.thisMonth ?? 0);

  const cards = [
    {
      label: "Ouverts",
      value: kpis ? openCount : null,
      suffix: "",
      icon: <AlertTriangle className="h-5 w-5 text-[#cc0000]" />,
      bg: "bg-[#cc0000]/10",
      ring: "ring-[#cc0000]/20",
    },
    {
      label: "Critiques actifs",
      value: kpis ? criticalCount : null,
      suffix: "",
      icon: <ShieldAlert className="h-5 w-5 text-[#892034]" />,
      bg: "bg-[#892034]/10",
      ring: "ring-[#892034]/20",
    },
    {
      label: "MTTR moyen (90j)",
      value: kpis ? mttr : null,
      suffix: "h",
      icon: <Clock className="h-5 w-5 text-[#c68200]" />,
      bg: "bg-[#c68200]/10",
      ring: "ring-[#c68200]/20",
    },
    {
      label: "Ce mois",
      value: kpis ? thisMonth : null,
      suffix: "",
      icon: <TrendingUp className="h-5 w-5 text-[#70916a]" />,
      bg: "bg-[#70916a]/15",
      ring: "ring-[#70916a]/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card
          key={c.label}
          className={`shadow-sm rounded-xl ring-1 cursor-default ${c.ring}`}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}
            >
              {c.icon}
            </div>
            <div>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                {c.label}
              </p>
              <p className="text-2xl font-medium text-seal-navy dark:text-white tabular-nums">
                {c.value !== null ? `${c.value}${c.suffix}` : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- Page -----------------------------------------------------------------

export default function IncidentsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const aiSuggestions = useAISuggestions("incidents");
  const orchestration = useAIOrchestrator("INCIDENTS");

  const [incidents, setIncidents] = useState<IncidentsResponse | null>(null);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");

  // Mobile: collapsible filters drawer
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "OTHER",
    severity: "MEDIUM",
    affectedSystems: "",
    affectedUsers: 0,
    impactSummary: "",
    gdprNotifiable: false,
  });

  const isReviewer = useMemo(
    () => (user ? isRoleAtLeast(user.role, UserRole.REVIEWER) : false),
    [user],
  );

  const handleRowClick = useCallback(
    (i: IncidentRow) => router.push(`/incidents/${i.id}`),
    [router],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (dateFrom) params.dateFrom = dateFrom;

      const [listRes, kpiRes] = await Promise.allSettled([
        api.get<IncidentsResponse>("/incidents", { params }),
        api.get<DashboardKpis>("/incidents/dashboard"),
      ]);
      if (listRes.status === "fulfilled") setIncidents(listRes.value.data);
      else
        logger.error(listRes.reason, {
          page: "incidents",
          context: "load list",
        });
      if (kpiRes.status === "fulfilled") setKpis(kpiRes.value.data);
      else
        logger.error(kpiRes.reason, {
          page: "incidents",
          context: "load kpis",
        });
    } catch (err) {
      logger.error(err, { page: "incidents", context: "fetch" });
      const e = err as {
        message?: string;
        response?: { data?: { message?: string } };
      };
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    debouncedSearch,
    statusFilter,
    severityFilter,
    categoryFilter,
    dateFrom,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useRefetchOnFocus(fetchData);

  // Event bus: auto-refresh when incident mutations happen elsewhere
  useEntityEvents("INCIDENT", (event) => {
    if (event.metadata?.optimistic) return;
    if (["CREATED", "STATUS_CHANGED", "DELETED"].includes(event.type)) {
      fetchData();
    }
  });

  const handleCreate = async () => {
    if (form.title.trim().length < 3) {
      toast.error("Titre trop court");
      return;
    }
    if (form.description.trim().length < 5) {
      toast.error("Description trop courte");
      return;
    }
    setCreating(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        severity: form.severity,
        affectedSystems: form.affectedSystems
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        affectedUsers: Number(form.affectedUsers) || 0,
        impactSummary: form.impactSummary.trim() || undefined,
        gdprNotifiable: form.gdprNotifiable,
      };
      const res = await api.post<{ id: string; reference: string }>(
        "/incidents",
        payload,
      );
      toast.success("Incident signale");
      setCreateOpen(false);
      setForm({
        title: "",
        description: "",
        category: "OTHER",
        severity: "MEDIUM",
        affectedSystems: "",
        affectedUsers: 0,
        impactSummary: "",
        gdprNotifiable: false,
      });
      router.push(`/incidents/${res.data.id}`);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Erreur lors du signalement";
      toast.error(String(message));
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<IncidentRow>[] = useMemo(
    () => [
      {
        key: "reference",
        header: "Référence",
        render: (i) => (
          <span className="font-mono text-xs text-seal-navy dark:text-white">
            {i.reference}
          </span>
        ),
      },
      {
        key: "title",
        header: "Titre",
        render: (i) => (
          <div className="max-w-md">
            <p className="text-sm font-medium text-seal-navy dark:text-white truncate">
              {i.title}
            </p>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
              {CATEGORY_OPTIONS.find((c) => c.value === i.category)?.label ||
                i.category}
            </p>
          </div>
        ),
      },
      {
        key: "severity",
        header: "Sévérité",
        render: (i) => {
          const s = SEVERITY_STYLE[i.severity];
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s?.bg} ${s?.text}`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                  i.severity === "CRITICAL"
                    ? "bg-[#cc0000]"
                    : i.severity === "HIGH"
                      ? "bg-[#F9964A]"
                      : i.severity === "MEDIUM"
                        ? "bg-[#c68200]"
                        : "bg-[#70916a]"
                }`}
              />
              {s?.label || i.severity}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Statut",
        render: (i) => <StatusBadge status={i.status} />,
      },
      {
        key: "assignedTo",
        header: "Responsable",
        render: (i) =>
          i.assignedTo ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-[9px] font-semibold flex-shrink-0">
                {`${i.assignedTo.firstName[0] || ""}${i.assignedTo.lastName[0] || ""}`.toUpperCase()}
              </span>
              <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                {i.assignedTo.firstName} {i.assignedTo.lastName}
              </span>
            </div>
          ) : (
            <span className="text-xs text-seal-gray-500/60 dark:text-slate-500 italic">
              Non assigné
            </span>
          ),
      },
      {
        key: "detectedAt",
        header: "Détecté",
        render: (i) => (
          <span className="text-xs text-seal-gray-500 dark:text-slate-400">
            {new Date(i.detectedAt).toLocaleDateString("fr-FR")}
          </span>
        ),
      },
      {
        key: "_count",
        header: "Actions",
        render: (i) => (
          <span className="text-xs text-seal-gray-500 dark:text-slate-400">
            {i._count.remediations} remédiation
            {i._count.remediations > 1 ? "s" : ""}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <AIOrchestratedLayout module="INCIDENTS" hints={orchestration.hints}>
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title={t("incidents.title")}
          subtitle="Déclarez et suivez les incidents de sécurité (ISO 27001 A.5.24-A.5.28)."
          icon={ShieldAlert}
          hub="security"
          actions={
            <>
              <ExportCsvButton
                endpoint="/incidents/export/csv"
                filename="incidents"
                params={{
                  ...(statusFilter ? { status: statusFilter } : {}),
                  ...(severityFilter ? { severity: severityFilter } : {}),
                  ...(categoryFilter ? { category: categoryFilter } : {}),
                  ...(debouncedSearch ? { search: debouncedSearch } : {}),
                  ...(dateFrom ? { dateFrom } : {}),
                }}
              />
              <PdfExportButton
                label="Rapport incidents"
                payload={() => ({
                  title: "Rapport de gestion des incidents",
                  subtitle: "ISO 27001 A.5.24 / A.5.25 / A.5.26 / A.5.27",
                  reference: `INC-RAPPORT-${new Date().toISOString().slice(0, 10)}`,
                  context: "Extrait OMNITECH Intranet",
                  sections: [
                    {
                      heading: "Synthèse",
                      paragraphs: [
                        `Total d'incidents: ${incidents?.data?.length || 0}`,
                        `Ouverts (non-clos): ${(incidents?.data || []).filter((i) => !["CLOSED", "RECOVERED"].includes(i?.status)).length}`,
                        `Critiques: ${(incidents?.data || []).filter((i) => i?.severity === "CRITICAL").length}`,
                      ],
                    },
                    {
                      heading: "Détail des incidents",
                      paragraphs:
                        (incidents?.data || []).length === 0
                          ? [
                              "Aucun incident enregistré dans le périmètre actuel.",
                            ]
                          : (incidents?.data || []).map(
                              (i: IncidentRow) =>
                                `[${i.reference || i.id}] ${i.title} — ${i.severity || "N/A"} — statut ${i.status} — détecté ${(i.detectedAt || "").slice(0, 10)}${i.assignedTo ? ` — assigné à ${i.assignedTo.firstName} ${i.assignedTo.lastName}` : ""}`,
                            ),
                    },
                  ],
                })}
              />
              <Button
                onClick={() => setCreateOpen(true)}
                aria-label="Signaler un nouvel incident de sécurité"
                className="bg-seal-bordeaux hover:bg-seal-bordeaux/90 text-white shadow-md text-sm font-semibold px-5 py-2.5 min-h-[44px]"
              >
                <ShieldAlert className="h-4 w-4 mr-1.5" />
                {t("incidents.new")}
              </Button>
            </>
          }
          meta={
            <span className="inline-flex items-center gap-1 rounded-full bg-seal-navy/10 dark:bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium text-seal-navy dark:text-sky-300">
              ISO 27001 A.5.24 / A.5.25 / A.5.26 / A.5.27
            </span>
          }
        />

        {/* KPIs */}
        <IncidentStatsCards kpis={kpis} />

        {/* AI suggestions */}
        <AISuggestionBar suggestions={aiSuggestions} />

        {/* Filters */}
        <Card className="shadow-sm rounded-xl">
          <CardContent className="p-4">
            {/* Mobile toggle: 5 filters → drawer */}
            {(() => {
              const activeFiltersCount = [
                search,
                statusFilter,
                severityFilter,
                categoryFilter,
                dateFrom,
              ].filter(Boolean).length;
              return (
                <button
                  type="button"
                  onClick={() => setFiltersOpen((o) => !o)}
                  aria-expanded={filtersOpen}
                  aria-controls="incidents-filters-panel"
                  className="md:hidden w-full flex items-center justify-between gap-2 mb-3 px-3 min-h-[44px] rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-seal-navy dark:text-white"
                >
                  <span className="inline-flex items-center gap-2">
                    <FilterIcon className="h-4 w-4 text-primary" />
                    Filtres
                    {activeFiltersCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary text-white text-[10px] font-semibold px-1.5">
                        {activeFiltersCount}
                      </span>
                    )}
                  </span>
                  {filtersOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              );
            })()}
            <div
              id="incidents-filters-panel"
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 ${filtersOpen ? "" : "hidden md:grid"}`}
            >
              <Input
                placeholder="Recherche par référence, titre..."
                aria-label="Rechercher un incident"
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
              />
              <Select
                aria-label="Filtrer par statut"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(e) => {
                  setPage(1);
                  setStatusFilter(e.target.value);
                }}
              />
              <Select
                aria-label="Filtrer par sévérité"
                options={SEVERITY_OPTIONS}
                value={severityFilter}
                onChange={(e) => {
                  setPage(1);
                  setSeverityFilter(e.target.value);
                }}
              />
              <Select
                aria-label="Filtrer par catégorie"
                options={CATEGORY_OPTIONS}
                value={categoryFilter}
                onChange={(e) => {
                  setPage(1);
                  setCategoryFilter(e.target.value);
                }}
              />
              <Input
                type="date"
                aria-label="Filtrer à partir de la date"
                value={dateFrom}
                onChange={(e) => {
                  setPage(1);
                  setDateFrom(e.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <div className="h-4 w-20 rounded shimmer" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-3/5 rounded shimmer" />
                      <div className="h-3 w-1/4 rounded shimmer" />
                    </div>
                    <div className="h-5 w-16 rounded-full shimmer" />
                    <div className="h-5 w-20 rounded-full shimmer" />
                    <div className="h-4 w-24 rounded shimmer hidden md:block" />
                    <div className="h-4 w-20 rounded shimmer hidden md:block" />
                  </div>
                ))}
              </div>
            ) : !incidents || incidents.data.length === 0 ? (
              (() => {
                const hasFilters = !!(
                  debouncedSearch ||
                  statusFilter ||
                  severityFilter ||
                  categoryFilter ||
                  dateFrom
                );
                return (
                  <EmptyState
                    type={hasFilters ? "search" : "success"}
                    title={
                      hasFilters
                        ? "Aucun incident pour ces critères"
                        : "Aucun incident actif — bonne posture sécurité"
                    }
                    description={
                      hasFilters
                        ? "Aucun incident ne correspond aux filtres sélectionnés. Modifiez vos critères ou réinitialisez les filtres pour élargir la recherche."
                        : "L'absence d'incident traduit une bonne hygiène cyber. En cas d'évènement suspect (phishing, intrusion, fuite), déclarez-le immédiatement pour déclencher l'investigation ISO 27001 (A.5.24-A.5.28)."
                    }
                    action={
                      hasFilters ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSearch("");
                            setStatusFilter("");
                            setSeverityFilter("");
                            setCategoryFilter("");
                            setDateFrom("");
                            setPage(1);
                          }}
                        >
                          Réinitialiser les filtres
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setCreateOpen(true)}
                          aria-label="Signaler un incident de sécurité"
                        >
                          <Plus className="h-4 w-4" /> Signaler un incident
                        </Button>
                      )
                    }
                  />
                );
              })()
            ) : (
              <div className="animate-fade-in-up">
                <DataTable
                  data={incidents.data}
                  columns={columns}
                  keyExtractor={(i) => i.id}
                  onRowClick={handleRowClick}
                />
              </div>
            )}
          </CardContent>
          {incidents && incidents.meta.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
              <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                Page {incidents.meta.page} / {incidents.meta.totalPages} —{" "}
                {incidents.meta.total} incidents
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= incidents.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* KPI by category (secondary) */}
        {kpis && kpis.byCategory.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Répartition par catégorie
              </h3>
              <div className="flex flex-wrap gap-2">
                {kpis.byCategory.map((c) => (
                  <span
                    key={c.category}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-seal-navy dark:text-sky-300 px-2 py-1 text-[11px] font-semibold"
                  >
                    {CATEGORY_OPTIONS.find((o) => o.value === c.category)
                      ?.label || c.category}
                    <span className="ml-1 rounded-full bg-white dark:bg-slate-800 px-1.5 text-[10px]">
                      {c.count}
                    </span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create modal */}
        <Dialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Signaler un incident de sécurité"
          description="Toute information pertinente aidera à qualifier et traiter l'incident."
        >
          <div className="space-y-3">
            {/* Severity visual indicator */}
            {(() => {
              const sev = form.severity
                ? SEVERITY_STYLE[form.severity as keyof typeof SEVERITY_STYLE]
                : undefined;
              if (!sev) return null;
              return (
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${sev.bg} ${sev.text}`}
                >
                  <ShieldAlert className="h-4 w-4" />
                  Niveau de severite : {sev.label}
                </div>
              );
            })()}
            <Input
              label="Titre *"
              placeholder="Ex. Campagne de phishing ciblant la DAF"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus
            />
            <Textarea
              label="Description détaillée *"
              rows={5}
              placeholder="Chronologie, éléments observés, systèmes impactés..."
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              onKeyDown={(e: React.KeyboardEvent) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Catégorie"
                options={CATEGORY_OPTIONS.filter((o) => o.value)}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <Select
                label="Sévérité"
                options={SEVERITY_OPTIONS.filter((o) => o.value)}
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              />
            </div>
            <Input
              label="Systèmes impactés (séparés par des virgules)"
              placeholder="AD, Exchange, Fileserver"
              value={form.affectedSystems}
              onChange={(e) =>
                setForm({ ...form, affectedSystems: e.target.value })
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="number"
                label="Utilisateurs affectés"
                value={String(form.affectedUsers)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    affectedUsers: Number(e.target.value) || 0,
                  })
                }
              />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-seal-navy dark:text-white">
                  <input
                    type="checkbox"
                    checked={form.gdprNotifiable}
                    onChange={(e) =>
                      setForm({ ...form, gdprNotifiable: e.target.checked })
                    }
                    aria-label="Notification RGPD/CNIL requise"
                    className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-900 text-primary focus:ring-primary"
                  />
                  Notification RGPD/CNIL requise
                </label>
              </div>
            </div>
            <Textarea
              label="Résumé d'impact"
              rows={2}
              placeholder="Impact métier, financier, RGPD, réputationnel..."
              value={form.impactSummary}
              onChange={(e) =>
                setForm({ ...form, impactSummary: e.target.value })
              }
              onKeyDown={(e: React.KeyboardEvent) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-primary hover:bg-primary/90 text-white transition"
              >
                {creating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
                {creating ? "Enregistrement…" : "Signaler"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Unused warning suppression */}
        <span className="hidden">
          {isReviewer ? <CheckCircle2 /> : null}
          <Calendar />
        </span>
      </div>
    </AIOrchestratedLayout>
  );
}
