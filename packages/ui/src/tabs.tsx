'use client';

import React, { useState } from 'react';
import { cn } from './utils';

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 border-b border-gray-200 dark:border-slate-700 overflow-x-auto', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors duration-200 relative whitespace-nowrap',
            activeTab === tab.id
              ? 'text-primary'
              : 'text-seal-gray-500 hover:text-seal-navy dark:hover:text-white',
          )}
        >
          <span className="flex items-center gap-1.5">
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium',
                  activeTab === tab.id
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400',
                )}
              >
                {tab.count}
              </span>
            )}
          </span>
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t" />
          )}
        </button>
      ))}
    </div>
  );
}
