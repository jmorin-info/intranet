'use client';

/**
 * CitationChip — Feature 5 du polish RAG.
 *
 * Chip cliquable avec popover (hover + focus + tap mobile) exposant :
 *  - Titre de la source
 *  - Extrait 100-150 chars (tronqué sur espace)
 *  - Icône du type (DOCUMENT / WIKI / PROCEDURE / RUNBOOK / FAQ)
 *  - Badge classification si connu
 *  - Score de confiance
 *  - Bouton ExternalLink pour ouvrir la source dans un onglet
 *
 * Accessibilité : `aria-haspopup`, `aria-expanded`, fermeture Escape, focus
 * ramené au chip à la fermeture.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { ClassificationBadge } from '@/components/ui/classification-badge';
import {
  SOURCE_LABEL,
  SOURCE_ROUTE,
  citationTitle,
  scoreToConfidence,
  truncateSnippet,
} from './citation-parser';
import type { RagCitation, RagSourceType } from './types';

const ICONS: Record<RagSourceType, React.ElementType> = {
  DOCUMENT: FileText,
  WIKI: BookOpen,
  PROCEDURE: ClipboardList,
  RUNBOOK: AlertTriangle,
  FAQ: HelpCircle,
};

const TONE_CLASSES: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface CitationChipProps {
  citation: RagCitation;
  /** Index 1-based affiché dans le chip (optionnel). */
  index?: number;
  /** Permet au parent de fermer les autres popovers (une seule à la fois). */
  onOpenChange?: (open: boolean) => void;
}

export function CitationChip({ citation, index, onOpenChange }: CitationChipProps) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const Icon = ICONS[citation.sourceType] ?? FileText;
  const title = citationTitle(citation);
  const snippet = truncateSnippet(citation.snippet, 100, 150);
  const confidence = scoreToConfidence(citation.score);
  const route = SOURCE_ROUTE[citation.sourceType](citation.sourceId);

  const setOpenWithNotify = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenWithNotify(false), 120);
  }, [setOpenWithNotify]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenWithNotify(false);
        chipRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpenWithNotify]);

  // Click outside closes popover
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        chipRef.current &&
        !chipRef.current.contains(target)
      ) {
        setOpenWithNotify(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, setOpenWithNotify]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <span className="relative inline-block">
      <button
        ref={chipRef}
        type="button"
        onMouseEnter={() => {
          cancelClose();
          setOpenWithNotify(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpenWithNotify(true)}
        onBlur={scheduleClose}
        onClick={() => setOpenWithNotify(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Source ${index ?? ''} — ${SOURCE_LABEL[citation.sourceType]} ${title}`}
        className="inline-flex items-center gap-1 rounded-full border border-seal-blue/30 bg-seal-blue/10 px-2 py-0.5 text-[11px] font-semibold text-seal-blue hover:bg-seal-blue/20 focus:outline-none focus:ring-2 focus:ring-seal-blue/40 dark:border-seal-blue/40 dark:bg-seal-blue/20 dark:text-seal-blue transition-colors"
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {index != null && <span>{index}</span>}
        <span className="max-w-[140px] truncate">{title}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Aperçu de la source ${title}`}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-seal-lg dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-start gap-2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-seal-blue/10 text-seal-blue dark:bg-seal-blue/20">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-seal-blue">
                  {SOURCE_LABEL[citation.sourceType]}
                </span>
                {citation.classification && (
                  <ClassificationBadge level={citation.classification} size="xs" />
                )}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-navy dark:text-white truncate">
                {title}
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-slate-400">
            {snippet}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASSES[confidence.tone]}`}
              title={`Score de retrieval : ${confidence.percent}%`}
            >
              Confiance {confidence.label} ({confidence.percent}%)
            </span>
            <a
              href={route}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-seal-blue px-2 py-1 text-[11px] font-semibold text-white hover:bg-seal-blue/90 focus:outline-none focus:ring-2 focus:ring-seal-blue/40 transition-colors"
              aria-label={`Ouvrir ${title} dans un nouvel onglet`}
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              Ouvrir
            </a>
          </div>
        </div>
      )}
    </span>
  );
}
