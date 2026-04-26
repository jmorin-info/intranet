import React from 'react';
import { cn } from './utils';
import { AlertCircle } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Texte d'aide sous le champ (ignoré si `error` présent). Alias historique : `hint`. */
  helperText?: string;
  /** @deprecated Utiliser `helperText`. Conservé pour rétrocompatibilité. */
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, hint, id, disabled, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : reactId);
    const helpId = `${inputId}-help`;
    const errorId = `${inputId}-error`;
    const help = helperText ?? hint;
    const describedBy = error ? errorId : help ? helpId : undefined;
    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[13px] font-semibold text-seal-navy dark:text-white"
          >
            {label}
            {props.required && (
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base sm:text-sm transition-colors touch-manipulation',
            'placeholder:text-seal-gray-500',
            'focus:border-seal-navy focus:outline-none focus:ring-2 focus:ring-seal-navy/30',
            'dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500',
            disabled && 'bg-gray-50 dark:bg-slate-800 cursor-not-allowed opacity-70',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className,
          )}
          {...props}
        />
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
        {help && !error && (
          <p id={helpId} className="text-xs text-seal-gray-500 dark:text-slate-400">{help}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
