'use client';

/**
 * AI Mode Store — 4-level control system replacing boolean toggle.
 *
 * OFF:        No mutations, no suggestions.
 * ASSISTED:   Suggestions ON, mutations OFF (advisory only).
 * AUTO:       Current governed behavior (default).
 * AGGRESSIVE: Relaxed limits (5 mutations, faster adaptation).
 *
 * Persists to localStorage.
 */

import { create } from 'zustand';

export type AIMode = 'OFF' | 'ASSISTED' | 'AUTO' | 'AGGRESSIVE';

const STORAGE_KEY = 'omnitech_ai_mode';

function loadMode(): AIMode {
  if (typeof window === 'undefined') return 'AUTO';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && ['OFF', 'ASSISTED', 'AUTO', 'AGGRESSIVE'].includes(saved)) return saved as AIMode;
  return 'AUTO';
}

export interface AIModeConfig {
  suggestionsEnabled: boolean;
  mutationsEnabled: boolean;
  maxMutationsPerCycle: number;
  debounceMs: number;
}

export const MODE_CONFIGS: Record<AIMode, AIModeConfig> = {
  OFF:        { suggestionsEnabled: false, mutationsEnabled: false, maxMutationsPerCycle: 0, debounceMs: 300 },
  ASSISTED:   { suggestionsEnabled: true,  mutationsEnabled: false, maxMutationsPerCycle: 0, debounceMs: 300 },
  AUTO:       { suggestionsEnabled: true,  mutationsEnabled: true,  maxMutationsPerCycle: 3, debounceMs: 300 },
  AGGRESSIVE: { suggestionsEnabled: true,  mutationsEnabled: true,  maxMutationsPerCycle: 5, debounceMs: 150 },
};

interface AIModeState {
  mode: AIMode;
  config: AIModeConfig;
  setMode: (mode: AIMode) => void;
}

export const useAIModeStore = create<AIModeState>((set) => ({
  mode: loadMode(),
  config: MODE_CONFIGS[loadMode()],

  setMode: (mode) => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, mode);
    set({ mode, config: MODE_CONFIGS[mode] });
  },
}));
