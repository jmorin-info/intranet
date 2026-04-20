'use client';

/**
 * <SmartFilterBar />
 * ==================
 *
 * Barre de recherche "IA" qui accepte du langage naturel et émet un
 * `SmartFilter` structuré via `onFilter`. Affiche les chips extraits.
 *
 * Purement client — parser local dans `@/lib/smart-filter`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  parseSmartFilter,
  smartFilterToChips,
  type SmartFilter,
} from '@/lib/smart-filter';

interface SmartFilterBarProps {
  placeholder?: string;
  initialValue?: string;
  onFilter: (filter: SmartFilter, raw: string) => void;
  suggestions?: string[];
  className?: string;
}

const DEFAULT_SUGGESTIONS = [
  'mes tickets ouverts cette semaine',
  'incidents critiques aujourd\'hui',
  'documents à revoir ce mois',
];

export function SmartFilterBar({
  placeholder = 'Essayez : "mes tickets ouverts cette semaine"',
  initialValue = '',
  onFilter,
  suggestions = DEFAULT_SUGGESTIONS,
  className,
}: SmartFilterBarProps) {
  const [raw, setRaw] = useState(initialValue);
  const [focused, setFocused] = useState(false);

  const filter = useMemo(() => parseSmartFilter(raw), [raw]);
  const chips = useMemo(() => smartFilterToChips(filter), [filter]);

  useEffect(() => {
    onFilter(filter, raw);
  }, [filter, raw, onFilter]);

  return (
    <div className={className}>
      <div
        className={`relative flex items-center gap-2 rounded-xl border bg-white dark:bg-slate-900 px-3 py-2 transition ${
          focused
            ? 'border-primary shadow-sm ring-2 ring-primary/15'
            : 'border-gray-200 dark:border-slate-700'
        }`}
      >
        <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none text-navy dark:text-white placeholder:text-taupe/60 dark:placeholder:text-slate-500"
          aria-label="Recherche intelligente"
        />
        {raw && (
          <button
            type="button"
            onClick={() => setRaw('')}
            className="flex-shrink-0 rounded-md p-1 text-taupe hover:bg-gray-100 dark:hover:bg-slate-800"
            aria-label="Effacer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 dark:bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary"
            >
              {c.label}
            </span>
          ))}
        </div>
      )}

      {focused && !raw && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setRaw(s);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] text-taupe dark:text-slate-400 hover:bg-primary/10 hover:text-primary transition"
            >
              <Sparkles className="h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartFilterBar;
