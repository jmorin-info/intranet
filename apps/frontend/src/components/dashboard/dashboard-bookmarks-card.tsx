'use client';

/**
 * Sidebar favorites card for the dashboard. Renders either a short empty-state
 * hint or the first 8 bookmarks with a small type-coloured icon. Bookmarks
 * themselves live in `localStorage` (see `bookmark-button.tsx`).
 */

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@omnitech/ui';
import { ArrowRight, BookOpen, FileText, Newspaper, Star } from 'lucide-react';
import type { BookmarkItem } from '@/components/bookmark-button';

const TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  document: { icon: FileText, color: 'text-blue-500' },
  wiki: { icon: BookOpen, color: 'text-emerald-500' },
  news: { icon: Newspaper, color: 'text-violet-500' },
};

export function DashboardBookmarksCard({ bookmarks }: { bookmarks: BookmarkItem[] }) {
  if (bookmarks.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <Star className="h-6 w-6 text-seal-gray-500/30 mx-auto mb-2" />
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Ajoutez des favoris via &#9733; sur n&apos;importe quelle page
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Mes favoris</h3>
          <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
            {bookmarks.length}
          </span>
          <Link href="/documents" className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {bookmarks.slice(0, 8).map((b) => {
          const ti = (TYPE_ICONS[b.type] || TYPE_ICONS['document'])!;
          const TIcon = ti.icon;
          return (
            <Link
              key={`${b.type}-${b.id}`}
              href={b.href}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-slate-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition group"
            >
              <TIcon className={`h-3.5 w-3.5 ${ti.color} flex-shrink-0`} />
              <span className="text-xs font-medium text-seal-navy dark:text-white truncate group-hover:text-primary transition">
                {b.title}
              </span>
              <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 ml-auto capitalize flex-shrink-0">{b.type}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default DashboardBookmarksCard;
