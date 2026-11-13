import React from 'react';
import { cn } from './utils';
import { Search, X } from 'lucide-react';

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ value, onChange, onClear, clearLabel = 'Effacer la recherche', disabled, className, ...props }, ref) {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    return (
      <div className={cn('relative', className)}>
        <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-seal-gray-500 dark:text-slate-400" />
        <input
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          type="search"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white py-2 pl-10 pr-10 text-sm placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          {...props}
        />
        {value && (
          <button
            type="button"
            aria-label={clearLabel}
            disabled={disabled}
            onClick={() => {
              onChange('');
              onClear?.();
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-blue disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
          </button>
        )}
      </div>
    );
  },
);
