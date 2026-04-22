'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Skeleton, EmptyState } from '@omnitech/ui';
import {
  Image as ImageIcon,
  Video,
  Lock,
  Users,
  Building2,
  Plus,
  Camera,
  Calendar,
  UserCircle,
  LayoutGrid,
  Images,
  Film,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { api } from '@/lib/api';
import { withAuthToken } from '@/lib/media-url';
import { MediaLightbox, type LightboxItem } from '@/components/media/media-lightbox';
import { HoverVideoPreview } from '@/components/media/hover-video-preview';
import { formatRelativeTime } from '@/lib/utils';

type MediaKind = 'IMAGE' | 'VIDEO';

interface PreviewItem {
  id: string;
  type: MediaKind;
  thumbnailUrl: string;
  fileUrl: string;
  width: number | null;
  height: number | null;
}

interface Album {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: 'INTERNAL' | 'DEPARTMENT' | 'PRIVATE';
  createdAt: string;
  coverItem: PreviewItem | null;
  previewItems: PreviewItem[];
  createdBy: { id: string; firstName: string; lastName: string };
  _count: { items: number };
}

interface FlatItem extends LightboxItem {
  album: { id: string; slug: string; title: string };
}

interface FlatResponse {
  total: number;
  limit: number;
  offset: number;
  items: FlatItem[];
}

const VISIBILITY_META: Record<
  Album['visibility'],
  { label: string; icon: React.ElementType; color: string }
> = {
  INTERNAL: { label: 'Interne', icon: Users, color: 'text-emerald-600' },
  DEPARTMENT: { label: 'Département', icon: Building2, color: 'text-blue-600' },
  PRIVATE: { label: 'Privé', icon: Lock, color: 'text-seal-gray-500' },
};

type Tab = 'albums' | 'photos' | 'videos';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'albums', label: 'Par album', icon: LayoutGrid },
  { id: 'photos', label: 'Toutes les photos', icon: Images },
  { id: 'videos', label: 'Toutes les vidéos', icon: Film },
];

export default function MediaPage() {
  const [tab, setTab] = useState<Tab>('albums');
  const [albums, setAlbums] = useState<Album[]>([]);
  const [flatItems, setFlatItems] = useState<FlatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(
    user &&
      (isRoleAtLeast(user.role, UserRole.ADMIN) ||
        (user as { canManageMedia?: boolean }).canManageMedia),
  );

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Album[]>('/media/albums');
      setAlbums(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erreur de chargement de la médiathèque');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlat = useCallback(async (type: 'IMAGE' | 'VIDEO') => {
    setLoading(true);
    try {
      const { data } = await api.get<FlatResponse>('/media/items', {
        params: { type, limit: 120 },
      });
      setFlatItems(data.items ?? []);
    } catch {
      toast.error('Erreur de chargement des médias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'albums') loadAlbums();
    else if (tab === 'photos') loadFlat('IMAGE');
    else loadFlat('VIDEO');
  }, [tab, loadAlbums, loadFlat]);

  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const nextLightbox = () =>
    setLightboxIndex((i) => (i !== null && i < flatItems.length - 1 ? i + 1 : i));
  const prevLightbox = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));

  const totalMediaCount = useMemo(
    () => albums.reduce((sum, a) => sum + a._count.items, 0),
    [albums],
  );

  return (
    <div className="mx-auto max-w-7xl">
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#004469] via-[#004469] to-[#002a40] p-8 sm:p-12 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#F9964A]/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#F9964A]/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/70 mb-3">
              <Camera className="h-3.5 w-3.5" /> Médiathèque OMNITECH
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold leading-tight mb-2">
              Photos &amp; vidéos de l&apos;équipe
            </h1>
            <p className="text-sm sm:text-base text-white/70 max-w-2xl">
              Événements, salons, équipes, projets — retrouvez et téléchargez les médias officiels
              mis à disposition par l&apos;équipe Marketing.
            </p>
            {tab === 'albums' && albums.length > 0 && (
              <p className="text-[11px] uppercase tracking-widest text-white/50 mt-4">
                {albums.length} album{albums.length > 1 ? 's' : ''} · {totalMediaCount} média
                {totalMediaCount > 1 ? 's' : ''}
              </p>
            )}
          </div>
          {canManage && (
            <Link href="/admin/media">
              <Button
                variant="primary"
                className="bg-[#F9964A] hover:bg-[#e67d1e] text-white border-0 gap-2"
              >
                <Plus className="h-4 w-4" />
                Gérer les albums
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Type d'affichage"
        className="flex gap-1 mb-6 border-b border-gray-200 dark:border-slate-700 overflow-x-auto"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
                active
                  ? 'border-[#F9964A] text-[#F9964A]'
                  : 'border-transparent text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'albums' ? (
        <AlbumsGrid albums={albums} loading={loading} canManage={canManage} />
      ) : (
        <FlatGallery
          items={flatItems}
          loading={loading}
          kind={tab === 'photos' ? 'IMAGE' : 'VIDEO'}
          onOpen={openLightbox}
        />
      )}

      {lightboxIndex !== null && flatItems.length > 0 && (
        <MediaLightbox
          items={flatItems}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={nextLightbox}
          onPrev={prevLightbox}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Albums grid + mosaic preview                                               */
/* -------------------------------------------------------------------------- */

function AlbumsGrid({
  albums,
  loading,
  canManage,
}: {
  albums: Album[];
  loading: boolean;
  canManage: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-72 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (albums.length === 0) {
    return (
      <EmptyState
        title="Aucun album pour l'instant"
        description={
          canManage
            ? "Créez votre premier album depuis l'espace de gestion pour partager des photos et vidéos avec vos collègues."
            : "L'équipe Marketing n'a pas encore publié de contenu. Revenez plus tard !"
        }
        action={
          canManage ? (
            <Link href="/admin/media">
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Créer un album
              </Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {albums.map((album) => (
        <AlbumCard key={album.id} album={album} />
      ))}
    </div>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const vis = VISIBILITY_META[album.visibility];
  const VisIcon = vis.icon;

  // Construit la mosaïque : 1 grand à gauche + jusqu'à 3 petits à droite.
  // Priorité aux previewItems (fraîcheur), fallback sur coverItem seul.
  const mosaic = useMemo(() => {
    const base = album.previewItems?.length > 0 ? album.previewItems : album.coverItem ? [album.coverItem] : [];
    // Si cover défini, on le met en tête pour qu'il soit le grand
    if (album.coverItem) {
      const filtered = base.filter((p) => p.id !== album.coverItem!.id);
      return [album.coverItem, ...filtered].slice(0, 4);
    }
    return base.slice(0, 4);
  }, [album.coverItem, album.previewItems]);

  const hasMosaic = mosaic.length >= 2;
  const extra = album._count.items - mosaic.length;

  return (
    <Link href={`/media/albums/${album.slug}`}>
      <article className="group relative rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full flex flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-800">
          {mosaic.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center">
              <ImageIcon className="h-16 w-16 text-white/40" />
            </div>
          ) : hasMosaic ? (
            <MosaicPreview items={mosaic} albumTitle={album.title} extra={extra} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={withAuthToken(mosaic[0]!.thumbnailUrl)}
              alt={album.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          )}

          {/* Top badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
            <span className="inline-flex items-center gap-1 rounded-full backdrop-blur-md bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
              <VisIcon className="h-3 w-3" /> {vis.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full backdrop-blur-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white">
              {album._count.items} méd.{' '}
              {album.coverItem?.type === 'VIDEO' ? (
                <Video className="h-3 w-3" />
              ) : (
                <ImageIcon className="h-3 w-3" />
              )}
            </span>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <h3 className="text-base font-semibold text-seal-navy dark:text-white group-hover:text-[#F9964A] transition-colors line-clamp-1">
            {album.title}
          </h3>
          {album.description && (
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2 flex-1">
              {album.description}
            </p>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/50">
            <span className="flex items-center gap-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
              <UserCircle className="h-3 w-3" />
              {album.createdBy.firstName} {album.createdBy.lastName}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
              <Calendar className="h-3 w-3" />
              {formatRelativeTime(album.createdAt)}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function MosaicPreview({
  items,
  albumTitle,
  extra,
}: {
  items: PreviewItem[];
  albumTitle: string;
  extra: number;
}) {
  const [main, ...rest] = items;
  if (!main) return null;
  const thumbs = rest.slice(0, 3);
  // Complète à 3 avec des placeholders vides si besoin (pour éviter le trou visuel)
  const filled = [...thumbs, ...Array.from({ length: 3 - thumbs.length }, () => null)];

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 h-full w-full">
      {/* Grand tile — colonnes 1-2, toute la hauteur */}
      <div className="col-span-2 row-span-3 relative overflow-hidden bg-gray-200 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={withAuthToken(main.thumbnailUrl)}
          alt={albumTitle}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {main.type === 'VIDEO' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Video className="h-4 w-4 text-white fill-white" />
            </div>
          </div>
        )}
      </div>

      {/* 3 petits tiles à droite */}
      {filled.map((item, idx) => (
        <div
          key={item?.id ?? `placeholder-${idx}`}
          className="col-span-1 row-span-1 relative overflow-hidden bg-gray-200 dark:bg-slate-800"
        >
          {item ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={withAuthToken(item.thumbnailUrl)}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              {item.type === 'VIDEO' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Video className="h-4 w-4 text-white fill-white drop-shadow-lg" />
                </div>
              )}
              {/* Overlay "+N" sur la dernière tile s'il reste des médias */}
              {idx === filled.length - 1 && extra > 0 && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-sm font-semibold text-white">+{extra}</span>
                </div>
              )}
            </>
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-800" />
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Flat gallery                                                               */
/* -------------------------------------------------------------------------- */

function FlatGallery({
  items,
  loading,
  kind,
  onOpen,
}: {
  items: FlatItem[];
  loading: boolean;
  kind: MediaKind;
  onOpen: (index: number) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={kind === 'IMAGE' ? 'Aucune photo disponible' : 'Aucune vidéo disponible'}
        description={
          kind === 'IMAGE'
            ? "Aucune photo n'a encore été publiée dans les albums auxquels vous avez accès."
            : "Aucune vidéo n'a encore été publiée dans les albums auxquels vous avez accès."
        }
      />
    );
  }

  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
      {items.map((item, idx) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(idx)}
          className="block w-full break-inside-avoid rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 group relative shadow-sm hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#F9964A]"
          aria-label={`Ouvrir ${item.title ?? 'le média'}`}
        >
          {item.type === 'VIDEO' ? (
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
              alt={item.title ?? ''}
              className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
            <div className="text-left">
              <p className="text-[10px] font-semibold text-white/90 uppercase tracking-widest">
                {item.album.title}
              </p>
              {item.title && (
                <p className="text-xs font-semibold text-white line-clamp-1 mt-0.5">{item.title}</p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
