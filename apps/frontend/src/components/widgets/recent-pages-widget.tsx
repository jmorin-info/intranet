'use client';

import Link from 'next/link';
import {
  Clock,
  X,
  FileText,
  Ticket,
  Newspaper,
  AlertTriangle,
  BookOpen,
  Camera,
  ShieldCheck,
  Settings,
  Users,
  Bell,
  Search,
  ClipboardCheck,
  MessageSquare,
  Activity,
  LayoutDashboard,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useRecentPages, clearRecentPages } from '@/hooks/use-recent-pages';

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} j`;
  return `il y a ${Math.floor(d / 7)} sem.`;
}

const ICON_RULES: Array<{ match: (p: string) => boolean; icon: LucideIcon }> = [
  { match: (p) => p.startsWith('/documents'), icon: FileText },
  { match: (p) => p.startsWith('/tickets'), icon: Ticket },
  { match: (p) => p.startsWith('/news'), icon: Newspaper },
  { match: (p) => p.startsWith('/incidents') || p.startsWith('/alerts'), icon: AlertTriangle },
  { match: (p) => p.startsWith('/wiki') || p.startsWith('/runbooks') || p.startsWith('/procedures'), icon: BookOpen },
  { match: (p) => p.startsWith('/media'), icon: Camera },
  { match: (p) => p.startsWith('/certificates') || p.startsWith('/veille'), icon: ShieldCheck },
  { match: (p) => p.startsWith('/admin'), icon: Settings },
  { match: (p) => p.startsWith('/directory') || p.startsWith('/extranet'), icon: Users },
  { match: (p) => p.startsWith('/notifications'), icon: Bell },
  { match: (p) => p.startsWith('/search'), icon: Search },
  { match: (p) => p.startsWith('/signatures') || p.startsWith('/satisfaction') || p.startsWith('/testimonials'), icon: ClipboardCheck },
  { match: (p) => p.startsWith('/chat') || p.startsWith('/helpdesk'), icon: MessageSquare },
  { match: (p) => p.startsWith('/timeline') || p.startsWith('/changelog'), icon: Activity },
];

function iconForPath(path: string): LucideIcon {
  return ICON_RULES.find((r) => r.match(path))?.icon ?? LayoutDashboard;
}

export function RecentPagesWidget() {
  const pages = useRecentPages().slice(0, 5);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Récemment consulté</h3>
        </div>
        {pages.length > 0 && (
          <button
            onClick={clearRecentPages}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 transition focus-visible:ring-2 focus-visible:ring-[#F9964A] focus-visible:outline-none"
            aria-label="Effacer l'historique"
            title="Effacer l'historique"
          >
            <X className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
          </button>
        )}
      </div>

      {pages.length === 0 ? (
        <div className="py-6 text-center">
          <Clock className="h-8 w-8 text-seal-gray-500/30 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-seal-gray-500 dark:text-slate-500">
            Aucune page récemment consultée — commencez à naviguer !
          </p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {pages.map((p) => {
            const Icon = iconForPath(p.path);
            return (
              <li key={p.path}>
                <Link
                  href={p.path}
                  className="group flex items-center gap-3 px-2 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/60 transition focus-visible:ring-2 focus-visible:ring-[#F9964A] focus-visible:outline-none"
                  title={p.title}
                >
                  <Icon className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 group-hover:text-primary transition-colors shrink-0" />
                  <span className="flex-1 text-sm text-seal-navy dark:text-white truncate group-hover:text-primary">
                    {p.title}
                  </span>
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 shrink-0 tabular-nums">
                    {formatRelative(p.visitedAt)}
                  </span>
                  <ChevronRight className="h-3 w-3 text-seal-gray-500/40 dark:text-slate-600 group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
