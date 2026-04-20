'use client';

/**
 * CitationsList — rendu groupé des citations RAG (Feature 5).
 *
 * Remplace l'ancienne liste UL verticale. Affiche une ligne d'intro
 * ("N sources") + une rangée de `CitationChip` inline wrap-flex.
 */

import React from 'react';
import { CitationChip } from './citation-chip';
import type { RagCitation } from './types';

interface CitationsListProps {
  citations: RagCitation[];
}

export function CitationsList({ citations }: CitationsListProps) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
      <div className="text-xs uppercase font-semibold text-seal-gray-500 mb-2">
        Sources ({citations.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {citations.map((c, i) => (
          <CitationChip
            key={`${c.sourceId}-${c.chunkIndex}`}
            citation={c}
            index={i + 1}
          />
        ))}
      </div>
    </div>
  );
}
