/**
 * Mutation Mapper — Pure deterministic mapping from governance-approved
 * actions to UI state mutations.
 *
 * Each mapping is a pure function: (action, target) → state patch.
 * No side effects. No DOM access. No external calls.
 */

import type { UIState, UIVisibility, UIEmphasis, UIDensity } from './ui-state-store';

export interface StatePatch {
  density?: UIDensity;
  visibility?: Partial<UIVisibility>;
  emphasis?: Partial<UIEmphasis>;
  layout?: { maxWidth?: UIState['layout']['maxWidth'] };
}

/**
 * Map a governance-approved action to a UI state patch.
 * Returns null if the action/target combination has no mapping.
 */
export function mapActionToMutation(
  actionType: string,
  target: string,
): StatePatch | null {
  // ── COLLAPSE actions ──────────────────────────────────────────
  if (actionType === 'COLLAPSE' || actionType === 'HIDE_COMPONENT') {
    switch (target) {
      case 'secondary-panels':
        return { visibility: { secondaryPanels: false } };
      case 'analytics-widgets':
        return { visibility: { analyticsWidgets: false } };
      case 'recent-entities':
        return { visibility: { recentEntities: false } };
      default:
        return null;
    }
  }

  // ── SHOW actions ──────────────────────────────────────────────
  if (actionType === 'SHOW_COMPONENT') {
    switch (target) {
      case 'secondary-panels':
        return { visibility: { secondaryPanels: true } };
      case 'analytics-widgets':
        return { visibility: { analyticsWidgets: true } };
      case 'recent-entities':
        return { visibility: { recentEntities: true } };
      case 'advanced-filters':
        return { visibility: { secondaryPanels: true } };
      default:
        return null;
    }
  }

  // ── PROMOTE actions ───────────────────────────────────────────
  if (actionType === 'PROMOTE' || actionType === 'PROMOTE_ACTION') {
    switch (target) {
      case 'status-dropdown':
        return { emphasis: { statusDropdown: true } };
      case 'approval-actions':
        return { emphasis: { primaryAction: true } };
      case 'action-feedback':
        return { emphasis: { primaryAction: true } };
      case 'navigation-hints':
        return { emphasis: { primaryAction: true } };
      default:
        return null;
    }
  }

  // ── SIMPLIFY actions ──────────────────────────────────────────
  if (actionType === 'SIMPLIFY' || actionType === 'SIMPLIFY_VIEW') {
    switch (target) {
      case 'widget-density':
        return { density: 'compact' };
      case 'secondary-panels':
        return { density: 'compact', visibility: { secondaryPanels: false } };
      default:
        return { density: 'compact' };
    }
  }

  // ── BULK MODE ─────────────────────────────────────────────────
  if (actionType === 'ENABLE_BULK_MODE') {
    return { emphasis: { bulkMode: true } };
  }

  // ── AUTO FOCUS ────────────────────────────────────────────────
  if (actionType === 'AUTO_FOCUS') {
    if (target === 'search-input') {
      return { emphasis: { searchFocus: true } };
    }
    return null;
  }

  return null;
}
