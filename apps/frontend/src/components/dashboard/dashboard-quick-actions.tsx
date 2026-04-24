'use client';

/**
 * Dashboard — "Mes tâches" / Actions requises hero block.
 *
 * Aggregates every actionable item waiting for the viewer (P1 alerts, docs to
 * approve/review, chartes, signatures, tickets, notifications). When the list
 * is empty, renders an "All clear" card instead.
 *
 * Row data is produced by `buildTaskRows` (see `./dashboard-quick-actions-config`)
 * so the JSX stays focused on layout. The backing data hook
 * `useActionsRequises` lives in `./use-actions-requises` and is re-exported
 * here for import ergonomics.
 */

import React from 'react';
import Link from 'next/link';
import { Badge, Card, CardContent } from '@omnitech/ui';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import {
  useActionsRequises,
  type ActionItem,
  type MyTasks,
} from './use-actions-requises';
import {
  buildTaskRows,
  type TaskRowConfig,
  type Urgency,
} from './dashboard-quick-actions-config';

export { useActionsRequises };
export type { ActionItem, MyTasks };

interface DashboardQuickActionsProps {
  actions: ActionItem[];
  actionsLoaded: boolean;
  myTasks: MyTasks | null;
  firstName?: string;
}

export function DashboardQuickActions({ actions, actionsLoaded, myTasks, firstName }: DashboardQuickActionsProps) {
  const hasMyTasks =
    myTasks &&
    (myTasks.pendingSignatures > 0 ||
      myTasks.docsToReview > 0 ||
      myTasks.unreadNotifications > 0 ||
      myTasks.unsignedChartes > 0);
  const hasAction = actions.some((a) =>
    ['ticket', 'alerte', 'approuver'].some((keyword) => a.label.includes(keyword)),
  );
  const hasContent = hasMyTasks || hasAction;

  if (!hasContent && !actionsLoaded && !myTasks) return null;
  if (!hasContent && (actionsLoaded || myTasks)) return <AllClearCard firstName={firstName} />;

  const rows = buildTaskRows({ actions, myTasks });

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">Mes tâches</p>
      <Card className="border-l-4 border-l-amber-400">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Actions requises</h3>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rows.map((row) => (
              <TaskRow key={row.label} row={row} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AllClearCard({ firstName }: { firstName?: string }) {
  const hour = new Date().getHours();
  const greet =
    hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonne matinée' : hour < 18 ? 'Bon après-midi' : 'Bonne soirée';
  return (
    <Card className="border-l-4 border-l-emerald-400 bg-gradient-to-r from-emerald-50/60 to-transparent dark:from-emerald-900/10">
      <CardContent className="py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              {greet}
              {firstName ? `, ${firstName}` : ''} — tout est à jour !
            </p>
            <p className="mt-0.5 text-xs text-seal-gray-500 dark:text-slate-400">
              Aucune action en attente de votre part. Profitez de ce moment pour explorer la veille, rédiger une procédure ou consulter un wiki.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            À jour
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

const URGENCY_BG: Record<Urgency, string> = {
  critical: 'bg-red-100 dark:bg-red-900/30 ring-1 ring-red-300 dark:ring-red-700',
  urgent: 'bg-red-50 dark:bg-red-900/20',
  info: '',
};

const INFO_VARIANT_BG: Record<TaskRowConfig['variant'], string> = {
  error: 'bg-red-50 dark:bg-red-900/20',
  warning: 'bg-amber-50 dark:bg-amber-900/20',
  info: 'bg-blue-50 dark:bg-blue-900/20',
  navy: 'bg-violet-50 dark:bg-violet-900/20',
};

function TaskRow({ row }: { row: TaskRowConfig }) {
  const Icon = row.icon;
  const CtaIcon = row.ctaIcon;
  const containerClass = row.urgency === 'info' ? INFO_VARIANT_BG[row.variant] : URGENCY_BG[row.urgency];

  return (
    <div className={`p-2 rounded-lg text-xs ${containerClass}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${row.iconColor}`} />
          <span className="font-medium text-seal-navy dark:text-white">{row.label}</span>
          <Badge variant={row.variant}>{row.count}</Badge>
          {row.showUrgentBadge && (
            <span className="text-[9px] font-bold text-red-600 uppercase tracking-wide animate-pulse">Urgent</span>
          )}
        </span>
        <Link
          href={row.href}
          className={`inline-flex items-center gap-1 rounded-md ${row.ctaClass} text-white px-2 py-1 text-[10px] font-semibold transition`}
        >
          {row.cta} <CtaIcon className="h-3 w-3" />
        </Link>
      </div>
      {row.details && row.details.length > 0 && (
        <div className="mt-1.5 pl-5 space-y-0.5">
          {row.details.map((d) =>
            row.detailsClickable ? (
              <Link
                key={d.id}
                href={d.href}
                className="block text-[11px] text-seal-navy/80 dark:text-slate-300 hover:text-primary truncate"
              >
                → {d.title}
              </Link>
            ) : (
              <span key={d.id} className="block text-[11px] text-seal-navy/80 dark:text-slate-300 truncate">
                → {d.title}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export default DashboardQuickActions;
