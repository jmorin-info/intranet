'use client';

import React, { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Wrapper pour boutons icône uniquement (sans texte visible).
 *
 * Garantit en permanence :
 *   - `aria-label` accessible aux lecteurs d'écran (obligatoire)
 *   - Tooltip visuel au hover / focus (via `title` natif + surcouche stylée)
 *   - Style cohérent charte SEAL + dark mode
 *
 * Utiliser À CHAQUE FOIS qu'un bouton n'a qu'une icône. Ne remplace pas les
 * `<Button>` avec texte visible (utilisez `<Button variant="ghost">` pour ça).
 *
 * @example
 * <IconButton
 *   icon={Settings}
 *   tooltip="Paramètres"
 *   onClick={() => setOpen(true)}
 * />
 */

type IconButtonVariant = 'default' | 'ghost' | 'subtle' | 'primary' | 'danger';
type IconButtonSize = 'sm' | 'md' | 'lg';
type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Icône lucide-react à afficher. */
  icon: LucideIcon;
  /** Libellé du tooltip + fallback aria-label. Obligatoire. */
  tooltip: string;
  /** Override aria-label si différent du tooltip (rare). */
  ariaLabel?: string;
  /** Côté d'apparition du tooltip. */
  tooltipSide?: TooltipSide;
  /** Variante visuelle. */
  variant?: IconButtonVariant;
  /** Taille. */
  size?: IconButtonSize;
}

const SIZE_CLASSES: Record<IconButtonSize, { btn: string; icon: string }> = {
  sm: { btn: 'h-7 w-7', icon: 'h-3.5 w-3.5' },
  md: { btn: 'h-9 w-9', icon: 'h-4 w-4' },
  lg: { btn: 'h-11 w-11', icon: 'h-5 w-5' },
};

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  default:
    'bg-gray-100 text-seal-navy hover:bg-gray-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700',
  ghost:
    'text-seal-gray-500 hover:bg-gray-100 hover:text-seal-navy dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
  subtle:
    'bg-gray-50 text-seal-gray-500 hover:bg-gray-100 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800',
  primary:
    'bg-[#F9964A] text-white hover:bg-[#e67d1e] shadow-sm',
  danger:
    'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20',
};

const TOOLTIP_POSITION: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon: Icon,
    tooltip,
    ariaLabel,
    tooltipSide = 'top',
    variant = 'ghost',
    size = 'md',
    className,
    disabled,
    ...rest
  },
  ref,
) {
  const sizing = SIZE_CLASSES[size];
  const variantCls = VARIANT_CLASSES[variant];
  const posCls = TOOLTIP_POSITION[tooltipSide];

  return (
    <span className="relative inline-flex group">
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel ?? tooltip}
        title={tooltip}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-lg',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9964A]',
          'focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          sizing.btn,
          variantCls,
          className,
        )}
        {...rest}
      >
        <Icon className={sizing.icon} aria-hidden="true" />
      </button>
      {/* Tooltip custom — affiché au hover/focus-within via group */}
      <span
        role="tooltip"
        className={cn(
          'absolute whitespace-nowrap pointer-events-none z-50',
          'rounded-md bg-seal-navy dark:bg-slate-800 text-white',
          'px-2 py-1 text-[11px] font-medium shadow-lg',
          'opacity-0 scale-95 transition-all duration-150',
          'group-hover:opacity-100 group-hover:scale-100',
          'group-focus-within:opacity-100 group-focus-within:scale-100',
          posCls,
        )}
      >
        {tooltip}
      </span>
    </span>
  );
});
