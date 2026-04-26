import React from 'react';
import { cn } from './utils';
import { ChevronDown, AlertCircle } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  /** Texte d'aide sous le champ (ignoré si `error` présent). */
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, placeholder, id, disabled, ...props }, ref) => {
    const reactId = React.useId();
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : reactId);
    const helpId = `${selectId}-help`;
    const errorId = `${selectId}-error`;
    const describedBy = error ? errorId : helperText ? helpId : undefined;
    // Dédoublonne les options sur leur `value` pour éviter le warning React
    // "two children with the same key" si les listes sources contiennent des doublons.
    const uniqueOptions = React.useMemo(() => {
      const seen = new Set<string>();
      const out: SelectOption[] = [];
      for (const opt of options) {
        if (!seen.has(opt.value)) {
          seen.add(opt.value);
          out.push(opt);
        }
      }
      return out;
    }, [options]);

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={selectId} className="block text-[13px] font-semibold text-seal-navy dark:text-white">
            {label}
            {props.required && (
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            )}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full appearance-none rounded-lg border border-gray-200 px-3 py-2 pr-10 text-base sm:text-sm bg-white transition-colors touch-manipulation',
              'focus:border-seal-navy focus:outline-none focus:ring-2 focus:ring-seal-navy/30',
              'dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500',
              disabled && 'bg-gray-50 dark:bg-slate-800 cursor-not-allowed opacity-70',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              className,
            )}
            {...props}
          >
            {placeholder && (
              <option value="" className="text-seal-gray-500">
                {placeholder}
              </option>
            )}
            {uniqueOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-seal-gray-500 dark:text-slate-400"
          />
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        {helperText && !error && (
          <p id={helpId} className="text-xs text-seal-gray-500 dark:text-slate-400">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
