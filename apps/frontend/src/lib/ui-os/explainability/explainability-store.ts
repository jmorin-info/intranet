'use client';

/**
 * Explainability Store — Holds active explanation messages.
 *
 * Messages auto-expire after 5s. Deduplicates by target within a 5s window.
 * Max 3 visible at once.
 */

import { create } from 'zustand';
import type { ExplainabilityMessage } from './message-builder';

const MAX_VISIBLE = 3;
const DEDUP_WINDOW_MS = 5_000;

interface ExplainabilityState {
  messages: ExplainabilityMessage[];
  add: (msg: ExplainabilityMessage) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useExplainabilityStore = create<ExplainabilityState>((set, get) => ({
  messages: [],

  add: (msg) => {
    const existing = get().messages;
    // Deduplicate: skip if same target already has a message within 5s
    const hasDuplicate = existing.some(
      m => m.target === msg.target && (msg.timestamp - m.timestamp) < DEDUP_WINDOW_MS,
    );
    if (hasDuplicate) return;

    // Add and cap at MAX_VISIBLE
    const updated = [...existing, msg].slice(-MAX_VISIBLE);
    set({ messages: updated });

    // Auto-dismiss after 5s
    setTimeout(() => {
      set(state => ({
        messages: state.messages.filter(m => m.id !== msg.id),
      }));
    }, 5_000);
  },

  dismiss: (id) =>
    set(state => ({ messages: state.messages.filter(m => m.id !== id) })),

  clear: () => set({ messages: [] }),
}));
