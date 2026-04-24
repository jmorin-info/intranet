'use client';

/**
 * Dashboard — main grid (two thirds / one third layout).
 *
 * Left column (2/3):
 *   - `DashboardRecentDocsCard`
 *   - `DashboardPinnedNewsCard` (when `showNews` and items exist)
 *
 * Right column (1/3):
 *   - Active satisfaction survey CTA
 *   - `UserActivityCard` (audit feed + weekly bar chart)
 *   - `DashboardBookmarksCard`
 *   - `AiSuggestionsCard` (AI feature-flag gated)
 *   - Lucca RH widget + RSS feed (REVIEWER+) + admin-only activity
 *
 * This component is pure presentation: the parent page owns every slice of
 * state passed in through props.
 */

import React from 'react';
import Link from 'next/link';
import { Button, Card, CardContent } from '@omnitech/ui';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { features } from '@/lib/features';
import { LuccaWidget } from '@/components/widgets/lucca-widget';
import { RSSFeedWidget } from '@/components/widgets/rss-feed-widget';
import type { BookmarkItem } from '@/components/bookmark-button';
import { AiSuggestionsCard } from './dashboard-ai-suggestions-card';
import {
  RecentActivityAdminCard,
  UserActivityCard,
  type ActivityEntry,
  type AdminActivityEntry,
} from './dashboard-activity-cards';
import { DashboardBookmarksCard } from './dashboard-bookmarks-card';
import { DashboardRecentDocsCard, type RecentDocument } from './dashboard-recent-docs-card';
import { DashboardPinnedNewsCard, type PinnedNews } from './dashboard-pinned-news-card';

interface ActiveSurvey {
  id: string;
  title: string;
  description?: string;
}

interface DashboardWidgetsGridProps {
  loading: boolean;
  recentDocs: RecentDocument[];
  pinnedNews: PinnedNews[];
  showNews: boolean;
  showRss: boolean;
  showActivity: boolean;
  activeSurvey: ActiveSurvey | null;
  userActivity: ActivityEntry[];
  weeklyActivityCounts: number[];
  bookmarks: BookmarkItem[];
  aiRecommendations: { documents: any[]; wiki: any[]; actions: string[] } | null;
  recentActivity: AdminActivityEntry[];
  isAdmin: boolean;
  isManager: boolean;
}

export function DashboardWidgetsGrid({
  loading,
  recentDocs,
  pinnedNews,
  showNews,
  showRss,
  showActivity,
  activeSurvey,
  userActivity,
  weeklyActivityCounts,
  bookmarks,
  aiRecommendations,
  recentActivity,
  isAdmin,
  isManager,
}: DashboardWidgetsGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 flex flex-col gap-6">
        <DashboardRecentDocsCard loading={loading} docs={recentDocs} />
        {showNews && pinnedNews.length > 0 && <DashboardPinnedNewsCard news={pinnedNews} />}
      </div>

      <div className="space-y-6">
        {activeSurvey && <ActiveSurveyCard survey={activeSurvey} />}

        {userActivity.length > 0 && (
          <UserActivityCard entries={userActivity} weeklyCounts={weeklyActivityCounts} />
        )}

        <DashboardBookmarksCard bookmarks={bookmarks} />

        {features.ai && <AiSuggestionsCard data={aiRecommendations} />}

        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
            Widgets
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
            <Card className="h-full">
              <CardContent className="h-full">
                <LuccaWidget />
              </CardContent>
            </Card>

            {isManager && showRss && (
              <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                <Card>
                  <CardContent>
                    <RSSFeedWidget />
                  </CardContent>
                </Card>
              </div>
            )}

            {isAdmin && showActivity && recentActivity.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                <RecentActivityAdminCard entries={recentActivity} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveSurveyCard({ survey }: { survey: ActiveSurvey }) {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-seal-navy dark:text-white">Enquête de satisfaction</p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">{survey.title}</p>
          </div>
          <Link href="/satisfaction" className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0">
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {survey.description && (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-3 line-clamp-2">{survey.description}</p>
        )}
        <Link href="/satisfaction">
          <Button size="sm" className="w-full">
            Répondre <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default DashboardWidgetsGrid;
