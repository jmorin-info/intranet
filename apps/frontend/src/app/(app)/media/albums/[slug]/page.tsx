"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button, Skeleton, EmptyState, Badge } from "@omnitech/ui";
import {
  ArrowLeft,
  Video,
  Image as ImageIcon,
  Download,
  UserCircle,
  Calendar,
  Settings2,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { isRoleAtLeast, UserRole } from "@omnitech/shared";
import { api } from "@/lib/api";
import { withAuthToken } from "@/lib/media-url";
import {
  MediaLightbox,
  type LightboxItem,
} from "@/components/media/media-lightbox";
import { HoverVideoPreview } from "@/components/media/hover-video-preview";
import { formatRelativeTime } from "@/lib/utils";

interface AlbumDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: "INTERNAL" | "DEPARTMENT" | "PRIVATE";
  createdAt: string;
  coverItemId: string | null;
  coverItem: LightboxItem | null;
  coverImageUrl: string | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  department: { id: string; name: string } | null;
  items: LightboxItem[];
  _count: { items: number };
}

export default function AlbumDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const user = useAuthStore((s) => s.user);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const canManage = Boolean(
    user && (isRoleAtLeast(user.role, UserRole.ADMIN) || user.canManageMedia),
  );

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const { data } = await api.get<AlbumDetail>(`/media/albums/${slug}`);
      setAlbum(data);
    } catch {
      toast.error("Album introuvable ou accès refusé.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const nextLightbox = () =>
    setLightboxIndex((i) =>
      i !== null && album && i < album.items.length - 1 ? i + 1 : i,
    );
  const prevLightbox = () =>
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState
          title="Album introuvable"
          description="L'album n'existe pas ou vous n'y avez pas accès."
        />
        <div className="text-center mt-4">
          <Link href="/media">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Retour à la médiathèque
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Pick the hero: image de couverture dédiée → coverItem → first image → first item
  const heroItem: LightboxItem | null =
    album.coverItem ||
    album.items.find((it) => it.type === "IMAGE") ||
    album.items[0] ||
    null;
  const hasDedicatedCover = Boolean(album.coverImageUrl);
  const showHero = hasDedicatedCover || Boolean(heroItem);

  return (
    <div className="mx-auto max-w-7xl">
      {/* Back link */}
      <Link
        href="/media"
        className="inline-flex items-center gap-1.5 text-sm text-seal-gray-500 dark:text-slate-400 hover:text-[#F9964A] mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à la médiathèque
      </Link>

      {/* Hero cover */}
      {showHero && (
        <div
          className={`relative mb-6 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black aspect-[16/6] max-h-[320px] shadow-lg${
            hasDedicatedCover ? " bg-cover bg-center" : ""
          }`}
          style={
            hasDedicatedCover
              ? {
                  backgroundImage: `url(${withAuthToken(album.coverImageUrl)})`,
                }
              : undefined
          }
        >
          {!hasDedicatedCover && heroItem && heroItem.type === "VIDEO" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={withAuthToken(heroItem.thumbnailUrl)}
                alt={album.title}
                className="absolute inset-0 w-full h-full object-cover opacity-80"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Video className="h-14 w-14 text-white/80 drop-shadow-lg" />
              </div>
            </>
          ) : !hasDedicatedCover && heroItem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={withAuthToken(heroItem.thumbnailUrl)}
              alt={album.title}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h1 className="text-3xl md:text-4xl font-semibold text-white drop-shadow-lg leading-tight">
              {album.title}
            </h1>
            {album.description && (
              <p className="mt-2 text-sm text-white/90 max-w-3xl line-clamp-2 drop-shadow">
                {album.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {!showHero && (
              <>
                <h1 className="text-3xl font-semibold text-seal-navy dark:text-white leading-tight">
                  {album.title}
                </h1>
                {album.description && (
                  <p className="mt-2 text-sm text-seal-gray-500 dark:text-slate-400 max-w-3xl leading-relaxed">
                    {album.description}
                  </p>
                )}
              </>
            )}
            <div className="flex items-center gap-4 mt-1 text-[12px] text-seal-gray-500 dark:text-slate-500 flex-wrap">
              <span className="flex items-center gap-1">
                <UserCircle className="h-3.5 w-3.5" />
                {album.createdBy
                  ? `${album.createdBy.firstName} ${album.createdBy.lastName}`
                  : "Auteur inconnu"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatRelativeTime(album.createdAt)}
              </span>
              <Badge variant="info" className="text-[10px]">
                {album._count.items} média{album._count.items !== 1 ? "s" : ""}
              </Badge>
              {album.department && (
                <Badge variant="info" className="text-[10px]">
                  {album.department.name}
                </Badge>
              )}
            </div>
          </div>
          {canManage && (
            <Link href={`/admin/media/albums/${album.id}`}>
              <Button variant="outline" className="gap-1.5">
                <Settings2 className="h-4 w-4" /> Gérer cet album
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Media grid — masonry via CSS columns */}
      {album.items.length === 0 ? (
        <EmptyState
          title="Album vide"
          description="Aucun média n'a encore été ajouté à cet album."
        />
      ) : (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {album.items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openLightbox(idx)}
              className="block w-full break-inside-avoid rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 group relative shadow-sm hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#F9964A]"
              aria-label={`Ouvrir ${item.title ?? "le média"}`}
            >
              {item.type === "VIDEO" ? (
                <HoverVideoPreview
                  thumbnailUrl={item.thumbnailUrl}
                  fileUrl={item.fileUrl}
                  title={item.title}
                  className="w-full"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={withAuthToken(item.thumbnailUrl)}
                  alt={item.title ?? ""}
                  className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity =
                      "0.25";
                  }}
                />
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                <div className="text-left">
                  {item.title && (
                    <p className="text-xs font-semibold text-white line-clamp-1">
                      {item.title}
                    </p>
                  )}
                  <p className="text-[10px] text-white/70 flex items-center gap-1 mt-0.5">
                    {item.type === "VIDEO" ? (
                      <Video className="h-2.5 w-2.5" />
                    ) : (
                      <ImageIcon className="h-2.5 w-2.5" />
                    )}
                    {item.uploadedBy
                      ? `${item.uploadedBy.firstName} ${item.uploadedBy.lastName}`
                      : "Auteur inconnu"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {lightboxIndex !== null && album.items.length > 0 && (
        <MediaLightbox
          items={album.items}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={nextLightbox}
          onPrev={prevLightbox}
        />
      )}
    </div>
  );
}
