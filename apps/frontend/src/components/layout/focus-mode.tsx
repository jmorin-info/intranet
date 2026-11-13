'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Focus, X, Maximize2, Minimize2 } from 'lucide-react';
import { useFocusModeStore } from '@/stores/focus-mode-store';

/**
 * Focus Mode — Two modes:
 * 1. Alt released on its own → toggle full-page focus (hides sidebar/header, centers main)
 * 2. Alt+Click on any card/section → focus just that element (clone in overlay)
 *
 * Tap Alt on its own again or press Esc to exit either mode.
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
  const storeMode = useFocusModeStore((s) => s.mode);
  const storeActivate = useFocusModeStore((s) => s.activate);
  const storeDeactivate = useFocusModeStore((s) => s.deactivate);

  const exit = useCallback(() => {
    setMode('off');
    document.body.classList.remove('focus-mode-active');
    document.body.classList.remove('focus-mode-store-active');
    if (cloneRef.current) cloneRef.current.replaceChildren();
    sourceRef.current = null;
    storeDeactivate();
  }, [storeDeactivate]);

  const enterPageMode = useCallback(() => {
    setMode('page');
    document.body.classList.add('focus-mode-active');
    document.body.classList.add('focus-mode-store-active');
    if (cloneRef.current) cloneRef.current.replaceChildren();
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
      if (cloneRef.current) cloneRef.current.replaceChildren();
      sourceRef.current = null;
    }
  }, [storeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const enterElementMode = useCallback((el: HTMLElement) => {
    document.body.classList.remove('focus-mode-active');
    sourceRef.current = el;
    setMode('element');
  }, []);

  // The clone container exists only after element mode has mounted.
  useEffect(() => {
    const source = sourceRef.current;
    const container = cloneRef.current;
    if (mode !== 'element' || !source || !container) return;
    const clone = source.cloneNode(true) as HTMLElement;
    clone.style.cssText = 'position:static;margin:0;transform:none;opacity:1;max-width:100%;width:100%;';
    container.replaceChildren(clone);
    const sourceScrollables = source.querySelectorAll<HTMLElement>('*');
    const cloneScrollables = container.querySelectorAll<HTMLElement>('*');
    sourceScrollables.forEach((src, index) => {
      const target = cloneScrollables[index];
      if (target) { target.scrollTop = src.scrollTop; target.scrollLeft = src.scrollLeft; }
    });
  }, [mode]);

  // A modifier key cannot be interpreted until the gesture ends. In
  // particular, Alt+click must reach Glance before page focus hides its link.
  useEffect(() => {
    let pending = false;
    const cancel = () => { pending = false; };
    const editable = (target: EventTarget | null) => target instanceof Element
      && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { cancel(); exit(); return; }
      if (event.key !== 'Alt') { cancel(); return; }
      if (event.repeat) return;
      pending = !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && !event.getModifierState('AltGraph') && !editable(event.target);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') { cancel(); return; }
      const solo = pending;
      cancel();
      if (!solo || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey
          || event.getModifierState('AltGraph') || editable(event.target)) return;
      event.preventDefault();
      if (mode === 'off') enterPageMode();
      else exit();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('blur', cancel);
    };
  }, [mode, exit, enterPageMode]);

  // Alt+Click on an element → focus that element.
  // NOTE: Alt+Click sur un <a href> interne est géré en priorité par
  // GlanceOverlay (capture phase, registered earlier). On skippe donc ici
  // les événements qui ciblent un <a>, pour laisser Glance ouvrir son panneau.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.getModifierState('AltGraph')) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
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
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.getModifierState('AltGraph')) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
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
              data-focus-content
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
