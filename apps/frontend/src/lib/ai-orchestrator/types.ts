/**
 * AI UX Orchestrator — Type Definitions
 *
 * Phase 11: Deterministic UI intelligence layer.
 * Converts user behavior patterns into concrete UI adaptations.
 */

export type OrchestratorModule = 'TICKETS' | 'DOCUMENTS' | 'INCIDENTS' | 'DASHBOARD';

export type UserIntent =
  | 'DO_BULK_ACTIONS'
  | 'NAVIGATE_FAST'
  | 'SEARCH_INTENT'
  | 'WORKFLOW_HEAVY'
  | 'CONFUSION'
  | 'EXPERT_USAGE'
  | 'EXPLORATION_MODE'
  | 'REVIEW_MODE'
  | 'IDLE';

export interface IntentSignal {
  module: OrchestratorModule;
  intent: UserIntent;
  /** 0.0 to 1.0 */
  confidence: number;
  /** Human-readable evidence strings */
  evidence: string[];
}

export type UIActionType =
  | 'PROMOTE_ACTION'
  | 'SHOW_COMPONENT'
  | 'HIDE_COMPONENT'
  | 'ENABLE_BULK_MODE'
  | 'AUTO_FOCUS'
  | 'SIMPLIFY_VIEW'
  | 'PIN_WIDGET';

export interface UIActionPlan {
  id: string;
  type: UIActionType;
  /** CSS selector, component name, or layout zone key */
  target: string;
  /** 0.0 to 1.0 — higher = more impactful */
  impactScore: number;
  /** Whether the change can be undone without reload */
  reversible: boolean;
  /** Why this action was chosen */
  reason: string;
}

export interface OrchestrationState {
  /** Detected intent signals for the current module */
  intents: IntentSignal[];
  /** UI action plans to apply */
  actions: UIActionPlan[];
  /** Active layout hints (consumed by AIOrchestratedLayout) */
  hints: {
    bulkModeEnabled: boolean;
    searchFocused: boolean;
    simplifiedView: boolean;
    promotedActions: string[];
    hiddenSections: string[];
  };
  /** Last computation timestamp */
  updatedAt: number;
}

export const EMPTY_STATE: OrchestrationState = {
  intents: [],
  actions: [],
  hints: {
    bulkModeEnabled: false,
    searchFocused: false,
    simplifiedView: false,
    promotedActions: [],
    hiddenSections: [],
  },
  updatedAt: 0,
};
