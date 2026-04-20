'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import dynamic from 'next/dynamic';
import { Bot, Wrench, LifeBuoy } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

const HelpdeskChat = dynamic(
  () => import('./HelpdeskChat').then(m => ({ default: m.HelpdeskChat })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);
const SelfServicePortal = dynamic(
  () => import('./SelfServicePortal').then(m => ({ default: m.SelfServicePortal })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);

type TabId = 'chat' | 'selfservice';

const tabs: Array<{ id: TabId; label: string; icon: typeof Bot }> = [
  { id: 'chat', label: 'Assistant IA', icon: Bot },
  { id: 'selfservice', label: 'Self-Service', icon: Wrench },
];

function SupportPageInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = (searchParams.get('tab') as TabId | null);
  const [activeTab, setActiveTab] = useState<TabId>(
    initialTab === 'selfservice' ? 'selfservice' : 'chat'
  );

  const handleSetTab = (id: TabId) => {
    setActiveTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Sync tab if the URL param changes externally (e.g. browser back/forward)
  useEffect(() => {
    const param = searchParams.get('tab') as TabId | null;
    if (param === 'selfservice' || param === 'chat') {
      setActiveTab(param);
    }
  }, [searchParams]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t('helpdesk.supportTitle')}
        subtitle={t('helpdesk.supportSubtitle')}
        icon={LifeBuoy}
        hub="monEspace"
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700 mb-6">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => handleSetTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary font-semibold'
                : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
            }`}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'chat' && <HelpdeskChat />}
      {activeTab === 'selfservice' && <SelfServicePortal />}
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense>
      <SupportPageInner />
    </Suspense>
  );
}
