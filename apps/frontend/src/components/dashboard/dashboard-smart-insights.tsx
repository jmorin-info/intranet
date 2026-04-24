'use client';

/**
 * Smart Insights widget: score ring + 4-type insight cards (tip / warning /
 * suggestion / achievement). Consumes the `/ai/ux-insights` response directly.
 *
 * The companion `AiSuggestionsCard` lives in
 * `./dashboard-ai-suggestions-card` and is re-exported here for backward
 * compatibility with existing imports.
 */

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Lightbulb,
  Sparkles,
  Trophy,
} from 'lucide-react';

export { AiSuggestionsCard } from './dashboard-ai-suggestions-card';
export type { AiRecommendationsData } from './dashboard-ai-suggestions-card';

export interface UxInsight {
  type: 'tip' | 'warning' | 'suggestion' | 'achievement';
  title: string;
  description: string;
  action?: string;
  priority: number;
}

export interface UxInsightsData {
  insights: UxInsight[];
  score: number;
  greeting?: string;
}

const INSIGHT_CONFIG: Record<
  UxInsight['type'],
  { icon: React.ElementType; color: string; bg: string; border: string; badge: string; label: string }
> = {
  tip: {
    icon: Lightbulb,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    label: 'Conseil',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    label: 'Attention',
  },
  suggestion: {
    icon: Sparkles,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    label: 'Suggestion',
  },
  achievement: {
    icon: Trophy,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    border: 'border-violet-200 dark:border-violet-800',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    label: 'Succès',
  },
};

export function SmartInsightsWidget({ data }: { data: UxInsightsData }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const scoreOffset = circumference - (data.score / 100) * circumference;
  const scoreColor = data.score > 80 ? '#10b981' : data.score > 50 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
        Smart Insights
      </p>
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-shrink-0 relative w-[52px] h-[52px]">
            <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90 absolute inset-0">
              <circle
                cx="26"
                cy="26"
                r={radius}
                fill="none"
                strokeWidth="5"
                stroke="currentColor"
                className="text-gray-100 dark:text-slate-800"
              />
              <circle
                cx="26"
                cy="26"
                r={radius}
                fill="none"
                strokeWidth="5"
                stroke={scoreColor}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={scoreOffset}
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-semibold tabular-nums" style={{ color: scoreColor }}>
                {data.score}%
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Analyse intelligente
            </h3>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5">
              {data.insights?.length ?? 0} recommandation{(data.insights?.length ?? 0) > 1 ? 's' : ''}{' '}
              personnalisée{(data.insights?.length ?? 0) > 1 ? 's' : ''} pour vous
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.insights.map((insight, i) => {
            const cfg = INSIGHT_CONFIG[insight.type];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border} flex flex-col gap-2`}>
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[9px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                    <p className="text-xs font-semibold text-seal-navy dark:text-white leading-snug mt-1">{insight.title}</p>
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">{insight.description}</p>
                  </div>
                </div>
                {insight.action && (
                  <Link
                    href={insight.action}
                    className={`self-start inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color} hover:underline`}
                  >
                    Agir <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SmartInsightsWidget;
