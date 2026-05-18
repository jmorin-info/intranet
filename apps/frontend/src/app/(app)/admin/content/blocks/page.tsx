"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import {
  Button,
  Badge,
  DataTable,
  Dialog,
  ConfirmDialog,
  SearchInput,
  SkeletonTable,
  EmptyState,
  Input,
  Textarea,
} from "@omnitech/ui";
import type { Column } from "@omnitech/ui";
import { createBlock, deleteBlock, listBlocks } from "@/lib/cms-admin/api";
import {
  CONTENT_STATUS_LABELS,
  SUPPORTED_LOCALES,
  type ContentBlock,
  type ContentStatus,
} from "@/lib/cms-admin/types";

const STATUS_BADGE_VARIANT: Record<
  ContentStatus,
  "draft" | "success" | "navy"
> = {
  DRAFT: "draft",
  PUBLISHED: "success",
  ARCHIVED: "navy",
};

const BLOCK_KEY_REGEX = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

const createBlockSchema = z.object({
  key: z
    .string()
    .min(1, "Clé requise")
    .max(120)
    .regex(
      BLOCK_KEY_REGEX,
      "Notation pointée minuscule (ex: welcome.hero.title)",
    ),
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().max(255).optional().or(z.literal("")),
  body: z.string().min(1, "Body requis").max(20_000),
});

type CreateBlockValues = z.infer<typeof createBlockSchema>;

export default function AdminContentBlocksList() {
  const router = useRouter();
  const [data, setData] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [prefix, setPrefix] = useState<string>("");
  const [localeFilter, setLocaleFilter] = useState<string>("ALL");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ContentBlock | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateBlockValues>({
    resolver: zodResolver(createBlockSchema),
    defaultValues: { locale: "fr", key: "", body: "", title: "" },
    mode: "onTouched",
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBlocks({
        prefix: prefix || undefined,
        locale: localeFilter === "ALL" ? undefined : localeFilter,
        q: debouncedSearch || undefined,
        page,
        limit: 50,
      });
      setData(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } catch {
      toast.error("Impossible de charger les blocs CMS");
    } finally {
      setLoading(false);
    }
  }, [prefix, localeFilter, debouncedSearch, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function onCreate(values: CreateBlockValues) {
    setCreating(true);
    try {
      const created = await createBlock({
        key: values.key,
        locale: values.locale,
        title: values.title || undefined,
        body: values.body,
      });
      toast.success(`Bloc « ${created.key} » créé`);
      reset();
      setShowCreate(false);
      router.push(`/admin/content/blocks/${created.id}`);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { message?: string } } }).response
              ?.data?.message ?? "Erreur inconnue")
          : "Erreur inconnue";
      toast.error(`Création impossible : ${message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteBlock(toDelete.id);
      toast.success(`Bloc « ${toDelete.key} » supprimé`);
      setToDelete(null);
      void fetchData();
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<ContentBlock>[] = [
    {
      key: "key",
      header: "Clé",
      render: (b) => (
        <Link
          href={`/admin/content/blocks/${b.id}`}
          className="font-mono text-xs text-seal-navy hover:text-seal-orange dark:text-white"
        >
          {b.key}
        </Link>
      ),
    },
    {
      key: "locale",
      header: "Locale",
      render: (b) => (
        <span className="uppercase text-xs font-medium">{b.locale}</span>
      ),
    },
    {
      key: "title",
      header: "Titre",
      render: (b) => (
        <span className="text-sm">
          {b.title ?? <em className="text-seal-gray-500">—</em>}
        </span>
      ),
    },
    {
      key: "body",
      header: "Aperçu",
      render: (b) => {
        const plain = b.body.replace(/<[^>]+>/g, "").trim();
        return (
          <span
            className="text-xs text-seal-gray-500 line-clamp-1 max-w-md"
            title={plain}
          >
            {plain || <em>(vide)</em>}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Statut",
      render: (b) => (
        <Badge variant={STATUS_BADGE_VARIANT[b.status]}>
          {CONTENT_STATUS_LABELS[b.status]}
        </Badge>
      ),
    },
    {
      key: "updatedAt",
      header: "Mise à jour",
      render: (b) => (
        <span className="text-xs text-seal-gray-500">
          {new Date(b.updatedAt).toLocaleDateString("fr-FR")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (b) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setToDelete(b);
          }}
          aria-label="Supprimer le bloc"
        >
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHeader
        hub="admin"
        icon={LayoutGrid}
        title="Blocs réutilisables"
        subtitle="Sections de contenu consommées par les composants (hero Welcome, services, FAQ…)"
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nouveau bloc
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
          placeholder="Rechercher dans la clé, le titre ou le corps…"
          className="min-w-[260px] flex-1 max-w-md"
        />
        <Input
          value={prefix}
          onChange={(e) => {
            setPrefix(e.target.value);
            setPage(1);
          }}
          placeholder="Préfixe (ex: welcome.)"
          className="w-48"
          aria-label="Filtrer par préfixe de clé"
        />
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
          title="Aucun bloc CMS"
          description="Créez votre premier bloc réutilisable."
          cta={{
            label: "Nouveau bloc",
            onClick: () => setShowCreate(true),
          }}
        />
      ) : (
        <DataTable<ContentBlock>
          columns={columns}
          data={data}
          keyExtractor={(b) => b.id}
          page={page}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          loading={loading}
        />
      )}

      <Dialog
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          reset();
        }}
        title="Nouveau bloc"
        size="md"
      >
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <div>
            <label htmlFor="block-key" className="seal-label">
              Clé namespacée
            </label>
            <Input
              id="block-key"
              placeholder="welcome.hero.title"
              {...register("key")}
              aria-invalid={!!errors.key}
            />
            {errors.key && (
              <p className="text-xs text-red-600 mt-1">{errors.key.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="block-locale" className="seal-label">
              Langue
            </label>
            <select
              id="block-locale"
              {...register("locale")}
              className="seal-input w-full"
            >
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="block-title" className="seal-label">
              Titre (optionnel)
            </label>
            <Input id="block-title" {...register("title")} />
          </div>
          <div>
            <label htmlFor="block-body" className="seal-label">
              Corps (texte ou HTML court)
            </label>
            <Textarea
              id="block-body"
              rows={4}
              {...register("body")}
              aria-invalid={!!errors.body}
            />
            {errors.body && (
              <p className="text-xs text-red-600 mt-1">{errors.body.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-seal-gray-300/40">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                reset();
              }}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? "Création…" : "Créer"}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Supprimer ce bloc ?"
        description={
          toDelete
            ? `Le bloc « ${toDelete.key} » sera retiré. Les composants front utilisant cette clé afficheront leur valeur de secours.`
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
