'use client';

import React, { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, FileText } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { PageHeader } from '@/components/layout/page-header';

const WikiContent = dynamic(
  () => import('./WikiContent').then((m) => m.WikiContent),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);

const RunbooksContent = dynamic(
  () => import('./RunbooksContent').then((m) => m.RunbooksContent),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);

type TabId = 'wiki' | 'runbooks';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

function KnowledgeBasePageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [wikiCount, setWikiCount] = useState<number | null>(null);
  const [runbooksCount, setRunbooksCount] = useState<number | null>(null);

  const rawTab = searchParams.get('tab');
  const activeTab: TabId = rawTab === 'runbooks' ? 'runbooks' : 'wiki';

  const setTab = (id: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    router.push(`/wiki?${params.toString()}`);
  };

  // Counts are reported by child components via onCount callback (no duplicate fetch)

  const tabs: Tab[] = [
    { id: 'wiki', label: 'Wiki', icon: BookOpen },
    { id: 'runbooks', label: 'Runbooks', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Base de connaissances"
        subtitle={t('wiki.subtitle')}
        icon={BookOpen}
        hub="work"
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary font-semibold'
                : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.id === 'wiki' && wikiCount !== null && (
              <span className={`ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                activeTab === 'wiki'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400'
              }`}>
                {wikiCount}
              </span>
            )}
            {tab.id === 'runbooks' && runbooksCount !== null && (
              <span className={`ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                activeTab === 'runbooks'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400'
              }`}>
                {runbooksCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'wiki' && <WikiContent onCount={setWikiCount} />}
      {activeTab === 'runbooks' && <RunbooksContent onCount={setRunbooksCount} />}
    </div>
  );
}

export default function KnowledgeBasePage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    }>
      <KnowledgeBasePageInner />
    </Suspense>
  );
}
