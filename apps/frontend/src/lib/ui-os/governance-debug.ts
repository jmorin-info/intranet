/**
 * Governance Debug Logger — Development-mode only.
 *
 * Logs rejected actions, conflict resolutions, and stability events.
 * Completely silent in production.
 */

import type { UIGovernedAction, UIConflict, UIStateLock } from './types';

const IS_DEV = process.env.NODE_ENV === 'development';
const PREFIX = '[UI-OS]';

export function logConflict(conflict: UIConflict): void {
  if (!IS_DEV) return;
  console.groupCollapsed(
    `${PREFIX} Conflict on "${conflict.target}" — winner: ${conflict.winner.source}(${conflict.winner.priority})`,
  );
  console.table(conflict.actions.map(a => ({
    source: a.source,
    type: a.type,
    priority: a.priority,
    timestamp: new Date(a.timestamp).toLocaleTimeString(),
  })));
  console.log('Dropped:', conflict.dropped.length, 'actions');
  console.groupEnd();
}

export function logRejection(action: UIGovernedAction, reason: string): void {
  if (!IS_DEV) return;
  console.warn(`${PREFIX} Rejected: ${action.source}→${action.target} (${reason})`);
}

export function logStabilityLock(lock: UIStateLock): void {
  if (!IS_DEV) return;
  if (lock.active) {
    console.warn(`${PREFIX} STABILITY LOCK: ${lock.reason} (only ${lock.allowedPriority}+ allowed)`);
  } else {
    console.info(`${PREFIX} Stability lock released`);
  }
}

export function logPipeline(input: number, afterConflict: number, afterStability: number, afterSafety: number): void {
  if (!IS_DEV) return;
  console.info(
    `${PREFIX} Pipeline: ${input} input → ${afterConflict} after conflicts → ${afterStability} after stability → ${afterSafety} approved`,
  );
}
