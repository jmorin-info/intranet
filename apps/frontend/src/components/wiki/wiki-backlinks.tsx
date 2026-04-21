'use client';

/**
 * WikiBacklinks — "Cité dans N articles" section for wiki detail pages.
 *
 * Fetches `/wiki/:id/backlinks` (which the backend scans with a Redis
 * cache) and renders a compact grid of cards that deep-link into the
 * backlinking article.
 *
 * The component gracefully hides itself when the endpoint errors or
 * returns zero backlinks — this avoids a noisy empty section at the
 * bottom of every article while backlinks are still rare.
 */

import React, { useEffect, useState } from 'react';
import { Link2, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

export interface WikiBacklinkItem {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  excerpt: string;
  updatedAt: string;
}

interface WikiBacklinksProps {
  /** Wiki article id whose backlinks should be loaded. */
  pageId: string;
  /** Invoked when a backlink card is clicked (e.g. to navigate in-app). */
  onNavigate?: (slug: string) => void;
}

type BacklinksResponse = {
  count: number;
  items: WikiBacklinkItem[];
};

export function WikiBacklinks({ pageId, onNavigate }: WikiBacklinksProps) {
  const [items, setItems] = useState<WikiBacklinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    api
      .get<BacklinksResponse>(`/wiki/${pageId}/backlinks`)
      .then((res) => {
        if (cancelled) return;
        setItems(Array.isArray(res.data?.items) ? res.data.items : []);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  // Hide the section while loading, on error, or when nothing links here.
  if (loading || errored || items.length === 0) return null;

  const count = items.length;
  const label =
    count === 1 ? 'Cité dans 1 article' : `Cité dans ${count} articles`;

  return (
    <section className="mt-10 pt-8 border-t border-gray-200 dark:border-slate-700">
      <h2 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2 mb-4">
        <Link2 className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
        {label}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item) => {
          const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (onNavigate) {
              e.preventDefault();
              onNavigate(item.slug);
            }
          };
          return (
            <a
              key={item.id}
              href={`/wiki?slug=${encodeURIComponent(item.slug)}`}
              onClick={handleClick}
              className="text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:border-primary/40 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-primary line-clamp-2">
                    {item.title}
                  </p>
                  {item.excerpt && (
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 line-clamp-2 leading-relaxed mt-1">
                      {item.excerpt}
                    </p>
                  )}
                  <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1.5 flex items-center gap-2">
                    {item.category && (
                      <>
                        <span className="truncate">{item.category}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{formatRelativeTime(item.updatedAt)}</span>
                  </p>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
