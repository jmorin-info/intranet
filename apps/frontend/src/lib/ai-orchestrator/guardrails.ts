/**
 * Guardrails — Safety rules for UI orchestration.
 *
 * Prevents destructive, flickering, or confusing UI mutations.
 * Every UIActionPlan passes through guardrails before application.
 */

import type { UIActionPlan } from './types';

/** Maximum number of UI mutations per orchestration cycle */
const MAX_MUTATIONS_PER_CYCLE = 3;

/** Components that must NEVER be hidden */
const PROTECTED_TARGETS = new Set([
  'navigation',
  'sidebar',
  'header',
  'breadcrumb',
  'create-button',
  'logout',
]);

/**
 * Validate and filter UI action plans.
 * Removes unsafe actions, caps mutation count, ensures reversibility.
 *
 * @returns Safe subset of action plans.
 */
export function applyGuardrails(actions: UIActionPlan[]): UIActionPlan[] {
  return actions
    // Remove actions targeting protected components
    .filter(a => {
      if (a.type === 'HIDE_COMPONENT' && PROTECTED_TARGETS.has(a.target)) return false;
      return true;
    })
    // Ensure all actions are reversible
    .filter(a => a.reversible)
    // Sort by impact score (highest first)
    .sort((a, b) => b.impactScore - a.impactScore)
    // Cap at max mutations
    .slice(0, MAX_MUTATIONS_PER_CYCLE);
}
