"use client";

import React, { useState } from "react";
import { PenLine } from "lucide-react";

export function EditInPlaceField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg group transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-slate-700/60">
      <Icon
        className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 flex-shrink-0"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium text-seal-gray-500 dark:text-slate-500 uppercase tracking-widest">
          {label}
        </p>
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
            placeholder={placeholder}
            aria-label={label}
            className="w-full text-sm text-seal-navy dark:text-white bg-transparent border-b border-seal-navy outline-none py-0.5 placeholder:text-seal-gray-500/40 focus:ring-2 focus:ring-seal-navy/15"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Modifier ${label.toLowerCase()}`}
            className="text-sm text-seal-navy dark:text-white text-left w-full truncate flex items-center gap-1.5 cursor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy rounded"
          >
            {value || (
              <span className="text-seal-gray-500 dark:text-slate-500 italic">
                {placeholder}
              </span>
            )}
            <PenLine
              className="h-3 w-3 text-seal-gray-500/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </div>
  );
}
