'use client';

import { useEffect, useRef } from 'react';

/**
 * useFocusTrap — WCAG 2.1 AA focus management for modals / dialogs.
 *
 * Behavior :
 *   - When the modal opens (`active = true`), the previously focused element is
 *     remembered, and focus is moved to the first focusable element inside the
 *     container (or to the container itself if none exists).
 *   - Tab / Shift+Tab cycle focus between the first and last focusable element
 *     of the container, never escaping the modal.
 *   - Escape key calls `onEscape` if provided (no-op otherwise).
 *   - When the modal closes (`active = false`), focus is restored to the
 *     element that triggered it.
 *
 * Usage :
 *   const ref = useFocusTrap<HTMLDivElement>(open, { onEscape: onClose });
 *   return <div ref={ref} role="dialog" aria-modal="true">...</div>;
 *
 * Notes :
 *   - The hook attaches a `keydown` listener at capture phase to win over
 *     bubbling listeners.
 *   - It treats elements with `[data-focus-trap-ignore]` as non-focusable so
 *     containers can opt out individual children if needed.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

interface UseFocusTrapOptions {
  /** Called when the user presses Escape inside the trapped container. */
  onEscape?: () => void;
  /** Disable the trap entirely (overrides `active`). Default: false. */
  disabled?: boolean;
  /** If false, do not auto-focus the first focusable element. Default: true. */
  autoFocus?: boolean;
  /** If false, do not restore focus when the trap deactivates. Default: true. */
  restoreFocus?: boolean;
}

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  options: UseFocusTrapOptions = {},
) {
  const { onEscape, disabled = false, autoFocus = true, restoreFocus = true } = options;
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Stable callback refs so the effect doesn't re-run when callers re-create them
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active || disabled) return;

    const container = containerRef.current;
    if (!container) return;

    // Remember the element that had focus before the trap activated
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
    previouslyFocusedRef.current = previouslyFocused;

    const getFocusable = (): HTMLElement[] => {
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      return nodes.filter(
        (n) =>
          !n.hasAttribute('data-focus-trap-ignore') &&
          // Skip hidden elements (display:none / visibility:hidden parents)
          n.offsetWidth > 0 &&
          n.offsetHeight > 0,
      );
    };

    // Auto-focus first focusable on next frame so the DOM is fully rendered
    if (autoFocus) {
      requestAnimationFrame(() => {
        const focusables = getFocusable();
        const first = focusables[0];
        if (first) {
          first.focus({ preventScroll: true });
        } else {
          // Make the container itself focusable as a fallback
          if (!container.hasAttribute('tabindex')) {
            container.setAttribute('tabindex', '-1');
          }
          container.focus({ preventScroll: true });
        }
      });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onEscapeRef.current) {
          e.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const current = document.activeElement as HTMLElement | null;

      // Tab cycle
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else {
        if (current === last || !container.contains(current)) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === 'function') {
        // Defer to next frame so the DOM has settled (modal unmounted)
        requestAnimationFrame(() => {
          try {
            previouslyFocused.focus({ preventScroll: true });
          } catch {
            // no-op : element may have been unmounted in the meantime
          }
        });
      }
    };
  }, [active, disabled, autoFocus, restoreFocus]);

  return containerRef;
}

export default useFocusTrap;
