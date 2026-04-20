'use client';

import React from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BulkAction {
  label: string;
  icon?: LucideIcon;
  variant?: 'default' | 'destructive';
  onClick: () => void;
  disabled?: boolean;
}

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
  label?: string;
}

/**
 * Floating bottom action bar for bulk selection.
 * Appears when selectedCount > 0. Mirrors the app's navy / primary palette.
 */
export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  actions,
  label,
}: BulkActionsBarProps) {
  if (selectedCount <= 0) return null;

  const displayLabel =
    label ??
    `${selectedCount} élément${selectedCount > 1 ? 's' : ''} sélectionné${selectedCount > 1 ? 's' : ''}`;

  return (
    <div
      role="toolbar"
      aria-label="Actions groupées"
      className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-200"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-navy dark:bg-slate-900 px-5 py-3 text-white shadow-2xl ring-1 ring-primary/30 backdrop-blur-sm">
        <span className="text-sm font-semibold whitespace-nowrap">
          {displayLabel}
        </span>

        <span className="h-5 w-px bg-white/20" aria-hidden="true" />

        <div className="flex items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const isDestructive = action.variant === 'destructive';
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy disabled:opacity-50 disabled:cursor-not-allowed',
                  isDestructive
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white',
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                {action.label}
              </button>
            );
          })}
        </div>

        <span className="h-5 w-px bg-white/20" aria-hidden="true" />

        <button
          type="button"
          onClick={onClearSelection}
          aria-label="Désélectionner tout"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Désélectionner
        </button>
      </div>
    </div>
  );
}
