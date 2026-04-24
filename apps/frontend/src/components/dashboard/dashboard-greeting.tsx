'use client';

/**
 * Dashboard greeting / top-bar block.
 *
 * Renders the personalised greeting, the current date, the daily security tip,
 * the AI toggle, the settings + manual refresh buttons, quick CTA pills
 * (nouveau document / ticket) and — on xl+ viewports — the clock and weather
 * widgets. Pure UI: all state (refresh spinner, uxInsights score, settings
 * toggle) is lifted from the parent page.
 */

import React from 'react';
import Link from 'next/link';
import { Button } from '@omnitech/ui';
import { FileText, RefreshCw, Settings, ShieldCheck, Ticket } from 'lucide-react';
import { ClockWidget } from '@/components/widgets/clock-widget';
import { WeatherWidget } from '@/components/widgets/weather-widget';
import { AIControlToggle } from '@/components/ai/ai-control-toggle';
import { useTranslation } from '@/lib/i18n';
import { getDailyTip } from './dashboard-tips-banner';

interface DashboardGreetingProps {
  firstName: string | undefined;
  showClock: boolean;
  showWeather: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onToggleSettings: () => void;
  profileScore?: number;
}

export function DashboardGreeting({
  firstName,
  showClock,
  showWeather,
  isRefreshing,
  onRefresh,
  onToggleSettings,
  profileScore,
}: DashboardGreetingProps) {
  const { t } = useTranslation();
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t('dashboard.greeting.morning')
      : hour < 18
        ? t('dashboard.greeting.afternoon')
        : t('dashboard.greeting.evening');
  const timeEmoji = hour < 12 ? '☀️' : hour < 18 ? '🌤️' : '🌙';
  const dateStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const tip = getDailyTip();

  return (
    <div className="py-3 px-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[26px] font-medium text-seal-navy dark:text-white tracking-tight leading-tight">
              <span className="text-seal-gray-500 dark:text-slate-400 font-light">{greeting},</span> {firstName}
            </h1>
            <AIControlToggle />
            <button
              onClick={onToggleSettings}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title="Personnaliser le tableau de bord"
              aria-label="Personnaliser le tableau de bord"
            >
              <Settings className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
            </button>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              title="Actualiser le tableau de bord"
              aria-label="Actualiser le tableau de bord"
            >
              <RefreshCw className={`h-5 w-5 text-seal-gray-500 dark:text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            {typeof profileScore === 'number' && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  profileScore > 80
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : profileScore > 50
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
                title="Score de complétion du profil"
              >
                <ShieldCheck className="h-3 w-3" />
                Profil {profileScore}%
              </span>
            )}
          </div>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-0.5 capitalize">
            {dateStr} <span className="text-seal-gray-500/60 dark:text-slate-500">— voici votre espace {timeEmoji}</span>
          </p>
          <p className="text-xs text-seal-gray-500/70 dark:text-slate-500 mt-1.5 italic max-w-md">{tip}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/documents/new" title="Créer un nouveau document dans la base documentaire">
            <Button variant="secondary" size="sm">
              <FileText className="h-4 w-4" /> {t('dashboard.newDocument')}
            </Button>
          </Link>
          <Link href="/tickets" title="Ouvrir un nouveau ticket au support IT">
            <Button variant="outline" size="sm">
              <Ticket className="h-4 w-4" /> {t('dashboard.newTicket')}
            </Button>
          </Link>
          <div className="hidden xl:flex items-center gap-6">
            {showClock && (
              <>
                <div className="h-8 w-px bg-gray-200 dark:bg-slate-700" />
                <ClockWidget />
              </>
            )}
            {showWeather && (
              <>
                <div className="h-8 w-px bg-gray-200 dark:bg-slate-700" />
                <WeatherWidget />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardGreeting;
