import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';
import { Loader2 } from 'lucide-react';
import { haptic, type HapticPattern } from './haptic';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold text-sm transition-all focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy focus-visible:ring-offset-2 dark:focus-visible:ring-blue-300 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none touch-manipulation select-none active:scale-[0.97] transition-transform duration-100',
  {
    variants: {
      variant: {
        // Orange OMNITECH + texte navy : contraste AA pour les libellés.
        primary: 'bg-[#F9964A] text-[#004469] hover:bg-[#ffb27a] active:bg-[#ffcc99] rounded-btn shadow-sm hover:shadow-md',
        secondary:
          'bg-transparent border-2 border-seal-navy text-seal-navy hover:bg-seal-navy hover:text-white dark:border-blue-300 dark:text-blue-300 dark:hover:bg-blue-300 dark:hover:text-slate-950 rounded-btn',
        danger: 'bg-[#892034] text-white hover:bg-[#6f1a2a] rounded-btn shadow-sm hover:shadow-md',
        // Alias sémantique de `danger` (terminologie shadcn/ui)
        destructive: 'bg-[#892034] text-white hover:bg-[#6f1a2a] rounded-btn shadow-sm hover:shadow-md',
        ghost: 'bg-transparent text-seal-navy hover:bg-primary-light dark:text-blue-300 dark:hover:bg-slate-800 rounded-btn',
        outline:
          'bg-transparent border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-btn',
        // Bouton lien : usage minimal, inline, navy SEAL souligné au hover
        link: 'bg-transparent text-seal-navy dark:text-blue-300 underline-offset-4 hover:underline px-0 h-auto rounded-none shadow-none',
        // === Variantes SEAL System (look produit hypervision OMNITECH) ===
        // Bouton signature SEAL : même contraste lisible et traitement de marque.
        seal: 'bg-[#F9964A] text-[#004469] border-2 border-[#F9964A] uppercase tracking-wider rounded-seal hover:bg-[#ffb27a] active:bg-[#ffcc99] font-semibold',
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
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        onClick={(e) => {
          if (hapticPattern) haptic(hapticPattern);
          onClick?.(e);
        }}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { buttonVariants };
