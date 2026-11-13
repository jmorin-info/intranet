"use client";

import React, { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { downloadFromApi, buildDocumentFilename } from "@/lib/download";
import { downloadCsv } from "@/lib/export-csv";
import { useAuthStore } from "@/stores/auth-store";
import { useDocumentStore } from "@/stores/document-store";
import { useDebounce } from "@/hooks/use-debounce";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useEntityEvents } from "@/lib/events";
import { useAISuggestions } from "@/lib/ai-ux";
import { AISuggestionBar } from "@/components/ai/ai-suggestion-bar";
import { useAIOrchestrator } from "@/lib/ai-orchestrator";
import { AIOrchestratedLayout } from "@/components/ai/ai-orchestrated-layout";
import { useUIVisibility } from "@/lib/ui-os/execution";
import { logger } from "@/lib/logger";
import {
  DocumentStatus,
  DocumentCategory,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  isRoleAtLeast,
  UserRole,
} from "@omnitech/shared";
import {
  Card,
  CardContent,
  Button,
  StatusBadge,
  SearchInput,
  Select,
  DataTable,
  EmptyState,
  Badge,
  ConfirmDialog,
  Dialog,
} from "@omnitech/ui";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import {
  Plus,
  FileText,
  Download,
  Filter,
  X,
  User,
  Clock,
  Eye,
  FileCheck,
  Trash2,
  FileDown,
  CheckSquare,
  Square,
  MinusSquare,
  ArrowUpDown,
  Keyboard,
  AlertTriangle,
  Archive,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/page-header";
import { ExportButton } from "@/components/ui/export-button";
import { useTranslation } from "@/lib/i18n";

const SavedFiltersBar = dynamic(
  () =>
    import("@/components/ui/saved-filters-bar").then((m) => ({
      default: m.SavedFiltersBar,
    })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);
const BulkActionsBar = dynamic(
  () =>
    import("@/components/ui/bulk-actions-bar").then((m) => ({
      default: m.BulkActionsBar,
    })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);
// Wave D — modale "Créer depuis template", chargée à la demande pour ne
// pas alourdir le bundle initial de /documents.
const CreateFromTemplateDialog = dynamic(
  () =>
    import("@/components/documents/create-from-template-dialog").then((m) => ({
      default: m.CreateFromTemplateDialog,
    })),
  { ssr: false },
);

// Types, helpers et constantes (DocumentCard, status tabs, validity, badges)
// extraits dans `_components/` pour alléger l'orchestrateur.
import { DocumentCard } from "./_components/document-card";
import {
  STATUS_TAB_DEFS,
  CLASS_COLORS,
  CARD_CLASS_BADGE,
  getValidityInfo,
  categoryBadgeVariant,
} from "./_components/helpers";
import type { Document, PaginatedDocs, StatusTabKey } from "./_components/types";
import { useDocumentsColumns } from "./_components/use-documents-columns";

function DocumentsContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { filters, setFilters, resetFilters } = useDocumentStore();
  const aiSuggestions = useAISuggestions("documents");
  const orchestration = useAIOrchestrator("DOCUMENTS");
  const uiVisibility = useUIVisibility();
  const [docs, setDocs] = useState<PaginatedDocs | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [myDocsOnly, setMyDocsOnly] = useState(false);
  const [docStats, setDocStats] = useState<any>(null);
  const [mySummary, setMySummary] = useState<{
    myDrafts: number; myInReview: number; toApproveByMe: number; toConfirmByMe: number; nearReviewDate: number; total: number;
  } | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const statusTab: StatusTabKey = filters.statusGroup || "all";
  const clearAllFilters = () => {
    resetFilters();
    setMyDocsOnly(false);
    router.replace("/documents", { scroll: false });
  };
  const setStatusTab = (key: StatusTabKey) => setFilters({ status: undefined, statusGroup: key === "all" ? undefined : key, page: 1 });

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const canReview = user && isRoleAtLeast(user.role, UserRole.REVIEWER);
  const canCreate = user && isRoleAtLeast(user.role, UserRole.REVIEWER);

  useEffect(() => {
    if (isAdmin) {
      api
        .get("/documents/statistics")
        .then((r) => setDocStats(r.data))
        .catch((err) => logger.error(err, { page: "documents", context: "load statistics" }));
    }
  }, [isAdmin]);

  const fetchMySummary = useCallback(async () => {
    if (!user) return;
    try { const response = await api.get("/documents/ged/my-summary"); setMySummary(response.data); }
    catch { setMySummary(null); }
  }, [user?.id]);
  useEffect(() => { void fetchMySummary(); }, [fetchMySummary]);

  const debouncedSearch = useDebounce(filters.search || "", 300);
  const requestFilterKey = JSON.stringify({ ...filters, search: debouncedSearch });
  const requestFilters = useMemo(() => JSON.parse(requestFilterKey) as typeof filters, [requestFilterKey]);

  // Only supported URL values reach the API; saved library criteria stay intact.
  useEffect(() => {
    const rawStatus = searchParams.get("status");
    const rawCategory = searchParams.get("category");
    const rawGroup = searchParams.get("statusGroup");
    const status = Object.values(DocumentStatus).includes(rawStatus as DocumentStatus) ? rawStatus as DocumentStatus : undefined;
    const category = Object.values(DocumentCategory).includes(rawCategory as DocumentCategory) ? rawCategory as DocumentCategory : undefined;
    const group = STATUS_TAB_DEFS.find((tab) => tab.key !== "all" && tab.key === rawGroup)?.key as Exclude<StatusTabKey, "all"> | undefined;
    if (status || category || group) setFilters({ status, category, statusGroup: status ? undefined : group, page: 1 });
    if (searchParams.get("owner") === "me") setMyDocsOnly(true);
  }, [searchParams, setFilters]);

  const fetchDocuments = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setFetchError(false);
    try {
      const params: Record<string, string | number> = {
        page: requestFilters.page,
        limit: requestFilters.limit,
      };
      if (requestFilters.status) params.status = requestFilters.status;
      if (requestFilters.statusGroup) params.statusGroup = requestFilters.statusGroup;
      if (requestFilters.category) params.category = requestFilters.category;
      if (requestFilters.classification) params.classification = requestFilters.classification;
      if (requestFilters.isoControlCode) params.isoControlCode = requestFilters.isoControlCode;
      if (debouncedSearch) params.search = debouncedSearch;
      if (requestFilters.dateFrom) params.dateFrom = requestFilters.dateFrom;
      if (requestFilters.dateTo) params.dateTo = requestFilters.dateTo;
      if (requestFilters.sortBy) params.sortBy = requestFilters.sortBy;
      if (requestFilters.sortOrder) params.sortOrder = requestFilters.sortOrder;
      if (myDocsOnly && user?.id) params.ownerId = user.id;

      const { data } = await api.get("/documents", { params, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (data.meta.totalPages > 0 && requestFilters.page > data.meta.totalPages) {
        setFilters({ page: data.meta.totalPages });
        return;
      }
      setDocs(data);
    } catch {
      if (!controller.signal.aborted) { setDocs(null); setFetchError(true); }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [requestFilters, debouncedSearch, myDocsOnly, user?.id, setFilters]);

  useEffect(() => {
    void fetchDocuments();
    return () => requestController.current?.abort();
  }, [fetchDocuments]);

  // Refetch when user returns from detail page (prevents stale status badges)
  useRefetchOnFocus(fetchDocuments);

  // Event bus: auto-refresh when document mutations happen elsewhere
  useEntityEvents("DOCUMENT", (event) => {
    if (event.metadata?.optimistic) return;
    if (["CREATED", "APPROVED", "REJECTED", "STATUS_CHANGED", "DELETED"].includes(event.type)) {
      void fetchDocuments();
      void fetchMySummary();
    }
  });

  const [viewMode, setViewMode] = useState<"table" | "cards" | "kanban">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkAction, setBulkAction] = useState<"archive" | "classify" | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkClassification, setBulkClassification] = useState("INTERNE");
  // Wave D — Create-from-template modal trigger (REVIEWER+ requis côté backend).
  const [showFromTemplate, setShowFromTemplate] = useState(false);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [docs?.data]);

  // Keyboard shortcuts for the documents list page.
  // N = nouveau, F = focus recherche, G+T = vue table, G+C = vue cartes,
  // G+K = vue kanban, ? = aide. Respects Ctrl+K (ne capture pas les combinaisons
  // avec meta/ctrl/alt).
  useEffect(() => {
    let gPrefix = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;
    const isEditableTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (gPrefix) {
        if (key === "t") {
          e.preventDefault();
          setViewMode("table");
        } else if (key === "c") {
          e.preventDefault();
          setViewMode("cards");
        } else if (key === "k") {
          e.preventDefault();
          setViewMode("kanban");
        }
        gPrefix = false;
        if (gTimer) clearTimeout(gTimer);
        return;
      }
      if (key === "g") {
        gPrefix = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => {
          gPrefix = false;
        }, 800);
        return;
      }
      if (key === "n" && canCreate) {
        e.preventDefault();
        router.push("/documents/new");
        return;
      }
      if (key === "f") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Rechercher"]');
        input?.focus();
        return;
      }
      if (key === "?") {
        e.preventDefault();
        setShowShortcutsHelp((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [canCreate, router]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!docs?.data) return;
    if (selectedIds.size === docs.data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(docs.data.map((d) => d.id)));
    }
  };

  const selectedDocs = docs?.data?.filter((d) => selectedIds.has(d.id)) || [];

  const handleBulkDownload = async () => {
    let downloaded = 0;
    for (const doc of selectedDocs) {
      try {
        const { data, headers } = await api.get(`/documents/${doc.id}/download`, {
          responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", buildDocumentFilename(doc.reference, undefined, String(headers["content-type"] || "")));
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
        downloaded++;
      } catch {
        toast.error(`Erreur de téléchargement : ${doc.title}`);
      }
    }
    if (downloaded > 0) toast.success(`${downloaded} téléchargement${downloaded > 1 ? "s lancés" : " lancé"}`);
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      // Prefer the atomic bulk endpoint (single audit batch, one request).
      await api.post("/documents/bulk/delete", {
        ids: selectedDocs.map((d) => d.id),
      });
      toast.success("Documents supprimés");
      setSelectedIds(new Set());
      fetchDocuments();
    } catch (err) {
      toast.error("Erreur de suppression");
    } finally {
      setBulkDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedDocs.length === 0) return;
    setBulkWorking(true);
    try {
      const { data } = await api.post<{ updated: number }>(`/documents/bulk/${bulkAction}`, {
        ids: selectedDocs.map((doc) => doc.id),
        ...(bulkAction === "classify" ? { classification: bulkClassification } : {}),
      });
      toast.success(`${data.updated} document${data.updated > 1 ? "s mis à jour" : " mis à jour"}`);
      setSelectedIds(new Set());
      setBulkAction(null);
      void fetchDocuments();
    } catch {
      toast.error(bulkAction === "archive" ? "L’archivage a échoué" : "La classification a échoué");
    } finally { setBulkWorking(false); }
  };

  const handleExportAllCSV = async () => {
    try {
      const params: Record<string, unknown> = {};
      if (filters.status) params.status = filters.status;
      if (filters.statusGroup) params.statusGroup = filters.statusGroup;
      if (filters.category) params.category = filters.category;
      if (filters.classification) params.classification = filters.classification;
      if (filters.isoControlCode) params.isoControlCode = filters.isoControlCode;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (myDocsOnly && user?.id) params.ownerId = user.id;

      const stamp = new Date().toISOString().slice(0, 10);
      await downloadFromApi("/documents/export/csv", `documents-${stamp}.csv`, params);
      toast.success("Export en cours");
    } catch (err) {
      toast.error("Erreur d'export");
    }
  };

  const handleExportCSV = () => {
    if (selectedDocs.length === 0) return;
    const headers = [
      "Reference",
      "Titre",
      "Categorie",
      "Classification",
      "Statut",
      "Responsable",
      "Date creation",
      "Derniere modification",
    ];
    const rows = selectedDocs.map((doc) => [
      doc.reference,
      doc.title,
      DOCUMENT_CATEGORY_LABELS[doc.category as DocumentCategory] || doc.category,
      doc.classification || "",
      DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] || doc.status,
      `${doc.owner.firstName} ${doc.owner.lastName}`,
      formatDate(doc.createdAt),
      formatDate(doc.updatedAt),
    ]);
    downloadCsv("documents", rows.map((cells) => Object.fromEntries(cells.map((value, index) => [String(index), value]))),
      headers.map((header, index) => ({ header, accessor: String(index) })), "Sélection documentaire");
    toast.success("Export terminé");
  };

  const canSeeAllStatuses = !!user;
  const statusOptions = Object.entries(DOCUMENT_STATUS_LABELS)
    .filter(([value]) => canSeeAllStatuses || value === "APPROVED")
    .map(([value, label]) => ({ value, label }));

  const categoryOptions = Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const allClassifications = [
    { value: "PUBLIC", label: "Public", minRole: null },
    { value: "INTERNE", label: "Interne", minRole: null },
    {
      value: "CONFIDENTIEL",
      label: "Confidentiel",
      minRole: UserRole.REVIEWER,
    },
    { value: "SECRET", label: "Secret", minRole: UserRole.ADMIN },
  ];
  const classificationOptions = allClassifications.filter(
    (c) => !c.minRole || (user && isRoleAtLeast(user.role, c.minRole)),
  );

  const allSelected = docs?.data && docs.data.length > 0 && selectedIds.size === docs.data.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const columns = useDocumentsColumns({
    isAdmin,
    canReview,
    selectedIds,
    toggleSelect,
    router,
  });

  const hasFilters =
    filters.status ||
    filters.category ||
    filters.classification ||
    filters.isoControlCode ||
    filters.dateFrom || filters.dateTo || filters.statusGroup || filters.search || myDocsOnly;

  return (
    <AIOrchestratedLayout module="DOCUMENTS" hints={orchestration.hints}>
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title={t("documents.title")}
          subtitle={`${t("documents.detail.subtitle")}${
            docs?.meta.total !== undefined
              ? ` — ${docs.meta.total} document${docs.meta.total > 1 ? "s" : ""}`
              : ""
          }`}
          icon={FileText}
          hub="work"
          actions={
            <>
              {canSeeAllStatuses && (
                <div className="flex items-center gap-1 border rounded-lg p-0.5 dark:border-slate-700">
                  {(["table", "cards", "kanban"] as const).map((mode) => {
                    const labels = {
                      table: "Tableau",
                      cards: "Cartes",
                      kanban: "Kanban",
                    };
                    return (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`px-3 py-1.5 text-xs rounded font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          viewMode === mode
                            ? "bg-primary text-white shadow-sm"
                            : "text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        {labels[mode]}
                      </button>
                    );
                  })}
                </div>
              )}
              <ExportButton
                filename="documents"
                rows={(docs?.data || []) as unknown as Array<Record<string, unknown>>}
                columns={[
                  { header: "Référence", accessor: "reference" },
                  { header: "Titre", accessor: "title" },
                  { header: "Statut", accessor: "status" },
                  { header: "Catégorie", accessor: "category" },
                  {
                    header: "Classification",
                    accessor: (r: any) => r?.classification || "INTERNE",
                  },
                  {
                    header: "Propriétaire",
                    accessor: (r: any) =>
                      r?.owner ? `${r.owner.firstName} ${r.owner.lastName}` : "",
                  },
                  {
                    header: "Créé le",
                    accessor: (r: any) => r?.createdAt || "",
                  },
                  { header: "MAJ", accessor: (r: any) => r?.updatedAt || "" },
                ]}
              />
              {canCreate && (
                <>
                  {canReview && <Button
                    variant="outline"
                    onClick={() => setShowFromTemplate(true)}
                    title="Créer un document à partir d'un modèle"
                  >
                    <FileText className="h-4 w-4" />
                    Depuis un modèle
                  </Button>}
                  <Button onClick={() => router.push("/documents/new")}>
                    <Plus className="h-4 w-4" />
                    {t("documents.new")}
                  </Button>
                </>
              )}
            </>
          }
        />

        <section aria-label="Suivi documentaire" className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">Votre activité documentaire</p>
              <p className="mt-1 text-xs text-seal-gray-500">Retrouvez vos brouillons et les validations qui attendent votre action.</p>
            </div>
            <Link href="/approvals" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <FileCheck className="h-4 w-4" aria-hidden="true" /> Approbations et relances
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="navy">{docs?.meta.total ?? "—"} résultat{docs?.meta.total === 1 ? "" : "s"} dans la bibliothèque</Badge>
            {mySummary && <>
              <button type="button" onClick={() => { setMyDocsOnly(true); setStatusTab("drafts"); }} className="min-h-[36px] rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 focus-visible:ring-2 focus-visible:ring-primary dark:bg-blue-900/20 dark:text-blue-300">
                {mySummary.myDrafts} brouillon{mySummary.myDrafts === 1 ? "" : "s"} à préparer
              </button>
              <Link href="/documents/pending" className="inline-flex min-h-[36px] items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 focus-visible:ring-2 focus-visible:ring-primary dark:bg-amber-900/20 dark:text-amber-300">
                {mySummary.toApproveByMe} approbation{mySummary.toApproveByMe === 1 ? "" : "s"} finale{mySummary.toApproveByMe === 1 ? "" : "s"} · {mySummary.toConfirmByMe} confirmation{mySummary.toConfirmByMe === 1 ? "" : "s"}
              </Link>
              {mySummary.nearReviewDate > 0 && <Badge variant="warning">{mySummary.nearReviewDate} revue{mySummary.nearReviewDate === 1 ? "" : "s"} à planifier</Badge>}
            </>}
          </div>
        </section>

        {/* Admin statistics — hidden by AI orchestrator when not needed */}
        {isAdmin && docStats && uiVisibility.analyticsWidgets && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
                  Par catégorie
                </p>
                <div className="space-y-1">
                  {docStats.byCategory?.slice(0, 5).map((c: any) => (
                    <div key={c.category} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-seal-gray-500 dark:text-slate-400 truncate">
                        {c.category}
                      </span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: `${(c.count / docStats.total) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-seal-navy dark:text-white font-semibold w-6 text-right">
                        {c.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
                  Par statut
                </p>
                <div className="space-y-1">
                  {docStats.byStatus?.map((s: any) => (
                    <div key={s.status} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-seal-gray-500 dark:text-slate-400 truncate">
                        {s.status}
                      </span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{
                            width: `${(s.count / docStats.total) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-seal-navy dark:text-white font-semibold w-6 text-right">
                        {s.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
                  Par classification
                </p>
                <div className="space-y-1">
                  {docStats.byClassification?.map((c: any) => {
                    // Couleurs SEAL/POL_015 — alignées sur le mapping de la vue cartes (cf. classColors plus bas).
                    const colors: Record<string, string> = {
                      PUBLIC: "bg-[#006233]",
                      INTERNE: "bg-[#296DC1]",
                      CONFIDENTIEL: "bg-[#F9964A]",
                      SECRET: "bg-[#892034]",
                    };
                    return (
                      <div key={c.classification} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-seal-gray-500 dark:text-slate-400 truncate">
                          {c.classification}
                        </span>
                        <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full">
                          <div
                            className={`h-full ${colors[c.classification] || "bg-gray-400"} rounded-full`}
                            style={{
                              width: `${(c.count / docStats.total) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-seal-navy dark:text-white font-semibold w-6 text-right">
                          {c.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search + filters */}
        <Card className="shadow-sm rounded-xl">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                value={filters.search || ""}
                onChange={(search) => setFilters({ search, page: 1 })}
                placeholder={t("documents.search")}
                className="min-w-[12rem] flex-1"
              />
              <Button
                variant={showFilters ? "primary" : "outline"}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
                Filtres
                {hasFilters && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-white">
                    !
                  </span>
                )}
              </Button>
              {canReview && (
                <Button
                  variant="outline"
                  onClick={handleExportAllCSV}
                  title="Exporter jusqu’à 1 000 documents correspondant aux filtres"
                >
                  <FileDown className="h-4 w-4" />
                  Exporter CSV
                </Button>
              )}
              {hasFilters && (
                <Button variant="ghost" onClick={clearAllFilters}>
                  <X className="h-4 w-4" />
                  Effacer
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
                <Select
                  label="Statut"
                  options={statusOptions}
                  placeholder="Tous les statuts"
                  value={filters.status || ""}
                  onChange={(e) =>
                    setFilters({
                      status: (e.target.value as DocumentStatus) || undefined,
                      page: 1,
                    })
                  }
                />
                <Select
                  label="Catégorie"
                  options={categoryOptions}
                  placeholder="Toutes les catégories"
                  value={filters.category || ""}
                  onChange={(e) =>
                    setFilters({
                      category: (e.target.value as DocumentCategory) || undefined,
                      page: 1,
                    })
                  }
                />
                <Select
                  label="Classification"
                  options={classificationOptions}
                  placeholder="Toutes"
                  value={filters.classification || ""}
                  onChange={(e) =>
                    setFilters({
                      classification: e.target.value || undefined,
                      page: 1,
                    })
                  }
                />
                <div className="space-y-1">
                  <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                    Date début
                  </label>
                  <input
                    type="date"
                    value={filters.dateFrom || ""}
                    onChange={(e) =>
                      setFilters({
                        dateFrom: e.target.value || undefined,
                        page: 1,
                      })
                    }
                    className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                    Date fin
                  </label>
                  <input
                    type="date"
                    value={filters.dateTo || ""}
                    onChange={(e) =>
                      setFilters({
                        dateTo: e.target.value || undefined,
                        page: 1,
                      })
                    }
                    className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Classification quick filter pills */}
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 font-semibold mr-1">
            Classification
          </span>
          <button
            onClick={() => setFilters({ classification: undefined, page: 1 })}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${!filters.classification ? "bg-seal-navy text-white dark:bg-primary" : "bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200"}`}
          >
            Toutes
          </button>
          {(
            [
              {
                value: "PUBLIC",
                label: "Public",
                bg: "bg-[#006233]",
                ring: "ring-[#006233]/30",
              },
              {
                value: "INTERNE",
                label: "Interne",
                bg: "bg-[#296DC1]",
                ring: "ring-[#296DC1]/30",
              },
              {
                value: "CONFIDENTIEL",
                label: "Confidentiel",
                bg: "bg-[#F9964A]",
                ring: "ring-[#F9964A]/30",
              },
              {
                value: "SECRET",
                label: "Secret",
                bg: "bg-[#892034]",
                ring: "ring-[#892034]/30",
              },
            ] as const
          )
            .filter((c) => {
              if (c.value === "SECRET") return user && isRoleAtLeast(user.role, UserRole.ADMIN);
              if (c.value === "CONFIDENTIEL")
                return user && isRoleAtLeast(user.role, UserRole.REVIEWER);
              return true;
            })
            .map((c) => (
              <button
                key={c.value}
                onClick={() =>
                  setFilters({
                    classification: filters.classification === c.value ? undefined : c.value,
                    page: 1,
                  })
                }
                className={`rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 ${c.ring} ${
                  filters.classification === c.value
                    ? `${c.bg} text-white`
                    : "bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${c.bg} ${filters.classification === c.value ? "bg-white/60" : ""}`}
                />
                {c.label}
              </button>
            ))}
        </div>

        {/* Category quick filters */}
        <div className="flex gap-1.5 flex-wrap items-center">
          <button
            onClick={() => {
              setMyDocsOnly(!myDocsOnly);
              setFilters({ page: 1 });
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${myDocsOnly ? "bg-seal-navy text-white dark:bg-primary" : "bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200"}`}
          >
            <User className="h-3 w-3" />
            Mes documents
          </button>
          <span className="text-gray-300 dark:text-slate-600">|</span>
          <button
            onClick={() => {
              setFilters({ category: undefined, page: 1 });
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${!filters.category ? "bg-primary text-white" : "bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200"}`}
          >
            Tous
          </button>
          {(
            [
              "POLICY",
              "PROCEDURE",
              "PLAN",
              "RECORD",
              "FORM",
              "GUIDE",
              "REPORT",
              "CONTRACT",
              "OTHER",
            ] as const
          ).map((cat) => (
            <button
              key={cat}
              onClick={() =>
                setFilters({
                  category: filters.category === cat ? undefined : (cat as DocumentCategory),
                  page: 1,
                })
              }
              className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filters.category === cat ? "bg-primary text-white" : "bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200"}`}
            >
              {DOCUMENT_CATEGORY_LABELS[cat as keyof typeof DOCUMENT_CATEGORY_LABELS] || cat}
            </button>
          ))}
        </div>

        {/* Saved filters bar */}
        {/* AI suggestions */}
        <AISuggestionBar suggestions={aiSuggestions} />

        <SavedFiltersBar
          module="documents"
          currentFilters={{
            status: filters.status,
            category: filters.category,
            classification: filters.classification,
            isoControlCode: filters.isoControlCode,
            search: filters.search,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder,
          }}
          onApplyFilter={(saved) => {
            setFilters({
              status: saved.status || undefined,
              category: saved.category || undefined,
              classification: saved.classification || undefined,
              isoControlCode: saved.isoControlCode || undefined,
              search: saved.search || undefined,
              dateFrom: saved.dateFrom || undefined,
              dateTo: saved.dateTo || undefined,
              sortBy: saved.sortBy || undefined,
              sortOrder: saved.sortOrder || undefined,
              page: 1,
            });
          }}
        />

        {/* Tabs de statut + tri rapide */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-700 pb-2">
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_TAB_DEFS.filter(
              (t) => canSeeAllStatuses || t.key === "all" || t.key === "published",
            ).map((tab) => {
              const active = statusTab === tab.key;
              const count = active ? docs?.meta.total : undefined;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusTab(tab.key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? `${tab.color} bg-white dark:bg-slate-800`
                      : "border-transparent text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                  {count !== undefined && <span className="inline-flex items-center justify-center rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold dark:bg-slate-900/60">{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-btn border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1">
              <ArrowUpDown className="h-3 w-3 text-seal-gray-500" />
              <select
                aria-label="Trier les documents"
                value={`${filters.sortBy || "updatedAt"}:${filters.sortOrder || "desc"}`}
                onChange={(e) => {
                  const [sortBy, sortOrder] = e.target.value.split(":");
                  setFilters({
                    sortBy,
                    sortOrder: sortOrder as "asc" | "desc",
                    page: 1,
                  });
                }}
                className="bg-transparent text-xs text-seal-navy dark:text-white focus:outline-none"
              >
                <option value="updatedAt:desc">Récemment modifiés</option>
                <option value="createdAt:desc">Récemment créés</option>
                <option value="nextReviewDate:asc">Revue la plus proche</option>
                <option value="title:asc">Titre (A-Z)</option>
                <option value="reference:asc">Reference (A-Z)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowShortcutsHelp((s) => !s)}
              title="Raccourcis clavier (?)"
              aria-label="Afficher les raccourcis clavier"
              className="rounded p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Aide raccourcis clavier */}
        {showShortcutsHelp && (
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 text-xs flex flex-wrap gap-x-6 gap-y-1 text-seal-gray-500 dark:text-slate-400">
            <span>
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                N
              </kbd>{" "}
              Nouveau document
            </span>
            <span>
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                F
              </kbd>{" "}
              Focus recherche
            </span>
            <span>
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                G
              </kbd>
              +
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                T
              </kbd>{" "}
              Vue tableau
            </span>
            <span>
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                G
              </kbd>
              +
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                C
              </kbd>{" "}
              Vue cartes
            </span>
            <span>
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                G
              </kbd>
              +
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                K
              </kbd>{" "}
              Vue kanban
            </span>
            <span>
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5">
                ?
              </kbd>{" "}
              Cette aide
            </span>
          </div>
        )}

        {/* Indicateur de pagination detaille */}
        {docs?.meta && docs.meta.total > 0 && (
          <div className="flex items-center justify-between text-[11px] text-seal-gray-500 dark:text-slate-500">
            <span>
              {(() => {
                const { page, limit, total } = docs.meta;
                const from = (page - 1) * limit + 1;
                const to = Math.min(page * limit, total);
                return `Affichage ${from}-${to} sur ${total} document${total > 1 ? "s" : ""}`;
              })()}
            </span>
            {statusTab !== "all" && (
              <button
                onClick={() => {
                  setStatusTab("all");
                  setFilters({ status: undefined, page: 1 });
                }}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <X className="h-3 w-3" /> Retirer le filtre d&apos;onglet
              </button>
            )}
          </div>
        )}

        {/* Floating bulk action bar */}
        {isAdmin && viewMode === "table" && (
          <BulkActionsBar
            selectedCount={selectedIds.size}
            onClearSelection={() => setSelectedIds(new Set())}
            actions={[
              { label: "Archiver", icon: Archive, onClick: () => setBulkAction("archive") },
              {
                label: "Classification",
                icon: ShieldCheck,
                onClick: () => setBulkAction("classify"),
              },
              {
                label: "Exporter en CSV",
                icon: FileDown,
                onClick: handleExportCSV,
              },
              {
                label: "Télécharger",
                icon: Download,
                onClick: handleBulkDownload,
              },
              {
                label: "Supprimer",
                icon: Trash2,
                variant: "destructive",
                onClick: () => setShowDeleteConfirm(true),
              },
            ]}
          />
        )}

        {/* Error state */}
        {fetchError && !loading && (
          <Card className="border-l-4 border-l-red-400">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                Impossible de charger les documents.
              </p>
              <Button variant="outline" className="mt-3" onClick={fetchDocuments}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {viewMode === "table" &&
          !loading &&
          !fetchError &&
          docs?.data?.length === 0 &&
          !hasFilters &&
          !myDocsOnly &&
          !debouncedSearch && (
            <EmptyState
              type="documents"
              title="Aucun document pour le moment"
              description="Votre base documentaire ISO 27001 est vide. Créez votre premier document pour démarrer le référentiel."
              action={
                canCreate ? (
                  <Button onClick={() => router.push("/documents/new")}>
                    <Plus className="h-4 w-4" /> Nouveau document
                  </Button>
                ) : undefined
              }
            />
          )}

        {viewMode === "table" &&
          (loading ||
            (docs?.data?.length ?? 0) > 0 ||
            hasFilters ||
            myDocsOnly ||
            !!debouncedSearch) && (
            <>
              {/* Mobile: cards layout (< md) — table view sur mobile = cards par défaut */}
              <div className="md:hidden space-y-2">
                {loading ? (
                  <div className="space-y-2" aria-label="Chargement des documents" aria-busy="true">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="rounded-card border-l-4 border-l-gray-200 dark:border-l-slate-700 border-y border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="h-3 w-24 rounded shimmer" />
                          <div className="h-5 w-16 rounded-full shimmer" />
                        </div>
                        <div className="h-4 w-11/12 rounded shimmer" />
                        <div className="flex items-center gap-1.5">
                          <div className="h-4 w-16 rounded-full shimmer" />
                          <div className="h-3 w-20 rounded shimmer ml-auto" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (docs?.data?.length ?? 0) === 0 ? (
                  <div className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-seal-gray-500">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    Aucun document
                  </div>
                ) : (
                  (docs?.data || []).map((doc) => {
                    const classBadge = (CARD_CLASS_BADGE[doc.classification || "INTERNE"] ||
                      CARD_CLASS_BADGE.INTERNE) as {
                      bg: string;
                      text: string;
                      label: string;
                    };
                    const cardOverdue =
                      doc.nextReviewDate && new Date(doc.nextReviewDate).getTime() < Date.now();
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        className={`w-full text-left rounded-card border-l-4 ${CLASS_COLORS[doc.classification || "INTERNE"] || CLASS_COLORS.INTERNE} border-y border-r border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors min-h-[88px]`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-mono text-seal-gray-500 dark:text-slate-500 truncate">
                            {doc.reference}
                          </span>
                          <StatusBadge status={doc.status as never} className="text-[10px]" />
                        </div>
                        <p className="mt-1 text-sm font-semibold text-seal-navy dark:text-white line-clamp-2">
                          {doc.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${classBadge.bg} ${classBadge.text}`}
                          >
                            {classBadge.label}
                          </span>
                          {cardOverdue && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#892034]/10 px-2 py-0.5 text-[10px] font-bold text-[#892034]">
                              <AlertTriangle className="h-2.5 w-2.5" />À revoir
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-[11px] text-seal-gray-500 dark:text-slate-500 truncate">
                          {doc.owner.firstName} {doc.owner.lastName} ·{" "}
                          {new Date(doc.updatedAt).toLocaleDateString("fr-FR")}
                        </p>
                      </button>
                    );
                  })
                )}
                {docs && docs.meta.totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={filters.page <= 1}
                      onClick={() => setFilters({ page: filters.page - 1 })}
                      className="min-h-[44px]"
                    >
                      Précédent
                    </Button>
                    <span className="text-xs text-seal-gray-500">
                      {filters.page} / {docs.meta.totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={filters.page >= docs.meta.totalPages}
                      onClick={() => setFilters({ page: filters.page + 1 })}
                      className="min-h-[44px]"
                    >
                      Suivant
                    </Button>
                  </div>
                )}
              </div>

              {/* Desktop: full DataTable (>= md) */}
              <div
                aria-label="Liste des documents"
                role="region"
                className="hidden md:block overflow-x-auto scrollbar-thin"
              >
                {/* Select all header row */}
                {isAdmin && docs?.data && docs.data.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-slate-800/50 rounded-t-lg border-b border-gray-100 dark:border-slate-700">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition text-xs text-seal-gray-500 dark:text-slate-400 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {allSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      ) : someSelected ? (
                        <MinusSquare className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-seal-gray-500/40 dark:text-slate-500" />
                      )}
                      {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                    {selectedIds.size > 0 && (
                      <span className="text-xs text-primary font-semibold">
                        ({selectedIds.size}/{docs?.data?.length ?? 0})
                      </span>
                    )}
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={docs?.data || []}
                  keyExtractor={(doc) => doc.id}
                  loading={loading}
                  page={filters.page}
                  totalPages={docs?.meta.totalPages || 1}
                  total={docs?.meta.total}
                  onPageChange={(page) => setFilters({ page })}
                  onRowClick={(doc) => router.push(`/documents/${doc.id}`)}
                  sortBy={filters.sortBy || "updatedAt"}
                  sortOrder={(filters.sortOrder as "asc" | "desc") || "desc"}
                  onSort={(field) => {
                    const newOrder =
                      filters.sortBy === field && filters.sortOrder === "asc" ? "desc" : "asc";
                    setFilters({ sortBy: field, sortOrder: newOrder, page: 1 });
                  }}
                  emptyMessage={
                    hasFilters
                      ? "Aucun document ne correspond à ces critères. Ajustez vos filtres ou lancez une nouvelle recherche."
                      : "Aucun document pour le moment. Créez-en un pour démarrer."
                  }
                  emptyIcon={
                    <FileText className="h-12 w-12 text-seal-gray-500/30 dark:text-slate-600" />
                  }
                />
              </div>
            </>
          )}

        {/* Vue cartes */}
        {viewMode === "cards" && !loading && docs?.data && docs.data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {docs.data.map((doc) => {
              const classColors: Record<string, string> = {
                PUBLIC: "border-l-[#006233] bg-[#006233]/5",
                INTERNE: "border-l-[#296DC1] bg-[#296DC1]/5",
                CONFIDENTIEL: "border-l-[#F9964A] bg-[#F9964A]/5",
                SECRET: "border-l-[#892034] bg-[#892034]/5",
              };
              const classStyle =
                classColors[doc.classification || "INTERNE"] || classColors.INTERNE;
              const cardOverdue =
                doc.nextReviewDate && new Date(doc.nextReviewDate).getTime() < Date.now();
              return (
                <Card
                  key={doc.id}
                  hoverable
                  className={`stagger-item border-l-4 ${classStyle} cursor-pointer ${cardOverdue ? "ring-2 ring-[#892034]/40 dark:ring-red-500/40" : ""}`}
                  onClick={() => router.push(`/documents/${doc.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={doc.status as never} className="text-[10px]" />
                        {cardOverdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#892034]/10 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-bold text-[#892034] dark:text-red-400">
                            <AlertTriangle className="h-2.5 w-2.5" />À revoir
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 whitespace-nowrap">
                        {formatRelativeTime(doc.updatedAt)}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-seal-gray-500 dark:text-slate-500 mb-0.5">
                      {doc.reference}
                    </p>
                    <h3 className="text-sm font-medium text-seal-navy dark:text-white line-clamp-2 mb-2">
                      {doc.title}
                    </h3>
                    {(() => {
                      const info = getValidityInfo(doc.nextReviewDate);
                      return (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold mb-2 ${info.className}`}
                        >
                          {info.label}
                        </span>
                      );
                    })()}
                    {doc.description && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mb-3">
                        {doc.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {doc.owner && (
                          <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                            {doc.owner.firstName} {doc.owner.lastName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {doc.isoControls && doc.isoControls.length > 0 && (
                          <span className="text-[9px] text-seal-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {doc.isoControls.length} ISO
                          </span>
                        )}
                        {doc._count?.versions && doc._count.versions > 1 && (
                          <span className="text-[9px] text-seal-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            v{doc._count.versions}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {viewMode === "cards" && !loading && (!docs?.data || docs.data.length === 0) && (
          <EmptyState
            type="documents"
            title={t("documents.empty")}
            description="Aucun document ne correspond aux filtres sélectionnés. Réinitialisez vos critères ou créez un nouveau document."
            action={
              <div className="flex flex-wrap items-center gap-2 justify-center">
                {(hasFilters || !!debouncedSearch || myDocsOnly || statusTab !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllFilters}
                  >
                    <X className="h-4 w-4" /> Réinitialiser les filtres
                  </Button>
                )}
                {canCreate && (
                  <Button size="sm" onClick={() => router.push("/documents/new")}>
                    <Plus className="h-4 w-4" /> Créer un document
                  </Button>
                )}
              </div>
            }
          />
        )}

        {viewMode === "cards" && loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-slate-700 rounded shimmer" />
                  <div className="h-3 w-32 bg-gray-200 dark:bg-slate-700 rounded shimmer" />
                  <div className="h-5 w-full bg-gray-200 dark:bg-slate-700 rounded shimmer" />
                  <div className="h-3 w-3/4 bg-gray-200 dark:bg-slate-700 rounded shimmer" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination pour vue cartes */}
        {(viewMode === "cards" || viewMode === "kanban") && docs?.meta && docs.meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-seal-gray-500 dark:text-slate-400">
              Page {docs.meta.page} / {docs.meta.totalPages} — {docs.meta.total} documents
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={docs.meta.page <= 1}
                onClick={() => setFilters({ page: docs.meta.page - 1 })}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={docs.meta.page >= docs.meta.totalPages}
                onClick={() => setFilters({ page: docs.meta.page + 1 })}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}

        {viewMode === "kanban" && (
          <DocumentKanbanBoard
            documents={docs?.data || []}
            loading={loading}
            onCardClick={(id) => router.push(`/documents/${id}`)}
          />
        )}

        {/* Bulk delete confirmation */}
        <ConfirmDialog
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title="Supprimer les documents sélectionnés"
          description={`Vous allez retirer ${selectedIds.size} document${selectedIds.size > 1 ? "s" : ""} de la bibliothèque. Leur historique reste conservé pour la traçabilité.`}
          confirmLabel={`Supprimer ${selectedIds.size} document${selectedIds.size > 1 ? "s" : ""}`}
          variant="danger"
          loading={bulkDeleting}
        />

        <ConfirmDialog
          open={bulkAction === "archive"}
          onClose={() => { if (!bulkWorking) setBulkAction(null); }}
          onConfirm={handleBulkAction}
          title="Archiver la sélection"
          description={`${selectedIds.size} document${selectedIds.size > 1 ? "s seront archivés" : " sera archivé"}. Vous pourrez retrouver les documents dans l’onglet Archives.`}
          confirmLabel="Archiver"
          variant="primary"
          loading={bulkWorking}
        />
        <Dialog open={bulkAction === "classify"} onClose={() => { if (!bulkWorking) setBulkAction(null); }} title="Modifier la classification" description={`La nouvelle classification s’appliquera aux ${selectedIds.size} documents sélectionnés et à leurs règles d’accès.`}>
          <Select label="Nouvelle classification" value={bulkClassification} onChange={(event) => setBulkClassification(event.target.value)} options={[
            { value: "PUBLIC", label: "Public" }, { value: "INTERNE", label: "Interne" },
            { value: "CONFIDENTIEL", label: "Confidentiel" }, { value: "SECRET", label: "Secret" },
          ]} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" disabled={bulkWorking} onClick={() => setBulkAction(null)}>Annuler</Button>
            <Button loading={bulkWorking} onClick={handleBulkAction}>Appliquer</Button>
          </div>
        </Dialog>

        {/* Création depuis un modèle */}
        <CreateFromTemplateDialog
          open={showFromTemplate}
          onOpenChange={setShowFromTemplate}
          onCreated={() => {
            // Refresh documents list when a new doc has been created.
            fetchDocuments();
          }}
        />
      </div>
    </AIOrchestratedLayout>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-8 w-48 skeleton-shimmer rounded mb-4" />
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-28 skeleton-shimmer rounded-full" />
            ))}
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="h-12 skeleton-shimmer" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3 border-t border-gray-50 dark:border-slate-800"
              >
                <div className="h-4 w-20 skeleton-shimmer rounded" />
                <div className="h-4 flex-1 skeleton-shimmer rounded" />
                <div className="h-5 w-16 skeleton-shimmer rounded-full" />
                <div className="h-5 w-16 skeleton-shimmer rounded-full" />
                <div className="h-4 w-24 skeleton-shimmer rounded" />
              </div>
            ))}
          </div>
        </div>
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}

/* Les changements de statut passent par le circuit du document. */
const DOC_KANBAN_COLUMNS = [
  { statuses: ["DRAFT"], label: "Brouillons", color: "border-t-gray-400" },
  { statuses: ["IN_REVIEW", "REVIEW_APPROVED", "PENDING_APPROVAL"], label: "En validation", color: "border-t-amber-500" },
  { statuses: ["APPROVED"], label: "Publiés", color: "border-t-emerald-500" },
  { statuses: ["OBSOLETE", "ARCHIVED"], label: "Obsolètes et archives", color: "border-t-slate-500" },
];

function DocumentKanbanBoard({ documents, loading, onCardClick }: {
  documents: Document[]; loading: boolean; onCardClick: (id: string) => void;
}) {
  return (
    <section aria-label="Tableau documentaire" className="space-y-3">
      <p className="text-xs text-seal-gray-500 dark:text-slate-400">Documents de la page courante. Ouvrez un document pour consulter son circuit et effectuer les actions autorisées.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {DOC_KANBAN_COLUMNS.map((column) => {
          const items = documents.filter((doc) => column.statuses.includes(doc.status));
          return <div key={column.label} className={`rounded-lg border-t-4 ${column.color} bg-gray-50 p-3 dark:bg-slate-800/50`}>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{column.label}</h3><Badge variant="navy">{items.length}</Badge></div>
            {loading ? <div className="h-24 animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700" /> : <div className="space-y-2">
              {items.map((doc) => <button type="button" key={doc.id} onClick={() => onCardClick(doc.id)} className="w-full rounded-lg border border-gray-100 bg-white p-3 text-left shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1"><span className="text-[10px] font-mono text-seal-gray-500">{doc.reference}</span><StatusBadge status={doc.status} /></div>
                <p className="line-clamp-2 text-sm font-semibold">{doc.title}</p>
                <p className="mt-2 text-xs text-seal-gray-500 dark:text-slate-400">{doc.owner.firstName} {doc.owner.lastName}</p>
                <p className="mt-1 text-[10px] text-seal-gray-500">Modifié {formatRelativeTime(doc.updatedAt)}</p>
              </button>)}
              {items.length === 0 && <p className="py-6 text-center text-xs text-seal-gray-500">Aucun document sur cette page</p>}
            </div>}
          </div>;
        })}
      </div>
    </section>
  );
}
