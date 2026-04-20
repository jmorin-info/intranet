'use client';

/**
 * AI Suggestion Bar — Non-intrusive, passive chip bar
 *
 * Displays max 3 contextual suggestions based on user behavior.
 * Auto-fades after 10s of inactivity. Reappears on new suggestions.
 *
 * Rules:
 *  - NEVER blocks UI
 *  - NEVER uses modals
 *  - Suggestions are passive chips (click to act)
 *  - Confidence < 0.6 → hidden (handled upstream)
 */

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAIModeStore } from '@/lib/ui-os/control';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  History,
  Layers,
  Plus,
  UserPlus,
  X,
} from 'lucide-react';
import type { AISuggestion } from '@/lib/ai-ux';

const ICON_MAP: Record<string, React.ElementType> = {
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  History,
  Layers,
  Plus,
  UserPlus,
};

interface AISuggestionBarProps {
  suggestions: AISuggestion[];
}

export function AISuggestionBar({ suggestions }: AISuggestionBarProps) {
  const suggestionsEnabled = useAIModeStore(s => s.config.suggestionsEnabled);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(true);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset dismiss + visibility when suggestions change
  useEffect(() => {
    if (suggestions.length > 0) {
      setDismissed(false);
      setVisible(true);
      // Auto-fade after 10s
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => setVisible(false), 10_000);
    }
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [suggestions]);

  if (!suggestionsEnabled || suggestions.length === 0 || dismissed) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 px-3 py-2 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
      }`}
      onMouseEnter={() => {
        // Keep visible on hover
        setVisible(true);
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      }}
      onMouseLeave={() => {
        // Restart fade timer on mouse leave
        fadeTimerRef.current = setTimeout(() => setVisible(false), 10_000);
      }}
    >
      <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="text-[11px] font-semibold text-primary dark:text-primary-light flex-shrink-0">
        Suggestions
      </span>

      <div className="flex items-center gap-1.5 overflow-x-auto">
        {suggestions.map((s) => {
          const Icon = (s.icon && ICON_MAP[s.icon]) || ArrowRight;

          if (s.href) {
            return (
              <Link
                key={s.id}
                href={s.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1 text-[11px] font-medium text-navy dark:text-white hover:border-primary/50 hover:bg-primary/5 transition-all whitespace-nowrap"
              >
                <Icon className="h-3 w-3 text-primary" />
                {s.label}
              </Link>
            );
          }

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => s.action?.()}
              className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1 text-[11px] font-medium text-navy dark:text-white hover:border-primary/50 hover:bg-primary/5 transition-all whitespace-nowrap"
            >
              <Icon className="h-3 w-3 text-primary" />
              {s.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto p-1 rounded text-taupe/50 hover:text-taupe hover:bg-gray-100 dark:hover:bg-slate-700 transition flex-shrink-0"
        aria-label="Masquer"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
