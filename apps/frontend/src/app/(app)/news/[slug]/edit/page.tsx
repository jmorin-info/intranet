"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { noaZodResolver } from "@/lib/noa/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardFooter,
  Button,
  Input,
  Skeleton,
  ConfirmDialog,
} from "@omnitech/ui";
import { ArrowLeft, Save, X, Trash2, Newspaper } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  EditorPreview,
  useEditorPreviewMode,
} from "@/components/editor/editor-preview";
import { useEditorAutosave } from "@/hooks/use-editor-autosave";

const newsSchema = z.object({
  title: z.string().min(3, "Titre requis"),
  excerpt: z.string().optional(),
  content: z.string().min(10, "Contenu requis (minimum 10 caractères)"),
  category: z.string().optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  isPinned: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

type NewsForm = z.infer<typeof newsSchema>;

export default function EditNewsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newsId, setNewsId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<NewsForm>({
    // Mode humour Noa actif sur /news/* si user opt-in.
    resolver: noaZodResolver(newsSchema),
  });

  const content = watch("content") || "";
  const setContent = (val: string) => {
    setValue("content", val, { shouldValidate: true, shouldDirty: true });
    if (editorRef.current && editorRef.current.innerHTML !== val) {
      editorRef.current.innerHTML = val;
    }
  };
  const editorInitialized = useRef(false);
  useEffect(() => {
    if (editorRef.current && content && !editorInitialized.current) {
      editorRef.current.innerHTML = content;
      editorInitialized.current = true;
    }
  }, [content]);

  useEffect(() => {
    if (!slug) return;
    api
      .get(`/news/${slug}`)
      .then(({ data }) => {
        setNewsId(data.id);
        reset({
          title: data.title,
          excerpt: data.excerpt || "",
          content: data.content,
          category: data.category || "",
          coverImageUrl: data.coverImageUrl || "",
          isPinned: data.isPinned,
          isPublished: data.isPublished,
        });
      })
      .catch(() => {
        toast.error("Article introuvable");
        router.push("/news");
      })
      .finally(() => setLoading(false));
  }, [slug, reset, router]);

  const onSubmit = async (data: NewsForm) => {
    if (!newsId) return;
    setSaving(true);
    try {
      await api.patch(`/news/${newsId}`, data);
      toast.success("Article mis à jour");
      // Nettoie le draft local apres save serveur reussi.
      try {
        window.localStorage.removeItem(`wiki-draft:news:${newsId}`);
      } catch {
        /* noop */
      }
      router.push(`/news/${slug}`);
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Erreur";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Mode apercu live persiste.
  const [previewMode, setPreviewMode] = useEditorPreviewMode("edit-only");

  // Autosave brouillon (entityKey = 'news:<id>'). Le serverValue est la
  // valeur initiale chargee depuis l'API, donc le hook detecte un draft
  // local non sauvegarde si on a ferme l'onglet en cours d'edition.
  const titleVal = watch("title") || "";
  const excerptVal = watch("excerpt") || "";
  const categoryVal = watch("category") || "";
  const draftValue = useMemo(
    () => ({
      title: titleVal,
      excerpt: excerptVal,
      category: categoryVal,
      content,
    }),
    [titleVal, excerptVal, categoryVal, content],
  );
  const serverDraftValue = useMemo(
    () => ({ title: "", excerpt: "", category: "", content: "" }),
    [],
  );
  const autosave = useEditorAutosave({
    entityKey: newsId ? `news:${newsId}` : "news:loading",
    value: draftValue,
    serverValue: serverDraftValue,
    disabled: !newsId,
  });

  // Cmd/Ctrl+S — flush draft et soumet le formulaire (save serveur).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        autosave.flushNow();
        // Submit form via React Hook Form
        handleSubmit(onSubmit)();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, newsId]);

  const handleDelete = async () => {
    if (!newsId) return;
    setDeleting(true);
    try {
      await api.delete(`/news/${newsId}`);
      toast.success("Article supprimé");
      router.push("/news");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl shimmer" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 shimmer" />
              <Skeleton className="h-3 w-64 shimmer" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 rounded-btn shimmer" />
        </div>
        <div className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 shimmer" />
            <Skeleton className="h-10 w-full shimmer" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24 shimmer" />
            <Skeleton className="h-10 w-full shimmer" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full shimmer" />
            <Skeleton className="h-10 w-full shimmer" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg shimmer" />
          <div className="flex justify-between pt-4">
            <Skeleton className="h-9 w-24 rounded-btn shimmer" />
            <Skeleton className="h-9 w-32 rounded-btn shimmer" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Modifier l'article"
        subtitle="Éditez le contenu et les métadonnées"
        icon={Newspaper}
        hub="work"
        actions={
          <>
            <button
              onClick={() => router.back()}
              className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800"
              aria-label="Retour"
            >
              <ArrowLeft className="h-5 w-5 text-seal-gray-500" />
            </button>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              loading={deleting}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Supprimer
            </Button>
          </>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Input
              label="Titre"
              placeholder="Titre de l'article"
              error={errors.title?.message}
              {...register("title")}
            />

            <Input
              label="Extrait (chapô)"
              placeholder="Résumé affiché dans les listes"
              {...register("excerpt")}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Catégorie"
                placeholder="Intranet, SMSI, RH..."
                {...register("category")}
              />
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                  Image de couverture
                </label>
                <label className="flex-1 cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const fd = new FormData();
                      fd.append("file", f);
                      try {
                        const { data } = await api.post(
                          "/news/upload-cover",
                          fd,
                          {
                            headers: { "Content-Type": "multipart/form-data" },
                          },
                        );
                        if (data.url) {
                          setValue("coverImageUrl", data.url, {
                            shouldDirty: true,
                          });
                          toast.success("Image uploadée");
                        }
                      } catch {
                        toast.error("Erreur upload image");
                      }
                    }}
                  />
                  <span className="flex items-center justify-center gap-1.5 w-full rounded-btn border border-dashed border-gray-300 dark:border-slate-600 px-3 py-2 text-xs text-seal-gray-500 hover:border-primary hover:text-primary transition cursor-pointer">
                    Choisir une nouvelle image
                  </span>
                </label>
                {watch("coverImageUrl") && (
                  <p className="text-[10px] text-emerald-600 truncate">
                    {watch("coverImageUrl")}
                  </p>
                )}
              </div>
            </div>

            {/* WYSIWYG Content editor — wrappe par EditorPreview (split / preview) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                  Contenu
                </label>
                {autosave.lastSavedAt && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    Brouillon sauvegarde
                  </span>
                )}
              </div>
              <EditorPreview
                html={content}
                mode={previewMode}
                onModeChange={setPreviewMode}
              >
                <div className="flex flex-wrap items-center gap-1 border border-b-0 border-gray-300 dark:border-slate-600 rounded-t-lg p-2 bg-gray-50 dark:bg-slate-800 overflow-x-auto">
                  {[
                    { cmd: "bold", label: "B", style: "font-semibold" },
                    { cmd: "italic", label: "I", style: "italic" },
                    {
                      cmd: "formatBlock:H2",
                      label: "H2",
                      style: "font-semibold",
                    },
                    {
                      cmd: "formatBlock:H3",
                      label: "H3",
                      style: "font-semibold",
                    },
                    {
                      cmd: "insertUnorderedList",
                      label: "•",
                      style: "font-semibold",
                    },
                    {
                      cmd: "insertBlockquote",
                      label: "“",
                      style: "font-semibold",
                    },
                    {
                      cmd: "insertCode",
                      label: "</>",
                      style: "font-mono text-[10px]",
                    },
                  ].map(({ cmd, label, style }) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => {
                        if (cmd === "insertBlockquote") {
                          document.execCommand(
                            "insertHTML",
                            false,
                            "<blockquote><p>Citation</p></blockquote><p><br></p>",
                          );
                        } else if (cmd === "insertCode") {
                          document.execCommand(
                            "insertHTML",
                            false,
                            "<pre><code>// code</code></pre><p><br></p>",
                          );
                        } else {
                          const parts = cmd.split(":");
                          document.execCommand(
                            parts[0]!,
                            false,
                            parts[1] ?? "",
                          );
                        }
                        editorRef.current?.focus();
                      }}
                      className={`px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white ${style || "font-semibold"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Editable area — wiki-content pour rendu cohérent avec le reader
                  (code blocks, citations, dark mode sans dépendance Typography) */}
                <div
                  ref={editorRef}
                  contentEditable
                  className="w-full max-w-full min-h-[250px] rounded-b-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-seal-navy dark:text-white px-4 py-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 overflow-x-auto overflow-y-auto wiki-content break-words"
                  onInput={(e) =>
                    setValue(
                      "content",
                      (e.target as HTMLDivElement).innerHTML,
                      { shouldValidate: true, shouldDirty: true },
                    )
                  }
                  suppressContentEditableWarning
                />
              </EditorPreview>
              {errors.content?.message && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.content.message}
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("isPinned")}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-900 text-primary focus:ring-primary"
                />
                <span className="text-sm text-seal-navy dark:text-white">
                  Épingler en haut
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("isPublished")}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-900 text-primary focus:ring-primary"
                />
                <span className="text-sm text-seal-navy dark:text-white">
                  Publié
                </span>
              </label>
            </div>
          </CardContent>

          <CardFooter>
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                type="button"
                onClick={() => router.back()}
              >
                <X className="h-4 w-4" /> Annuler
              </Button>
              <Button type="submit" loading={saving} disabled={!isDirty}>
                <Save className="h-4 w-4" /> Enregistrer
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDelete();
        }}
        title="Supprimer l'article"
        description="Supprimer cet article ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
      />
    </div>
  );
}
