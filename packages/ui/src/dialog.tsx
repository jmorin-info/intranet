'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from './utils';
import { X } from 'lucide-react';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function getVisibleFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter(
    (n) =>
      !n.hasAttribute('data-focus-trap-ignore') &&
      n.offsetWidth > 0 &&
      n.offsetHeight > 0,
  );
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Store onClose in a ref so the effect doesn't re-run when the callback changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      // Remember the trigger so we can restore focus on close (WCAG 2.4.3)
      if (!prevOpenRef.current) {
        previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
      }
      document.body.style.overflow = 'hidden';
      // Auto-focus ONLY when dialog first opens (not on every re-render)
      if (!prevOpenRef.current) {
        requestAnimationFrame(() => {
          if (overlayRef.current) overlayRef.current.scrollTop = 0;
          // Prefer first input/textarea/select for ergonomic flow, otherwise
          // first focusable element (incl. close button).
          const formEl = panelRef.current?.querySelector<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
          );
          if (formEl) {
            formEl.focus({ preventScroll: true });
          } else if (panelRef.current) {
            const focusables = getVisibleFocusable(panelRef.current);
            (focusables[0] ?? panelRef.current).focus({ preventScroll: true });
          }
        });
      }
      prevOpenRef.current = true;
    } else if (prevOpenRef.current) {
      // Restore focus to the element that opened the dialog
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        requestAnimationFrame(() => {
          try {
            prev.focus({ preventScroll: true });
          } catch {
            // no-op
          }
        });
      }
      previouslyFocusedRef.current = null;
      prevOpenRef.current = false;
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Focus-trap + Escape : while the dialog is open, Tab/Shift+Tab cycle inside
  // the panel and never escape it. Escape closes.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = getVisibleFocusable(panelRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        if (!panelRef.current.hasAttribute('tabindex')) {
          panelRef.current.setAttribute('tabindex', '-1');
        }
        panelRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const current = document.activeElement as HTMLElement | null;
      const inside = panelRef.current.contains(current);

      if (e.shiftKey) {
        if (!inside || current === first) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else {
        if (!inside || current === last) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center overflow-y-auto bg-black/50 p-0 sm:p-4 sm:pt-[5vh] sm:pb-[5vh] animate-fade-in-scale"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cn(
          'bg-white dark:bg-slate-900 shadow-xl w-full sm:max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] flex flex-col animate-fade-in-scale',
          'rounded-t-card rounded-b-none sm:rounded-card sm:rounded-b-card',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-gray-300 dark:bg-slate-600 mt-2 mb-1 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-seal-navy dark:text-white">
              {title}
            </h2>
            {description && <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Fermer la fenêtre"
          >
            <X className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'danger',
  loading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-3 mt-4">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
