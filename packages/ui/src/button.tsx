import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';
import { Loader2 } from 'lucide-react';
import { haptic, type HapticPattern } from './haptic';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none touch-manipulation select-none active:scale-[0.97] transition-transform duration-100',
  {
    variants: {
      variant: {
        // Primary OMNITECH (#F68D2E) — bouton principal renforcé look SEAL
        primary: 'bg-[#F9964A] text-white hover:bg-[#e67d1e] active:bg-[#c46714] rounded-btn shadow-sm hover:shadow-md',
        secondary:
          'bg-transparent border-2 border-seal-navy text-seal-navy hover:bg-seal-navy hover:text-white rounded-btn',
        danger: 'bg-[#892034] text-white hover:bg-[#6f1a2a] rounded-btn shadow-sm hover:shadow-md',
        ghost: 'bg-transparent text-primary hover:bg-primary-light rounded-btn',
        outline:
          'bg-transparent border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-btn',
        // === Variantes SEAL System (look produit hypervision OMNITECH) ===
        // Bouton signature SEAL : orange plein → s'inverse au hover (transparent + bordure orange)
        seal: 'bg-[#F9964A] text-white border-2 border-[#F9964A] uppercase tracking-wider rounded-seal hover:bg-transparent hover:text-[#F9964A] font-semibold',
        'seal-blue': 'bg-[#296DC1] text-white border-2 border-[#296DC1] uppercase tracking-wider rounded-seal hover:bg-transparent hover:text-[#296DC1] font-semibold',
        'seal-green': 'bg-[#006233] text-white border-2 border-[#006233] uppercase tracking-wider rounded-seal hover:bg-transparent hover:text-[#006233] font-semibold',
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  hapticPattern?: HapticPattern;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, hapticPattern, onClick, type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        onClick={(e) => {
          if (hapticPattern) haptic(hapticPattern);
          onClick?.(e);
        }}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { buttonVariants };
