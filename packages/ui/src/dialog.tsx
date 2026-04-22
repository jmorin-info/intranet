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

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Store onClose in a ref so the effect doesn't re-run when the callback changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const prevOpenRef = useRef(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    if (open) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
      // Auto-focus ONLY when dialog first opens (not on every re-render)
      if (!prevOpenRef.current) {
        requestAnimationFrame(() => {
          if (overlayRef.current) overlayRef.current.scrollTop = 0;
          const el = panelRef.current?.querySelector<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
          );
          el?.focus({ preventScroll: true });
        });
      }
      prevOpenRef.current = true;
    } else {
      prevOpenRef.current = false;
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
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
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Fermer"
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
