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
            <label htmlFor="block-data-edit" className="seal-label">
              Données structurées{" "}
              <span className="text-xs text-seal-gray-500 font-normal">
                (JSON optionnel — listes, configs)
              </span>
            </label>
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
