import React from 'react';
import { cn } from './utils';
import { FileX, Users, Newspaper, Bell, Search, FolderOpen, CheckCircle2, TicketIcon } from 'lucide-react';

type EmptyStateType = 'documents' | 'users' | 'news' | 'notifications' | 'search' | 'general' | 'success' | 'tickets';

const iconMap: Record<EmptyStateType, { icon: React.ReactNode; bg: string }> = {
  documents: { icon: <FileX className="h-10 w-10 text-[#004469]/40 dark:text-blue-400/40" />, bg: 'bg-[#004469]/5 dark:bg-blue-900/20' },
  users: { icon: <Users className="h-10 w-10 text-violet-400/60" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
  news: { icon: <Newspaper className="h-10 w-10 text-[#F68D2E]/50" />, bg: 'bg-[#F68D2E]/5 dark:bg-orange-900/20' },
  notifications: { icon: <Bell className="h-10 w-10 text-blue-400/50" />, bg: 'bg-blue-50 dark:bg-blue-900/20' },
  search: { icon: <Search className="h-10 w-10 text-seal-gray-500/40" />, bg: 'bg-gray-100 dark:bg-slate-800' },
  general: { icon: <FolderOpen className="h-10 w-10 text-seal-gray-500/40" />, bg: 'bg-gray-100 dark:bg-slate-800' },
  success: { icon: <CheckCircle2 className="h-10 w-10 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  tickets: { icon: <TicketIcon className="h-10 w-10 text-amber-400/60" />, bg: 'bg-amber-50 dark:bg-amber-900/20' },
};

interface EmptyStateProps {
  type?: EmptyStateType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  type = 'general',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const { icon, bg } = iconMap[type];
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 px-6 rounded-2xl',
      'bg-gradient-to-b from-gray-50/80 to-transparent dark:from-slate-800/40 dark:to-transparent',
      className,
    )}>
      <div className="animate-[fadeIn_0.5s_ease-out] flex flex-col items-center">
        <div className={cn('rounded-2xl p-5 mb-5 ring-1 ring-black/5 dark:ring-white/5', bg)}>
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-seal-navy dark:text-white">{title}</h3>
        {description && (
          <p className="mt-2 text-sm text-seal-gray-500 dark:text-slate-400 text-center max-w-sm leading-relaxed">{description}</p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
