'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, Button, Input, Textarea, Badge, EmptyState, Skeleton } from '@omnitech/ui';
import {
  Camera, Plus, Trash2, Edit3, Users, Lock, Building2,
  Image as ImageIcon, Video, Settings2, BarChart3, X,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { withAuthToken } from '@/lib/media-url';
import { formatRelativeTime } from '@/lib/utils';

interface Album {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: 'INTERNAL' | 'DEPARTMENT' | 'PRIVATE';
  departmentId: string | null;
  createdAt: string;
  coverItem: { id: string; thumbnailUrl: string } | null;
  createdBy: { firstName: string; lastName: string };
  _count: { items: number };
}

interface Stats {
  albumsCount: number;
  itemsCount: number;
  downloadsCount: number;
  topDownloaded: Array<{ id: string; title: string | null; albumSlug: string; albumTitle: string; downloads: number; thumbnailUrl: string }>;
}

const VIS_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  INTERNAL: { label: 'Interne', icon: Users, color: 'text-emerald-600' },
  DEPARTMENT: { label: 'Département', icon: Building2, color: 'text-blue-600' },
  PRIVATE: { label: 'Privé', icon: Lock, color: 'text-seal-gray-500' },
};

export default function AdminMediaPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newVisibility, setNewVisibility] = useState<'INTERNAL' | 'DEPARTMENT' | 'PRIVATE'>('INTERNAL');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [albumsRes, statsRes] = await Promise.all([
        api.get<Album[]>('/media/albums'),
        api.get<Stats>('/media/stats').catch(() => ({ data: null as Stats | null })),
      ]);
      setAlbums(Array.isArray(albumsRes.data) ? albumsRes.data : []);
      setStats(statsRes.data);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newTitle.trim() || newTitle.trim().length < 3) {
      toast.error('Titre requis (minimum 3 caractères)');
      return;
    }
    setCreating(true);
    try {
      const { data: album } = await api.post<Album>('/media/albums', {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        visibility: newVisibility,
      });
      toast.success(`Album "${album.title}" créé`);
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewVisibility('INTERNAL');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur création');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (a: Album) => {
    if (!confirm(`Supprimer l'album "${a.title}" et ses ${a._count.items} média(s) ? Cette action est irréversible.`)) return;
    try {
      await api.delete(`/media/albums/${a.id}`);
      toast.success('Album supprimé');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur');
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Médiathèque — gestion"
        subtitle="Créez des albums, uploadez photos et vidéos, gérez la visibilité. Visible pour les collaborateurs depuis /media."
        icon={Camera}
        hub="admin"
        actions={
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nouvel album
          </Button>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">Albums</p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">{stats.albumsCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">Médias</p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">{stats.itemsCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">Téléchargements</p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">{stats.downloadsCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gradient-to-br from-[#F9964A]/10 to-[#F9964A]/5 p-4">
            <p className="text-[10px] uppercase font-semibold text-[#F9964A] flex items-center gap-1">
              <BarChart3 className="h-3 w-3" /> Top téléchargés
            </p>
            <p className="text-xs text-seal-gray-500 mt-1 line-clamp-2">
              {stats.topDownloaded[0]
                ? `${stats.topDownloaded[0].title ?? 'Sans titre'} (${stats.topDownloaded[0].downloads})`
                : 'Pas encore de téléchargement'}
            </p>
          </div>
        </div>
      )}

      {/* Albums list */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Albums ({albums.length})
          </h2>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : albums.length === 0 ? (
            <EmptyState
              title="Aucun album"
              description="Créez votre premier album pour partager des photos et vidéos avec l'équipe."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Créer un album
                </Button>
              }
            />
          ) : (
            albums.map((a) => {
              const vis = VIS_META[a.visibility]!;
              const VisIcon = vis.icon;
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 hover:border-[#F9964A]/40 transition"
                >
                  {/* Cover */}
                  <div className="h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-800">
                    {a.coverItem ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={withAuthToken(a.coverItem.thumbnailUrl)} alt={a.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-seal-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-seal-navy dark:text-white truncate">{a.title}</h3>
                      <Badge variant="info" className="text-[9px] gap-1">
                        <VisIcon className="h-2.5 w-2.5" /> {vis.label}
                      </Badge>
                      <Badge variant="info" className="text-[9px]">{a._count.items} média{a._count.items !== 1 ? 's' : ''}</Badge>
                    </div>
                    {a.description && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5 line-clamp-1">{a.description}</p>
                    )}
                    <p className="text-[11px] text-seal-gray-500 mt-1">
                      {a.createdBy.firstName} {a.createdBy.lastName} · {formatRelativeTime(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Link href={`/admin/media/albums/${a.id}`}>
                      <Button size="sm" variant="outline" className="gap-1"><Settings2 className="h-3.5 w-3.5" />Gérer</Button>
                    </Link>
                    <Link href={`/media/albums/${a.slug}`}>
                      <Button size="sm" variant="ghost">Voir</Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(a)} className="text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-seal-navy dark:text-white">Nouvel album</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-seal-navy dark:text-white mb-1 block">Titre *</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Salon Milipol 2026" />
              </div>
              <div>
                <label className="text-xs font-semibold text-seal-navy dark:text-white mb-1 block">Description</label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} placeholder="Présentation de nos solutions sur le salon…" />
              </div>
              <div>
                <label className="text-xs font-semibold text-seal-navy dark:text-white mb-2 block">Visibilité</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['INTERNAL', 'DEPARTMENT', 'PRIVATE'] as const).map((v) => {
                    const meta = VIS_META[v]!;
                    const VisIcon = meta.icon;
                    const active = newVisibility === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setNewVisibility(v)}
                        className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-xs transition ${
                          active ? 'border-[#F9964A] bg-[#F9964A]/5' : 'border-gray-200 dark:border-slate-700 hover:border-[#F9964A]/50'
                        }`}
                      >
                        <VisIcon className={`h-4 w-4 ${active ? 'text-[#F9964A]' : 'text-seal-gray-500'}`} />
                        <span className="font-semibold text-seal-navy dark:text-white">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button onClick={handleCreate} loading={creating} disabled={creating}>Créer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
