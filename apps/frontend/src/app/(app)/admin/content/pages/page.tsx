"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import {
  Button,
  Badge,
  DataTable,
  ConfirmDialog,
  SearchInput,
  SkeletonTable,
  EmptyState,
} from "@omnitech/ui";
import type { Column } from "@omnitech/ui";
import {
  listPages,
  deletePage,
  publishPage,
  unpublishPage,
} from "@/lib/cms-admin/api";
import {
  CONTENT_STATUS_LABELS,
  SUPPORTED_LOCALES,
  type ContentPage,
  type ContentStatus,
} from "@/lib/cms-admin/types";

const STATUS_FILTERS: Array<{ value: ContentStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Tous" },
  { value: "DRAFT", label: "Brouillons" },
  { value: "PUBLISHED", label: "Publiés" },
  { value: "ARCHIVED", label: "Archivés" },
];

const STATUS_BADGE_VARIANT: Record<
  ContentStatus,
  "draft" | "success" | "navy"
> = {
  DRAFT: "draft",
  PUBLISHED: "success",
  ARCHIVED: "navy",
};

export default function AdminContentPagesList() {
  const router = useRouter();
  const [data, setData] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "ALL">(
    "ALL",
  );
  const [localeFilter, setLocaleFilter] = useState<string>("ALL");

  const [toDelete, setToDelete] = useState<ContentPage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPages({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        locale: localeFilter === "ALL" ? undefined : localeFilter,
        q: debouncedSearch || undefined,
        page,
        limit: 20,
      });
      setData(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } catch (err: unknown) {
      toast.error("Impossible de charger les pages CMS");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, localeFilter, debouncedSearch, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleTogglePublish(p: ContentPage) {
    try {
      if (p.status === "PUBLISHED") {
        await unpublishPage(p.id);
        toast.success(`Page « ${p.title} » dépubliée`);
      } else {
        await publishPage(p.id);
        toast.success(`Page « ${p.title} » publiée`);
      }
      void fetchData();
    } catch {
      toast.error("Action impossible");
    }
  }

  async function handleConfirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deletePage(toDelete.id);
      toast.success(`Page « ${toDelete.title} » supprimée`);
      setToDelete(null);
      void fetchData();
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<ContentPage>[] = [
    {
      key: "title",
      header: "Titre",
      render: (p) => (
        <Link
          href={`/admin/content/pages/${p.id}`}
          className="font-medium text-seal-navy hover:text-seal-orange dark:text-white"
        >
          {p.title}
        </Link>
      ),
    },
    {
      key: "slug",
      header: "Slug",
      render: (p) => (
        <code className="text-xs text-seal-gray-500 dark:text-slate-400">
          /{p.slug}
        </code>
      ),
    },
    {
      key: "locale",
      header: "Locale",
      render: (p) => (
        <span className="uppercase text-xs font-medium">{p.locale}</span>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (p) => (
        <Badge variant={STATUS_BADGE_VARIANT[p.status]}>
          {CONTENT_STATUS_LABELS[p.status]}
        </Badge>
      ),
    },
    {
      key: "updatedAt",
      header: "Mise à jour",
      render: (p) => (
        <span className="text-xs text-seal-gray-500 dark:text-slate-400">
          {new Date(p.updatedAt).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "author",
      header: "Auteur",
      render: (p) =>
        p.updatedBy ? (
          <span className="text-xs">
            {p.updatedBy.firstName} {p.updatedBy.lastName}
          </span>
        ) : p.author ? (
          <span className="text-xs">
            {p.author.firstName} {p.author.lastName}
          </span>
        ) : (
          <span className="text-xs text-seal-gray-500">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              void handleTogglePublish(p);
            }}
            aria-label={
              p.status === "PUBLISHED" ? "Dépublier la page" : "Publier la page"
            }
            title={
              p.status === "PUBLISHED" ? "Dépublier la page" : "Publier la page"
            }
          >
            {p.status === "PUBLISHED" ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setToDelete(p);
            }}
            aria-label="Supprimer la page"
            title="Supprimer la page"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHeader
        hub="admin"
        icon={FileText}
        title="Pages éditoriales"
        subtitle="Pages statiques publiées sur l'intranet (mentions légales, FAQ, accueil…)"
        actions={
          <Button
            variant="primary"
            onClick={() => router.push("/admin/content/pages/new")}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouvelle page
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Rechercher un titre, un slug…"
          className="min-w-[260px] flex-1 max-w-md"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ContentStatus | "ALL");
            setPage(1);
          }}
          className="seal-input h-9 text-sm"
          aria-label="Filtrer par statut"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={localeFilter}
          onChange={(e) => {
            setLocaleFilter(e.target.value);
            setPage(1);
          }}
          className="seal-input h-9 text-sm"
          aria-label="Filtrer par langue"
        >
          <option value="ALL">Toutes langues</option>
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {loading && data.length === 0 ? (
        <SkeletonTable rows={5} />
      ) : data.length === 0 ? (
        <EmptyState
          type="general"
          title="Aucune page CMS"
          description="Créez votre première page éditoriale."
          cta={{
            label: "Nouvelle page",
            onClick: () => router.push("/admin/content/pages/new"),
          }}
        />
      ) : (
        <DataTable<ContentPage>
          columns={columns}
          data={data}
          keyExtractor={(p) => p.id}
          page={page}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          loading={loading}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Supprimer cette page ?"
        description={
          toDelete
            ? `« ${toDelete.title} » sera archivée (soft delete). L'historique des révisions reste conservé.`
            : ""
        }
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
