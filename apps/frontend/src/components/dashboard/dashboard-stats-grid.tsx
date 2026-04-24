'use client';

/**
 * Dashboard — stats grid.
 *
 * Renders two different grids depending on the viewer:
 * - Admin / Super-admin: 6 metric cards (documents, approved, in-review,
 *   pending, overdue, signatures) with a trend indicator.
 * - Non-admin: up to 5 action-oriented CTA cards derived from the same stats.
 *
 * Card data is produced by `buildStatCards` / `buildActionCards` helpers so
 * this module stays pure presentation.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, Skeleton } from '@omnitech/ui';
import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  buildActionCards,
  buildStatCards,
  type ActionCard as ActionCardType,
  type DashboardStats,
  type StatCard as StatCardType,
} from './dashboard-stats-cards';

export type { DashboardStats } from './dashboard-stats-cards';

interface DashboardStatsGridProps {
  stats: DashboardStats | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
}

export function DashboardStatsGrid({ stats, loading, isAdmin, isManager }: DashboardStatsGridProps) {
  const { t } = useTranslation();

  const statCards = useMemo(() => buildStatCards({ stats, isManager, t }), [stats, isManager, t]);
  const actionCards = useMemo(() => (isAdmin ? [] : buildActionCards(stats)), [isAdmin, stats]);

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
        {isAdmin ? 'Indicateurs' : 'Actions rapides'}
      </p>
      <div
        className={`grid gap-3 ${
          isAdmin
            ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
            : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
        }`}
      >
        {loading
          ? Array.from({ length: isAdmin ? 6 : 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="py-3">
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))
          : isAdmin
            ? statCards.map((c) => <StatCard key={c.label} card={c} />)
            : actionCards.map((c) => <ActionCard key={c.label} card={c} />)}
      </div>
    </div>
  );
}

function StatCard({ card }: { card: StatCardType }) {
  const Icon = card.icon;
  const TrendIcon =
    card.trend?.direction === 'up' ? TrendingUp : card.trend?.direction === 'down' ? TrendingDown : Minus;
  const trendColor =
    card.trend?.direction === 'up'
      ? 'text-emerald-500'
      : card.trend?.direction === 'down'
        ? 'text-red-500'
        : 'text-seal-gray-500/50';

  const inner = (
    <Card
      hoverable={!!card.href}
      className={`h-full bg-gradient-to-br ${card.gradient} dark:from-transparent shadow-sm rounded-xl ${
        card.href ? 'cursor-pointer hover:shadow-md hover:ring-1 hover:ring-primary/20 transition-shadow' : 'cursor-default'
      }`}
    >
      <CardContent className="py-4 px-5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`h-8 w-8 rounded-lg ${card.bg} dark:bg-opacity-20 flex items-center justify-center`}>
            <Icon className={`h-4 w-4 ${card.color}`} />
          </div>
          <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 truncate flex-1">{card.label}</p>
          {card.trend && card.trend.direction !== 'flat' && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${trendColor}`}
              title={`${card.trend.direction === 'up' ? '+' : '-'}${card.trend.delta} vs periode precedente`}
            >
              <TrendIcon className="h-3 w-3" />
              {card.trend.delta}
            </span>
          )}
        </div>
        <p className="text-2xl font-medium text-seal-navy dark:text-white tabular-nums">{card.value}</p>
        {card.subtext && <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5 truncate">{card.subtext}</p>}
        {!card.subtext && card.value === 0 && <p className="text-[10px] text-seal-gray-500">Rien à signaler</p>}
      </CardContent>
    </Card>
  );

  return card.href ? (
    <Link href={card.href} className="stagger-item">
      {inner}
    </Link>
  ) : (
    <div className="stagger-item">{inner}</div>
  );
}

function ActionCard({ card }: { card: ActionCardType }) {
  const Icon = card.icon;
  return (
    <Link href={card.href} className="stagger-item group">
      <Card
        hoverable
        className={`h-full bg-gradient-to-br ${card.gradient} dark:from-transparent shadow-sm rounded-xl cursor-pointer hover:shadow-md hover:ring-1 hover:ring-primary/20 transition-all`}
      >
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`h-8 w-8 rounded-lg ${card.bg} dark:bg-opacity-20 flex items-center justify-center`}>
              <Icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 truncate flex-1">{card.label}</p>
          </div>
          <p className="text-2xl font-medium text-seal-navy dark:text-white tabular-nums">{card.value}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <p className={`text-xs font-semibold ${card.color}`}>{card.cta}</p>
            <ArrowRight className={`h-3.5 w-3.5 ${card.color} transition-transform group-hover:translate-x-0.5`} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default DashboardStatsGrid;
