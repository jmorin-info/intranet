/**
 * AI UX Context Store — In-Memory Session State
 *
 * Tracks user behavior within the current browser session.
 * Resets on page reload / logout. No persistence.
 * Fed by the Phase 7 event bus.
 */

import type { AIContext, TrackedAction, BehaviorProfile } from './types';

const MAX_ACTIONS = 30;
const BURST_WINDOW_MS = 30_000; // 30 seconds
const BURST_THRESHOLD = 3;

class AIContextStore {
  private ctx: AIContext = {
    actions: [],
    profile: this.emptyProfile(),
    activeModule: 'dashboard',
    suggestions: [],
    lastSuggestionUpdate: 0,
  };

  private emptyProfile(): BehaviorProfile {
    return {
      actionCounts: {},
      recentEntityIds: [],
      recentModules: [],
      patterns: {
        burstMode: false,
        repeatedStatusChanges: 0,
        contextSwitchCount: 0,
      },
    };
  }

  /** Record a new user action and recompute the behavioral profile */
  trackAction(action: TrackedAction): void {
    // Append to ring buffer
    this.ctx.actions.push(action);
    if (this.ctx.actions.length > MAX_ACTIONS) {
      this.ctx.actions.shift();
    }

    // Recompute profile
    this.ctx.profile = this.computeProfile();
  }

  /** Update which module the user is currently viewing */
  setActiveModule(module: string): void {
    if (module !== this.ctx.activeModule) {
      this.ctx.activeModule = module;
      // Track module switch for context-switch detection
      this.ctx.profile.recentModules.push(module);
      if (this.ctx.profile.recentModules.length > 10) {
        this.ctx.profile.recentModules.shift();
      }
    }
  }

  /** Store the latest suggestions */
  setSuggestions(suggestions: AIContext['suggestions']): void {
    this.ctx.suggestions = suggestions;
    this.ctx.lastSuggestionUpdate = Date.now();
  }

  /** Get current context (read-only snapshot) */
  getContext(): Readonly<AIContext> {
    return this.ctx;
  }

  /** Reset everything (call on logout) */
  reset(): void {
    this.ctx = {
      actions: [],
      profile: this.emptyProfile(),
      activeModule: 'dashboard',
      suggestions: [],
      lastSuggestionUpdate: 0,
    };
  }

  // ── Private: profile computation ──────────────────────────────

  private computeProfile(): BehaviorProfile {
    const actions = this.ctx.actions;
    const now = Date.now();

    // Action counts
    const actionCounts: Record<string, number> = {};
    for (const a of actions) {
      const key = `${a.entity}:${a.eventType}`;
      actionCounts[key] = (actionCounts[key] || 0) + 1;
    }

    // Recent entity IDs (deduplicated, last 10)
    const seenIds = new Set<string>();
    const recentEntityIds: string[] = [];
    for (let i = actions.length - 1; i >= 0 && recentEntityIds.length < 10; i--) {
      const id = actions[i]!.entityId;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        recentEntityIds.push(id);
      }
    }

    // Burst detection: >3 actions within 30s window
    const recentActions = actions.filter(a => now - a.timestamp < BURST_WINDOW_MS);
    const burstMode = recentActions.length >= BURST_THRESHOLD;

    // Repeated status changes
    const statusChanges = actions.filter(a => a.eventType === 'STATUS_CHANGED');
    const recentStatusChanges = statusChanges.filter(a => now - a.timestamp < 120_000);

    // Context switch detection: module changes in last 5 actions
    let contextSwitchCount = 0;
    for (let i = 1; i < Math.min(actions.length, 5); i++) {
      if (actions[actions.length - i]!.module !== actions[actions.length - i - 1]?.module) {
        contextSwitchCount++;
      }
    }

    return {
      actionCounts,
      recentEntityIds,
      recentModules: this.ctx.profile.recentModules,
      patterns: {
        burstMode,
        repeatedStatusChanges: recentStatusChanges.length,
        contextSwitchCount,
      },
    };
  }
}

/** Singleton context store */
export const aiContext = new AIContextStore();
