/**
 * Governance Debug Logger — Development-mode only.
 *
 * Logs rejected actions, conflict resolutions, and stability events.
 * Completely silent in production.
 *
 * Uses the centralized logger (which no-ops outside dev and forwards
 * warnings to Sentry in prod). `console.table`/`groupCollapsed` remain
 * as raw browser calls because they are dev-only visualization helpers
 * with no logger equivalent.
 */

import type { UIGovernedAction, UIConflict, UIStateLock } from './types';
import { logger } from '@/lib/logger';

const IS_DEV = process.env.NODE_ENV === 'development';
const PREFIX = '[UI-OS]';

export function logConflict(conflict: UIConflict): void {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `${PREFIX} Conflict on "${conflict.target}" — winner: ${conflict.winner.source}(${conflict.winner.priority})`,
  );
  // eslint-disable-next-line no-console
  console.table(conflict.actions.map(a => ({
    source: a.source,
    type: a.type,
    priority: a.priority,
    timestamp: new Date(a.timestamp).toLocaleTimeString(),
  })));
  logger.debug('Dropped:', conflict.dropped.length, 'actions');
  // eslint-disable-next-line no-console
  console.groupEnd();
}

export function logRejection(action: UIGovernedAction, reason: string): void {
  if (!IS_DEV) return;
  logger.warn(`${PREFIX} Rejected: ${action.source}→${action.target}`, { reason });
}

export function logStabilityLock(lock: UIStateLock): void {
  if (!IS_DEV) return;
  if (lock.active) {
    logger.warn(`${PREFIX} STABILITY LOCK: ${lock.reason}`, { allowedPriority: lock.allowedPriority });
  } else {
    logger.debug(`${PREFIX} Stability lock released`);
  }
}

export function logPipeline(input: number, afterConflict: number, afterStability: number, afterSafety: number): void {
  if (!IS_DEV) return;
  logger.debug(
    `${PREFIX} Pipeline: ${input} input → ${afterConflict} after conflicts → ${afterStability} after stability → ${afterSafety} approved`,
  );
}
