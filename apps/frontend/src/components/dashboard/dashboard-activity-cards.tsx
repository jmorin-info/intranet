'use client';

/**
 * Two sidebar cards that render audit-based activity streams:
 *
 * - `UserActivityCard` — the viewer's 8 most recent significant actions plus
 *   a mini 7-day bar chart aggregated from the last 50 entries.
 * - `RecentActivityAdminCard` — same filter/labels but sourced from the
 *   global audit log (admin-only).
 *
 * Lookup tables and the `isSignificantActivity` filter live in
 * `./dashboard-activity-labels` for reuse.
 */

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@omnitech/ui';
import { Activity, ArrowRight } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import {
  ADMIN_LABELS,
  ADMIN_TYPE_LABELS,
  RESOURCE_LABELS,
  USER_ACTIVITY_ICONS,
  USER_ACTIVITY_LABELS,
  isSignificantActivity,
  labelForAction,
} from './dashboard-activity-labels';

export interface ActivityEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  createdAt: string;
}

export interface AdminActivityEntry {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
}

export function UserActivityCard({
  entries,
  weeklyCounts,
}: {
  entries: ActivityEntry[];
  weeklyCounts: number[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Mon activité</h3>
            {weeklyCounts.length > 0 && (
              <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
                {weeklyCounts.reduce((a, b) => a + b, 0)} actions cette semaine
              </span>
            )}
          </div>
          <Link href="/notifications" className="text-xs text-primary hover:underline flex items-center gap-1">
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {weeklyCounts.length > 0 && <WeeklyBarChart counts={weeklyCounts} />}
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {entries
          .filter((a) => isSignificantActivity(a.action, a.resourceType, true))
          .slice(0, 8)
          .map((a) => {
            const resType = (a.resourceType || '').toUpperCase();
            const entry = (USER_ACTIVITY_ICONS[resType] || USER_ACTIVITY_ICONS['DOCUMENT'])!;
            const Icon = entry.icon;
            const actionLabel = labelForAction(a.action || '', USER_ACTIVITY_LABELS);
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-slate-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition"
              >
                <div className={`h-7 w-7 rounded-lg ${entry.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-3.5 w-3.5 ${entry.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-seal-navy dark:text-white truncate">{actionLabel}</p>
                  <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                    {RESOURCE_LABELS[resType.toLowerCase()] ?? resType.toLowerCase()}
                  </p>
                </div>
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex-shrink-0 whitespace-nowrap">
                  {formatRelativeTime(a.createdAt)}
                </span>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

function WeeklyBarChart({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const today = new Date().getDay();
  return (
    <div className="flex items-end gap-1 mt-3 h-8">
      {counts.map((count, idx) => {
        const dayIndex = (today - 6 + idx + 7) % 7;
        const label = dayLabels[dayIndex === 0 ? 6 : dayIndex - 1] ?? '';
        const heightPct = Math.max((count / max) * 100, 4);
        return (
          <div
            key={idx}
            className="flex flex-col items-center gap-0.5 flex-1"
            title={`${label}: ${count} action${count !== 1 ? 's' : ''}`}
          >
            <div
              className={`w-full max-w-[18px] rounded-sm transition-all ${
                count > 0 ? 'bg-primary/70 dark:bg-primary/50' : 'bg-gray-200 dark:bg-slate-700'
              }`}
              style={{ height: `${heightPct}%`, minHeight: '2px' }}
            />
            <span className="text-[8px] text-seal-gray-500 dark:text-slate-500 leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RecentActivityAdminCard({ entries }: { entries: AdminActivityEntry[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">{t('dashboard.recentActivity')}</h3>
          <Link href="/admin/audit" className="text-xs text-primary hover:underline flex items-center gap-1">
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries
          .filter((a) => isSignificantActivity(a.action, a.resourceType, false))
          .slice(0, 8)
          .map((a) => {
            const label = labelForAction(a.action || '', ADMIN_LABELS);
            const rt = (a.resourceType || '').toLowerCase();
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                <span className="text-seal-navy dark:text-white font-medium truncate">{label}</span>
                <span className="text-seal-gray-500 dark:text-slate-400">{ADMIN_TYPE_LABELS[rt] ?? rt}</span>
                <span className="text-seal-gray-500 dark:text-slate-500 ml-auto whitespace-nowrap">
                  {formatRelativeTime(a.createdAt)}
                </span>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
