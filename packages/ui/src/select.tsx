import React from 'react';
import { cn } from './utils';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
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
          <label htmlFor={selectId} className="block text-[13px] font-semibold text-navy dark:text-white">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full appearance-none rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm bg-white transition-colors',
              'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
              'dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500',
              error && 'border-red-500',
              className,
            )}
            {...props}
          >
            {placeholder && (
              <option value="" className="text-taupe">
                {placeholder}
              </option>
            )}
            {uniqueOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-taupe dark:text-slate-400" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
