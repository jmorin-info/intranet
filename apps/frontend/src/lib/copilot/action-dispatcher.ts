/**
 * Action Dispatcher — Executes copilot actions via router navigation.
 *
 * The copilot can trigger UI actions like:
 * - Navigate to a page
 * - Open a creation form (via query params)
 * - Prefill a search query
 *
 * All actions are UI-only (router.push). No direct API mutations.
 */

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { PageAction } from './context-engine';

export interface ActionResult {
  success: boolean;
  message: string;
}

/**
 * Execute a copilot action via the Next.js router.
 */
export function executeAction(
  action: PageAction,
  router: AppRouterInstance,
): ActionResult {
  if (!action.href) {
    return { success: false, message: 'Cette action n\'a pas de destination.' };
  }

  let url = action.href;

  // Append query params if present
  if (action.queryParams && Object.keys(action.queryParams).length > 0) {
    const params = new URLSearchParams(action.queryParams);
    url += (url.includes('?') ? '&' : '?') + params.toString();
  }

  try {
    if (action.routerAction === 'replace') {
      router.replace(url);
    } else {
      router.push(url);
    }
    // Hard fallback: if router.push doesn't navigate within 500ms,
    // force with window.location (catches hydration edge cases)
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        if (window.location.pathname !== url.split('?')[0]) {
          window.location.href = url;
        }
      }, 500);
    }
    return { success: true, message: `Navigation vers ${action.label}` };
  } catch {
    // Router failed completely — force navigation
    if (typeof window !== 'undefined') window.location.href = url;
    return { success: false, message: 'Navigation forcée.' };
  }
}

/**
 * Execute a search action — navigate to search page with prefilled query.
 */
export function executeSearch(
  query: string,
  router: AppRouterInstance,
): ActionResult {
  router.push(`/search?q=${encodeURIComponent(query)}`);
  return { success: true, message: `Recherche : "${query}"` };
}

/**
 * Parse a copilot text response to detect inline action intents.
 * Returns the action ID if the response suggests executing one.
 */
export function detectActionIntent(response: string): string | null {
  const patterns: Array<[RegExp, string]> = [
    [/créer un document/i, 'create-doc'],
    [/nouveau document/i, 'create-doc'],
    [/créer un ticket/i, 'create-ticket'],
    [/ouvrir un ticket/i, 'create-ticket'],
    [/déclarer.*incident/i, 'declare-incident'],
    [/file de validation/i, 'view-pending'],
    [/journal d'audit/i, 'audit-log'],
    [/gérer.*utilisateur/i, 'manage-users'],
    [/conformité/i, 'view-compliance'],
    [/configuration/i, 'config'],
  ];

  for (const [pattern, actionId] of patterns) {
    if (pattern.test(response)) return actionId;
  }
  return null;
}
