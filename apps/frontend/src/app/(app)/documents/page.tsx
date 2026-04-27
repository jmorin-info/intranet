"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
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
  IsoControlBadge,
  SearchInput,
  Select,
  DataTable,
  EmptyState,
  Badge,
  ConfirmDialog,
  Avatar,
} from "@omnitech/ui";
import type { Column } from "@omnitech/ui";
import { formatDate, formatRelativeTime, getInitials } from "@/lib/utils";
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
  GripVertical,
  Trash2,
  FileDown,
  CheckSquare,
  Square,
  MinusSquare,
  Link2,
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

interface Document {
  id: string;
  title: string;
  reference: string;
  status: string;
  category: string;
  classification?: string;
  description: string;
  nextReviewDate: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; firstName: string; lastName: string };
  isoControls?: Array<{
    isoControl: { code: string; title: string; titleFr?: string };
  }>;
  _count?: { acknowledgments?: number; versions?: number };
}

const CLASS_COLORS: Record<string, string> = {
  PUBLIC: "border-l-[#006233] bg-[#006233]/5",
  INTERNE: "border-l-[#296DC1] bg-[#296DC1]/5",
  CONFIDENTIEL: "border-l-[#F9964A] bg-[#F9964A]/5",
  SECRET: "border-l-[#892034] bg-[#892034]/5",
};

const CARD_CLASS_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  SECRET: { bg: "bg-[#892034]/10", text: "text-[#892034]", label: "Secret" },
  CONFIDENTIEL: {
    bg: "bg-[#F9964A]/10",
    text: "text-[#F9964A]",
    label: "Confidentiel",
  },
  INTERNE: { bg: "bg-[#296DC1]/10", text: "text-[#296DC1]", label: "Interne" },
  PUBLIC: { bg: "bg-[#006233]/10", text: "text-[#006233]", label: "Public" },
};

const DocumentCard = React.memo(function DocumentCard({
  doc,
  onClick,
}: {
  doc: Document;
  onClick: (id: string) => void;
}) {
  const classStyle =
    CLASS_COLORS[doc.classification || "INTERNE"] || CLASS_COLORS.INTERNE;
  const ownerInitials = doc.owner
    ? getInitials(doc.owner.firstName, doc.owner.lastName)
    : "??";
  const classBadge = (CARD_CLASS_BADGE[doc.classification || "INTERNE"] ||
    CARD_CLASS_BADGE.INTERNE) as { bg: string; text: string; label: string };
  const isOverdueReview =
    doc.nextReviewDate && new Date(doc.nextReviewDate).getTime() < Date.now();
  return (
    <Card
      hoverable
      className={`border-l-4 ${classStyle} cursor-pointer ${isOverdueReview ? "ring-2 ring-[#892034]/40 dark:ring-red-500/40" : ""}`}
      onClick={() => onClick(doc.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={doc.status as never} className="text-[10px]" />
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${classBadge.bg} ${classBadge.text}`}
            >
              {classBadge.label}
            </span>
            {isOverdueReview && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#892034]/10 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-bold text-[#892034] dark:text-red-400">
                <AlertTriangle className="h-2.5 w-2.5" />A revoir
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-[10px] text-seal-gray-500 dark:text-slate-500 whitespace-nowrap">
            <Clock className="h-2.5 w-2.5" />
            {formatRelativeTime(doc.updatedAt)}
          </span>
        </div>
        <p className="text-xs font-mono text-seal-gray-500 dark:text-slate-500 mb-0.5">
          {doc.reference}
        </p>
        <h3 className="text-sm font-medium text-seal-navy dark:text-white line-clamp-2 mb-2">
          {doc.title}
        </h3>
        {doc.description && (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mb-3">
            {doc.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {doc.owner && (
              <>
                <Avatar
                  initials={ownerInitials}
                  size="sm"
                  className="h-5 w-5 text-[8px] flex-shrink-0"
                />
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                  {doc.owner.firstName} {doc.owner.lastName}
                </span>
              </>
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
});

function categoryBadgeVariant(
  cat: string,
): "info" | "warning" | "success" | "error" | "navy" | "primary" {
  switch (cat) {
    case "POLICY":
      return "primary";
    case "PROCEDURE":
      return "info";
    case "PLAN":
      return "success";
    case "RECORD":
      return "navy";
    case "CONTRACT":
      return "warning";
    case "REPORT":
      return "info";
    default:
      return "navy";
  }
}

function classificationVariant(
  c: string,
): "seal-bordeaux" | "seal-orange" | "seal-blue" | "seal-green" {
  switch (c) {
    case "SECRET":
      return "seal-bordeaux"; // PANTONE 202C
    case "CONFIDENTIEL":
      return "seal-orange"; // PANTONE 715C
    case "INTERNE":
      return "seal-blue"; // PANTONE 660C
    case "PUBLIC":
      return "seal-green"; // PANTONE 349C
    default:
      return "seal-blue";
  }
}

interface PaginatedDocs {
  data: Document[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * Return a human-readable validity indicator based on the document review deadline.
 * Uses `nextReviewDate` (no `validUntil` field in the Prisma schema).
 * Colors follow the SEAL charter.
 */
interface ValidityInfo {
  label: string;
  className: string;
}
function getValidityInfo(
  nextReviewDate: string | null | undefined,
): ValidityInfo {
  if (!nextReviewDate) {
    return {
      label: "Permanent",
      className:
        "bg-gray-100 text-seal-gray-500 dark:bg-slate-800 dark:text-slate-400",
    };
  }
  const diffMs = new Date(nextReviewDate).getTime() - Date.now();
  const days = Math.floor(diffMs / 86400000);
  if (days < 0) {
    return {
      label: `Expire (${Math.abs(days)}j)`,
      className:
        "bg-[#892034]/10 text-[#892034] dark:bg-[#892034]/20 dark:text-red-300",
    };
  }
  if (days <= 14) {
    return {
      label: `Bientot (${days}j)`,
      className: "bg-[#F9964A]/15 text-[#F9964A] dark:text-amber-300",
    };
  }
  return {
    label: `Valide (${days}j)`,
    className:
      "bg-[#006233]/10 text-[#006233] dark:bg-[#006233]/20 dark:text-emerald-300",
  };
}

/**
 * Filter tabs grouped on status families (the Prisma DocumentStatus enum has
 * more values than tabs, so we map ranges -> tab keys).
 */
type StatusTabKey =
  | "all"
  | "drafts"
  | "review"
  | "published"
  | "expired"
  | "archived";
const STATUS_TAB_DEFS: Array<{
  key: StatusTabKey;
  label: string;
  color: string;
  statuses: DocumentStatus[] | null;
}> = [
  {
    key: "all",
    label: "Tous",
    color: "border-seal-gray-500 text-seal-gray-500",
    statuses: null,
  },
  {
    key: "drafts",
    label: "Brouillons",
    color: "border-[#296DC1] text-[#296DC1]",
    statuses: [DocumentStatus.DRAFT],
  },
  {
    key: "review",
    label: "En revue",
    color: "border-[#F9964A] text-[#F9964A]",
    statuses: [
      DocumentStatus.IN_REVIEW,
      DocumentStatus.REVIEW_APPROVED,
      DocumentStatus.PENDING_APPROVAL,
    ],
  },
  {
    key: "published",
    label: "Publies",
    color: "border-[#006233] text-[#006233]",
    statuses: [DocumentStatus.APPROVED],
  },
  {
    key: "expired",
    label: "Expires",
    color: "border-[#892034] text-[#892034]",
    statuses: [DocumentStatus.OBSOLETE],
  },
  {
    key: "archived",
    label: "Archives",
    color: "border-gray-400 text-seal-gray-500 dark:border-slate-600 dark:text-slate-400",
    statuses: [DocumentStatus.ARCHIVED],
  },
];

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
  const [quickStats, setQuickStats] = useState<{
    total: number;
    mine: number;
    pendingReview: number;
    recentlyUpdated: number;
  } | null>(null);

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const canReview = user && isRoleAtLeast(user.role, UserRole.REVIEWER);
  const canCreate = user && isRoleAtLeast(user.role, UserRole.COLLABORATEUR);

  useEffect(() => {
    if (isAdmin) {
      api
        .get("/documents/statistics")
        .then((r) => setDocStats(r.data))
        .catch((err) =>
          logger.error(err, { page: "documents", context: "load statistics" }),
        );
    }
  }, [isAdmin]);

  // Compute quick stats from loaded docs and stats
  useEffect(() => {
    if (docs && user) {
      const total = docs.meta?.total ?? 0;
      const docList = docs.data || [];
      const mine = docList.filter((d) => d.owner.id === user.id).length;
      const pendingReview = docList.filter(
        (d) => d.status === "IN_REVIEW" || d.status === "PENDING_APPROVAL",
      ).length;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const recentlyUpdated = docList.filter(
        (d) => d.updatedAt >= sevenDaysAgo,
      ).length;
      setQuickStats({ total, mine, pendingReview, recentlyUpdated });
    }
  }, [docs, user]);

  const debouncedSearch = useDebounce(filters.search || "", 300);

  // Initialize filters from URL params
  useEffect(() => {
    const status = searchParams.get("status") as DocumentStatus | null;
    const category = searchParams.get("category") as DocumentCategory | null;
    if (status || category) {
      setFilters({
        status: status || undefined,
        category: category || undefined,
      });
    }
  }, [searchParams, setFilters]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const params: Record<string, string | number> = {
        page: filters.page,
        limit: filters.limit,
      };
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.classification)
        params.classification = filters.classification;
      if (filters.isoControlCode)
        params.isoControlCode = filters.isoControlCode;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.sortBy) params.sortBy = filters.sortBy;
      if (filters.sortOrder) params.sortOrder = filters.sortOrder;
      if (myDocsOnly && user?.id) params.ownerId = user.id;

      const { data } = await api.get("/documents", { params });
      setDocs(data);
    } catch {
      setDocs(null);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [filters, debouncedSearch, myDocsOnly, user?.id]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Refetch when user returns from detail page (prevents stale status badges)
  useRefetchOnFocus(fetchDocuments);

  // Event bus: auto-refresh when document mutations happen elsewhere
  useEntityEvents("DOCUMENT", (event) => {
    if (event.metadata?.optimistic) return;
    if (
      ["CREATED", "APPROVED", "REJECTED", "STATUS_CHANGED", "DELETED"].includes(
        event.type,
      )
    ) {
      fetchDocuments();
    }
  });

  const [viewMode, setViewMode] = useState<"table" | "cards" | "kanban">(
    "table",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusTab, setStatusTab] = useState<StatusTabKey>("all");
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
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
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Rechercher"]',
        );
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
    for (const doc of selectedDocs) {
      try {
        const { data } = await api.get(`/documents/${doc.id}/download`, {
          responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${doc.reference}-${doc.title}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch {
        toast.error(`Erreur de téléchargement : ${doc.title}`);
      }
    }
    toast.success("Téléchargement lancé");
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

  const handleBulkArchive = async () => {
    if (selectedDocs.length === 0) return;
    if (
      !confirm(
        `Archiver ${selectedDocs.length} document${selectedDocs.length > 1 ? "s" : ""} ?`,
      )
    )
      return;
    try {
      const { data } = await api.post<{ updated: number }>(
        "/documents/bulk/archive",
        {
          ids: selectedDocs.map((d) => d.id),
        },
      );
      toast.success(
        `${data.updated} document${data.updated > 1 ? "s archivés" : " archivé"}`,
      );
      setSelectedIds(new Set());
      fetchDocuments();
    } catch {
      toast.error("Erreur d'archivage");
    }
  };

  const handleBulkClassify = async () => {
    if (selectedDocs.length === 0) return;
    const choice = prompt(
      "Nouvelle classification (PUBLIC / INTERNE / CONFIDENTIEL / SECRET) :",
      "INTERNE",
    );
    if (!choice) return;
    const value = choice.trim().toUpperCase();
    if (!["PUBLIC", "INTERNE", "CONFIDENTIEL", "SECRET"].includes(value)) {
      toast.error("Classification invalide");
      return;
    }
    try {
      const { data } = await api.post<{ updated: number }>(
        "/documents/bulk/classify",
        {
          ids: selectedDocs.map((d) => d.id),
          classification: value,
        },
      );
      toast.success(
        `Classification mise à jour sur ${data.updated} document${data.updated > 1 ? "s" : ""}`,
      );
      setSelectedIds(new Set());
      fetchDocuments();
    } catch {
      toast.error("Erreur de classification");
    }
  };

  const handleExportAllCSV = async () => {
    try {
      const params: Record<string, unknown> = {};
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.classification)
        params.classification = filters.classification;
      if (filters.isoControlCode)
        params.isoControlCode = filters.isoControlCode;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (myDocsOnly && user?.id) params.ownerId = user.id;

      const stamp = new Date().toISOString().slice(0, 10);
      await downloadFromApi(
        "/documents/export/csv",
        `documents-${stamp}.csv`,
        params,
      );
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
      DOCUMENT_CATEGORY_LABELS[doc.category as DocumentCategory] ||
        doc.category,
      doc.classification || "",
      DOCUMENT_STATUS_LABELS[doc.status as DocumentStatus] || doc.status,
      `${doc.owner.firstName} ${doc.owner.lastName}`,
      formatDate(doc.createdAt),
      formatDate(doc.updatedAt),
    ]);
    const csv = [
      headers.join(";"),
      ...rows.map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"),
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `documents-export-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Export terminé");
  };

  const canSeeAllStatuses = user && isRoleAtLeast(user.role, UserRole.REVIEWER);
  const statusOptions = Object.entries(DOCUMENT_STATUS_LABELS)
    .filter(([value]) => canSeeAllStatuses || value === "APPROVED")
    .map(([value, label]) => ({ value, label }));

  const categoryOptions = Object.entries(DOCUMENT_CATEGORY_LABELS).map(
    ([value, label]) => ({
      value,
      label,
    }),
  );

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

  const allSelected =
    docs?.data && docs.data.length > 0 && selectedIds.size === docs.data.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const columns: Column<Document>[] = [
    ...(isAdmin
      ? [
          {
            key: "select" as keyof Document,
            header: "",
            className: "w-10",
            render: (doc: Document) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelect(doc.id);
                }}
                className="flex items-center justify-center p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={
                  selectedIds.has(doc.id) ? "Désélectionner" : "Sélectionner"
                }
              >
                {selectedIds.has(doc.id) ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4 text-seal-gray-500/40 dark:text-slate-500" />
                )}
              </button>
            ),
          },
        ]
      : []),
    {
      key: "reference",
      header: "Référence",
      sortable: true,
      className: "w-36",
      render: (doc) => (
        <span className="font-mono text-xs text-seal-navy dark:text-white font-semibold">
          {doc.reference}
        </span>
      ),
    },
    {
      key: "title",
      header: "Titre",
      sortable: true,
      render: (doc) => (
        <div className="min-w-0" title={doc.description || doc.title}>
          <p className="text-sm font-semibold text-seal-navy dark:text-white truncate max-w-xs">
            {doc.title}
          </p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {doc.isoControls?.slice(0, 3).map(({ isoControl }) => (
              <IsoControlBadge
                key={isoControl.code}
                code={isoControl.code}
                title={isoControl.titleFr || isoControl.title}
              />
            ))}
            {(doc.isoControls?.length || 0) > 3 && (
              <Badge variant="navy">
                +{(doc.isoControls?.length || 0) - 3}
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Catégorie",
      render: (doc) => (
        <Badge variant={categoryBadgeVariant(doc.category)}>
          {DOCUMENT_CATEGORY_LABELS[doc.category as DocumentCategory] ||
            doc.category}
        </Badge>
      ),
    },
    ...(canReview
      ? [
          {
            key: "classification" as keyof Document,
            header: "Classification",
            render: (doc: Document) =>
              doc.classification ? (
                <Badge variant={classificationVariant(doc.classification)}>
                  {doc.classification}
                </Badge>
              ) : null,
          },
        ]
      : []),
    {
      key: "status",
      header: "Statut",
      sortable: true,
      render: (doc) => (
        <StatusBadge
          status={
            doc.status as
              | "DRAFT"
              | "IN_REVIEW"
              | "PENDING_APPROVAL"
              | "APPROVED"
              | "OBSOLETE"
              | "ARCHIVED"
          }
        />
      ),
    },
    {
      key: "owner",
      header: "Responsable",
      render: (doc) => (
        <div className="flex items-center gap-2">
          <Avatar
            initials={getInitials(doc.owner.firstName, doc.owner.lastName)}
            size="sm"
            className="h-6 w-6 text-[10px] flex-shrink-0"
          />
          <span className="text-sm text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
            {doc.owner.firstName} {doc.owner.lastName}
          </span>
        </div>
      ),
    },
    {
      key: "updatedAt",
      header: "Modifié",
      sortable: true,
      render: (doc) => (
        <span className="text-xs text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
          {formatRelativeTime(doc.updatedAt)}
        </span>
      ),
    },
    {
      key: "nextReviewDate",
      header: "Validité",
      render: (doc) => {
        const info = getValidityInfo(doc.nextReviewDate);
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${info.className}`}
            title={
              doc.nextReviewDate
                ? `Prochaine revue : ${formatDate(doc.nextReviewDate)}`
                : "Document sans date de revue"
            }
          >
            {info.label}
          </span>
        );
      },
    },
    {
      key: "id",
      header: "",
      className: "w-28",
      render: (doc) => (
        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/documents/${doc.id}`);
            }}
            title="Ouvrir"
            aria-label="Ouvrir le document"
            className="rounded p-1 text-seal-gray-500 hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-700 transition"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const { data } = await api.get(
                  `/documents/${doc.id}/download`,
                  { responseType: "blob" },
                );
                const blobUrl = URL.createObjectURL(new Blob([data]));
                const link = window.document.createElement("a");
                link.href = blobUrl;
                link.setAttribute(
                  "download",
                  `${doc.reference}-${doc.title}.pdf`,
                );
                window.document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(blobUrl);
                toast.success("Téléchargement lancé");
              } catch {
                toast.error("Téléchargement impossible");
              }
            }}
            title="Télécharger"
            aria-label="Télécharger le document"
            className="rounded p-1 text-seal-gray-500 hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-700 transition"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const url = `${window.location.origin}/documents/${doc.id}`;
              navigator.clipboard
                ?.writeText(url)
                .then(() => toast.success("Lien copie"))
                .catch(() => toast.error("Impossible de copier"));
            }}
            title="Copier le lien"
            aria-label="Copier le lien du document"
            className="rounded p-1 text-seal-gray-500 hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-700 transition"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const hasFilters =
    filters.status ||
    filters.category ||
    filters.classification ||
    filters.isoControlCode ||
    filters.dateFrom;

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
                rows={
                  (docs?.data || []) as unknown as Array<
                    Record<string, unknown>
                  >
                }
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
                      r?.owner
                        ? `${r.owner.firstName} ${r.owner.lastName}`
                        : "",
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
                  <Button
                    variant="outline"
                    onClick={() => setShowFromTemplate(true)}
                    title="Créer un document à partir d'un template"
                  >
                    <FileText className="h-4 w-4" />
                    Depuis template
                  </Button>
                  <Button onClick={() => router.push("/documents/new")}>
                    <Plus className="h-4 w-4" />
                    {t("documents.new")}
                  </Button>
                </>
              )}
            </>
          }
        />

        {/* Quick stats bar */}
        {quickStats && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="navy"
              className="inline-flex items-center gap-1.5 px-3 py-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="font-semibold">{quickStats.total}</span>{" "}
              documents
            </Badge>
            <Badge
              variant="primary"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 cursor-pointer"
              onClick={() => {
                setMyDocsOnly(true);
                setFilters({ page: 1 });
              }}
            >
              <User className="h-3.5 w-3.5" />
              <span className="font-semibold">{quickStats.mine}</span> mes
              documents
            </Badge>
            {canReview && quickStats.pendingReview > 0 && (
              <Badge
                variant="warning"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 cursor-pointer"
                onClick={() =>
                  setFilters({ status: "IN_REVIEW" as DocumentStatus, page: 1 })
                }
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="font-semibold">
                  {quickStats.pendingReview}
                </span>{" "}
                en revue
              </Badge>
            )}
            {quickStats.recentlyUpdated > 0 && (
              <Badge
                variant="success"
                className="inline-flex items-center gap-1.5 px-3 py-1.5"
              >
                <Clock className="h-3.5 w-3.5" />
                <span className="font-semibold">
                  {quickStats.recentlyUpdated}
                </span>{" "}
                mis à jour (7j)
              </Badge>
            )}
          </div>
        )}

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
                    <div
                      key={c.category}
                      className="flex items-center gap-2 text-xs"
                    >
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
                    <div
                      key={s.status}
                      className="flex items-center gap-2 text-xs"
                    >
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
                    const colors: Record<string, string> = {
                      SECRET: "bg-red-500",
                      CONFIDENTIEL: "bg-amber-500",
                      INTERNE: "bg-blue-500",
                      PUBLIC: "bg-emerald-500",
                    };
                    return (
                      <div
                        key={c.classification}
                        className="flex items-center gap-2 text-xs"
                      >
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
            <div className="flex gap-3">
              <SearchInput
                value={filters.search || ""}
                onChange={(search) => setFilters({ search, page: 1 })}
                placeholder={t("documents.search")}
                className="flex-1"
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
                  title="Exporte jusqu'a 1000 documents filtres au format CSV"
                >
                  <FileDown className="h-4 w-4" />
                  Exporter CSV
                </Button>
              )}
              {hasFilters && (
                <Button variant="ghost" onClick={resetFilters}>
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
                      category:
                        (e.target.value as DocumentCategory) || undefined,
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
              if (c.value === "SECRET")
                return user && isRoleAtLeast(user.role, UserRole.ADMIN);
              if (c.value === "CONFIDENTIEL")
                return user && isRoleAtLeast(user.role, UserRole.REVIEWER);
              return true;
            })
            .map((c) => (
              <button
                key={c.value}
                onClick={() =>
                  setFilters({
                    classification:
                      filters.classification === c.value ? undefined : c.value,
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
                  category:
                    filters.category === cat
                      ? undefined
                      : (cat as DocumentCategory),
                  page: 1,
                })
              }
              className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filters.category === cat ? "bg-primary text-white" : "bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200"}`}
            >
              {DOCUMENT_CATEGORY_LABELS[
                cat as keyof typeof DOCUMENT_CATEGORY_LABELS
              ] || cat}
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
              (t) =>
                canSeeAllStatuses || t.key === "all" || t.key === "published",
            ).map((tab) => {
              const active = statusTab === tab.key;
              const count =
                tab.statuses === null
                  ? (docs?.meta?.total ?? 0)
                  : (docs?.data?.filter((d) =>
                      tab.statuses!.includes(d.status as DocumentStatus),
                    ).length ?? 0);
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setStatusTab(tab.key);
                    if (tab.statuses === null) {
                      setFilters({ status: undefined, page: 1 });
                    } else if (tab.statuses.length === 1) {
                      setFilters({ status: tab.statuses[0], page: 1 });
                    } else {
                      // Multi-status tab: apply first status then rely on client-side filter
                      setFilters({ status: tab.statuses[0], page: 1 });
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? `${tab.color} bg-white dark:bg-slate-800`
                      : "border-transparent text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-white/60 dark:bg-slate-900/60" : "bg-gray-100 dark:bg-slate-700"}`}
                  >
                    {count}
                  </span>
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
              { label: "Archiver", icon: Archive, onClick: handleBulkArchive },
              {
                label: "Classification",
                icon: ShieldCheck,
                onClick: handleBulkClassify,
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
              <Button
                variant="outline"
                className="mt-3"
                onClick={fetchDocuments}
              >
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
              description="Votre base documentaire ISO 27001 est vide. Cr\u00e9ez votre premier document pour d\u00e9marrer le r\u00e9f\u00e9rentiel."
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
                    const classBadge = (CARD_CLASS_BADGE[
                      doc.classification || "INTERNE"
                    ] || CARD_CLASS_BADGE.INTERNE) as {
                      bg: string;
                      text: string;
                      label: string;
                    };
                    const cardOverdue =
                      doc.nextReviewDate &&
                      new Date(doc.nextReviewDate).getTime() < Date.now();
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
                          <StatusBadge
                            status={doc.status as never}
                            className="text-[10px]"
                          />
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
                      {allSelected
                        ? "Tout désélectionner"
                        : "Tout sélectionner"}
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
                      filters.sortBy === field && filters.sortOrder === "asc"
                        ? "desc"
                        : "asc";
                    setFilters({ sortBy: field, sortOrder: newOrder, page: 1 });
                  }}
                  emptyMessage={
                    hasFilters
                      ? "Aucun document ne correspond \u00e0 ces crit\u00e8res. Ajustez vos filtres ou lancez une nouvelle recherche."
                      : "Aucun document pour le moment. Cr\u00e9ez-en un pour d\u00e9marrer."
                  }
                  emptyIcon={
                    <FileText className="h-12 w-12 text-seal-gray-500/30 dark:text-slate-600" />
                  }
                />
              </div>
            </>
          )}

        {/* Vue cartes */}
        {viewMode === "cards" &&
          !loading &&
          docs?.data &&
          docs.data.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {docs.data.map((doc) => {
                const classColors: Record<string, string> = {
                  PUBLIC: "border-l-[#006233] bg-[#006233]/5",
                  INTERNE: "border-l-[#296DC1] bg-[#296DC1]/5",
                  CONFIDENTIEL: "border-l-[#F9964A] bg-[#F9964A]/5",
                  SECRET: "border-l-[#892034] bg-[#892034]/5",
                };
                const classStyle =
                  classColors[doc.classification || "INTERNE"] ||
                  classColors.INTERNE;
                const cardOverdue =
                  doc.nextReviewDate &&
                  new Date(doc.nextReviewDate).getTime() < Date.now();
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
                          <StatusBadge
                            status={doc.status as never}
                            className="text-[10px]"
                          />
                          {cardOverdue && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#892034]/10 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-bold text-[#892034] dark:text-red-400">
                              <AlertTriangle className="h-2.5 w-2.5" />A revoir
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

        {viewMode === "cards" &&
          !loading &&
          (!docs?.data || docs.data.length === 0) && (
            <EmptyState
              type="documents"
              title={t("documents.empty")}
              description="Aucun document ne correspond aux filtres s\u00e9lectionn\u00e9s. R\u00e9initialisez vos crit\u00e8res ou cr\u00e9ez un nouveau document."
              action={
                <div className="flex flex-wrap items-center gap-2 justify-center">
                  {(hasFilters ||
                    !!debouncedSearch ||
                    myDocsOnly ||
                    statusTab !== "all") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        resetFilters();
                        setStatusTab("all");
                        setMyDocsOnly(false);
                      }}
                    >
                      <X className="h-4 w-4" /> Reinitialiser les filtres
                    </Button>
                  )}
                  {canCreate && (
                    <Button
                      size="sm"
                      onClick={() => router.push("/documents/new")}
                    >
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
        {viewMode === "cards" && docs?.meta && docs.meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-seal-gray-500 dark:text-slate-400">
              Page {docs.meta.page} / {docs.meta.totalPages} — {docs.meta.total}{" "}
              documents
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
            isAdmin={!!isAdmin}
            onStatusChange={async (docId, newStatus) => {
              try {
                await api.patch(`/documents/${docId}`, { status: newStatus });
                fetchDocuments();
              } catch {
                /* handled */
              }
            }}
            onCardClick={(id) => router.push(`/documents/${id}`)}
          />
        )}

        {/* Bulk delete confirmation */}
        <ConfirmDialog
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title="Supprimer les documents sélectionnés"
          description={`Vous allez supprimer définitivement ${selectedIds.size} document${selectedIds.size > 1 ? "s" : ""}. Cette action est irréversible.`}
          confirmLabel={`Supprimer ${selectedIds.size} document${selectedIds.size > 1 ? "s" : ""}`}
          variant="danger"
          loading={bulkDeleting}
        />

        {/* Wave D — Création depuis template */}
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

/* ─────── Document Kanban Board with HTML5 Drag & Drop ─────── */

const DOC_KANBAN_COLUMNS = [
  {
    status: "DRAFT",
    label: "Brouillon",
    color: "border-t-gray-400",
    dropBg: "bg-gray-50 dark:bg-gray-900/20",
  },
  {
    status: "IN_REVIEW",
    label: "En revue",
    color: "border-t-blue-500",
    dropBg: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    status: "PENDING_APPROVAL",
    label: "Approbation",
    color: "border-t-amber-500",
    dropBg: "bg-amber-50 dark:bg-amber-900/20",
  },
  {
    status: "APPROVED",
    label: "Approuvé",
    color: "border-t-emerald-500",
    dropBg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
];

interface DocumentKanbanBoardProps {
  documents: Document[];
  loading: boolean;
  isAdmin: boolean;
  onStatusChange: (docId: string, newStatus: string) => Promise<void>;
  onCardClick: (id: string) => void;
}

function DocumentKanbanBoard({
  documents,
  loading,
  isAdmin,
  onStatusChange,
  onCardClick,
}: DocumentKanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, docId: string) => {
    if (!isAdmin) {
      e.preventDefault();
      return;
    }
    setDraggedId(docId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", docId);
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      if (el) el.style.opacity = "0.4";
    });
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el) el.style.opacity = "1";
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(status);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDropTarget(null);
    const docId = e.dataTransfer.getData("text/plain");
    if (!docId) return;
    const doc = documents.find((d) => d.id === docId);
    if (!doc || doc.status === newStatus) return;
    setMoving(docId);
    await onStatusChange(docId, newStatus);
    setMoving(null);
    setDraggedId(null);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {DOC_KANBAN_COLUMNS.map((col) => (
          <div
            key={col.status}
            className="rounded-lg border-t-4 border-gray-200 dark:border-slate-600 p-3 min-h-[200px] bg-gray-50 dark:bg-slate-800/50"
          >
            <div className="h-5 w-24 skeleton-shimmer rounded mb-3" />
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-lg p-3 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-4 w-14 skeleton-shimmer rounded-full" />
                    <div className="h-3 w-16 skeleton-shimmer rounded ml-auto" />
                  </div>
                  <div className="h-4 w-full skeleton-shimmer rounded mb-1" />
                  <div className="h-3 w-2/3 skeleton-shimmer rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {DOC_KANBAN_COLUMNS.map((col) => {
        const colDocs = documents.filter((d) => d.status === col.status);
        const isOver = dropTarget === col.status && draggedId !== null;
        const draggedDoc = draggedId
          ? documents.find((d) => d.id === draggedId)
          : null;
        const isDraggedFromHere = draggedDoc?.status === col.status;

        return (
          <div
            key={col.status}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
            className={`rounded-lg border-t-4 ${col.color} p-3 min-h-[200px] transition-all duration-200 ${
              isOver && !isDraggedFromHere
                ? `${col.dropBg} ring-2 ring-primary/30 scale-[1.01]`
                : "bg-gray-50 dark:bg-slate-800/50"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                {col.label}
              </h3>
              <Badge variant="navy">{colDocs.length}</Badge>
            </div>

            {isOver && !isDraggedFromHere && (
              <div className="border-2 border-dashed border-primary/40 rounded-lg p-3 mb-2 text-center">
                <p className="text-xs text-primary font-semibold">
                  Déposer ici → {col.label}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {colDocs.map((doc) => {
                const isDragged = draggedId === doc.id;
                const isBeingMoved = moving === doc.id;
                return (
                  <div
                    key={doc.id}
                    draggable={isAdmin}
                    onDragStart={(e) => handleDragStart(e, doc.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (!isDragged) onCardClick(doc.id);
                    }}
                    className={`bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-slate-700 group ${
                      isDragged
                        ? "opacity-40 scale-95"
                        : "card-hover cursor-pointer"
                    } ${isBeingMoved ? "animate-pulse" : ""} ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {isAdmin && (
                          <GripVertical className="h-3 w-3 text-seal-gray-500/30 group-hover:text-seal-gray-500/60 flex-shrink-0" />
                        )}
                        <Badge
                          variant={categoryBadgeVariant(doc.category)}
                          className="text-[9px]"
                        >
                          {DOCUMENT_CATEGORY_LABELS[
                            doc.category as DocumentCategory
                          ] || doc.category}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-seal-gray-500 font-mono">
                        {doc.reference}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-seal-navy dark:text-white line-clamp-2 group-hover:text-primary transition-colors">
                      {doc.title}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-slate-700/50">
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                        {doc.owner.firstName} {doc.owner.lastName}
                      </p>
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                        {formatRelativeTime(doc.updatedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {colDocs.length === 0 && !isOver && (
                <p className="text-xs text-seal-gray-500 dark:text-slate-500 text-center py-8">
                  Aucun document
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
