'use client';

/**
 * "Actualités" card (3 items max) rendered next to the recent documents list
 * when `prefs.showNews` is on and there is at least one pinned news item.
 */

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@omnitech/ui';
import { formatDate } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export interface PinnedNews {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  author: { firstName: string; lastName: string };
}

export function DashboardPinnedNewsCard({ news }: { news: PinnedNews[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-seal-navy dark:text-white">{t('dashboard.news')}</h2>
          <Link href="/news" className="text-sm text-primary hover:underline">
            {t('common.viewAll')}
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {news.slice(0, 3).map((n) => (
            <Link
              key={n.id}
              href={`/news/${n.slug}`}
              className="block px-6 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              <p className="text-sm font-medium text-seal-navy dark:text-white line-clamp-1">{n.title}</p>
              {n.excerpt && <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mt-0.5">{n.excerpt}</p>}
              <p className="text-[10px] text-seal-gray-500/60 dark:text-slate-500 mt-1">
                {n.author.firstName} {n.author.lastName} — {formatDate(n.publishedAt)}
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default DashboardPinnedNewsCard;
