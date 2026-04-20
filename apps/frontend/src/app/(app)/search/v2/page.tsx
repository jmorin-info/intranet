'use client';

/**
 * Page de recherche federee v2 — propulsee par Meilisearch.
 *
 * Cette page coexiste avec `/search` (v1 Postgres) pendant la migration.
 * Elle interroge `/api/search/v2?q=...` et regroupe les resultats par type
 * (documents, tickets, wiki, news).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, BookOpen, Newspaper, Ticket } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Spotlight } from '@/components/ui/spotlight';
import { SmartFilterBar } from '@/components/ui/smart-filter-bar';
import type { SmartFilter } from '@/lib/smart-filter';
import { periodToRange } from '@/lib/smart-filter';

interface MeiliHit {
  id: string;
  title: string;
  content?: string;
  type: 'document' | 'ticket' | 'wiki' | 'news';
  url: string;
  author?: string | null;
  date?: string | null;
  tags?: string[];
}

interface MeiliSearchResponse {
  hits: MeiliHit[];
  total: number;
  byIndex?: Record<string, { hits: MeiliHit[]; total: number }>;
}

const INDEX_LABELS: Record<string, string> = {
  omnitech_documents: 'Documents',
  omnitech_tickets: 'Tickets',
  omnitech_wiki: 'Wiki',
  omnitech_news: 'Actualités',
};

const TYPE_ICON: Record<string, React.ElementType> = {
  document: FileText,
  ticket: Ticket,
  wiki: BookOpen,
  news: Newspaper,
};

const TYPE_ICON_COLOR: Record<string, string> = {
  document: 'text-navy dark:text-blue-400',
  ticket: 'text-violet-500',
  wiki: 'text-emerald-500',
  news: 'text-blue-500',
};

/** Index UID → hit type for icon lookup */
const INDEX_TYPE: Record<string, string> = {
  omnitech_documents: 'document',
  omnitech_tickets: 'ticket',
  omnitech_wiki: 'wiki',
  omnitech_news: 'news',
};

/** Skeleton row matching result card shape */
function ResultSkeleton() {
  return (
    <div className="shimmer rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
      <div className="h-5 w-5 rounded bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-slate-700" />
      </div>
      <div className="h-4 w-20 rounded bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
    </div>
  );
}

export default function SearchV2Page() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeiliSearchResponse | null>(null);
  const [smartFilter, setSmartFilter] = useState<SmartFilter | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('omnitech:recent-searches');
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  // Save to recent on successful search
  useEffect(() => {
    if (debounced && data && data.total > 0) {
      setRecentSearches(prev => {
        const next = [debounced, ...prev.filter(s => s !== debounced)].slice(0, 5);
        try { localStorage.setItem('omnitech:recent-searches', JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [debounced, data]);

  // Keyboard shortcut: "/" focuses the search input when outside an input
  useEffect(() => {
    function handleSlash(e: KeyboardEvent) {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener('keydown', handleSlash);
    return () => document.removeEventListener('keydown', handleSlash);
  }, []);

  // Debounce 300ms sur l'input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Lancement de la requete
  useEffect(() => {
    if (!debounced) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<MeiliSearchResponse>('/search/v2', { params: { q: debounced } })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              'Erreur de recherche',
          );
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // SmartFilter handler
  const handleSmartFilter = useCallback((filter: SmartFilter, _raw: string) => {
    setSmartFilter(filter);
  }, []);

  // Period range for smart-filter
  const periodRange = useMemo(
    () => (smartFilter?.period ? periodToRange(smartFilter.period) : null),
    [smartFilter?.period],
  );

  function matchesPeriod(hit: MeiliHit): boolean {
    if (!periodRange) return true;
    if (!hit.date) return true;
    return hit.date >= periodRange.from && hit.date < periodRange.to;
  }

  const groups = useMemo(() => {
    if (!data?.byIndex) return [];
    return Object.entries(data.byIndex)
      .map(([uid, group]) => ({
        uid,
        label: INDEX_LABELS[uid] ?? uid,
        hitType: INDEX_TYPE[uid] ?? 'document',
        hits: group.hits.filter(matchesPeriod),
        total: group.total,
      }))
      .filter((g) => g.hits.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, periodRange]);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-navy dark:text-white p-6 animate-fade-in-up">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold seal-text-navy dark:text-white">
            Recherche fédérée
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Propulsée par Meilisearch — documents, tickets, wiki et actualités.
          </p>
        </header>

        <div className="mb-4">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans tout l'intranet... (appuyez sur / pour focus)"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* SmartFilterBar — NL filter above results */}
        <SmartFilterBar
          placeholder="Filtrer : « cette semaine », « tickets ouverts », « critiques »..."
          onFilter={handleSmartFilter}
          className="mb-6"
        />

        {/* Etat : loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <ResultSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Etat : erreur */}
        {error && !loading && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Etat : vide (aucune saisie) */}
        {!loading && !error && !debounced && (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400">
            <p>{t('search.minChars')}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono border border-gray-200 dark:border-slate-700">/</kbd> pour rechercher
            </p>
            {recentSearches.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('search.recent')}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {recentSearches.map(s => (
                    <button key={s} onClick={() => setQuery(s)}
                      className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* État : aucun résultat */}
        {!loading && !error && debounced && data && data.total === 0 && (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400">
            Aucun résultat pour <strong>&ldquo;{debounced}&rdquo;</strong>.
          </div>
        )}

        {/* Did you mean hint for zero results */}
        {!loading && !error && debounced && data && data.total === 0 && recentSearches.length > 0 && (
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Recherches récentes :</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {recentSearches.map(s => (
                <button key={s} onClick={() => setQuery(s)}
                  className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Résultats groupés par type */}
        {!loading && !error && data && data.total > 0 && (
          <div className="space-y-8">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {data.total} résultat{data.total > 1 ? 's' : ''} trouvé
              {data.total > 1 ? 's' : ''}
            </div>

            {groups.map((group) => {
              const GroupIcon = TYPE_ICON[group.hitType] ?? FileText;
              const iconColor = TYPE_ICON_COLOR[group.hitType] ?? 'text-navy';
              return (
                <section key={group.uid}>
                  <h2 className="text-xl font-semibold mb-3 border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2">
                    <GroupIcon className={`h-5 w-5 ${iconColor}`} />
                    {group.label}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      ({group.hits.length})
                    </span>
                  </h2>
                  <ul className="space-y-3">
                    {group.hits.map((hit) => {
                      const HitIcon = TYPE_ICON[hit.type] ?? FileText;
                      const hitIconColor = TYPE_ICON_COLOR[hit.type] ?? 'text-navy';
                      return (
                        <li
                          key={hit.id}
                          className="stagger-item p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <Link
                            href={hit.url || '#'}
                            className="block"
                          >
                            <div className="flex items-start gap-3">
                              <HitIcon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${hitIconColor}`} />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-navy dark:text-white">
                                  <Spotlight text={hit.title} query={debounced} />
                                </h3>
                                {hit.content && (
                                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                    <Spotlight
                                      text={hit.content.slice(0, 200) + (hit.content.length > 200 ? '...' : '')}
                                      query={debounced}
                                    />
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500 dark:text-slate-500">
                                  {hit.author && <span>Auteur : {hit.author}</span>}
                                  {hit.date && (
                                    <span>{formatRelativeTime(hit.date)}</span>
                                  )}
                                  {hit.tags?.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
