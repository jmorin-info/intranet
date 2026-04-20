/**
 * UI Rewriter — Converts UIActionPlans into OrchestrationState hints.
 *
 * NON-DESTRUCTIVE: produces layout hints that React components
 * consume via context/props. Never touches the DOM directly.
 */

import type { UIActionPlan, OrchestrationState, EMPTY_STATE } from './types';

/**
 * Convert a list of action plans into orchestration hints.
 * These hints are consumed by AIOrchestratedLayout and individual components.
 */
export function rewrite(actions: UIActionPlan[]): OrchestrationState['hints'] {
  const hints: OrchestrationState['hints'] = {
    bulkModeEnabled: false,
    searchFocused: false,
    simplifiedView: false,
    promotedActions: [],
    hiddenSections: [],
  };

  for (const action of actions) {
    switch (action.type) {
      case 'ENABLE_BULK_MODE':
        hints.bulkModeEnabled = true;
        break;
      case 'AUTO_FOCUS':
        if (action.target === 'search-input') hints.searchFocused = true;
        break;
      case 'SIMPLIFY_VIEW':
        hints.simplifiedView = true;
        hints.hiddenSections.push(action.target);
        break;
      case 'PROMOTE_ACTION':
        hints.promotedActions.push(action.target);
        break;
      case 'HIDE_COMPONENT':
        hints.hiddenSections.push(action.target);
        break;
      case 'SHOW_COMPONENT':
        // Remove from hidden if it was there
        hints.hiddenSections = hints.hiddenSections.filter(s => s !== action.target);
        break;
      case 'PIN_WIDGET':
        hints.promotedActions.push(action.target);
        break;
    }
  }

  return hints;
}
