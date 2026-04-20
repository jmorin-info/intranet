/**
 * UI OS Governance — Type Definitions
 *
 * Phase 11.5: Central governance layer that arbitrates all UI mutations
 * from Phases 9 (suggestions), 10 (insights), and 11 (orchestrator).
 *
 * No UI mutation reaches the rendering layer without governance approval.
 */

/** Which subsystem produced this action */
export type UISource =
  | 'AI_ORCHESTRATOR'   // Phase 11 — highest AI priority
  | 'UX_INSIGHTS'       // Phase 10 — medium priority
  | 'AI_SUGGESTIONS'    // Phase 9  — lowest AI priority
  | 'STATIC_UI';        // Phase 8  — base UI, always allowed

/** Priority levels (strict hierarchy) */
export type UIActionPriority =
  | 'CRITICAL'   // Safety: guardrails, navigation protection
  | 'HIGH'       // AI Orchestrator decisions
  | 'MEDIUM'     // UX Insights recommendations
  | 'LOW';       // AI Suggestions

/** Numeric weight for comparison */
export const PRIORITY_WEIGHT: Record<UIActionPriority, number> = {
  CRITICAL: 100,
  HIGH: 75,
  MEDIUM: 50,
  LOW: 25,
};

/** A governed UI action that has passed through the governance pipeline */
export interface UIGovernedAction {
  id: string;
  source: UISource;
  type: string;
  target: string;
  priority: UIActionPriority;
  timestamp: number;
  /** Whether the governance engine approved this action */
  approved?: boolean;
  /** Reason for rejection (if not approved) */
  rejectionReason?: string;
}

/** A detected conflict between two or more actions targeting the same element */
export interface UIConflict {
  target: string;
  actions: UIGovernedAction[];
  /** The winning action after resolution */
  winner: UIGovernedAction;
  /** Actions that were dropped */
  dropped: UIGovernedAction[];
}

/** Global UI stability lock */
export interface UIStateLock {
  active: boolean;
  reason: string;
  module?: string;
  /** When active, only CRITICAL actions are allowed */
  allowedPriority: UIActionPriority;
}

/** Targets that can NEVER be hidden or disabled */
export const HARD_LOCKED_TARGETS = new Set([
  'navigation',
  'sidebar',
  'header',
  'breadcrumb',
  'create-button',
  'logout',
  'back-button',
]);
