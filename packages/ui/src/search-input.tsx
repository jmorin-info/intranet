import React from 'react';
import { cn } from './utils';
import { Search, X } from 'lucide-react';

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  className?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ value, onChange, onClear, className, ...props }, ref) {
    return (
      <div className={cn('relative', className)}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-seal-gray-500 dark:text-slate-400" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white py-2 pl-10 pr-10 text-sm placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          {...props}
        />
        {value && (
          <button
            onClick={() => {
              onChange('');
              onClear?.();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <X className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
          </button>
        )}
      </div>
    );
  },
);
