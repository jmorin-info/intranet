'use client';

/**
 * Sidebar AI recommendations card.
 *
 * Reads from `/ai/recommendations` (fetched by the page) and surfaces:
 * - unread wiki articles this week (emerald pill)
 * - pending signature / notification / quiz actions (amber pills)
 * - recommended documents + recent wiki entries
 *
 * Renders nothing when the payload is missing or empty — the hook-gated
 * `features.ai` flag already controls mount/unmount in the parent.
 */

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@omnitech/ui';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Brain,
  FileText,
  PenLine,
  Sparkles,
} from 'lucide-react';

export interface AiRecommendationsData {
  documents: any[];
  wiki: any[];
  actions: string[];
}

export function AiSuggestionsCard({ data }: { data: AiRecommendationsData | null }) {
  if (!data) return null;
  if ((data.actions?.length ?? 0) === 0 && (data.documents?.length ?? 0) === 0 && (data.wiki?.length ?? 0) === 0) {
    return null;
  }

  const totalItems = data.actions.length + data.documents.length + data.wiki.length;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Suggestions pour vous</h3>
          <span className="ml-auto text-[10px] text-seal-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
            {totalItems}
          </span>
        </div>

        <div className="space-y-1.5 mb-3">
          {data.wiki.length > 0 && (
            <Link
              href="/wiki"
              className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition text-xs"
            >
              <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium text-seal-navy dark:text-white">
                Vous avez {data.wiki.length} article{data.wiki.length > 1 ? 's' : ''} wiki non lu{data.wiki.length > 1 ? 's' : ''} cette semaine
              </span>
              <ArrowRight className="h-3 w-3 text-seal-gray-500 ml-auto" />
            </Link>
          )}
          {data.actions
            .filter((a): a is string => typeof a === 'string')
            .map((action, i) => {
              const isSig = action.includes('signature');
              const isNotif = action.includes('notification');
              const isQuiz = action.toLowerCase().includes('quiz');
              const href = isSig ? '/documents?tab=signatures' : isNotif ? '/notifications' : isQuiz ? '/quiz' : '#';
              return (
                <Link
                  key={i}
                  href={href}
                  className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition text-xs"
                >
                  {isSig ? (
                    <PenLine className="h-3.5 w-3.5 text-amber-600" />
                  ) : isNotif ? (
                    <Bell className="h-3.5 w-3.5 text-blue-600" />
                  ) : isQuiz ? (
                    <Brain className="h-3.5 w-3.5 text-pink-600" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  )}
                  <span className="font-medium text-seal-navy dark:text-white">{action}</span>
                  <ArrowRight className="h-3 w-3 text-seal-gray-500 ml-auto" />
                </Link>
              );
            })}
        </div>

        {data.documents.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
              Documents recommandes
            </p>
            <div className="space-y-1">
              {data.documents.slice(0, 3).map((doc: any) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 transition text-xs group"
                >
                  <FileText className="h-3.5 w-3.5 text-seal-gray-500 group-hover:text-primary transition" />
                  <span className="text-seal-navy dark:text-white truncate group-hover:text-primary transition">{doc.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {data.wiki.length > 0 && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
              Wiki recent
            </p>
            <div className="space-y-1">
              {data.wiki.map((page: any) => (
                <Link
                  key={page.id}
                  href={`/wiki/${page.slug || page.id}`}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 transition text-xs group"
                >
                  <BookOpen className="h-3.5 w-3.5 text-seal-gray-500 group-hover:text-primary transition" />
                  <span className="text-seal-navy dark:text-white truncate group-hover:text-primary transition">{page.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AiSuggestionsCard;
