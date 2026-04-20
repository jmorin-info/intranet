'use client';

import Link from 'next/link';
import { Bell, ArrowRight, CheckCheck } from 'lucide-react';
import { useNotificationStore } from '@/stores/notification-store';
import { formatRelativeTime } from '@/lib/utils';

/**
 * Widget dashboard : 5 dernières notifications non lues + accès rapide.
 * Source : notification store (déjà polli toutes les 60s par AuthProvider).
 */
export function MyNotificationsWidget() {
  const { notifications, unreadCount } = useNotificationStore();
  const unread = (notifications || []).filter((n: any) => !n.isRead).slice(0, 5);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Notifications</h3>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <Link
          href="/notifications"
          className="text-[11px] text-seal-gray-500 dark:text-slate-400 hover:text-primary flex items-center gap-1"
        >
          Tout voir <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {unread.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCheck className="h-8 w-8 text-emerald-400" />
          <p className="text-xs text-seal-gray-500 dark:text-slate-500">Tout est lu — bravo !</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {unread.map((n: any) => (
            <li key={n.id}>
              <Link
                href={
                  n.resourceType === 'ticket'
                    ? `/tickets/${n.resourceId}`
                    : n.resourceType === 'document'
                      ? `/documents/${n.resourceId}`
                      : n.resourceType === 'news'
                        ? `/news/${n.resourceId}`
                        : '/notifications'
                }
                className="group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/60"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-seal-navy dark:text-white group-hover:text-primary truncate">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                      {n.body}
                    </p>
                  )}
                  <p className="text-[9px] text-seal-gray-500/70 dark:text-slate-600 tabular-nums mt-0.5">
                    {n.createdAt ? formatRelativeTime(n.createdAt) : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
