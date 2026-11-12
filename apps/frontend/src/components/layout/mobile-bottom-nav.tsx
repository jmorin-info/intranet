'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { UserRole, isRoleAtLeast } from '@omnitech/shared';
import {
  Home,
  Briefcase,
  ShieldCheck,
  Cog,
  Activity,
  Bell,
  LogOut,
  FileText,
  Ticket,
  type LucideIcon,
} from 'lucide-react';

interface HubTab {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Active pour toutes les routes qui commencent par l'un de ces préfixes. */
  match: string[];
  minRole?: UserRole;
}

/**
 * Mobile bottom nav = 5 hubs métiers (exception PRESTATAIRE: 4 raccourcis).
 * Cohérence avec la sidebar desktop.
 */
const HUB_TABS: HubTab[] = [
  {
    href: '/dashboard',
    icon: Home,
    label: 'Espace',
    match: ['/dashboard', '/notifications', '/profile', '/tickets', '/signatures', '/approvals', '/calendar', '/mfa'],
  },
  {
    href: '/hub/work',
    icon: Briefcase,
    label: 'Travail',
    match: ['/hub/work', '/documents', '/procedures', '/news', '/wiki', '/directory', '/files', '/search', '/tools'],
  },
  {
    href: '/hub/security',
    icon: ShieldCheck,
    label: 'Sécurité',
    match: ['/hub/security', '/incidents', '/alerts', '/veille', '/chartes', '/helpdesk', '/quiz', '/satisfaction'],
  },
  {
    href: '/admin',
    icon: Cog,
    label: 'Admin',
    match: ['/admin', '/extranet'],
    minRole: UserRole.ADMIN,
  },
  {
    href: '/admin/rssi-dashboard',
    icon: Activity,
    label: 'RSSI',
    match: ['/admin/rssi-dashboard'],
    minRole: UserRole.SUPER_ADMIN,
  },
];

const PRESTATAIRE_TABS: HubTab[] = [
  { href: '/dashboard', icon: Home, label: 'Accueil', match: ['/dashboard'] },
  { href: '/documents', icon: FileText, label: 'Documents', match: ['/documents'] },
  { href: '/tickets', icon: Ticket, label: 'Tickets', match: ['/tickets'] },
  { href: '/notifications', icon: Bell, label: 'Notifs', match: ['/notifications'] },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const user = useAuthStore(s => s.user); const logout = useAuthStore(s => s.logout);
  const unreadCount = useNotificationStore(s => s.unreadCount);

  if (!user) return null;

  const rawTabs = user.role === UserRole.PRESTATAIRE ? PRESTATAIRE_TABS : HUB_TABS;
  const tabs = rawTabs.filter((tab) => !tab.minRole || isRoleAtLeast(user.role, tab.minRole));

  const isTabActive = (tab: HubTab) =>
    tab.match.some((m) => pathname === m || pathname.startsWith(m + '/'));

  return (
    <>
      <div className="mobile-bottom-nav-spacer lg:hidden" />

      <nav className="mobile-bottom-nav no-print" aria-label="Navigation mobile">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = isTabActive(tab);
          const badge = tab.href === '/notifications' ? unreadCount : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon />
              {badge > 0 && (
                <span className="mobile-nav-badge">{badge > 99 ? '99+' : badge}</span>
              )}
              <span>{tab.label}</span>
            </Link>
          );
        })}

        {user.role === UserRole.PRESTATAIRE && (
          <button
            onClick={logout}
            className="mobile-bottom-nav-item"
            aria-label="Déconnexion"
          >
            <LogOut />
            <span>Quitter</span>
          </button>
        )}
      </nav>
    </>
  );
}
