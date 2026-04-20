'use client';

import React, { Suspense, lazy, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, ClipboardList, BarChart3, Layers } from 'lucide-react';
import { Skeleton } from '@omnitech/ui';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { useTranslation } from '@/lib/i18n';

const ComplianceOverview = lazy(() =>
  import('./ComplianceOverview').then((m) => ({ default: m.ComplianceOverview }))
);
const CompliancePlanning = lazy(() =>
  import('./CompliancePlanning').then((m) => ({ default: m.CompliancePlanning }))
);
const ComplianceControls = lazy(() =>
  import('./ComplianceControls').then((m) => ({ default: m.ComplianceControls }))
);
const ComplianceFrameworks = lazy(() =>
  import('./ComplianceFrameworks').then((m) => ({ default: m.ComplianceFrameworks }))
);

type TabId = 'overview' | 'planning' | 'controls' | 'frameworks';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
  { id: 'planning', label: 'Planning', icon: ClipboardList },
  { id: 'controls', label: 'Contrôles', icon: Shield },
  { id: 'frameworks', label: 'Référentiels', icon: Layers },
];

function TabFallback() {
  return (
    <div className="space-y-6 pt-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

function CompliancePageInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get('tab');
  const activeTab: TabId =
    rawTab === 'planning' || rawTab === 'controls' || rawTab === 'frameworks'
      ? rawTab
      : 'overview';

  const handleTabClick = useCallback(
    (id: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', id);
      }
      router.push(`/admin/compliance?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="space-y-0">
      <AdminGroupTabs group="compliance" />
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${
                isActive
                  ? 'border-b-2 border-primary text-primary font-semibold'
                  : 'text-seal-gray-500 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'overview' && <ComplianceOverview />}
        {activeTab === 'planning' && <CompliancePlanning />}
        {activeTab === 'controls' && <ComplianceControls />}
        {activeTab === 'frameworks' && <ComplianceFrameworks />}
      </Suspense>
    </div>
  );
}

export default function CompliancePage() {
  return (
    <Suspense fallback={<TabFallback />}>
      <CompliancePageInner />
    </Suspense>
  );
}
