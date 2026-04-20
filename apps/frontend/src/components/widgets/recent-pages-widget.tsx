'use client';

import Link from 'next/link';
import { Clock, X } from 'lucide-react';
import { useRecentPages, clearRecentPages } from '@/hooks/use-recent-pages';

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'à l\'instant';
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export function RecentPagesWidget() {
  const pages = useRecentPages();

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-navy dark:text-white">Pages récentes</h3>
        </div>
        <p className="text-xs text-taupe dark:text-slate-500">
          Naviguez dans l'intranet — vos pages récentes apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-navy dark:text-white">Pages récentes</h3>
        </div>
        <button
          onClick={clearRecentPages}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          aria-label="Effacer l'historique"
          title="Effacer l'historique"
        >
          <X className="h-3.5 w-3.5 text-taupe" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {pages.map((p) => (
          <li key={p.path}>
            <Link
              href={p.path}
              className="group flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/60 transition"
            >
              <span className="text-sm text-navy dark:text-white truncate group-hover:text-primary">
                {p.title}
              </span>
              <span className="text-[10px] text-taupe dark:text-slate-500 shrink-0 tabular-nums">
                {formatRelative(p.visitedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
