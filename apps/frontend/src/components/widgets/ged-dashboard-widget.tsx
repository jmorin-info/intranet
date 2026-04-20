'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  FileClock,
  FileCheck,
  FileSignature,
  CalendarClock,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, Skeleton } from '@omnitech/ui';
import { api } from '@/lib/api';

interface GedSummary {
  myDrafts: number;
  myInReview: number;
  toApproveByMe: number;
  toConfirmByMe: number;
  nearReviewDate: number;
  total: number;
}

interface RowDef {
  key: keyof Omit<GedSummary, 'total'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  tone: 'navy' | 'amber' | 'orange' | 'bordeaux' | 'green';
}

const ROWS: RowDef[] = [
  {
    key: 'myDrafts',
    label: 'Mes brouillons',
    icon: FileText,
    href: '/documents?status=DRAFT',
    tone: 'navy',
  },
  {
    key: 'myInReview',
    label: 'En attente de revue',
    icon: FileClock,
    href: '/documents?status=IN_REVIEW',
    tone: 'amber',
  },
  {
    key: 'toApproveByMe',
    label: 'À approuver',
    icon: FileCheck,
    href: '/documents?status=PENDING_APPROVAL',
    tone: 'orange',
  },
  {
    key: 'toConfirmByMe',
    label: 'À confirmer (rédacteur)',
    icon: FileSignature,
    href: '/documents?status=REVIEW_APPROVED',
    tone: 'bordeaux',
  },
  {
    key: 'nearReviewDate',
    label: 'Revue annuelle proche',
    icon: CalendarClock,
    href: '/documents?sortBy=nextReviewDate&sortOrder=asc',
    tone: 'green',
  },
];

const TONE_CLASSES: Record<RowDef['tone'], { icon: string; value: string }> = {
  navy: { icon: 'text-seal-navy bg-seal-navy/10', value: 'text-seal-navy' },
  amber: { icon: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', value: 'text-amber-600' },
  orange: { icon: 'text-primary bg-primary/10', value: 'text-primary' },
  bordeaux: { icon: 'text-[#892034] bg-[#892034]/10', value: 'text-[#892034]' },
  green: { icon: 'text-[#006233] bg-[#006233]/10', value: 'text-[#006233]' },
};

export function GedDashboardWidget() {
  const [data, setData] = useState<GedSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get<GedSummary>('/documents/ged/my-summary');
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalActions = data
    ? data.myDrafts + data.myInReview + data.toApproveByMe + data.toConfirmByMe + data.nearReviewDate
    : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Ma GED</h3>
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                {loading ? '…' : `${totalActions} action${totalActions > 1 ? 's' : ''} requise${totalActions > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <Link
            href="/documents"
            className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Ouvrir <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : data ? (
          <ul className="space-y-1">
            {ROWS.map((row) => {
              const value = data[row.key];
              const Icon = row.icon;
              const tone = TONE_CLASSES[row.tone];
              return (
                <li key={row.key}>
                  <Link
                    href={row.href}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded ${tone.icon}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-xs text-seal-navy dark:text-slate-200">{row.label}</span>
                    </span>
                    <span className={`text-sm font-semibold ${value > 0 ? tone.value : 'text-gray-300 dark:text-slate-600'}`}>
                      {value}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-4">
            GED indisponible
          </p>
        )}
      </CardContent>
    </Card>
  );
}
