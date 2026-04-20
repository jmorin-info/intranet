/**
 * Explainability Engine — Converts governance-approved actions
 * into user-facing explanation messages.
 *
 * Called AFTER governance, BEFORE mutation execution.
 * Non-blocking: even if message building fails, execution proceeds.
 */

import type { UIGovernedAction } from '../types';
import { PRIORITY_WEIGHT } from '../types';
import { buildMessage } from './message-builder';
import { useExplainabilityStore } from './explainability-store';

/**
 * Generate and store explanation messages for approved actions.
 * @param actions — Governance-approved actions about to be executed.
 */
export function explainActions(actions: UIGovernedAction[]): void {
  const store = useExplainabilityStore.getState();

  for (const action of actions) {
    const confidence = PRIORITY_WEIGHT[action.priority] / 100;
    const msg = buildMessage(action.type, action.target, confidence);
    if (msg) {
      store.add(msg);
    }
  }
}
