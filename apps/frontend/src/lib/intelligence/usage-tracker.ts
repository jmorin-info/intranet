/**
 * Usage Tracker — Lightweight page usage analytics (client-side only).
 *
 * Tracks: page views, feature usage, navigation flows.
 * Stored in localStorage with a 7-day rolling window.
 * No external analytics service dependency.
 */

const STORAGE_KEY = 'omnitech:usage:v1';
const MAX_ENTRIES = 200;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface UsageEvent {
  type: 'page_view' | 'feature_use' | 'search' | 'action';
  path: string;
  module: string;
  detail?: string;
  timestamp: number;
}

export interface UsageSummary {
  totalPageViews: number;
  topPages: Array<{ path: string; count: number }>;
  topModules: Array<{ module: string; count: number }>;
  recentPaths: string[];
  activeHours: number[];
  searchCount: number;
  actionCount: number;
}

function loadEvents(): UsageEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const events: UsageEvent[] = JSON.parse(raw);
    const cutoff = Date.now() - RETENTION_MS;
    return events.filter(e => e.timestamp > cutoff);
  } catch {
    return [];
  }
}

function saveEvents(events: UsageEvent[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_ENTRIES)));
  } catch { /* storage full */ }
}

export function trackEvent(event: Omit<UsageEvent, 'timestamp'>) {
  const events = loadEvents();
  events.push({ ...event, timestamp: Date.now() });
  saveEvents(events);
}

export function trackPageView(path: string) {
  const module = detectModule(path);
  trackEvent({ type: 'page_view', path, module });
}

export function trackFeatureUse(path: string, feature: string) {
  trackEvent({ type: 'feature_use', path, module: detectModule(path), detail: feature });
}

export function trackSearch(query: string) {
  trackEvent({ type: 'search', path: '/search', module: 'search', detail: query });
}

export function trackAction(path: string, action: string) {
  trackEvent({ type: 'action', path, module: detectModule(path), detail: action });
}

export function getUsageSummary(): UsageSummary {
  const events = loadEvents();

  const pageViews = events.filter(e => e.type === 'page_view');
  const pageCounts = new Map<string, number>();
  const moduleCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  const recentPaths: string[] = [];

  for (const ev of pageViews) {
    pageCounts.set(ev.path, (pageCounts.get(ev.path) || 0) + 1);
    moduleCounts.set(ev.module, (moduleCounts.get(ev.module) || 0) + 1);
    const hour = new Date(ev.timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    if (!recentPaths.includes(ev.path)) recentPaths.push(ev.path);
  }

  const topPages = [...pageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  const topModules = [...moduleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([module, count]) => ({ module, count }));

  const activeHours = [...hourCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => hour);

  return {
    totalPageViews: pageViews.length,
    topPages,
    topModules,
    recentPaths: recentPaths.slice(-10).reverse(),
    activeHours,
    searchCount: events.filter(e => e.type === 'search').length,
    actionCount: events.filter(e => e.type === 'action').length,
  };
}

function detectModule(path: string): string {
  if (path.startsWith('/documents')) return 'documents';
  if (path.startsWith('/tickets')) return 'tickets';
  if (path.startsWith('/incidents')) return 'incidents';
  if (path.startsWith('/veille')) return 'veille';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/wiki')) return 'wiki';
  if (path.startsWith('/news')) return 'news';
  if (path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/search')) return 'search';
  if (path.startsWith('/profile')) return 'profile';
  return 'other';
}
