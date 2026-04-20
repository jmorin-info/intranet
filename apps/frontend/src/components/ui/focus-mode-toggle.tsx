'use client';

import React from 'react';
import { Focus, LayoutGrid } from 'lucide-react';
import { useFocusModeStore } from '@/stores/focus-mode-store';

export function FocusModeToggle() {
  const { mode, toggle } = useFocusModeStore();
  const isFocus = mode === 'FOCUS';

  return (
    <button
      onClick={toggle}
      className={
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold ' +
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
        'focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ' +
        (isFocus
          ? 'text-seal-blue dark:text-seal-orange bg-seal-blue/10 dark:bg-seal-orange/10 ' +
            'hover:bg-seal-blue/20 dark:hover:bg-seal-orange/20'
          : 'text-seal-gray-500 dark:text-slate-400 ' +
            'hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-blue dark:hover:text-seal-orange')
      }
      title={isFocus ? 'Quitter le mode focus' : 'Mode focus : une tache, zero distraction'}
      aria-label={isFocus ? 'Quitter le mode focus' : 'Activer le mode focus'}
      aria-pressed={isFocus}
    >
      <span className="relative">
        {isFocus ? (
          <Focus className="h-4 w-4" />
        ) : (
          <LayoutGrid className="h-4 w-4" />
        )}
        {isFocus && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-seal-blue dark:bg-seal-orange ring-2 ring-white dark:ring-slate-900 animate-pulse"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="hidden lg:inline">
        {isFocus ? 'Focus' : 'Normal'}
      </span>
    </button>
  );
}
