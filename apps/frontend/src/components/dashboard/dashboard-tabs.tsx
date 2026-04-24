'use client';

/**
 * Admin-only top tabs to switch between "Mon espace" (classic dashboard) and
 * "Vue RSSI" (aggregated security posture). Non-admins never see this bar.
 */

import React from 'react';
import { ShieldCheck } from 'lucide-react';

export type DashboardView = 'me' | 'rssi';

interface DashboardTabsProps {
  activeView: DashboardView;
  onSwitch: (view: DashboardView) => void;
}

export function DashboardTabs({ activeView, onSwitch }: DashboardTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => onSwitch('me')}
        className={`relative px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-t-lg ${
          activeView === 'me'
            ? 'text-primary'
            : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
        }`}
        aria-current={activeView === 'me' ? 'page' : undefined}
      >
        Mon espace
        {activeView === 'me' && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
      </button>
      <button
        type="button"
        onClick={() => onSwitch('rssi')}
        className={`relative px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-t-lg ${
          activeView === 'rssi'
            ? 'text-primary'
            : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
        }`}
        aria-current={activeView === 'rssi' ? 'page' : undefined}
      >
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" /> Vue RSSI
        </span>
        {activeView === 'rssi' && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
      </button>
    </div>
  );
}

export default DashboardTabs;
