'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Focus, X, Maximize2, Minimize2 } from 'lucide-react';
import { useFocusModeStore } from '@/stores/focus-mode-store';

/**
 * Focus Mode — Two modes:
 * 1. Alt press → toggle full-page focus (hides sidebar/header, centers main)
 * 2. Alt+Click on any card/section → focus just that element (clone in overlay)
 *
 * Press Alt again or Esc to exit either mode.
 * Elements in the focused view are INTERACTIVE.
 */

function findFocusableParent(el: HTMLElement): HTMLElement | null {
  const main = el.closest('main');
  if (!main) return null;

  let node: HTMLElement | null = el;
  while (node && node !== main) {
    const cls = node.getAttribute('class') || '';
    const tag = node.tagName;
    const rect = node.getBoundingClientRect();

    // 1. Card-like class names with minimum height
    const hasCardClass =
      cls.includes('card') ||
      cls.includes('Card') ||
      cls.includes('rounded-card') ||
      cls.includes('rounded-xl') ||
      cls.includes('rounded-lg');
    if (hasCardClass && rect.height > 50) return node;

    // 2. Semantic block elements
    if (tag === 'ARTICLE' || tag === 'SECTION' || tag === 'DETAILS') return node;

    // 3. ARIA landmark/dialog roles
    const role = node.getAttribute('role') || '';
    if (role === 'article' || role === 'region' || role === 'dialog') return node;

    // 4. Direct grid child that is visible and tall enough
    const parentCls = node.parentElement?.getAttribute('class') || '';
    if (parentCls.includes('grid') && rect.height > 50 && rect.width > 0) return node;

    // 5. Table rows and list items with height > 40px
    if ((tag === 'TR' || tag === 'LI') && rect.height > 40) return node;

    node = node.parentElement;
  }

  // 6. Fallback: direct child of <main> with height > 80px
  if (main) {
    let candidate: HTMLElement | null = el;
    while (candidate && candidate.parentElement !== main) {
      candidate = candidate.parentElement;
    }
    if (candidate && candidate !== main) {
      const rect = candidate.getBoundingClientRect();
      if (rect.height > 80) return candidate;
    }
  }

  return null;
}

export function FocusMode() {
  const [mode, setMode] = useState<'off' | 'page' | 'element'>('off');
  const cloneRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLElement | null>(null);
  const lastToggle = useRef(0);
  const storeMode = useFocusModeStore((s) => s.mode);
  const storeActivate = useFocusModeStore((s) => s.activate);
  const storeDeactivate = useFocusModeStore((s) => s.deactivate);

  const exit = useCallback(() => {
    setMode('off');
    document.body.classList.remove('focus-mode-active');
    document.body.classList.remove('focus-mode-store-active');
    if (cloneRef.current) cloneRef.current.innerHTML = '';
    sourceRef.current = null;
    storeDeactivate();
  }, [storeDeactivate]);

  const enterPageMode = useCallback(() => {
    setMode('page');
    document.body.classList.add('focus-mode-active');
    document.body.classList.add('focus-mode-store-active');
    if (cloneRef.current) cloneRef.current.innerHTML = '';
    sourceRef.current = null;
    storeActivate();
  }, [storeActivate]);

  // Sync: when the store mode changes externally (e.g. toggle button), enter/exit page mode
  useEffect(() => {
    if (storeMode === 'FOCUS' && mode === 'off') {
      enterPageMode();
    } else if (storeMode === 'NORMAL' && mode !== 'off') {
      // Store went to NORMAL externally — exit without re-calling storeDeactivate
      setMode('off');
      document.body.classList.remove('focus-mode-active');
      document.body.classList.remove('focus-mode-store-active');
      if (cloneRef.current) cloneRef.current.innerHTML = '';
      sourceRef.current = null;
    }
  }, [storeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const enterElementMode = useCallback((el: HTMLElement) => {
    document.body.classList.remove('focus-mode-active');
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.cssText = 'position:static;margin:0;transform:none;opacity:1;max-width:100%;width:100%;';
    // Keep interactivity — don't disable pointerEvents on the clone
    if (cloneRef.current) {
      cloneRef.current.innerHTML = '';
      cloneRef.current.appendChild(clone);
      // Restore scroll position inside the clone to match the source element
      const sourceScrollables = el.querySelectorAll<HTMLElement>('*');
      const cloneScrollables = cloneRef.current.querySelectorAll<HTMLElement>('*');
      sourceScrollables.forEach((src, i) => {
        const dst = cloneScrollables[i];
        if (dst && (src.scrollTop || src.scrollLeft)) {
          dst.scrollTop = src.scrollTop;
          dst.scrollLeft = src.scrollLeft;
        }
      });
    }
    sourceRef.current = el;
    setMode('element');
  }, []);

  // Alt key = toggle page focus / exit element focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { exit(); return; }
      if (e.key !== 'Alt' || e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      const now = Date.now();
      if (now - lastToggle.current < 300) return;
      lastToggle.current = now;

      if (mode === 'off') enterPageMode();
      else exit();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, exit, enterPageMode]);

  // Alt+Click on an element → focus that element.
  // NOTE: Alt+Click sur un <a href> interne est géré en priorité par
  // GlanceOverlay (capture phase, registered earlier). On skippe donc ici
  // les événements qui ciblent un <a>, pour laisser Glance ouvrir son panneau.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!e.altKey) return;
      const el = e.target as HTMLElement;
      // Si le clic est sur un lien, Glance prend le relais → ne rien faire.
      if (el.closest?.('a[href]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      if (el.closest('[data-focus-ui]')) return;

      const focusable = findFocusableParent(el);
      if (focusable) {
        enterElementMode(focusable);
      }
    };

    const block = (e: MouseEvent) => {
      if (!e.altKey) return;
      const el = e.target as HTMLElement;
      // Idem : on laisse passer les clics sur <a> pour Glance.
      if (el.closest?.('a[href]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    window.addEventListener('click', onClick, { capture: true });
    window.addEventListener('mousedown', block, { capture: true });
    window.addEventListener('mouseup', block, { capture: true });
    return () => {
      window.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      window.removeEventListener('mousedown', block, { capture: true } as EventListenerOptions);
      window.removeEventListener('mouseup', block, { capture: true } as EventListenerOptions);
    };
  }, [enterElementMode]);

  if (mode === 'off') return null;

  return (
    <>
      {/* Element mode: dark backdrop + clone overlay */}
      {mode === 'element' && (
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-[2px] animate-[fadeIn_0.15s_ease-out]"
            onClick={exit}
          />
          <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 pb-6 px-4 md:px-12 overflow-auto">
            <div
              ref={cloneRef}
              className={[
                'w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden',
                'ring-2 ring-primary/30',
                'transition-all duration-200 ease-out',
                'animate-[focusIn_0.2s_ease-out]',
              ].join(' ')}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </>
      )}

      {/* Page mode: just the backdrop (CSS handles the rest) */}
      {mode === 'page' && (
        <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-[2px] animate-[fadeIn_0.1s_ease-out]" onClick={exit} />
      )}

      {/* Toolbar */}
      <div
        data-focus-ui
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[10001] flex items-center gap-2 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 backdrop-blur-sm animate-[fadeIn_0.1s_ease-out]"
      >
        <Focus className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-seal-navy dark:text-white">
          {mode === 'page' ? 'Focus page' : 'Focus élément'}
        </span>
        {mode === 'element' && (
          <button
            onClick={enterPageMode}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition"
            title="Passer en focus page"
            aria-label="Passer en focus page"
          >
            <Maximize2 className="h-3 w-3 text-seal-gray-500" />
          </button>
        )}
        {mode === 'page' && (
          <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 hidden sm:inline">Alt+Clic sur un élément pour le cibler</span>
        )}
        <button
          onClick={exit}
          className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-seal-gray-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
        >
          <X className="h-3 w-3" />
          <span className="hidden sm:inline">Alt / Esc</span>
        </button>
      </div>
    </>
  );
}
