import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap border',
  {
    variants: {
      variant: {
        draft: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        'in-review': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
        'pending-approval': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
        approved: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
        obsolete: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
        archived: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
        success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
        warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
        error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
        primary: 'bg-primary-light text-primary-dark border-primary/30 dark:bg-primary/15 dark:text-primary dark:border-primary/40',
        navy: 'bg-navy/10 text-navy border-navy/20 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
        // === Variantes PANTONE OMNITECH SECURITY (charte SEAL System) ===
        'seal-orange': 'bg-[#F9964A]/10 text-[#c46714] border-[#F9964A]/30 dark:bg-[#F9964A]/20 dark:text-[#FBC078] dark:border-[#F9964A]/40',
        'seal-blue': 'bg-[#296DC1]/10 text-[#1e5494] border-[#296DC1]/30 dark:bg-[#296DC1]/20 dark:text-[#7eb0ec] dark:border-[#296DC1]/40',
        'seal-green': 'bg-[#006233]/10 text-[#006233] border-[#006233]/30 dark:bg-[#006233]/25 dark:text-[#6ad79b] dark:border-[#006233]/40',
        'seal-bordeaux': 'bg-[#892034]/10 text-[#892034] border-[#892034]/30 dark:bg-[#892034]/25 dark:text-[#e58a99] dark:border-[#892034]/40',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
