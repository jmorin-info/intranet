/**
 * Enterprise Copilot Layer — Unified entry point.
 *
 * Merges: context engine + action dispatcher + intelligence + automation.
 */

// Context awareness
export { getPageContext, getActionsForRole } from './context-engine';
export type { PageContext, PageAction, PageWorkflow } from './context-engine';

// Action execution
export { executeAction, executeSearch, detectActionIntent } from './action-dispatcher';
export type { ActionResult } from './action-dispatcher';

// Intelligence (re-export from intelligence layer)
export { generateInsights, getRoleConfig, generateAutomationHints } from '../intelligence';
export type { Insight, RoleConfig, AutomationHint } from '../intelligence';

// Usage tracking
export { trackPageView, trackFeatureUse, trackSearch, trackAction, getUsageSummary } from '../intelligence';
export type { UsageEvent, UsageSummary } from '../intelligence';
