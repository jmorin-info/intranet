'use client';

/**
 * Timeline unifiée
 * ================
 *
 * Agrège news + notifications + documents récents dans un flux chronologique
 * unique. Aucune nouvelle API backend — merge client-side.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Newspaper, Bell, FileText, Filter, RefreshCw, Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { useNotificationStore } from '@/stores/notification-store';
import { Card, CardContent, Button, Badge } from '@omnitech/ui';
import { formatRelativeTime } from '@/lib/utils';

type TimelineKind = 'news' | 'notification' | 'document';

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  body?: string;
  href: string;
  at: string; // ISO
  author?: string;
}

interface NewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  createdAt: string;
  author?: { firstName?: string; lastName?: string };
}

interface NotifItem {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  resourceType?: string;
  resourceId?: string;
}

interface DocItem {
  id: string;
  title: string;
  reference?: string;
  updatedAt: string;
  owner?: { firstName?: string; lastName?: string };
}

const KIND_META: Record<TimelineKind, { label: string; Icon: React.ElementType; accent: string; chip: string }> = {
  news: {
    label: 'Actualité',
    Icon: Newspaper,
    accent: 'border-l-emerald-400',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  notification: {
    label: 'Notification',
    Icon: Bell,
    accent: 'border-l-amber-400',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  document: {
    label: 'Document',
    Icon: FileText,
    accent: 'border-l-sky-400',
    chip: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  },
};

function authorName(a?: { firstName?: string; lastName?: string }): string | undefined {
  if (!a) return undefined;
  const full = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
  return full || undefined;
}

function notifHref(n: NotifItem): string {
  if (n.resourceType === 'document' && n.resourceId) return `/documents/${n.resourceId}`;
  if (n.resourceType === 'ticket' && n.resourceId) return `/tickets/${n.resourceId}`;
  if (n.resourceType === 'news' && n.resourceId) return `/news/${n.resourceId}`;
  return '/notifications';
}

function groupByDay(entries: TimelineEntry[]): Array<{ key: string; label: string; items: TimelineEntry[] }> {
  const map = new Map<string, TimelineEntry[]>();
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);

  for (const e of entries) {
    const key = e.at.slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, items]) => {
      let label: string;
      if (key === todayKey) label = "Aujourd'hui";
      else if (key === yesterdayKey) label = 'Hier';
      else label = fmt.format(new Date(key));
      return { key, label: label.charAt(0).toUpperCase() + label.slice(1), items };
    });
}

export default function TimelinePage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<Set<TimelineKind>>(
    new Set<TimelineKind>(['news', 'notification', 'document']),
  );
  const { notifications: storeNotifs } = useNotificationStore();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [newsRes, docsRes] = await Promise.all([
        api.get('/news', { params: { limit: 15 } }).catch(() => ({ data: { data: [] } })),
        api.get('/documents', { params: { limit: 15, sort: 'updatedAt:desc' } }).catch(() => ({ data: { data: [] } })),
      ]);

      const news: NewsPost[] = newsRes.data?.data ?? newsRes.data ?? [];
      // Use notifications from centralized store (already loaded by AuthProvider, no extra API call)
      const notifs: NotifItem[] = storeNotifs.slice(0, 20);
      const docs: DocItem[] = docsRes.data?.data ?? docsRes.data ?? [];

      const merged: TimelineEntry[] = [
        ...news.map<TimelineEntry>((n) => ({
          id: `news-${n.id}`,
          kind: 'news',
          title: n.title,
          body: n.excerpt,
          href: `/news/${n.slug}`,
          at: n.publishedAt ?? n.createdAt,
          author: authorName(n.author),
        })),
        ...notifs.map<TimelineEntry>((n) => ({
          id: `notif-${n.id}`,
          kind: 'notification',
          title: n.title,
          body: n.body,
          href: notifHref(n),
          at: n.createdAt,
        })),
        ...docs.map<TimelineEntry>((d) => ({
          id: `doc-${d.id}`,
          kind: 'document',
          title: d.title,
          body: d.reference,
          href: `/documents/${d.id}`,
          at: d.updatedAt,
          author: authorName(d.owner),
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : -1));

      setEntries(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => entries.filter((e) => kindFilter.has(e.kind)),
    [entries, kindFilter],
  );
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const toggleKind = (k: TimelineKind) => {
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      if (next.size === 0) return new Set<TimelineKind>(['news', 'notification', 'document']);
      return next;
    });
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-medium text-navy dark:text-white">Timeline</h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            Vue unifiée des actualités, notifications et documents.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Rafraîchir
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-seal-gray-500 dark:text-slate-500" />
        {(Object.keys(KIND_META) as TimelineKind[]).map((k) => {
          const meta = KIND_META[k];
          const active = kindFilter.has(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition btn-lift ${
                active ? meta.chip : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-500 opacity-60'
              }`}
            >
              <meta.Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {error && (
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error}</CardContent>
        </Card>
      )}

      {loading && entries.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Clock className="h-8 w-8 text-seal-gray-500/40 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">Aucun évènement à afficher.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.key}>
            <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
              {group.label}
            </p>
            <div className="relative pl-5 space-y-2">
              <div className="absolute left-1.5 top-1 bottom-1 w-px bg-gradient-to-b from-primary/30 via-gray-200 dark:via-slate-700 to-transparent" />
              {group.items.map((entry, idx) => {
                const meta = KIND_META[entry.kind];
                return (
                  <div key={entry.id} className="stagger-item relative" style={{ animationDelay: `${idx * 30}ms` }}>
                    <div className="absolute -left-[18px] top-4 h-3 w-3 rounded-full bg-white dark:bg-slate-900 border-2 border-primary shadow-sm" />
                    <Link href={entry.href} className="block">
                      <Card hoverable className={`border-l-4 ${meta.accent}`}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center">
                              <meta.Icon className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <Badge className={`${meta.chip} text-[10px] px-2 py-0.5`}>{meta.label}</Badge>
                                <span className="text-[10px] text-seal-gray-500/70 dark:text-slate-500">
                                  {formatRelativeTime(entry.at)}
                                </span>
                                {entry.author && (
                                  <span className="text-[10px] text-seal-gray-500/70 dark:text-slate-500">
                                    — {entry.author}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-navy dark:text-white truncate">{entry.title}</p>
                              {entry.body && (
                                <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                                  {entry.body}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
