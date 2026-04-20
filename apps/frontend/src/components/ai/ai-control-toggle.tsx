'use client';

/**
 * AI Control Toggle — 4-mode segmented control with impact stats.
 *
 * Modes: OFF | ASSISTED | AUTO | AGGRESSIVE
 * Shows impact metrics (clicks saved) when active.
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { useAIModeStore } from '@/lib/ui-os/control';
import type { AIMode } from '@/lib/ui-os/control';
import { useImpactStore } from '@/lib/ui-os/impact';
import { resetUIState } from '@/lib/ui-os/execution';

const MODE_LABELS: Record<AIMode, string> = {
  OFF: 'Off',
  ASSISTED: 'Assist',
  AUTO: 'Auto',
  AGGRESSIVE: 'Max',
};

export function AIControlToggle() {
  const { mode, setMode } = useAIModeStore();
  const clicksSaved = useImpactStore(s => s.totalClicksSaved);

  const handleModeChange = (newMode: AIMode) => {
    if (newMode === 'OFF') resetUIState();
    setMode(newMode);
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <Sparkles className={`h-3 w-3 flex-shrink-0 ${mode !== 'OFF' ? 'text-primary' : 'text-seal-gray-500/40'}`} />
      <div className="inline-flex items-center rounded-full border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-0.5">
        {(['OFF', 'ASSISTED', 'AUTO', 'AGGRESSIVE'] as AIMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeChange(m)}
            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all ${
              mode === m
                ? m === 'OFF'
                  ? 'bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-slate-200'
                  : m === 'AGGRESSIVE'
                    ? 'bg-red-500 text-white'
                    : 'bg-primary text-white'
                : 'text-seal-gray-500/60 dark:text-slate-500 hover:text-seal-gray-500 dark:hover:text-slate-300'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {mode !== 'OFF' && clicksSaved > 0 && (
        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
          +{clicksSaved} clics
        </span>
      )}
    </div>
  );
}
