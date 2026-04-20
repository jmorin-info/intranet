'use client';

/**
 * AI Control Store — User-controllable AI toggle.
 *
 * Provides a global ON/OFF switch for the adaptive UI system.
 * When OFF: no mutations are applied, suggestions hidden, orchestrator disabled.
 * Persists to localStorage so the preference survives reload.
 *
 * Addresses: EXPLAINABILITY + USER CONTROL gaps.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'omnitech_ai_ux_enabled';

function loadPreference(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === null ? true : saved === 'true';
}

interface AIControlState {
  /** Whether the AI adaptive UI is enabled */
  aiEnabled: boolean;
  /** Total mutations applied this session */
  totalMutations: number;
  /** Total resets this session */
  totalResets: number;
  /** Mutations per module this session */
  mutationsPerModule: Record<string, number>;

  /** Toggle AI on/off */
  toggleAI: () => void;
  /** Set AI state explicitly */
  setAIEnabled: (enabled: boolean) => void;
  /** Increment mutation counter */
  recordMutation: (module?: string) => void;
  /** Increment reset counter */
  recordReset: () => void;
}

export const useAIControlStore = create<AIControlState>((set) => ({
  aiEnabled: loadPreference(),
  totalMutations: 0,
  totalResets: 0,
  mutationsPerModule: {},

  toggleAI: () =>
    set((state) => {
      const next = !state.aiEnabled;
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, String(next));
      return { aiEnabled: next };
    }),

  setAIEnabled: (enabled) => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, String(enabled));
    set({ aiEnabled: enabled });
  },

  recordMutation: (module) =>
    set((state) => ({
      totalMutations: state.totalMutations + 1,
      mutationsPerModule: {
        ...state.mutationsPerModule,
        ...(module ? { [module]: (state.mutationsPerModule[module] || 0) + 1 } : {}),
      },
    })),

  recordReset: () =>
    set((state) => ({ totalResets: state.totalResets + 1 })),
}));
