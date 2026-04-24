'use client';

/**
 * Tiny row shown below the stats grid: three quick-shortcut pills (ticket,
 * signatures, support) and, on the right, a "last refreshed Xmin ago" hint.
 */

import React from 'react';
import Link from 'next/link';
import { MessageSquare, PenLine, Ticket } from 'lucide-react';

const PILLS = [
  {
    href: '/tickets?create=true',
    icon: Ticket,
    label: 'Ticket',
    title: 'Créer un ticket rapidement',
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300',
  },
  {
    href: '/signatures',
    icon: PenLine,
    label: 'Signatures',
    title: 'Voir les signatures en attente',
    color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300',
  },
  {
    href: '/helpdesk',
    icon: MessageSquare,
    label: 'Support',
    title: 'Contacter le support IT',
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300',
  },
] as const;

interface DashboardFooterShortcutsProps {
  lastLoadedAt: Date | null;
  loading: boolean;
}

export function DashboardFooterShortcuts({ lastLoadedAt, loading }: DashboardFooterShortcutsProps) {
  const diffLabel = (() => {
    if (!lastLoadedAt || loading) return null;
    const diffMin = Math.floor((Date.now() - lastLoadedAt.getTime()) / 60000);
    return diffMin < 1 ? "À l'instant" : `Il y a ${diffMin} min`;
  })();

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 -mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PILLS.map(({ href, icon: Icon, label, title, color }) => (
          <Link key={href} href={href} title={title}>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-[10px] font-semibold ${color} hover:opacity-80 transition cursor-pointer`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </span>
          </Link>
        ))}
      </div>
      {diffLabel && <p className="text-[10px] text-seal-gray-500/70 dark:text-slate-500">{diffLabel}</p>}
    </div>
  );
}

export default DashboardFooterShortcuts;
