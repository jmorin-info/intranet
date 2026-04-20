'use client';

/**
 * UX Command Center — Admin-only intelligence panel
 *
 * Displays real-time UX friction detection, insights, and per-module health.
 * Powered by Phase 7 (event bus) → Phase 10 (telemetry + friction detection).
 *
 * Non-intrusive: only visible to admins, never blocks user workflows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, Badge } from '@omnitech/ui';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Zap,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { useEventSubscription } from '@/lib/events';
import { metricsStore, initTracker } from '@/lib/ux-telemetry';
import type { TelemetryModule, ModuleMetrics } from '@/lib/ux-telemetry';
import { generateInsights } from '@/lib/ux-insights';
import type { UXInsight } from '@/lib/ux-insights';

const MODULES: TelemetryModule[] = ['TICKETS', 'DOCUMENTS', 'INCIDENTS', 'DASHBOARD'];

const MODULE_LABELS: Record<TelemetryModule, string> = {
  TICKETS: 'Tickets',
  DOCUMENTS: 'Documents',
  INCIDENTS: 'Incidents',
  DASHBOARD: 'Dashboard',
};

const SEVERITY_CONFIG = {
  HIGH: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', icon: AlertTriangle },
  MEDIUM: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', icon: Eye },
  LOW: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', icon: Activity },
};

function moduleHealthScore(metrics: ModuleMetrics): number {
  let score = 100;
  if (metrics.rollbackCount > 0) score -= metrics.rollbackCount * 10;
  if (metrics.slowFlowCount > 0) score -= metrics.slowFlowCount * 8;
  if (metrics.navigationLoops > 0) score -= metrics.navigationLoops * 6;
  if (metrics.maxBurstSize > 3) score -= (metrics.maxBurstSize - 3) * 5;
  return Math.max(0, Math.min(100, score));
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-50 dark:bg-emerald-900/20';
  if (score >= 60) return 'bg-amber-50 dark:bg-amber-900/20';
  return 'bg-red-50 dark:bg-red-900/20';
}

export function UXCommandCenter() {
  const [insights, setInsights] = useState<UXInsight[]>([]);
  const [snapshot, setSnapshot] = useState(metricsStore.getSnapshot());

  // Initialize tracker
  useEffect(() => { initTracker(); }, []);

  const refresh = useCallback(() => {
    setInsights(generateInsights());
    setSnapshot(metricsStore.getSnapshot());
  }, []);

  // Refresh on every confirmed event
  useEventSubscription('*', (event) => {
    if (event.metadata?.optimistic) return;
    refresh();
  });

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  const totalEvents = snapshot.totalEvents;
  const highCount = insights.filter(i => i.severity === 'HIGH').length;
  const mediumCount = insights.filter(i => i.severity === 'MEDIUM').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-navy dark:text-white">UX Intelligence</h3>
          <Badge variant="navy">{totalEvents} events</Badge>
        </div>
        <button
          onClick={refresh}
          className="p-1.5 rounded-lg text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          title="Rafraichir"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Module Health Map */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {MODULES.map(mod => {
          const metrics = snapshot.modules[mod];
          const score = moduleHealthScore(metrics);
          return (
            <div key={mod} className={`rounded-lg p-3 ${scoreBg(score)} border border-gray-100 dark:border-slate-700`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-taupe dark:text-slate-500">
                  {MODULE_LABELS[mod]}
                </span>
                <span className={`text-lg font-semibold tabular-nums ${scoreColor(score)}`}>
                  {metrics.totalActions > 0 ? score : '--'}
                </span>
              </div>
              <div className="text-[10px] text-taupe dark:text-slate-400 space-y-0.5">
                <div>{metrics.totalActions} actions</div>
                {metrics.avgTimeToAction > 0 && <div>{(metrics.avgTimeToAction / 1000).toFixed(1)}s moy.</div>}
                {metrics.rollbackCount > 0 && <div className="text-red-600 dark:text-red-400">{metrics.rollbackCount} rollback(s)</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Insights */}
      {insights.length === 0 && totalEvents > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs text-emerald-700 dark:text-emerald-300">Aucune friction detectee</span>
        </div>
      )}

      {insights.length === 0 && totalEvents === 0 && (
        <div className="text-xs text-taupe dark:text-slate-500 text-center py-4">
          En attente d'interactions utilisateur...
        </div>
      )}

      {insights.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] text-taupe dark:text-slate-500">
            {highCount > 0 && <span className="text-red-600 dark:text-red-400 font-semibold">{highCount} critique(s)</span>}
            {mediumCount > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold">{mediumCount} moyenne(s)</span>}
            <span>{insights.length} insight(s) total</span>
          </div>

          {insights.map(insight => {
            const config = SEVERITY_CONFIG[insight.severity];
            const Icon = config.icon;
            return (
              <div
                key={insight.id}
                className={`rounded-lg border ${config.border} ${config.bg} p-3`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${config.text}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={insight.severity === 'HIGH' ? 'error' : insight.severity === 'MEDIUM' ? 'warning' : 'info'}>
                        {MODULE_LABELS[insight.module]}
                      </Badge>
                      <span className="text-[10px] font-semibold uppercase text-taupe dark:text-slate-500">
                        {insight.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-taupe dark:text-slate-500 ml-auto">
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-navy dark:text-white font-medium">{insight.description}</p>
                    <p className="text-[11px] text-taupe dark:text-slate-400 mt-1 flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      {insight.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
