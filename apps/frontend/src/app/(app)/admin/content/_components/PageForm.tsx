"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, History, Save, Trash2 } from "lucide-react";
import {
  Button,
  Badge,
  Input,
  Textarea,
  ConfirmDialog,
  Card,
} from "@omnitech/ui";
import {
  createPage,
  updatePage,
  publishPage,
  unpublishPage,
  deletePage,
} from "@/lib/cms-admin/api";
import {
  CONTENT_STATUS_LABELS,
  SUPPORTED_LOCALES,
  type ContentPage,
  type ContentStatus,
} from "@/lib/cms-admin/types";

// RichTextEditor charge ~50ko de code éditeur — lazy uniquement quand on
// monte le formulaire, et pas en SSR (contentEditable nécessite le DOM).
const RichTextEditor = dynamic(
  () =>
    import("@/components/editor/rich-text-editor").then((m) => ({
      default: m.RichTextEditor,
    })),
  {
    ssr: false,
    loading: () => <div className="h-64 seal-input animate-pulse" />,
  },
);

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const pageSchema = z.object({
  title: z.string().min(1, "Titre requis").max(255),
  slug: z
    .string()
    .max(120)
    .regex(SLUG_REGEX, "Slug invalide (minuscules, chiffres, tirets)")
    .optional()
    .or(z.literal("")),
  locale: z.enum(SUPPORTED_LOCALES),
  excerpt: z.string().max(500).optional().or(z.literal("")),
  seoTitle: z.string().max(70).optional().or(z.literal("")),
  seoDescription: z.string().max(180).optional().or(z.literal("")),
});

type PageFormValues = z.infer<typeof pageSchema>;

interface Props {
  /** Si fourni : mode édition. Sinon : création. */
  page?: ContentPage;
}

const STATUS_BADGE_VARIANT: Record<
  ContentStatus,
  "draft" | "success" | "navy"
> = {
  DRAFT: "draft",
  PUBLISHED: "success",
  ARCHIVED: "navy",
};

export function PageForm({ page }: Props) {
  const router = useRouter();
  const isEdit = !!page;
  const [content, setContent] = useState<string>(page?.content ?? "");
  const [contentDirty, setContentDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<PageFormValues>({
    resolver: zodResolver(pageSchema),
    defaultValues: {
      title: page?.title ?? "",
      slug: page?.slug ?? "",
      locale: (page?.locale as PageFormValues["locale"]) ?? "fr",
      excerpt: page?.excerpt ?? "",
      seoTitle: page?.seoTitle ?? "",
      seoDescription: page?.seoDescription ?? "",
    },
    mode: "onTouched",
  });

  // Synchronise le state local content quand on reçoit une page différente
  // (ex: navigation latérale entre pages).
  useEffect(() => {
    setContent(page?.content ?? "");
    setContentDirty(false);
  }, [page?.id, page?.content]);

  const overallDirty = isDirty || contentDirty;

  async function onSubmit(values: PageFormValues) {
    setSaving(true);
    try {
      if (isEdit && page) {
        // La locale d'une page existante n'est pas modifiable (création d'une
        // nouvelle page dans l'autre langue requise) — on n'envoie pas le champ.
        await updatePage(page.id, {
          title: values.title,
          slug: values.slug || undefined,
          excerpt: values.excerpt || undefined,
          seoTitle: values.seoTitle || undefined,
          seoDescription: values.seoDescription || undefined,
          content,
        });
        toast.success("Page enregistrée");
        reset(values);
        setContentDirty(false);
        router.refresh();
      } else {
        const created = await createPage({
          title: values.title,
          slug: values.slug || undefined,
          locale: values.locale,
          excerpt: values.excerpt || undefined,
          seoTitle: values.seoTitle || undefined,
          seoDescription: values.seoDescription || undefined,
          content: content || "<p></p>",
        });
        toast.success(`Page « ${created.title} » créée`);
        router.push(`/admin/content/pages/${created.id}`);
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? // axios error
            ((err as { response?: { data?: { message?: string } } }).response
              ?.data?.message ?? "Erreur inconnue")
          : "Erreur inconnue";
      toast.error(`Échec de l'enregistrement : ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishToggle() {
    if (!page) return;
    setPublishing(true);
    try {
      if (page.status === "PUBLISHED") {
        await unpublishPage(page.id);
        toast.success("Page dépubliée");
      } else {
        await publishPage(page.id);
        toast.success("Page publiée");
      }
      router.refresh();
    } catch {
      toast.error("Action impossible");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete() {
    if (!page) return;
    setDeleting(true);
    try {
      await deletePage(page.id);
      toast.success(`Page « ${page.title} » supprimée`);
      router.push("/admin/content/pages");
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setDeleting(false);
    }
  }

  const formattedDates = useMemo(() => {
    if (!page) return null;
    const fmt = (d: string | null) =>
      d
        ? new Date(d).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
    return {
      created: fmt(page.createdAt),
      updated: fmt(page.updatedAt),
      published: fmt(page.publishedAt),
    };
  }, [page]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-1 lg:grid-cols-3 gap-6"
    >
      {/* Colonne gauche — contenu principal */}
      <div className="lg:col-span-2 space-y-4">
        <div>
          <label htmlFor="title" className="seal-label">
            Titre
          </label>
          <Input
            id="title"
            {...register("title")}
            aria-invalid={!!errors.title}
          />
          {errors.title && (
            <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label htmlFor="slug" className="seal-label">
              Slug{" "}
              <span className="text-xs text-seal-gray-500 font-normal">
                (laisser vide pour générer automatiquement)
              </span>
            </label>
            <Input
              id="slug"
              placeholder="mentions-legales"
              {...register("slug")}
              aria-invalid={!!errors.slug}
            />
            {errors.slug && (
              <p className="text-xs text-red-600 mt-1">{errors.slug.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="locale" className="seal-label">
              Langue
            </label>
            <select
              id="locale"
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
        </div>

        <div>
          <label htmlFor="excerpt" className="seal-label">
            Résumé (excerpt)
          </label>
          <Textarea
            id="excerpt"
            rows={2}
            placeholder="Brève description affichée dans les listes et meta sociales"
            {...register("excerpt")}
          />
          {errors.excerpt && (
            <p className="text-xs text-red-600 mt-1">
              {errors.excerpt.message}
            </p>
          )}
        </div>

        <div>
          <span className="seal-label">Contenu</span>
          <RichTextEditor
            value={content}
            onChange={(html) => {
              setContent(html);
              setContentDirty(html !== (page?.content ?? ""));
            }}
            placeholder="Commencez à rédiger…"
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-seal-gray-300/40">
          <p className="text-xs text-seal-gray-500">
            {overallDirty
              ? "Modifications non enregistrées"
              : "Toutes les modifications enregistrées"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/admin/content/pages")}
            >
              Retour
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || (!overallDirty && isEdit)}
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </div>

      {/* Colonne droite — sidebar meta */}
      <aside className="space-y-4">
        {page && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wide text-seal-gray-500">
                Statut
              </span>
              <Badge variant={STATUS_BADGE_VARIANT[page.status]}>
                {CONTENT_STATUS_LABELS[page.status]}
              </Badge>
            </div>
            <Button
              type="button"
              variant={page.status === "PUBLISHED" ? "outline" : "primary"}
              className="w-full"
              onClick={handlePublishToggle}
              disabled={publishing || overallDirty}
              title={
                overallDirty
                  ? "Enregistrez vos modifications avant de publier"
                  : undefined
              }
            >
              {page.status === "PUBLISHED" ? (
                <>
                  <EyeOff className="h-4 w-4 mr-1" />
                  Dépublier
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-1" />
                  Publier
                </>
              )}
            </Button>
          </Card>
        )}

        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
            SEO
          </h3>
          <div>
            <label htmlFor="seoTitle" className="seal-label text-xs">
              Titre SEO (≤ 70 caractères)
            </label>
            <Input
              id="seoTitle"
              {...register("seoTitle")}
              aria-invalid={!!errors.seoTitle}
            />
            {errors.seoTitle && (
              <p className="text-xs text-red-600 mt-1">
                {errors.seoTitle.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="seoDescription" className="seal-label text-xs">
              Description SEO (≤ 180 caractères)
            </label>
            <Textarea
              id="seoDescription"
              rows={3}
              {...register("seoDescription")}
              aria-invalid={!!errors.seoDescription}
            />
            {errors.seoDescription && (
              <p className="text-xs text-red-600 mt-1">
                {errors.seoDescription.message}
              </p>
            )}
          </div>
        </Card>

        {page && formattedDates && (
          <Card className="p-4 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-seal-gray-500">Créée</span>
              <span>{formattedDates.created}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-seal-gray-500">Mise à jour</span>
              <span>{formattedDates.updated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-seal-gray-500">Publiée</span>
              <span>{formattedDates.published}</span>
            </div>
            {page.updatedBy && (
              <div className="flex justify-between pt-1 border-t border-seal-gray-300/30">
                <span className="text-seal-gray-500">Par</span>
                <span>
                  {page.updatedBy.firstName} {page.updatedBy.lastName}
                </span>
              </div>
            )}
          </Card>
        )}

        {page && (
          <Card className="p-4 space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() =>
                router.push(`/admin/content/pages/${page.id}/revisions`)
              }
            >
              <History className="h-4 w-4 mr-1" />
              Voir l'historique
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-red-600 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Supprimer
            </Button>
          </Card>
        )}

        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          title="Supprimer cette page ?"
          description="La page sera archivée (soft delete). L'historique des révisions est conservé."
          confirmLabel="Supprimer"
          cancelLabel="Annuler"
          variant="danger"
          loading={deleting}
        />
      </aside>
    </form>
  );
}
