import React from 'react';
import { cn } from './utils';
import {
  FileX,
  Users,
  Newspaper,
  Bell,
  Search,
  FolderOpen,
  CheckCircle2,
  TicketIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button, buttonVariants } from './button';

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

type CtaClick = { label: string; onClick: () => void; href?: never };
type CtaLink = { label: string; href: string; onClick?: never };
type Cta = CtaClick | CtaLink;

interface EmptyStateProps {
  type?: EmptyStateType;
  /**
   * Icône Lucide custom (composant). Prend le pas sur `type` si fournie.
   * Permet aux écrans hors taxonomie d'afficher un visuel cohérent.
   */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Action principale typée (rétrocompat : utiliser `action` pour un noeud libre). */
  cta?: Cta;
  /** @deprecated Préférer `cta`. Conservé pour rétrocompatibilité. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  type = 'general',
  icon: IconComponent,
  title,
  description,
  cta,
  action,
  className,
}: EmptyStateProps) {
  const { icon, bg } = iconMap[type];
  const renderedIcon = IconComponent ? (
    <IconComponent className="h-10 w-10 text-seal-navy/50 dark:text-blue-300/50" aria-hidden="true" />
  ) : (
    icon
  );
  const renderedBg = IconComponent ? 'bg-seal-navy/5 dark:bg-blue-900/20' : bg;

  let renderedCta: React.ReactNode = action;
  if (!renderedCta && cta) {
    if ('href' in cta && cta.href) {
      renderedCta = (
        <a
          href={cta.href}
          className={buttonVariants({ variant: 'primary', size: 'md' })}
        >
          {cta.label}
        </a>
      );
    } else if ('onClick' in cta && cta.onClick) {
      renderedCta = (
        <Button variant="primary" size="md" onClick={cta.onClick}>
          {cta.label}
        </Button>
      );
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 rounded-2xl',
        'bg-gradient-to-b from-gray-50/80 to-transparent dark:from-slate-800/40 dark:to-transparent',
        className,
      )}
    >
      <div className="animate-[fadeIn_0.5s_ease-out] flex flex-col items-center">
        <div className={cn('rounded-2xl p-5 mb-5 ring-1 ring-black/5 dark:ring-white/5', renderedBg)}>
          {renderedIcon}
        </div>
        <h3 className="text-lg font-semibold text-seal-navy dark:text-white">{title}</h3>
        {description && (
          <p className="mt-2 text-sm text-seal-gray-500 dark:text-slate-400 text-center max-w-sm leading-relaxed">{description}</p>
        )}
        {renderedCta && <div className="mt-5">{renderedCta}</div>}
      </div>
    </div>
  );
}
