'use client';

import { create } from 'zustand';
import { DocumentStatus, DocumentCategory } from '@omnitech/shared';

interface DocumentFilters {
  status?: DocumentStatus;
  category?: DocumentCategory;
  classification?: string;
  isoControlCode?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page: number;
  limit: number;
}

interface DocumentState {
  filters: DocumentFilters;
  pendingCount: number;
  setFilters: (filters: Partial<DocumentFilters>) => void;
  resetFilters: () => void;
  setPendingCount: (count: number) => void;
  decrementPendingCount: () => void;
}

const defaultFilters: DocumentFilters = {
  page: 1,
  limit: 20,
  sortBy: 'updatedAt',
  sortOrder: 'desc',
};

export const useDocumentStore = create<DocumentState>((set) => ({
  filters: defaultFilters,
  pendingCount: 0,

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),

  resetFilters: () => set({ filters: defaultFilters }),

  setPendingCount: (count) => set({ pendingCount: count }),

  decrementPendingCount: () => set((state) => ({ pendingCount: Math.max(0, state.pendingCount - 1) })),
}));
