'use client';

/**
 * Settings drawer opened from the greeting's gear button. Contains the
 * `DashboardFaceSelector` (watch-face presets) and a row of per-widget
 * toggles. All persistence happens in the parent via the passed setters.
 */

import React from 'react';
import { Card, CardContent } from '@omnitech/ui';
import { useTranslation } from '@/lib/i18n';
import {
  DashboardFaceSelector,
  type DashboardFaceDef,
  type DashboardFaceId,
} from './dashboard-face-selector';

export interface DashboardWidgetPrefs {
  showStats: boolean;
  showNews: boolean;
  showClock: boolean;
  showWeather: boolean;
  showQuickLinks: boolean;
  showQuote: boolean;
  showRss: boolean;
  showActivity: boolean;
  showHealthIT: boolean;
}

interface DashboardSettingsPanelProps {
  faceId: DashboardFaceId;
  onFaceChange: (face: DashboardFaceDef) => void;
  prefs: DashboardWidgetPrefs;
  onToggle: (key: keyof DashboardWidgetPrefs) => void;
}

export function DashboardSettingsPanel({ faceId, onFaceChange, prefs, onToggle }: DashboardSettingsPanelProps) {
  const { t } = useTranslation();
  const widgetLabels: Record<keyof DashboardWidgetPrefs, string> = {
    showStats: t('dashboard.widget.stats'),
    showNews: t('dashboard.widget.news'),
    showClock: t('dashboard.widget.clock'),
    showWeather: t('dashboard.widget.weather'),
    showQuickLinks: t('dashboard.widget.quickLinks'),
    showQuote: t('dashboard.widget.quote'),
    showRss: t('dashboard.widget.rss'),
    showActivity: t('dashboard.widget.activity'),
    showHealthIT: t('dashboard.widget.healthIT'),
  };

  return (
    <div className="mb-4 space-y-3">
      <DashboardFaceSelector value={faceId} onChange={onFaceChange} />
      <Card>
        <CardContent className="py-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
            {t('dashboard.widgetsVisible')}
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(widgetLabels) as Array<keyof DashboardWidgetPrefs>).map((key) => (
              <button
                key={key}
                onClick={() => onToggle(key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  prefs[key] ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400'
                }`}
              >
                {widgetLabels[key]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DashboardSettingsPanel;
