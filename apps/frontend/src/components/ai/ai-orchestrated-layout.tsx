'use client';

/**
 * AIOrchestratedLayout — Adaptive layout wrapper.
 *
 * Wraps page sections and applies visibility/priority hints
 * from the AI orchestrator. Never destroys children — only
 * controls CSS visibility and order.
 *
 * Usage:
 *   <AIOrchestratedLayout module="TICKETS" hints={hints}>
 *     <Section id="filters" ... />
 *     <Section id="table" ... />
 *   </AIOrchestratedLayout>
 */

import React from 'react';
import type { OrchestrationState } from '@/lib/ai-orchestrator';

interface AIOrchestratedLayoutProps {
  /** Current module context */
  module: string;
  /** Orchestration hints from useAIOrchestrator */
  hints: OrchestrationState['hints'];
  /** Child sections */
  children: React.ReactNode;
}

/**
 * Wraps children and applies orchestration hints as CSS classes.
 * Does NOT modify the React tree — only adds conditional classes.
 */
export function AIOrchestratedLayout({
  hints,
  children,
}: AIOrchestratedLayoutProps) {
  return (
    <div
      className={`transition-all duration-200 ${hints.simplifiedView ? 'ai-simplified' : ''}`}
      data-ai-bulk={hints.bulkModeEnabled || undefined}
      data-ai-simplified={hints.simplifiedView || undefined}
    >
      {children}
    </div>
  );
}

/**
 * Utility: check if a section should be hidden by orchestrator.
 * Use in individual components:
 *
 *   if (isHiddenByOrchestrator('analytics-widgets', hints)) return null;
 */
export function isHiddenByOrchestrator(
  sectionId: string,
  hints: OrchestrationState['hints'],
): boolean {
  return hints.hiddenSections.includes(sectionId);
}

/**
 * Utility: check if an action should be promoted.
 */
export function isPromotedByOrchestrator(
  actionId: string,
  hints: OrchestrationState['hints'],
): boolean {
  return hints.promotedActions.includes(actionId);
}
