"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Textarea,
  EmptyState,
  Skeleton,
  Badge,
  ConfirmDialog,
} from "@omnitech/ui";
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  Video,
  Trash2,
  Star,
  Edit3,
  Save,
  X,
} from "lucide-react";
import { logger } from "@/lib/logger";
import { api } from "@/lib/api";
import { withAuthToken } from "@/lib/media-url";
import { formatRelativeTime } from "@/lib/utils";

interface Item {
  id: string;
  type: "IMAGE" | "VIDEO";
  thumbnailUrl: string;
  fileUrl: string;
  title: string | null;
  description: string | null;
  tags: string[];
  fileSizeBytes: string;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
  _count?: { downloads: number };
}

interface Album {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: string;
  coverItemId?: string | null;
  coverImageUrl?: string | null;
  items: Item[];
  _count: { items: number };
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export default function AdminAlbumPage() {
  const params = useParams();
  const albumId = params?.id as string;
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTags, setEditTags] = useState("");
  const [coverDragOver, setCoverDragOver] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [removeCoverConfirm, setRemoveCoverConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Fetch album via slug-less endpoint : on prend l'id direct sur la liste pour trouver le slug
  const load = useCallback(async () => {
    if (!albumId) return;
    setLoading(true);
    try {
      // Obtenir le slug depuis la liste
      const { data: list } = await api.get<Array<{ id: string; slug: string }>>("/media/albums");
      const match = list.find((a) => a.id === albumId);
      if (!match) {
        toast.error("Album introuvable");
        setLoading(false);
        return;
      }
      const { data } = await api.get<Album>(`/media/albums/${match.slug}`);
      setAlbum(data);
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      const localKey = `${file.name}-${file.size}-${Date.now()}`;
      setUploading((prev) => ({ ...prev, [localKey]: 0 }));
      try {
        const formData = new FormData();
        formData.append("file", file);
        await api.post(`/media/albums/${albumId}/items`, formData, {
          // Ne PAS forcer Content-Type : axios doit le générer avec le boundary
          // multipart auto depuis FormData. Forcer "multipart/form-data" sans
          // boundary casse le parsing côté Multer (Request body empty).
          onUploadProgress: (e) => {
            const total = e.total;
            if (typeof total === "number" && total > 0) {
              setUploading((prev) => ({
                ...prev,
                [localKey]: Math.round((e.loaded / total) * 100),
              }));
            }
          },
        });
        toast.success(`${file.name} uploadé`);
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : null;
        toast.error(`${file.name} : ${msg || "échec upload"}`);
      } finally {
        setUploading((prev) => {
          const next = { ...prev };
          delete next[localKey];
          return next;
        });
      }
    }
    await load();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const handleDelete = (item: Item) => {
    setDeleteItem(item);
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    const item = deleteItem;
    setDeleteItem(null);
    try {
      await api.delete(`/media/items/${item.id}`);
      toast.success("Média supprimé");
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || "Erreur");
    }
  };

  const uploadCoverImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Seules les images sont acceptées comme couverture.");
      return;
    }
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.patch(`/media/albums/${albumId}/cover-image`, formData);
      toast.success("Image de couverture mise à jour");
      await load();
    } catch (err: unknown) {
      logger.error(err, {
        component: "AdminAlbumPage",
        op: "uploadCoverImage",
      });
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || "Échec de l'upload de la couverture");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleCoverDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCoverDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadCoverImage(file);
  };

  const handleRemoveCover = () => {
    setRemoveCoverConfirm(true);
  };

  const confirmRemoveCover = async () => {
    setRemoveCoverConfirm(false);
    try {
      await api.delete(`/media/albums/${albumId}/cover-image`);
      toast.success("Image de couverture retirée");
      load();
    } catch (err: unknown) {
      logger.error(err, {
        component: "AdminAlbumPage",
        op: "removeCoverImage",
      });
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleSetCover = async (item: Item) => {
    try {
      await api.patch(`/media/albums/${albumId}`, { coverItemId: item.id });
      toast.success("Cover de l'album mise à jour");
      load();
    } catch {
      toast.error("Erreur mise à jour cover");
    }
  };

  const startEdit = (item: Item) => {
    setEditingItemId(item.id);
    setEditTitle(item.title ?? "");
    setEditDesc(item.description ?? "");
    setEditTags((item.tags || []).join(", "));
  };

  const saveEdit = async () => {
    if (!editingItemId) return;
    try {
      await api.patch(`/media/items/${editingItemId}`, {
        title: editTitle.trim() || undefined,
        description: editDesc.trim() || undefined,
        tags: editTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      toast.success("Média mis à jour");
      setEditingItemId(null);
      load();
    } catch {
      toast.error("Erreur");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!album) return null;

  const uploadingArr = Object.entries(uploading);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/media"
        className="inline-flex items-center gap-1.5 text-sm text-seal-gray-500 hover:text-[#F9964A] mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux albums
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-seal-navy dark:text-white">{album.title}</h1>
          {album.description && (
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 max-w-2xl">
              {album.description}
            </p>
          )}
          <p className="text-[11px] text-seal-gray-500 mt-2">
            {album._count.items} média{album._count.items !== 1 ? "s" : ""} · Visibilité{" "}
            {album.visibility}
          </p>
        </div>
        <Link href={`/media/albums/${album.slug}`}>
          <Button variant="outline">Voir côté utilisateur →</Button>
        </Link>
      </header>

      {/* Image de couverture dédiée — distincte des items de l'album */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                Image de couverture dédiée
              </h2>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                Affichée en bannière de l&apos;album. Si définie, elle prime sur la cover choisie
                parmi les médias.
              </p>
            </div>
            {album.coverImageUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveCover}
                className="gap-1.5 text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Retirer
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {album.coverImageUrl ? (
            <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 aspect-[16/6] max-h-[260px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={withAuthToken(album.coverImageUrl)}
                alt="Image de couverture"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="gap-1.5 bg-white/90 hover:bg-white"
                >
                  <Upload className="h-3.5 w-3.5" /> Remplacer
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                coverDragOver
                  ? "border-[#F9964A] bg-[#F9964A]/5 scale-[1.005]"
                  : "border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/40"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setCoverDragOver(true);
              }}
              onDragLeave={() => setCoverDragOver(false)}
              onDrop={handleCoverDrop}
            >
              <ImageIcon
                className={`h-8 w-8 mx-auto mb-2 ${coverDragOver ? "text-[#F9964A]" : "text-seal-gray-500"}`}
              />
              <p className="text-xs font-semibold text-seal-navy dark:text-white mb-1">
                Déposez une image de couverture ici
              </p>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mb-2">
                JPEG, PNG, WebP — recommandé 1920×1080
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />{" "}
                {coverUploading ? "Upload…" : "Choisir une image"}
              </Button>
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadCoverImage(f);
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      {/* Dropzone upload */}
      <div
        className={`rounded-2xl border-2 border-dashed p-8 mb-6 text-center transition-all ${
          dragOver
            ? "border-[#F9964A] bg-[#F9964A]/5 scale-[1.01]"
            : "border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/40"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload
          className={`h-10 w-10 mx-auto mb-3 ${dragOver ? "text-[#F9964A]" : "text-seal-gray-500"}`}
        />
        <p className="text-sm font-semibold text-seal-navy dark:text-white mb-1">
          Déposez vos photos ou vidéos ici
        </p>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-3">
          JPEG, PNG, WebP, GIF, MP4, WebM · Max 10 Go par fichier · Multi-fichiers supportés
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/*"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
        <Button onClick={() => fileInputRef.current?.click()} className="gap-1.5">
          <Upload className="h-4 w-4" /> Choisir des fichiers
        </Button>
      </div>

      {/* Progress upload en cours */}
      {uploadingArr.length > 0 && (
        <div className="mb-4 space-y-2">
          {uploadingArr.map(([key, pct]) => (
            <div
              key={key}
              className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-seal-navy dark:text-white truncate">
                  {key.split("-")[0]}
                </span>
                <span className="text-xs text-[#F9964A] font-mono">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#F9964A] to-[#FFB874] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Items grid */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Médias ({album.items.length})
          </h2>
        </CardHeader>
        <CardContent>
          {album.items.length === 0 ? (
            <EmptyState
              title="Album vide"
              description="Uploadez vos premiers médias avec la zone ci-dessus."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {album.items.map((item) => (
                <div
                  key={item.id}
                  className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 group border border-gray-200 dark:border-slate-700"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={withAuthToken(item.thumbnailUrl)}
                    alt={item.title ?? ""}
                    className="w-full aspect-square object-cover"
                  />
                  {item.type === "VIDEO" && (
                    <div className="absolute top-2 right-2 rounded-full bg-black/60 p-1">
                      <Video className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {album.coverItemId === item.id && (
                    <div
                      className="absolute top-2 left-2 rounded-full bg-[#F9964A] p-1"
                      title="Cover de l'album"
                    >
                      <Star className="h-3 w-3 text-white fill-white" />
                    </div>
                  )}
                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-stretch justify-end p-2 gap-1">
                    <p className="text-[10px] text-white/80 font-semibold truncate">
                      {item.title ?? "Sans titre"}
                    </p>
                    <p className="text-[9px] text-white/60">
                      {humanSize(parseInt(item.fileSizeBytes))} · {item._count?.downloads ?? 0} DL
                    </p>
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => startEdit(item)}
                        className="flex-1 rounded bg-white/20 hover:bg-white/30 text-white text-[10px] py-1 transition"
                        title="Éditer"
                      >
                        <Edit3 className="h-3 w-3 inline" />
                      </button>
                      <button
                        onClick={() => handleSetCover(item)}
                        className="flex-1 rounded bg-white/20 hover:bg-[#F9964A] text-white text-[10px] py-1 transition"
                        title="Définir comme cover"
                      >
                        <Star className="h-3 w-3 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="flex-1 rounded bg-white/20 hover:bg-red-500 text-white text-[10px] py-1 transition"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3 w-3 inline" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editingItemId && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditingItemId(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
                Éditer le média
              </h2>
              <button
                onClick={() => setEditingItemId(null)}
                className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-seal-navy dark:text-white mb-1 block">
                  Titre
                </label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Titre du média"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-seal-navy dark:text-white mb-1 block">
                  Description
                </label>
                <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
              </div>
              <div>
                <label className="text-xs font-semibold text-seal-navy dark:text-white mb-1 block">
                  Tags (séparés par virgule)
                </label>
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="événement, salon, équipe..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" onClick={() => setEditingItemId(null)}>
                Annuler
              </Button>
              <Button onClick={saveEdit} className="gap-1">
                <Save className="h-4 w-4" /> Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDelete}
        title="Supprimer le média"
        description="Supprimer ce média définitivement ?"
        variant="danger"
      />

      <ConfirmDialog
        open={removeCoverConfirm}
        onClose={() => setRemoveCoverConfirm(false)}
        onConfirm={confirmRemoveCover}
        title="Retirer la couverture"
        description="Retirer l'image de couverture dédiée ?"
        variant="danger"
      />
    </div>
  );
}
