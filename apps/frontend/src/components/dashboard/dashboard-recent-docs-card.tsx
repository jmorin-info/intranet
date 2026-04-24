'use client';

/**
 * "Documents récents" card shown in the dashboard main grid (left column).
 * Handles loading skeleton, empty state and the document row list.
 */

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, StatusBadge } from '@omnitech/ui';
import { SkeletonGrid } from '@/components/ui/skeleton-grid';
import { ArrowRight, FileText } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export interface RecentDocument {
  id: string;
  title: string;
  reference: string;
  status: string;
  updatedAt: string;
  owner: { firstName: string; lastName: string };
}

interface DashboardRecentDocsCardProps {
  loading: boolean;
  docs: RecentDocument[];
}

export function DashboardRecentDocsCard({ loading, docs }: DashboardRecentDocsCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-seal-navy dark:text-white">{t('dashboard.recentDocs')}</h2>
          <Link href="/documents" className="flex items-center gap-1 text-sm text-primary hover:underline">
            {t('common.viewAll')} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4">
            <SkeletonGrid count={4} columns={1} />
          </div>
        ) : docs.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="h-10 w-10 text-seal-gray-500/30 mx-auto mb-2" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">{t('common.noResults')}</p>
            <Link href="/documents/new" className="text-xs text-primary hover:underline mt-1 inline-block">
              Créer un document
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {docs.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/80 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="h-8 w-8 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                  <FileText className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-seal-navy dark:text-white truncate">{doc.title}</p>
                  <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5">
                    {doc.reference} — {doc.owner.firstName} {doc.owner.lastName}
                  </p>
                </div>
                <StatusBadge
                  status={doc.status as 'DRAFT' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'OBSOLETE' | 'ARCHIVED'}
                />
                <span className="text-[11px] text-seal-gray-500 dark:text-slate-500 hidden sm:block whitespace-nowrap">
                  {formatRelativeTime(doc.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DashboardRecentDocsCard;
