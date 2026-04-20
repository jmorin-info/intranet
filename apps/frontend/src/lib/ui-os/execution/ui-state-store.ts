'use client';

/**
 * UI State Store — Global reactive UI state powered by Zustand.
 *
 * This is the ONLY place where adaptive UI mutations are stored.
 * Components read from this store to apply visibility, density,
 * emphasis, and layout changes.
 *
 * Default state = current UI (zero regression on init).
 * Reset returns to default on navigation or STABLE mode.
 */

import { create } from 'zustand';

export interface UIVisibility {
  sidebar: boolean;
  secondaryPanels: boolean;
  analyticsWidgets: boolean;
  recentEntities: boolean;
}

export interface UIEmphasis {
  primaryAction: boolean;
  statusDropdown: boolean;
  searchFocus: boolean;
  bulkMode: boolean;
}

export interface UILayout {
  maxWidth: 'default' | 'expanded' | 'full';
}

export type UIDensity = 'compact' | 'default' | 'comfortable';

export interface UIState {
  density: UIDensity;
  visibility: UIVisibility;
  emphasis: UIEmphasis;
  layout: UILayout;
}

interface UIStateActions {
  /** Apply a partial state update (batched by React) */
  patch: (partial: Partial<UIState>) => void;
  /** Patch only visibility */
  patchVisibility: (partial: Partial<UIVisibility>) => void;
  /** Patch only emphasis */
  patchEmphasis: (partial: Partial<UIEmphasis>) => void;
  /** Reset to default (call on navigation / STABLE mode) */
  reset: () => void;
}

const DEFAULT_STATE: UIState = {
  density: 'default',
  visibility: {
    sidebar: true,
    secondaryPanels: true,
    analyticsWidgets: true,
    recentEntities: true,
  },
  emphasis: {
    primaryAction: false,
    statusDropdown: false,
    searchFocus: false,
    bulkMode: false,
  },
  layout: {
    maxWidth: 'default',
  },
};

export const useUIStateStore = create<UIState & UIStateActions>((set) => ({
  ...DEFAULT_STATE,

  patch: (partial) =>
    set((state) => ({ ...state, ...partial })),

  patchVisibility: (partial) =>
    set((state) => ({
      visibility: { ...state.visibility, ...partial },
    })),

  patchEmphasis: (partial) =>
    set((state) => ({
      emphasis: { ...state.emphasis, ...partial },
    })),

  reset: () => set(DEFAULT_STATE),
}));
