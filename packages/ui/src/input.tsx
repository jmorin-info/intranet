import React from 'react';
import { cn } from './utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[13px] font-semibold text-navy dark:text-white"
          >
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors',
            'placeholder:text-taupe',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
            'dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-taupe dark:text-slate-400">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
