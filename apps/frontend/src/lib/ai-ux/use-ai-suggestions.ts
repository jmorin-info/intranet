'use client';

/**
 * React hook: provides AI suggestions for the current module.
 *
 * Subscribes to the event bus, feeds events into the analyzer,
 * regenerates suggestions on every confirmed event, and returns
 * the current suggestion list.
 *
 * Usage:
 *   const suggestions = useAISuggestions('tickets');
 */

import { useState, useEffect, useRef } from 'react';
import { useEventSubscription } from '@/lib/events';
import { initEventAnalyzer } from './event-analyzer';
import { aiContext } from './context-store';
import { generateSuggestions } from './suggestions';
import type { AISuggestion } from './types';

export function useAISuggestions(activeModule: string): AISuggestion[] {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const initialized = useRef(false);

  // Initialize event analyzer once
  useEffect(() => {
    if (!initialized.current) {
      initEventAnalyzer();
      initialized.current = true;
    }
  }, []);

  // Track active module
  useEffect(() => {
    aiContext.setActiveModule(activeModule);
    // Regenerate suggestions when module changes
    setSuggestions(generateSuggestions());
  }, [activeModule]);

  // Regenerate suggestions on every confirmed event
  useEventSubscription('*', (event) => {
    if (event.metadata?.optimistic) return;
    if (event.type === 'ROLLBACK') return;
    // Debounce: only regenerate if >200ms since last update
    const now = Date.now();
    const ctx = aiContext.getContext();
    if (now - ctx.lastSuggestionUpdate < 200) return;
    setSuggestions(generateSuggestions());
  });

  return suggestions;
}
