'use client';

/**
 * AI Explainability Hints — Floating stack of brief explanations.
 *
 * Shows WHY the AI adapted the UI. Bottom-right corner, auto-dismiss.
 * Non-intrusive: small, transparent, disappears after 5s.
 */

import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { useExplainabilityStore } from '@/lib/ui-os/explainability';
import { useAIModeStore } from '@/lib/ui-os/control';

export function AIExplainabilityHints() {
  const messages = useExplainabilityStore(s => s.messages);
  const dismiss = useExplainabilityStore(s => s.dismiss);
  const mutationsEnabled = useAIModeStore(s => s.config.mutationsEnabled);

  if (!mutationsEnabled || messages.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs pointer-events-none">
      {messages.map(msg => (
        <div
          key={msg.id}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-primary/20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg px-3 py-2 animate-fade-in-up"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-navy dark:text-white">{msg.message}</p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{msg.reason}</p>
          </div>
          <button
            onClick={() => dismiss(msg.id)}
            className="p-0.5 rounded text-seal-gray-500/40 hover:text-seal-gray-500 transition flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
