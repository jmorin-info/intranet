'use client';

import React from 'react';
import { cn } from './utils';

interface TooltipProps {
  /** Contenu affiché dans la bulle. */
  content: React.ReactNode;
  children: React.ReactElement;
  /** Position relative à l'enfant. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Délai avant ouverture (ms). 300ms par défaut conformément aux usages SEAL. */
  delayDuration?: number;
  /** Désactive le tooltip (utile pour cas conditionnels). */
  disabled?: boolean;
  className?: string;
}

const SIDE_CLASSES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Tooltip léger sans dépendance externe.
 * - Hover (souris) + focus clavier → ouverture après `delayDuration`.
 * - Escape → fermeture immédiate.
 * - `aria-describedby` lie l'élément déclencheur à la bulle (WCAG).
 * - Contraste : fond `seal-navy`, texte blanc, taille `xs`.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delayDuration = 300,
  disabled,
  className,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const tooltipId = React.useId();
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = () => {
    if (disabled) return;
    clear();
    timerRef.current = setTimeout(() => setOpen(true), delayDuration);
  };

  const hide = () => {
    clear();
    setOpen(false);
  };

  React.useEffect(() => () => clear(), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const child = React.Children.only(children) as React.ReactElement<
    React.HTMLAttributes<HTMLElement> & { 'aria-describedby'?: string }
  >;
  const childProps = child.props;
  const trigger = React.cloneElement(child, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      hide();
    },
    'aria-describedby': open ? tooltipId : childProps['aria-describedby'],
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {open && !disabled && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-seal-navy text-white text-xs font-medium px-2 py-1 shadow-md',
            SIDE_CLASSES[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
