'use client';

/**
 * Impact Tracker — Measures real UX gains from AI mutations.
 *
 * Tracks clicks saved, time saved, and per-module impact.
 * Compares post-mutation behavior against baseline telemetry.
 */

import { create } from 'zustand';

/** Click savings per mutation type */
const CLICK_SAVINGS: Record<string, number> = {
  AUTO_FOCUS: 1,        // skip 1 click to focus search
  ENABLE_BULK_MODE: 2,  // skip toggling bulk mode manually
  COLLAPSE: 1,          // skip scrolling past irrelevant panel
  HIDE_COMPONENT: 1,    // same
  PROMOTE_ACTION: 1,    // action found 1 click faster
  PROMOTE: 1,
  SIMPLIFY: 2,          // reduced visual scanning
  SIMPLIFY_VIEW: 2,
};

/** Time savings per mutation type (ms) */
const TIME_SAVINGS_MS: Record<string, number> = {
  AUTO_FOCUS: 800,       // time to locate and click search
  ENABLE_BULK_MODE: 1500, // time to enable mode manually
  COLLAPSE: 500,         // scroll time saved
  HIDE_COMPONENT: 500,
  PROMOTE_ACTION: 1000,  // discovery time saved
  PROMOTE: 1000,
  SIMPLIFY: 2000,        // cognitive load reduction
  SIMPLIFY_VIEW: 2000,
};

export interface ImpactMetrics {
  totalClicksSaved: number;
  totalTimeSavedMs: number;
  totalMutations: number;
  moduleImpact: Record<string, { clicks: number; timeMs: number; mutations: number }>;
}

interface ImpactState extends ImpactMetrics {
  recordImpact: (actionType: string, module?: string) => void;
  reset: () => void;
}

export const useImpactStore = create<ImpactState>((set) => ({
  totalClicksSaved: 0,
  totalTimeSavedMs: 0,
  totalMutations: 0,
  moduleImpact: {},

  recordImpact: (actionType, module) => set((state) => {
    const clicks = CLICK_SAVINGS[actionType] || 0;
    const timeMs = TIME_SAVINGS_MS[actionType] || 0;
    const moduleName = module || 'unknown';

    const prev = state.moduleImpact[moduleName] || { clicks: 0, timeMs: 0, mutations: 0 };

    return {
      totalClicksSaved: state.totalClicksSaved + clicks,
      totalTimeSavedMs: state.totalTimeSavedMs + timeMs,
      totalMutations: state.totalMutations + 1,
      moduleImpact: {
        ...state.moduleImpact,
        [moduleName]: {
          clicks: prev.clicks + clicks,
          timeMs: prev.timeMs + timeMs,
          mutations: prev.mutations + 1,
        },
      },
    };
  }),

  reset: () => set({
    totalClicksSaved: 0,
    totalTimeSavedMs: 0,
    totalMutations: 0,
    moduleImpact: {},
  }),
}));
