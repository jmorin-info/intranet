'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';

export interface StatusOption {
  /** Status value key (e.g. "OPEN", "IN_REVIEW") */
  value: string;
  /** Display label */
  label: string;
  /** Lucide icon component (optional) */
  icon?: React.ElementType;
  /** Tailwind color class for the icon */
  iconColor?: string;
  /** Background + text classes for the badge when this status is active */
  badgeBg?: string;
  badgeText?: string;
}

export interface StatusAction {
  /** Unique key for this action (can differ from status value, e.g. "reject-review") */
  key: string;
  /** Display label */
  label: string;
  /** Lucide icon component */
  icon?: React.ElementType;
  /** Tailwind color class for the icon */
  iconColor?: string;
}

interface InlineStatusDropdownProps {
  /** Current status value */
  current: string;
  /** Full list of possible statuses (used to render the active badge) */
  statuses: StatusOption[];
  /** Actions available from the current state. If empty, badge is non-interactive. */
  actions: StatusAction[];
  /** Called when an action is selected */
  onAction: (actionKey: string) => void;
  /** Whether the dropdown is interactive (false = read-only badge) */
  interactive?: boolean;
}

/**
 * Unified inline status dropdown — shared by tickets, documents, incidents.
 *
 * Renders a clickable status badge that opens a dropdown with available transitions.
 * Pattern: click badge → dropdown → select action → handler called.
 */
export function InlineStatusDropdown({
  current,
  statuses,
  actions,
  onAction,
  interactive = true,
}: InlineStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const config = statuses.find(s => s.value === current);
  const canInteract = interactive && actions.length > 0;
  const Icon = config?.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => canInteract && setOpen(o => !o)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
          canInteract ? 'cursor-pointer hover:ring-2 hover:ring-primary/30' : 'cursor-default'
        } ${config?.badgeBg || 'bg-gray-100 dark:bg-slate-800'} ${config?.badgeText || 'text-gray-700 dark:text-slate-300'}`}
      >
        {Icon && <Icon className="h-3 w-3" />}
        {config?.label || current}
        {canInteract && (
          <ChevronDown className={`h-3 w-3 ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 animate-fade-in-up">
          {actions.map(action => {
            const ActionIcon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => { setOpen(false); onAction(action.key); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                {ActionIcon && <ActionIcon className={`h-3.5 w-3.5 ${action.iconColor || 'text-seal-gray-500'}`} />}
                <span className="text-seal-navy dark:text-white">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
