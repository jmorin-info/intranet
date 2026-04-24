/**
 * UI Mutation Engine — Converts governance-approved actions into
 * real Zustand state mutations. Batches updates. Prevents flicker.
 *
 * This is the ONLY code path that writes to UIStateStore.
 */

import type { UIGovernedAction } from '../types';
import { logger } from '@/lib/logger';
import { useUIStateStore } from './ui-state-store';
import { useAIModeStore } from '../control/ai-mode-store';
import { explainActions } from '../explainability';
import { perceptionGuard } from '../perception';
import { useImpactStore } from '../impact';
import { mapActionToMutation } from './mutation-mapper';
import type { StatePatch } from './mutation-mapper';

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Apply a batch of governance-approved actions through the full Phase 14 pipeline:
 *
 *   Governance-approved → Explainability → Perception Guard → Impact → Mutation
 *
 * GATED by AI mode: OFF = no mutations, ASSISTED = suggestions only.
 */
export function applyUIMutations(actions: UIGovernedAction[], module?: string): void {
  if (actions.length === 0) return;

  // Phase 14: Mode-based gate (replaces boolean toggle)
  const { config } = useAIModeStore.getState();
  if (!config.mutationsEnabled) return;

  // Phase 14: Explainability (non-blocking — runs even if perception blocks)
  explainActions(actions);

  // Phase 14: Perception guard (CAN block)
  const safeActions = perceptionGuard.filter(actions);
  if (safeActions.length === 0) return;

  const store = useUIStateStore.getState();

  // Collect all patches
  const patches: StatePatch[] = [];
  for (const action of safeActions) {
    const patch = mapActionToMutation(action.type, action.target);
    if (patch) {
      patches.push(patch);
      // Phase 14: Record perception shift
      perceptionGuard.recordShift(action.target);
      // Phase 14: Record impact
      useImpactStore.getState().recordImpact(action.type, module);
      if (IS_DEV) {
        logger.debug(`[UI-EXEC] ${action.type}→${action.target} applied`);
      }
    }
  }

  if (patches.length === 0) return;

  // Merge all patches into a single state update
  const merged = {
    density: store.density,
    visibility: { ...store.visibility },
    emphasis: { ...store.emphasis },
    layout: { ...store.layout },
  };

  for (const patch of patches) {
    if (patch.density) merged.density = patch.density;
    if (patch.visibility) Object.assign(merged.visibility, patch.visibility);
    if (patch.emphasis) Object.assign(merged.emphasis, patch.emphasis);
    if (patch.layout) Object.assign(merged.layout, patch.layout);
  }

  // Single Zustand set call = single React render
  useUIStateStore.setState(merged);
}

/**
 * Reset UI state to defaults.
 * Call on: module navigation, STABLE mode activation, logout.
 */
export function resetUIState(): void {
  useUIStateStore.getState().reset();
}
