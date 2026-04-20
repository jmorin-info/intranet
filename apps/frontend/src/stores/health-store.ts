'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

interface HealthState {
  status: 'ok' | 'error' | null;
  data: Record<string, unknown> | null;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  startPolling: (intervalMs?: number) => () => void;
}

// Singleton guard — prevents double-polling when multiple components call startPolling()
let activeInterval: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

/**
 * Centralized health store — single source of truth for /health endpoint.
 * Polling is ref-counted: first caller starts, last cleanup stops.
 */
export const useHealthStore = create<HealthState>((set, get) => ({
  status: null,
  data: null,
  lastFetchedAt: 0,

  fetch: async () => {
    try {
      const { data } = await api.get('/health');
      set({ status: data?.status === 'ok' ? 'ok' : 'error', data, lastFetchedAt: Date.now() });
    } catch {
      set({ status: 'error', lastFetchedAt: Date.now() });
    }
  },

  startPolling: (intervalMs = 30_000) => {
    refCount++;
    if (!activeInterval) {
      get().fetch();
      activeInterval = setInterval(() => get().fetch(), intervalMs);
    }
    return () => {
      refCount--;
      if (refCount <= 0 && activeInterval) {
        clearInterval(activeInterval);
        activeInterval = null;
        refCount = 0;
      }
    };
  },
}));
