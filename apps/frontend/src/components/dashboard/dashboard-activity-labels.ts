'use client';

/**
 * Lookup tables + helpers used by the dashboard activity feeds
 * (`UserActivityCard` and `RecentActivityAdminCard`). Kept separate so the
 * JSX components stay focused on layout.
 */

import type { ElementType } from 'react';
import {
  BookOpen,
  Brain,
  FileText,
  MessageSquare,
  Newspaper,
  Sparkles,
  Ticket,
  UserCircle,
} from 'lucide-react';

export interface IconTheme {
  icon: ElementType;
  color: string;
  bg: string;
}

const SIGNIFICANT_RESOURCES = ['document', 'documentversion', 'ticket', 'incident', 'wiki', 'wikipage', 'quiz', 'charte'];
const SIGNIFICANT_ACTIONS = ['created', 'updated', 'uploaded', 'approved', 'published', 'resolved', 'completed', 'signed', 'declared'];

/**
 * Matches the filter previously inlined in `page.tsx`. `includeReadFilter`
 * matches the stricter user-activity variant; passing `false` matches the
 * admin-audit variant.
 */
export function isSignificantActivity(action: string, resourceType: string, includeReadFilter: boolean) {
  const act = (action || '').toLowerCase();
  const rt = (resourceType || '').toLowerCase();
  const isSignificantByResource = SIGNIFICANT_RESOURCES.includes(rt);
  const isSignificantByAction = SIGNIFICANT_ACTIONS.some((s) => act.includes(s));
  const baseMutation = act.startsWith('post /api/') && !act.includes('notifications');
  const isPostMutation = includeReadFilter
    ? baseMutation && !act.includes('get') && !act.includes('read')
    : baseMutation && !act.includes('read');
  const isPutPatch = (act.startsWith('put /api/') || act.startsWith('patch /api/')) && !act.includes('notifications');
  return (isSignificantByResource && isSignificantByAction) || isPostMutation || isPutPatch;
}

export const USER_ACTIVITY_ICONS: Record<string, IconTheme> = {
  DOCUMENT: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  DOCUMENTVERSION: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  TICKET: { icon: Ticket, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  NEWS: { icon: Newspaper, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  NEWSPOST: { icon: Newspaper, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  WIKI: { icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  WIKIPAGE: { icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  QUIZ: { icon: Brain, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-900/30' },
  RAG: { icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10' },
  COMMENT: { icon: MessageSquare, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-900/30' },
  USER: { icon: UserCircle, color: 'text-gray-600 dark:text-slate-400', bg: 'bg-gray-50 dark:bg-gray-900/30' },
};

export const USER_ACTIVITY_LABELS: Record<string, string> = {
  'document created': 'Document créé',
  'document updated': 'Document mis à jour',
  'document version uploaded': 'Nouvelle version uploadée',
  'document approved': 'Document approuvé',
  'document published': 'Document publié',
  'ticket created': 'Ticket créé',
  'ticket updated': 'Ticket mis à jour',
  'ticket resolved': 'Ticket résolu',
  'incident created': 'Incident déclaré',
  'incident updated': 'Incident mis à jour',
  'news created': 'Actualité publiée',
  'wiki created': 'Page wiki créée',
  'wiki updated': 'Page wiki modifiée',
  'quiz completed': 'Quiz terminé',
  'charte signed': 'Charte signée',
  'post /api/documents': 'Document créé',
  'post /api/documents/:id/versions': 'Nouvelle version',
  'post /api/tickets': 'Ticket créé',
  'post /api/incidents': 'Incident déclaré',
  'post /api/news': 'Actualité publiée',
  'post /api/wiki': 'Page wiki créée',
  'post /api/rag/reindex': 'Index IA mis à jour',
  'post /api/quiz/submit': 'Quiz complété',
};

export const RESOURCE_LABELS: Record<string, string> = {
  document: 'Document',
  documentversion: 'Document',
  ticket: 'Ticket',
  news: 'Actualité',
  newspost: 'Actualité',
  wiki: 'Wiki',
  wikipage: 'Wiki',
  quiz: 'Quiz',
  rag: 'Recherche IA',
  comment: 'Commentaire',
  user: 'Profil',
  notifications: 'Notification',
  incidents: 'Incident',
  documents: 'Document',
};

export const ADMIN_LABELS: Record<string, string> = {
  'document created': 'Document créé',
  'document updated': 'Document modifié',
  'document version uploaded': 'Nouvelle version',
  'ticket created': 'Ticket créé',
  'incident created': 'Incident déclaré',
  'quiz completed': 'Quiz terminé',
  'post /api/documents': 'Document créé',
  'post /api/tickets': 'Ticket créé',
  'post /api/incidents': 'Incident déclaré',
  'post /api/rag/reindex': 'Index IA mis à jour',
};

export const ADMIN_TYPE_LABELS: Record<string, string> = {
  document: 'Document',
  documentversion: 'Document',
  ticket: 'Ticket',
  notifications: 'Notification',
  rag: 'IA',
  documents: 'Document',
};

/** Humanises an action string, falling back to the URL pattern stripped. */
export function labelForAction(rawAction: string, map: Record<string, string>): string {
  const raw = rawAction.replace(/_/g, ' ').toLowerCase();
  const fallback = raw
    .replace(/^(post|put|patch|delete) \/api\//, '')
    .replace(/\/:?\w+/g, '')
    .replace(/\//g, ' ')
    .trim();
  return map[raw] ?? (fallback || 'Action');
}
