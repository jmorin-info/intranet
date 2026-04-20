/**
 * UI OS Governance — Public API
 */

export { governanceEngine } from './governance-engine';
export { stabilityController } from './stability-controller';
export { resolvePriority } from './priority-resolver';
export { resolveConflicts } from './conflict-resolver';
export type {
  UIGovernedAction,
  UISource,
  UIActionPriority,
  UIConflict,
  UIStateLock,
} from './types';
export { HARD_LOCKED_TARGETS, PRIORITY_WEIGHT } from './types';
