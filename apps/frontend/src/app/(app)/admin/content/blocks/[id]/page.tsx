"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LayoutGrid, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  SkeletonCard,
  Textarea,
} from "@omnitech/ui";
import { deleteBlock, getBlock, updateBlock } from "@/lib/cms-admin/api";
import {
  CONTENT_STATUS_LABELS,
  type ContentBlock,
  type ContentStatus,
} from "@/lib/cms-admin/types";
import { resolveSchema, type BlockSchema } from "@/lib/cms-admin/schemas";
import { StructuredEditor } from "../../_components/StructuredEditor";

const STATUS_BADGE_VARIANT: Record<
  ContentStatus,
  "draft" | "success" | "navy"
> = {
  DRAFT: "draft",
  PUBLISHED: "success",
  ARCHIVED: "navy",
};

const STATUS_OPTIONS: ContentStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export default function AdminContentBlockEdit() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [block, setBlock] = useState<ContentBlock | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state (controlled)
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dataJson, setDataJson] = useState("");
  const [dataError, setDataError] = useState<string | null>(null);
  const [status, setStatus] = useState<ContentStatus>("PUBLISHED");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Mode d'édition de `data` : `structured` (form-driven via schéma connu)
  // ou `json` (textarea brute). Par défaut, structured si la clé a un schéma.
  const [editMode, setEditMode] = useState<"structured" | "json">("structured");

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      try {
        const b = await getBlock(params.id);
        if (canceled) return;
        setBlock(b);
        setTitle(b.title ?? "");
        setBody(b.body);
        setDataJson(
          b.data === null || b.data === undefined
            ? ""
            : JSON.stringify(b.data, null, 2),
        );
        setStatus(b.status);
        // Reset le mode d'édition : si un schéma existe, on démarre en
        // structured ; sinon, json brut.
        setEditMode(resolveSchema(b.key) ? "structured" : "json");
      } catch {
        toast.error("Bloc introuvable");
        router.push("/admin/content/blocks");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [params.id, router]);

  // Schéma résolu pour la clé du bloc (null si inconnue).
  const schema: BlockSchema | null = useMemo(
    () => (block ? resolveSchema(block.key) : null),
    [block],
  );

  // Représentation parsée de `dataJson` — utilisée par l'éditeur structuré.
  // Sync bidirectionnelle gérée plus bas via setDataObject().
  const parsedData = useMemo<unknown>(() => {
    if (!dataJson.trim()) return null;
    try {
      return JSON.parse(dataJson);
    } catch {
      return null;
    }
  }, [dataJson]);

  function setDataObject(next: unknown) {
    setDataError(null);
    if (next === null || next === undefined) {
      setDataJson("");
    } else {
      setDataJson(JSON.stringify(next, null, 2));
    }
  }

  const dirty = useMemo(() => {
    if (!block) return false;
    const initialData =
      block.data === null || block.data === undefined
        ? ""
        : JSON.stringify(block.data, null, 2);
    return (
      title !== (block.title ?? "") ||
      body !== block.body ||
      dataJson !== initialData ||
      status !== block.status
    );
  }, [block, title, body, dataJson, status]);

  async function handleSave() {
    if (!block) return;
    let parsedData: unknown = undefined;
    const trimmed = dataJson.trim();
    if (trimmed.length > 0) {
      try {
        parsedData = JSON.parse(trimmed);
        setDataError(null);
      } catch {
        setDataError("JSON invalide");
        return;
      }
    } else {
      parsedData = null;
    }

    setSaving(true);
    try {
      const updated = await updateBlock(block.id, {
        title: title || "",
        body,
        data: parsedData,
        status,
      });
      setBlock(updated);
      toast.success("Bloc enregistré");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { message?: string } } }).response
              ?.data?.message ?? "Erreur inconnue")
          : "Erreur inconnue";
      toast.error(`Échec : ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!block) return;
    setDeleting(true);
    try {
      await deleteBlock(block.id);
      toast.success("Bloc supprimé");
      router.push("/admin/content/blocks");
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !block) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <PageHeader
        hub="admin"
        icon={LayoutGrid}
        title={block.key}
        subtitle={`Locale ${block.locale.toUpperCase()} · Bloc réutilisable`}
        actions={
          <Badge variant={STATUS_BADGE_VARIANT[status]}>
            {CONTENT_STATUS_LABELS[status]}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label htmlFor="block-title-edit" className="seal-label">
              Titre (optionnel)
            </label>
            <Input
              id="block-title-edit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="block-body-edit" className="seal-label">
              Corps (texte ou HTML court, max 20 Ko)
            </label>
            <Textarea
              id="block-body-edit"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="block-data-edit" className="seal-label mb-0">
                Données structurées{" "}
                <span className="text-xs text-seal-gray-500 font-normal">
                  {schema
                    ? "(éditeur form-driven)"
                    : "(JSON brut — clé sans schéma)"}
                </span>
              </label>
              {schema && (
                <div className="inline-flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditMode("structured")}
                    className={`px-2 py-1 rounded ${
                      editMode === "structured"
                        ? "bg-seal-navy text-white"
                        : "text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    Formulaire
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode("json")}
                    className={`px-2 py-1 rounded ${
                      editMode === "json"
                        ? "bg-seal-navy text-white"
                        : "text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    JSON brut
                  </button>
                </div>
              )}
            </div>

            {schema?.description && editMode === "structured" && (
              <p className="text-[11px] text-seal-gray-500 mb-2">
                {schema.description}
              </p>
            )}

            {schema && editMode === "structured" ? (
              <div className="rounded-lg border border-seal-gray-300/40 p-3 bg-gray-50 dark:bg-slate-900/40">
                <StructuredEditor
                  schema={schema}
                  value={parsedData}
                  onChange={setDataObject}
                />
              </div>
            ) : (
              <Textarea
                id="block-data-edit"
                rows={10}
                value={dataJson}
                onChange={(e) => {
                  setDataJson(e.target.value);
                  setDataError(null);
                }}
                className="font-mono text-xs"
                placeholder='[{ "title": "...", "body": "..." }]'
              />
            )}
            {dataError && (
              <p className="text-xs text-red-600 mt-1">{dataError}</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-seal-gray-300/40">
            <p className="text-xs text-seal-gray-500">
              {dirty
                ? "Modifications non enregistrées"
                : "Toutes les modifications enregistrées"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/admin/content/blocks")}
              >
                Retour
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <Card className="p-4 space-y-3">
            <label htmlFor="block-status-edit" className="seal-label">
              Statut
            </label>
            <select
              id="block-status-edit"
              value={status}
              onChange={(e) => setStatus(e.target.value as ContentStatus)}
              className="seal-input w-full"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {CONTENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <p className="text-xs text-seal-gray-500">
              Seuls les blocs PUBLISHED sont retournés sur la route publique.
            </p>
          </Card>

          <Card className="p-4 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-seal-gray-500">Créé</span>
              <span>{new Date(block.createdAt).toLocaleString("fr-FR")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-seal-gray-500">Mise à jour</span>
              <span>{new Date(block.updatedAt).toLocaleString("fr-FR")}</span>
            </div>
            {block.updatedBy && (
              <div className="flex justify-between pt-1 border-t border-seal-gray-300/30">
                <span className="text-seal-gray-500">Par</span>
                <span>
                  {block.updatedBy.firstName} {block.updatedBy.lastName}
                </span>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <Button
              type="button"
              variant="ghost"
              className="w-full text-red-600 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Supprimer le bloc
            </Button>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer ce bloc ?"
        description={`La clé « ${block.key} » sera retirée. Les composants front utilisant cette clé afficheront leur valeur de secours.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
