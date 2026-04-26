'use client';

/**
 * Dashboard — orchestration layer.
 *
 * Every data fetch lives in `useDashboardData`; every UI block lives in
 * `components/dashboard/*`. This page wires role + URL view selection to the
 * right section and forwards the fetched slices.
 *
 * Render order when activeView === 'me':
 *   1. DashboardTabs (admin only)
 *   2. DashboardGreeting (title, clock/weather, tips, refresh)
 *   3. DashboardSettingsPanel (face selector + widget toggles)
 *   4. DashboardOnboardingCard (admin, empty doc base)
 *   5. AI suggestion bar + explainability hints
 *   6. DashboardQuickActions (Mes tâches)
 *   7. QuickLinks row
 *   8. DashboardRecentPages
 *   9. DashboardAdminPanel
 *   10. DashboardStatsGrid
 *   11. SmartInsightsWidget
 *   12. DashboardFooterShortcuts
 *   13. DashboardWidgetsGrid
 */

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { Button, Card, CardContent } from '@omnitech/ui';
import { useAuthStore } from '@/stores/auth-store';
import { useAIOrchestrator } from '@/lib/ai-orchestrator';
import { useAISuggestions } from '@/lib/ai-ux';
import { useUIVisibility } from '@/lib/ui-os/execution';
import { useTranslations } from 'next-intl';
import { AISuggestionBar } from '@/components/ai/ai-suggestion-bar';
import { AIExplainabilityHints } from '@/components/ai/ai-explainability-hints';
import { QuickLinks } from '@/components/widgets/quick-links';
import {
  loadDashboardFace,
  saveDashboardFace,
  type DashboardFaceDef,
  type DashboardFaceId,
} from '@/components/dashboard/dashboard-face-selector';
import { DashboardGreeting } from '@/components/dashboard/dashboard-greeting';
import {
  DashboardQuickActions,
  useActionsRequises,
} from '@/components/dashboard/dashboard-quick-actions';
import { DashboardRecentPages } from '@/components/dashboard/dashboard-recent-pages';
import { DashboardStatsGrid } from '@/components/dashboard/dashboard-stats-grid';
import { DashboardWidgetsGrid } from '@/components/dashboard/dashboard-widgets-grid';
import { DashboardTabs, type DashboardView } from '@/components/dashboard/dashboard-tabs';
import { type DashboardWidgetPrefs } from '@/components/dashboard/dashboard-settings-panel';
import { useDashboardData } from '@/components/dashboard/use-dashboard-data';

const RssiDashboardSummary = dynamic(
  () => import('@/components/widgets/rssi-dashboard-summary').then((m) => m.RssiDashboardSummary),
  { ssr: false },
);

// Conditional / role-gated sections — chargées dynamiquement pour réduire le
// First Load JS (~314 KB → cible). Pas de SSR (composants client-only avec
// state local), skeleton léger pour préserver le layout.
const DashboardSettingsPanel = dynamic(
  () => import('@/components/dashboard/dashboard-settings-panel').then((m) => ({ default: m.DashboardSettingsPanel })),
  { ssr: false, loading: () => <div className="shimmer h-40 rounded-xl" /> },
);
const DashboardOnboardingCard = dynamic(
  () => import('@/components/dashboard/dashboard-onboarding-card').then((m) => ({ default: m.DashboardOnboardingCard })),
  { ssr: false },
);
const DashboardProviderView = dynamic(
  () => import('@/components/dashboard/dashboard-provider-view').then((m) => ({ default: m.DashboardProviderView })),
  { ssr: false, loading: () => <div className="shimmer h-64 rounded-xl" /> },
);
const DashboardAdminPanel = dynamic(
  () => import('@/components/dashboard/dashboard-admin-panel').then((m) => ({ default: m.DashboardAdminPanel })),
  { ssr: false },
);
const SmartInsightsWidget = dynamic(
  () => import('@/components/dashboard/dashboard-smart-insights').then((m) => ({ default: m.SmartInsightsWidget })),
  { ssr: false },
);
const WelcomeChecklist = dynamic(
  () => import('@/components/dashboard/welcome-checklist').then((m) => ({ default: m.WelcomeChecklist })),
  { ssr: false },
);
const DashboardFooterShortcuts = dynamic(
  () => import('@/components/dashboard/dashboard-footer-shortcuts').then((m) => ({ default: m.DashboardFooterShortcuts })),
  { ssr: false },
);

const defaultPrefs: DashboardWidgetPrefs = {
  showStats: true, showNews: true, showClock: true, showWeather: true,
  showQuickLinks: true, showQuote: true, showRss: true, showActivity: true,
  showHealthIT: true,
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const t = useTranslations('dashboard');
  const aiSuggestions = useAISuggestions('dashboard');
  // Side-effect hooks: trigger AI orchestration + UI visibility sync.
  useAIOrchestrator('DASHBOARD');
  useUIVisibility();

  const isManager = !!user && isRoleAtLeast(user.role, UserRole.REVIEWER);
  const isAdmin = !!user && isRoleAtLeast(user.role, UserRole.ADMIN);

  // --- Data + refresh --------------------------------------------------------
  const data = useDashboardData({ isManager, isAdmin, userRole: user?.role });
  const { actions: requiredActions, loaded: actionsLoaded } = useActionsRequises();

  // --- User preferences (watch face, widget toggles, onboarding, settings)
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('dashboard_onboarding_dismissed');
  });
  const [prefs, setPrefs] = useState<DashboardWidgetPrefs>(() => {
    if (typeof window === 'undefined') return defaultPrefs;
    try {
      const saved = localStorage.getItem('dashboard_prefs');
      return saved ? { ...defaultPrefs, ...JSON.parse(saved) } : defaultPrefs;
    } catch { return defaultPrefs; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [faceId, setFaceId] = useState<DashboardFaceId>(() => loadDashboardFace());

  const applyFace = useCallback((face: DashboardFaceDef) => {
    setFaceId(face.id);
    saveDashboardFace(face.id);
    setPrefs(face.prefs);
    localStorage.setItem('dashboard_prefs', JSON.stringify(face.prefs));
  }, []);

  const toggleWidget = useCallback((key: keyof DashboardWidgetPrefs) => {
    setPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem('dashboard_prefs', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // --- Tabs (admin only) ------------------------------------------------------
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawView = searchParams?.get('view');
  const activeView: DashboardView = useMemo(() => {
    if (isAdmin && rawView === 'rssi') return 'rssi';
    return 'me';
  }, [isAdmin, rawView]);

  const switchView = useCallback(
    (view: DashboardView) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (view === 'me') params.delete('view');
      else params.set('view', view);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // --- Role branches ----------------------------------------------------------
  if (user?.role === UserRole.PRESTATAIRE) {
    return <DashboardProviderView />;
  }

  if (data.error && !data.loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">{t('loadError')}</p>
            <Button className="mt-4" onClick={() => { data.setError(false); window.location.reload(); }}>
              {t('retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showOnboarding =
    isAdmin && !data.loading && data.stats?.totalDocuments === 0 && !onboardingDismissed;

  return (
    <div className="space-y-6">
      {isAdmin && <DashboardTabs activeView={activeView} onSwitch={switchView} />}
      {isAdmin && activeView === 'rssi' && <RssiDashboardSummary />}

      {!(isAdmin && activeView === 'rssi') && (
        <>
          <DashboardGreeting
            firstName={user?.firstName}
            showClock={prefs.showClock}
            showWeather={prefs.showWeather}
            isRefreshing={data.isRefreshing}
            onRefresh={data.handleManualRefresh}
            onToggleSettings={() => setShowSettings((v) => !v)}
            profileScore={data.uxInsights?.score}
          />

          {showSettings && (
            <DashboardSettingsPanel
              faceId={faceId}
              onFaceChange={applyFace}
              prefs={prefs}
              onToggle={toggleWidget}
            />
          )}

          {showOnboarding && (
            <DashboardOnboardingCard
              onDismiss={() => {
                localStorage.setItem('dashboard_onboarding_dismissed', '1');
                setOnboardingDismissed(true);
              }}
            />
          )}

          {/* Démarrage rapide — auto-masqué si 5/5, > 14 jours, ou dismissed. */}
          <WelcomeChecklist />

          <AISuggestionBar suggestions={aiSuggestions} />
          <AIExplainabilityHints />

          <DashboardQuickActions
            actions={requiredActions}
            actionsLoaded={actionsLoaded}
            myTasks={data.myTasks}
            firstName={user?.firstName}
          />

          {prefs.showQuickLinks && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 lg:col-span-2">
                <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
                  {t('quickAccess')}
                </p>
                <QuickLinks />
              </div>
            </div>
          )}

          <DashboardRecentPages isManager={isManager} />

          <DashboardAdminPanel
            isAdmin={isAdmin}
            isManager={isManager}
            compliance={data.compliance}
            ticketStats={data.ticketStats}
            veilleStats={data.veilleStats}
          />

          {prefs.showStats && (
            <DashboardStatsGrid stats={data.stats} loading={data.loading} isAdmin={isAdmin} isManager={isManager} />
          )}

          {data.uxInsights && data.uxInsights.insights && data.uxInsights.insights.length > 0 && (
            <SmartInsightsWidget data={data.uxInsights} />
          )}

          <DashboardFooterShortcuts lastLoadedAt={data.lastLoadedAt} loading={data.loading} />

          <DashboardWidgetsGrid
            loading={data.loading}
            recentDocs={data.recentDocs}
            pinnedNews={data.pinnedNews}
            showNews={prefs.showNews}
            showRss={prefs.showRss}
            showActivity={prefs.showActivity}
            activeSurvey={data.activeSurvey}
            userActivity={data.userActivity}
            weeklyActivityCounts={data.weeklyActivityCounts}
            bookmarks={data.bookmarks}
            aiRecommendations={data.aiRecommendations}
            recentActivity={data.recentActivity}
            isAdmin={isAdmin}
            isManager={isManager}
          />
        </>
      )}
    </div>
  );
}
