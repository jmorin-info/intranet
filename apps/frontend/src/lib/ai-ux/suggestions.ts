/**
 * AI UX Suggestion Generator
 *
 * Runs all heuristics against the current behavioral profile
 * and returns the top N suggestions above the confidence threshold.
 */

import { aiContext } from './context-store';
import { ALL_HEURISTICS } from './heuristics';
import type { AISuggestion } from './types';

const MIN_CONFIDENCE = 0.6;
const MAX_SUGGESTIONS = 3;

/**
 * Generate suggestions based on current session behavior.
 * Called after every event processing cycle.
 *
 * @returns Up to 3 suggestions sorted by confidence (desc).
 */
export function generateSuggestions(): AISuggestion[] {
  const ctx = aiContext.getContext();
  const { profile, activeModule } = ctx;

  // Run all heuristics and collect candidates
  const candidates: AISuggestion[] = [];
  for (const heuristic of ALL_HEURISTICS) {
    const results = heuristic(profile, activeModule);
    candidates.push(...results);
  }

  // Filter by confidence threshold, deduplicate by label, sort by confidence
  const seen = new Set<string>();
  const filtered = candidates
    .filter(s => {
      if (s.confidence < MIN_CONFIDENCE) return false;
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SUGGESTIONS);

  // Update context store
  aiContext.setSuggestions(filtered);

  return filtered;
}
