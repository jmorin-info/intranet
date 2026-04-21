'use client';

/**
 * WikiOutline — Notion/Obsidian-like table of contents for wiki articles.
 *
 * Extracts H1/H2/H3 headings from a rendered article and renders:
 *   - a sticky right-hand panel on desktop (>= 1280px via `xl:` breakpoint),
 *   - a toggleable drawer / inline list on smaller screens.
 *
 * Active-section tracking uses IntersectionObserver: whenever a heading
 * crosses a top offset, it becomes the "active" entry. We fall back to
 * a manual scan on initial mount to cover the case where the user lands
 * already scrolled (e.g. anchor link).
 *
 * The component is purely presentational — it doesn't mutate article DOM.
 * The caller is responsible for injecting the `id` attributes on headings
 * (which the wiki already does inside WikiContent.tsx).
 */

import React, { useEffect, useRef, useState } from 'react';
import { List, X } from 'lucide-react';

export interface WikiOutlineEntry {
  /** Unique DOM id injected on the heading (e.g. `wiki-h-3`). */
  id: string;
  /** Plain-text content of the heading. */
  text: string;
  /** Heading level (1, 2 or 3). */
  level: number;
}

interface WikiOutlineProps {
  /** Flat list of headings extracted from the rendered article. */
  entries: WikiOutlineEntry[];
  /** Ref to the rendered article container, used for the scroll spy. */
  articleRef: React.RefObject<HTMLElement | null>;
  /** Optional pixel offset used by the scroll spy & scroll-to behaviour (default 96). */
  topOffset?: number;
  /** Optional className to further tweak the desktop sidebar container. */
  className?: string;
}

/**
 * Smooth-scrolls a heading into view, accounting for a sticky header offset.
 */
function scrollToHeading(id: string, offset: number): void {
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

/**
 * Public helper — exposed so callers that already compute their own HTML can
 * derive the outline data they need to pass in.
 *
 *   const { html, entries } = extractOutline(sanitizedHtml);
 */
export function extractOutline(html: string): {
  html: string;
  entries: WikiOutlineEntry[];
} {
  const entries: WikiOutlineEntry[] = [];
  let idx = 0;
  const out = html.replace(
    /<h([1-3])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_m, lvl: string, attrs: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, '').trim();
      const id = `wiki-h-${idx++}`;
      entries.push({ id, text, level: parseInt(lvl, 10) });
      return `<h${lvl}${attrs} id="${id}">${inner}</h${lvl}>`;
    },
  );
  return { html: out, entries };
}

export function WikiOutline({
  entries,
  articleRef,
  topOffset = 96,
  className = '',
}: WikiOutlineProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // --- Scroll spy via IntersectionObserver --------------------------------
  useEffect(() => {
    if (entries.length === 0) return;
    const root = articleRef.current;
    if (!root) return;

    const headings = Array.from(
      root.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]'),
    ).filter((h) => entries.some((e) => e.id === h.id));
    if (headings.length === 0) return;

    // Track which headings are currently "above the fold" (past the offset).
    const visibility = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entriesObs) => {
        for (const entry of entriesObs) {
          visibility.set(
            (entry.target as HTMLElement).id,
            entry.intersectionRatio,
          );
        }

        // Determine the closest heading above the top offset.
        let current: string | null = null;
        for (const h of headings) {
          const rect = h.getBoundingClientRect();
          if (rect.top - topOffset <= 0) {
            current = h.id;
          } else {
            break;
          }
        }
        // Fallback: if nothing is above, use the first visible one.
        if (!current) {
          const firstVisible = headings.find(
            (h) => (visibility.get(h.id) ?? 0) > 0,
          );
          if (firstVisible) current = firstVisible.id;
        }
        if (current) setActiveId(current);
      },
      {
        rootMargin: `-${topOffset}px 0px -60% 0px`,
        threshold: [0, 0.25, 0.5, 1],
      },
    );

    headings.forEach((h) => observer.observe(h));
    observerRef.current = observer;

    // Prime on mount so the first heading is highlighted.
    const firstAbove = headings.find(
      (h) => h.getBoundingClientRect().top - topOffset <= 0,
    );
    setActiveId(firstAbove?.id ?? headings[0]?.id ?? null);

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [entries, articleRef, topOffset]);

  if (entries.length < 2) return null;

  const handleClick = (id: string) => {
    scrollToHeading(id, topOffset);
    setDrawerOpen(false);
  };

  // Shared list markup
  const list = (
    <nav className="space-y-0.5">
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => handleClick(e.id)}
          className={`wiki-toc-item w-full text-left truncate ${
            activeId === e.id ? 'is-active' : ''
          }`}
          style={e.level === 3 ? { paddingLeft: 24 } : { paddingLeft: 12 }}
          title={e.text}
        >
          {e.text}
        </button>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop sticky outline — only on >= 1280px */}
      <aside
        className={`hidden xl:block w-60 flex-shrink-0 ${className}`}
        aria-label="Sommaire de l'article"
      >
        <div className="sticky top-20">
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-2 px-2">
              Sur cette page
            </p>
            {list}
          </div>
        </div>
      </aside>

      {/* Mobile / tablet floating toggle + drawer */}
      <button
        type="button"
        onClick={() => setDrawerOpen((v) => !v)}
        className="xl:hidden fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label="Ouvrir le sommaire"
      >
        <List className="h-5 w-5" />
      </button>

      {drawerOpen && (
        <div
          className="xl:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-2xl border-t border-gray-200 dark:border-slate-700 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400">
                Sur cette page
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 dark:text-slate-400"
                aria-label="Fermer le sommaire"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {list}
          </div>
        </div>
      )}
    </>
  );
}
