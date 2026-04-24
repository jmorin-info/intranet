'use client';

/**
 * Consolidates every dashboard data fetch + side-effect subscription so the
 * page component can stay focused on layout.
 *
 * Responsibilities:
 *  - initial + silent refresh load (`loadDashboard`)
 *  - 5 min full auto-refresh (toast-driven) and 60 s task-count poll
 *  - targeted stats refresh on mutation events from the global event bus
 *  - bookmarks sync via `bookmarks-changed` DOM events
 *
 * Exposes every fetched slice plus the `handleManualRefresh` helper used by
 * the greeting block.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserRole } from '@omnitech/shared';
import { api } from '@/lib/api';
import { features } from '@/lib/features';
import { logger } from '@/lib/logger';
import { useEventSubscription } from '@/lib/events';
import { getBookmarks, type BookmarkItem } from '@/components/bookmark-button';
import type { DashboardStats } from './dashboard-stats-grid';
import type { UxInsightsData } from './dashboard-smart-insights';
import type { MyTasks } from './dashboard-quick-actions';

interface ComplianceSummary { total: number; covered: number; coveragePercent: number }
interface RecentDocument { id: string; title: string; reference: string; status: string; updatedAt: string; owner: { firstName: string; lastName: string } }
interface PinnedNews { id: string; title: string; slug: string; excerpt: string; publishedAt: string; author: { firstName: string; lastName: string } }
interface TicketStats { open: number; inProgress: number }
interface VeilleStats { total: number; unprocessed: number }
interface ActivityEntry { id: string; action: string; resourceType: string; resourceId?: string; createdAt: string }
interface AdminActivityEntry { id: string; action: string; resourceType: string; createdAt: string }

interface UseDashboardDataOptions {
  isManager: boolean;
  isAdmin: boolean;
  userRole: UserRole | undefined;
}

export function useDashboardData({ isManager, isAdmin, userRole }: UseDashboardDataOptions) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [pinnedNews, setPinnedNews] = useState<PinnedNews[]>([]);
  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null);
  const [veilleStats, setVeilleStats] = useState<VeilleStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<AdminActivityEntry[]>([]);
  const [activeSurvey, setActiveSurvey] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [userActivity, setUserActivity] = useState<ActivityEntry[]>([]);
  const [myTasks, setMyTasks] = useState<MyTasks | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [uxInsights, setUxInsights] = useState<UxInsightsData | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<{ documents: any[]; wiki: any[]; actions: string[] } | null>(null);
  const [weeklyActivityCounts, setWeeklyActivityCounts] = useState<number[]>([]);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (userRole === UserRole.PRESTATAIRE) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      let aggregatedOk = false;
      try {
        const initR = await api.get('/dashboard');
        if (initR.data) {
          aggregatedOk = true;
          if (initR.data.stats) setStats(initR.data.stats as DashboardStats);
          if (initR.data.recentDocuments) setRecentDocs(initR.data.recentDocuments as RecentDocument[]);
          if (initR.data.pinnedNews) setPinnedNews(initR.data.pinnedNews as PinnedNews[]);
          if (initR.data.ticketStats) setTicketStats(initR.data.ticketStats);
        }
      } catch {
        // Aggregated endpoint unavailable — fall back to individual calls below.
      }

      if (!aggregatedOk) {
        const [statsR, docsR, newsR] = await Promise.all([
          api.get('/reports/dashboard-stats').catch(() => ({ data: null })),
          api.get('/documents', { params: { limit: 5, sortBy: 'updatedAt', sortOrder: 'desc' } }).catch(() => ({ data: { data: [] } })),
          api.get('/news', { params: { limit: 4 } }).catch(() => ({ data: { data: [] } })),
        ] as const);
        if (statsR.data) setStats(statsR.data as DashboardStats);
        setRecentDocs(((docsR.data as { data?: RecentDocument[] })?.data) || []);
        setPinnedNews(((newsR.data as { data?: PinnedNews[] })?.data) || []);
      }

      if (isManager) {
        api.get('/iso-analyzer/compliance-summary')
          .then((r) => setCompliance(r.data))
          .catch((err) => logger.error(err, { context: 'dashboard: compliance summary' }));
      }
      if (isAdmin) {
        if (!aggregatedOk) api.get('/tickets/stats').then((r) => setTicketStats(r.data)).catch(() => {});
        api.get('/veille/stats').then((r) => setVeilleStats(r.data)).catch(() => {});
      }

      api.get('/satisfaction/surveys').then(({ data }) => {
        const surveys = Array.isArray(data) ? data : (data?.data || []);
        const active = surveys.find((s: any) => s.isActive || (s.expiresAt && new Date(s.expiresAt) > new Date()));
        if (active) setActiveSurvey({ id: active.id, title: active.title, description: active.description });
      }).catch((err) => logger.error(err, { context: 'dashboard: satisfaction surveys' }));

      api.get('/audit/my-activity', { params: { limit: 50 } })
        .then((r) => {
          const items: ActivityEntry[] = r.data?.data || [];
          setUserActivity(items);
          const now = Date.now();
          const counts = Array.from({ length: 7 }, (_, dayIdx) => {
            const dayStart = now - (6 - dayIdx) * 86400000;
            const dayEnd = dayStart + 86400000;
            return items.filter((a) => {
              const tms = new Date(a.createdAt).getTime();
              return tms >= dayStart && tms < dayEnd;
            }).length;
          });
          setWeeklyActivityCounts(counts);
        })
        .catch(() => {});
      if (isAdmin) {
        api.get('/audit', { params: { limit: 5 } })
          .then((r) => setRecentActivity(r.data?.data || []))
          .catch(() => {});
      }

      if (features.ai) {
        api.get('/ai/recommendations').then(({ data }) => {
          setAiRecommendations(data ?? null);
          setMyTasks({
            pendingSignatures: data?.pendingSignatures ?? 0,
            docsToReview: data?.docsToReview ?? 0,
            unreadNotifications: data?.unreadNotifications ?? 0,
            unsignedChartes: data?.unsignedChartes ?? 0,
          });
        }).catch(() => {});
      }

      setBookmarks(getBookmarks());

      if (features.ai) {
        api.get('/ai/ux-insights').then(({ data }) => setUxInsights(data)).catch(() => {});
      }
    } catch (err) {
      logger.error(err, { context: 'dashboard: load' });
      setError(true);
    } finally {
      setLoading(false);
      setLastLoadedAt(new Date());
    }
  }, [isManager, isAdmin, userRole]);

  // Initial load.
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Auto-refresh every 5 minutes with a subtle toast.
  useEffect(() => {
    if (userRole === UserRole.PRESTATAIRE) return;
    const interval = setInterval(async () => {
      setIsRefreshing(true);
      const toastId = toast.loading('Actualisation...');
      try {
        await loadDashboard(true);
        toast.dismiss(toastId);
      } finally {
        setIsRefreshing(false);
      }
    }, 300000);
    return () => clearInterval(interval);
  }, [loadDashboard, userRole]);

  // Lightweight task-counts poll every 60s.
  useEffect(() => {
    if (!features.ai || userRole === UserRole.PRESTATAIRE) return;
    const taskPoll = setInterval(() => {
      api.get('/ai/recommendations').then(({ data }) => {
        setAiRecommendations(data ?? null);
        setMyTasks({
          pendingSignatures: data?.pendingSignatures ?? 0,
          docsToReview: data?.docsToReview ?? 0,
          unreadNotifications: data?.unreadNotifications ?? 0,
          unsignedChartes: data?.unsignedChartes ?? 0,
        });
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(taskPoll);
  }, [userRole]);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const toastId = toast.loading('Actualisation...');
    try {
      await loadDashboard(true);
      toast.dismiss(toastId);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadDashboard, isRefreshing]);

  // Event bus: targeted stats refresh on any module mutation.
  useEventSubscription('*', (event) => {
    if (event.metadata?.optimistic) return;
    if (['CREATED', 'STATUS_CHANGED', 'APPROVED', 'REJECTED', 'DELETED'].includes(event.type)) {
      api.get('/reports/dashboard-stats').then((r) => { if (r.data) setStats(r.data as DashboardStats); }).catch(() => {});
    }
  });

  // Bookmarks live-sync.
  useEffect(() => {
    const syncBookmarks = () => setBookmarks(getBookmarks());
    window.addEventListener('bookmarks-changed', syncBookmarks);
    return () => window.removeEventListener('bookmarks-changed', syncBookmarks);
  }, []);

  return {
    stats,
    compliance,
    recentDocs,
    pinnedNews,
    ticketStats,
    veilleStats,
    recentActivity,
    activeSurvey,
    userActivity,
    myTasks,
    bookmarks,
    uxInsights,
    aiRecommendations,
    weeklyActivityCounts,
    loading,
    isRefreshing,
    error,
    setError,
    lastLoadedAt,
    handleManualRefresh,
  };
}
