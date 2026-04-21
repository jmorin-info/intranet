'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, Button, Badge, Skeleton, EmptyState } from '@omnitech/ui';
import { Image as ImageIcon, Video, Lock, Users, Building2, Plus, Camera, Calendar, UserCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { api } from '@/lib/api';
import { withAuthToken } from '@/lib/media-url';
import { formatRelativeTime } from '@/lib/utils';

interface Album {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: 'INTERNAL' | 'DEPARTMENT' | 'PRIVATE';
  createdAt: string;
  coverItem: {
    id: string;
    thumbnailUrl: string;
    type: 'IMAGE' | 'VIDEO';
    width: number | null;
    height: number | null;
  } | null;
  createdBy: { id: string; firstName: string; lastName: string };
  _count: { items: number };
}

const VISIBILITY_META: Record<Album['visibility'], { label: string; icon: React.ElementType; color: string }> = {
  INTERNAL: { label: 'Interne', icon: Users, color: 'text-emerald-600' },
  DEPARTMENT: { label: 'Département', icon: Building2, color: 'text-blue-600' },
  PRIVATE: { label: 'Privé', icon: Lock, color: 'text-seal-gray-500' },
};

export default function MediaPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);
  const canManage = Boolean(
    user && (isRoleAtLeast(user.role, UserRole.ADMIN) || (user as { canManageMedia?: boolean }).canManageMedia),
  );

  const load = useCallback(async () => {
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

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl">
      {/* Hero section — moderne, donne envie */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#004469] via-[#004469] to-[#002a40] p-8 sm:p-12 text-white">
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
              Événements, salons, équipes, projets — retrouvez et téléchargez
              les médias officiels mis à disposition par l&apos;équipe Marketing.
            </p>
          </div>
          {canManage && (
            <Link href="/admin/media">
              <Button variant="primary" className="bg-[#F9964A] hover:bg-[#e67d1e] text-white border-0 gap-2">
                <Plus className="h-4 w-4" />
                Gérer les albums
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Albums grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : albums.length === 0 ? (
        <EmptyState
          title="Aucun album pour l'instant"
          description={
            canManage
              ? 'Créez votre premier album depuis l\'espace de gestion pour partager des photos et vidéos avec vos collègues.'
              : 'L\'équipe Marketing n\'a pas encore publié de contenu. Revenez plus tard !'
          }
          action={
            canManage ? (
              <Link href="/admin/media">
                <Button><Plus className="h-4 w-4 mr-1" />Créer un album</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {albums.map((album) => {
            const vis = VISIBILITY_META[album.visibility];
            const VisIcon = vis.icon;
            return (
              <Link key={album.id} href={`/media/albums/${album.slug}`}>
                <article className="group relative rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full flex flex-col">
                  {/* Cover */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-800">
                    {album.coverItem ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={withAuthToken(album.coverItem.thumbnailUrl)}
                        alt={album.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <ImageIcon className="h-16 w-16 text-white/40" />
                      </div>
                    )}
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                    {/* Top badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 rounded-full backdrop-blur-md bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white`}>
                        <VisIcon className="h-3 w-3" /> {vis.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full backdrop-blur-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {album._count.items} méd. {album.coverItem?.type === 'VIDEO' ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
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
          })}
        </div>
      )}
    </div>
  );
}
