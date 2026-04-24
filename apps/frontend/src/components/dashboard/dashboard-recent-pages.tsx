'use client';

/**
 * Dashboard row wrapping three secondary widgets:
 * - Recently visited pages
 * - My notifications
 * - Docs due review (manager+ only)
 *
 * Kept as a thin composition wrapper to keep `dashboard/page.tsx` focused on
 * orchestration.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { RecentPagesWidget } from '@/components/widgets/recent-pages-widget';
import { MyNotificationsWidget } from '@/components/widgets/my-notifications-widget';

// Lazy: admin/manager-only — mirrors the dynamic import used in the page before the split.
const DocsDueReviewWidget = dynamic(
  () => import('@/components/widgets/docs-due-review-widget').then((m) => m.DocsDueReviewWidget),
  { ssr: false },
);

interface DashboardRecentPagesProps {
  isManager: boolean;
}

export function DashboardRecentPages({ isManager }: DashboardRecentPagesProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <RecentPagesWidget />
      <MyNotificationsWidget />
      {isManager && <DocsDueReviewWidget />}
    </div>
  );
}

export default DashboardRecentPages;
