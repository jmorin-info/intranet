'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

interface AdminCountsState {
  ldapPendingCount: number;
  workflowPendingCount: number;
  lastFetchedAt: number;
  fetchLdap: () => Promise<void>;
  fetchWorkflows: () => Promise<void>;
  fetchAll: () => Promise<void>;
  startPolling: (intervalMs?: number) => () => void;
}

// Singleton guard — prevents double-polling
let activeInterval: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

/**
 * Centralized admin counts store — single source of truth for
 * LDAP pending count + workflow pending count.
 * Polling is ref-counted: first caller starts, last cleanup stops.
 */
export const useAdminCountsStore = create<AdminCountsState>((set, get) => ({
  ldapPendingCount: 0,
  workflowPendingCount: 0,
  lastFetchedAt: 0,

  fetchLdap: async () => {
    try {
      const { data } = await api.get('/ldap/pending/count');
      const count = typeof data === 'number' ? data : data?.count ?? 0;
      set({ ldapPendingCount: Number(count) || 0, lastFetchedAt: Date.now() });
    } catch {
      // silently ignore — sidebar/widget will show 0
    }
  },

  fetchWorkflows: async () => {
    try {
      const { data } = await api.get('/approval-workflows/pending/me');
      const arr = Array.isArray(data) ? data : data?.items ?? [];
      set({ workflowPendingCount: arr.length, lastFetchedAt: Date.now() });
    } catch {
      // silently ignore
    }
  },

  fetchAll: async () => {
    await Promise.all([get().fetchLdap(), get().fetchWorkflows()]);
  },

  startPolling: (intervalMs = 60_000) => {
    refCount++;
    if (!activeInterval) {
      get().fetchAll();
      activeInterval = setInterval(() => get().fetchAll(), intervalMs);
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
