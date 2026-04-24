'use client';

/**
 * Sidebar — Rail + Panel layout
 * -----------------------------------------------------------------------------
 * Nouvelle architecture inspirée macOS Finder / Mail / VS Code :
 *  - Un RAIL étroit (56px) à gauche avec 5 icônes de HUBS + logo + avatar + pastille sante
 *  - Un PANEL (240px) a droite du rail affichant uniquement les items du hub actif
 *  - Double-clic sur une icone du rail = masque/affiche le panel (mode ultra-compact)
 *  - Recherche instantanée dans le hub courant + raccourci Cmd+.
 *
 * IMPORTANT : tous les hooks / polling / filtrage role / pinned / recents
 * sont preserves strictement a l'identique pour ne rien casser.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { features } from '@/lib/features';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useSidebarCounters } from '@/hooks/use-sidebar-counters';
import { useUIStore } from '@/stores/ui-store';
import { useHealthStore } from '@/stores/health-store';
import { useAdminCountsStore } from '@/stores/admin-counts-store';
import { useTranslation } from '@/lib/i18n';
import { UserRole } from '@omnitech/shared';
import { isRoleAtLeast } from '@omnitech/shared';
import { Avatar } from '@omnitech/ui';
import { OmnitechLogo } from '@/components/omnitech-logo';
import { getAvatarUrl } from '@/lib/avatar';
import {
  LayoutDashboard,
  FileText,
  Newspaper,
  Users,
  Building2,
  Shield,
  ClipboardList,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  ShieldCheck,
  Ticket,
  Rss,
  Star,
  GraduationCap,
  PenLine,
  HardDrive,
  ShieldAlert,
  AlertTriangle,
  Search,
  X,
  Calendar,
  Headset,
  BookMarked,
  Camera,
  Inbox,
  MessageCircle,
  UserCheck2,
  Layers,
  ClipboardCheck,
  FileType,
  Home,
  Briefcase,
  Cog,
  Activity,
  User,
  ClipboardEdit,
  Globe2,
  BookOpen,
  Pin,
  PinOff,
  History,
  UserPlus,
  Moon,
  Workflow,
  Award,
  PanelLeftClose,
  PanelLeftOpen,
  Database,
  type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole?: UserRole;
  badge?: number;
  badgeTone?: 'red' | 'amber' | 'emerald';
  shortcut?: string;
  hidden?: boolean;
  /** Separator rendering — label only, not a navigable link */
  separator?: boolean;
  /** Small colored status dot shown before the label */
  statusDot?: 'ok' | 'error' | null;
}

/**
 * Map href → date ISO de disparition du badge NEW. Les paths listés ici
 * afficheront un petit badge « NEW » dans la sidebar jusqu'à la date
 * indiquée (pour signaler aux utilisateurs les modules fraîchement
 * déployés).
 */
const NEW_UNTIL: Record<string, string> = {
  '/media': '2026-05-22',
  '/runbooks': '2026-05-22',
  '/changelog': '2026-05-22',
};

interface NavHub {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  minRole?: UserRole;
  shortcut: string;
  shortcutKey: string; // key pressed with Cmd/Ctrl+Alt (ex: '1')
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function highlightMatch(label: string, filter: string): React.ReactNode {
  const q = filter.trim();
  if (!q) return label;
  const lower = label.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return label;
  return (
    <>
      {label.slice(0, idx)}
      <mark className="bg-[#F9964A]/40 text-white rounded-sm px-0.5">
        {label.slice(idx, idx + q.length)}
      </mark>
      {label.slice(idx + q.length)}
    </>
  );
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'v3';

// Is path active w.r.t. this href
const isPathActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + '/');

// ---------------------------------------------------------------------------
// Rail tooltip — absolute popover shown on hover of a rail icon
// ---------------------------------------------------------------------------

interface RailTooltipProps {
  label: string;
  shortcut?: string;
  badge?: number;
}

const RailTooltip: React.FC<RailTooltipProps> = ({ label, shortcut, badge }) => (
  <div
    role="tooltip"
    className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 z-[60] opacity-0 translate-x-[-4px] group-hover/rail:opacity-100 group-hover/rail:translate-x-0 transition-all duration-150 whitespace-nowrap"
  >
    <div className="relative bg-[#002a40]/95 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-md shadow-lg border border-white/10 flex items-center gap-2">
      <span className="font-medium">{label}</span>
      {shortcut && (
        <span className="text-white/50 text-[10px] font-mono">{shortcut}</span>
      )}
      {badge !== undefined && badge > 0 && (
        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#002a40]/95" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Rail icon button
// ---------------------------------------------------------------------------

interface RailButtonProps {
  hub: NavHub;
  isActive: boolean;
  isSelected: boolean;
  badge?: number;
  onClick: () => void;
  onDoubleClick: () => void;
}

const RailButton: React.FC<RailButtonProps> = ({
  hub,
  isActive,
  isSelected,
  badge,
  onClick,
  onDoubleClick,
}) => {
  const Icon = hub.icon;
  return (
    <div className="group/rail relative">
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-label={hub.label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-xl mx-auto',
          'transition-all duration-300 ease-out',
          'ring-1 ring-white/5',
          isSelected
            ? 'bg-gradient-to-br from-white/15 to-white/5 text-white ring-white/15 shadow-[0_4px_12px_-4px_rgba(249,150,74,0.4)] scale-105'
            : 'text-white/55 hover:bg-white/[0.08] hover:text-white hover:ring-white/10 hover:scale-105',
        )}
      >
        {/* Barre d'accent active — allongée et plus fluide */}
        <span
          className={cn(
            'absolute left-[-14px] top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-gradient-to-b from-[#F9964A] to-[#F68D2E] transition-all duration-300 ease-out',
            'shadow-[0_0_8px_rgba(249,150,74,0.6)]',
            isActive ? 'h-7 opacity-100' : 'h-0 opacity-0',
          )}
        />
        <Icon className="h-[18px] w-[18px] drop-shadow-sm" strokeWidth={2} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 px-1 text-[9px] font-semibold text-white ring-2 ring-[#002a40] shadow-lg">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
      <RailTooltip label={hub.label} shortcut={hub.shortcut} badge={badge} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Panel item row
// ---------------------------------------------------------------------------

interface PanelItemProps {
  item: NavItem;
  active: boolean;
  accent: string;
  filter: string;
  pinned: boolean;
  onTogglePin: (href: string) => void;
  onNavigate: () => void;
}

const PanelItem: React.FC<PanelItemProps> = ({
  item,
  active,
  accent,
  filter,
  pinned,
  onTogglePin,
  onNavigate,
}) => {
  if (item.separator) {
    return (
      <div
        key={item.href}
        role="presentation"
        className="mt-3 mb-1 flex items-center gap-2 px-3"
      >
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {item.label}
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    );
  }

  const Icon = item.icon;
  const badgeTone =
    item.badgeTone === 'amber'
      ? 'bg-amber-500 text-white'
      : item.badgeTone === 'emerald'
        ? 'bg-emerald-500 text-white'
        : 'bg-red-500 text-white';

  return (
    <div className="group/item relative">
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 mx-1.5 text-[13px]',
          'transition-all duration-200 ease-out',
          active
            ? 'bg-white/[0.18] text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'text-white/75 hover:bg-white/8 hover:text-white',
        )}
      >
        {/* accent bar when active */}
        <span
          className="h-4 w-[2px] rounded-full transition-all duration-200"
          style={{ backgroundColor: active ? accent : 'transparent' }}
        />
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="flex-1 truncate">
          {highlightMatch(item.label, filter)}
        </span>
        {item.statusDot && (
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              item.statusDot === 'ok' ? 'bg-emerald-400' : 'bg-red-500',
            )}
            aria-label={item.statusDot}
          />
        )}
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cn(
              'flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-semibold',
              badgeTone,
            )}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
        {NEW_UNTIL[item.href] && new Date(NEW_UNTIL[item.href]!) > new Date() && (
          <span
            className="flex h-4 items-center justify-center rounded-full px-1.5 text-[9px] font-bold bg-[#F9964A] text-white tracking-wide uppercase"
            title="Nouveau module"
          >
            New
          </span>
        )}
      </Link>
      {/* Pin toggle visible on hover */}
      <button
        type="button"
        aria-label={pinned ? 'Détacher' : 'Épingler'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin(item.href);
        }}
        className={cn(
          'absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded',
          'opacity-0 group-hover/item:opacity-100 transition-opacity duration-150',
          'text-white/40 hover:text-white hover:bg-white/10',
          pinned && 'opacity-100 text-[#F9964A]',
        )}
      >
        {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore(s => s.user); const logout = useAuthStore(s => s.logout);
  const { unreadCount } = useNotificationStore();
  const counters = useSidebarCounters();
  const {
    sidebarOpen,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    sidebarCompact,
    toggleCompact,
    setCompact,
    sidebarPinned,
    togglePinned,
    sidebarRecents,
    pushRecent,
  } = useUIStore();
  const { t } = useTranslation();

  // ---- Local UI state ----------------------------------------------------
  const [allowedModules, setAllowedModules] = React.useState<Set<string> | null>(
    null,
  );
  /** Hub shown inside the panel. Can differ from the route's active hub. */
  const [selectedHubId, setSelectedHubId] = React.useState<string | null>(null);
  /**
   * Ultra-compact mode: rail visible, panel hidden (double-click on rail icon).
   * Dérivé de `sidebarOpen` pour synchroniser avec le toggle du Header (burger),
   * les raccourcis clavier et la préférence stockée dans useUIStore.
   */
  const panelHidden = !sidebarOpen;
  const setPanelHidden = React.useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof updater === 'function' ? updater(!sidebarOpen) : updater;
      // setPanelHidden(true) → sidebarOpen=false, et inversement.
      if (next === !sidebarOpen) return;
      toggleSidebar();
    },
    [sidebarOpen, toggleSidebar],
  );
  const [filter, setFilter] = React.useState('');
  const filterInputRef = React.useRef<HTMLInputElement>(null);

  // Live counters / status from centralized stores (no local polling needed)
  const healthStatus = useHealthStore(s => s.status);
  const ldapPendingCount = useAdminCountsStore(s => s.ldapPendingCount);
  const workflowPendingCount = useAdminCountsStore(s => s.workflowPendingCount);

  // ---- Allowed modules fetch --------------------------------------------
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .get('/spaces/my-modules')
      .then((r) => {
        if (cancelled) return;
        const mods: string[] = r.data?.modules || [];
        setAllowedModules(new Set(mods));
      })
      .catch(() => {
        if (!cancelled) setAllowedModules(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Close mobile drawer on route change
  React.useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  // Track recents
  React.useEffect(() => {
    if (pathname) pushRecent(pathname);
  }, [pathname, pushRecent]);

  // Auto-compact on tablet
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const apply = () => {
      if (mq.matches) setCompact(true);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [setCompact]);

  // Safe role fallback to keep hooks rules (early-return is after all hooks).
  const safeUserRole = user?.role ?? UserRole.COLLABORATEUR;

  // Sidebar reads from centralized health + admin-counts stores.
  // Polling is managed by the stores themselves (started by auth-provider or widgets).

  // -------------------------------------------------------------------------
  // Hub model
  // -------------------------------------------------------------------------
  const hubs: NavHub[] = [
    {
      id: 'monEspace',
      label: t('hub.monEspace'),
      href: '/dashboard',
      icon: Home,
      accent: '#004469',
      shortcut: '\u2325\u23181',
      shortcutKey: '1',
      items: [
        { label: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard },
        { label: t('nav.notifications'), href: '/notifications', icon: Bell, badge: unreadCount || undefined },
        { label: t('nav.profile'), href: '/profile', icon: User },
        { label: t('nav.tickets'), href: '/tickets', icon: Ticket,
          badge: counters.myActiveTickets > 0 ? counters.myActiveTickets : undefined, badgeTone: 'amber' },
        { label: t('nav.mySignatures'), href: '/signatures', icon: PenLine },
        { label: 'Mes certifications', href: '/certificates', icon: Award },
        { label: t('nav.calendar'), href: '/calendar', icon: Calendar },
        { label: t('nav.mfa'), href: '/mfa', icon: Shield },
        { label: 'Médiathèque', href: '/media', icon: Camera },
        { label: 'Mon avis sur l\'intranet', href: '/testimonials', icon: MessageCircle },
      ],
    },
    {
      id: 'work',
      label: t('hub.work'),
      href: '/hub/work',
      icon: Briefcase,
      accent: '#296DC1',
      shortcut: '\u2325\u23182',
      shortcutKey: '2',
      items: [
        { label: t('nav.documents'), href: '/documents', icon: FileText },
        { label: t('nav.procedures'), href: '/procedures', icon: ClipboardEdit },
        { label: t('nav.news'), href: '/news', icon: Newspaper },
        { label: t('nav.wiki'), href: '/wiki', icon: BookMarked },
        { label: 'Runbooks', href: '/runbooks', icon: BookOpen },
        { label: 'Médiathèque', href: '/media', icon: Camera },
        { label: t('nav.directory'), href: '/directory', icon: Users },
        { label: t('nav.networkFiles'), href: '/files', icon: HardDrive },
        { label: t('nav.search'), href: '/search', icon: Search },
        { label: 'Outils PDF', href: '/tools/pdf', icon: FileType, minRole: UserRole.COLLABORATEUR },
        { label: t('nav.quiz'), href: '/quiz', icon: GraduationCap, minRole: UserRole.COLLABORATEUR },
        { label: t('nav.satisfaction'), href: '/satisfaction', icon: Star, minRole: UserRole.COLLABORATEUR },
      ],
    },
    {
      id: 'security',
      label: t('hub.security'),
      href: '/hub/security',
      icon: ShieldCheck,
      accent: '#892034',
      shortcut: '\u2325\u23183',
      shortcutKey: '3',
      items: [
        { label: t('nav.veille'), href: '/veille', icon: Rss, minRole: UserRole.REVIEWER },
        { label: 'Incidents', href: '/incidents', icon: ShieldAlert, minRole: UserRole.COLLABORATEUR,
          badge: counters.criticalIncidents > 0 ? counters.criticalIncidents : undefined, badgeTone: 'red' },
        { label: t('nav.alerts'), href: '/alerts', icon: AlertTriangle, minRole: UserRole.COLLABORATEUR },
        { label: t('nav.helpdesk'), href: '/helpdesk', icon: Headset },
        // Chartes: retiré de Security car doublon avec Admin hub (même URL, même RBAC ADMIN).
        // Les chartes en attente de signature s'affichent déjà automatiquement en modal
        // bloquant sur connexion via la route /chartes publique (outside /app).
      ],
    },
    {
      id: 'admin',
      label: t('hub.admin'),
      href: '/admin',
      icon: Cog,
      accent: '#F9964A',
      minRole: UserRole.ADMIN,
      shortcut: '\u2325\u23184',
      shortcutKey: '4',
      items: [
        // --- Identites & acces ---
        { label: 'Identites & acces', href: '#sep-admin-1', icon: User, separator: true, minRole: UserRole.ADMIN },
        { label: t('nav.users'), href: '/admin/users', icon: Users, minRole: UserRole.ADMIN },
        { label: 'Validation LDAP', href: '/admin/ldap-pending', icon: UserPlus, minRole: UserRole.ADMIN,
          badge: ldapPendingCount > 0 ? ldapPendingCount : undefined, badgeTone: 'amber' },
        { label: t('nav.departments'), href: '/admin/departments', icon: Building2, minRole: UserRole.ADMIN },
        { label: t('nav.externalAccess'), href: '/admin/external-access', icon: Users, minRole: UserRole.ADMIN },
        { label: t('nav.onboarding'), href: '/admin/onboarding', icon: Users, minRole: UserRole.ADMIN, hidden: !features.onboardingAdmin },
        // --- Conformite ---
        { label: 'Conformité & validations', href: '#sep-admin-2', icon: ShieldCheck, separator: true, minRole: UserRole.REVIEWER },
        { label: t('nav.compliance'), href: '/admin/compliance', icon: ShieldCheck, minRole: UserRole.REVIEWER },
        { label: 'Workflows d\'approbation', href: '/admin/workflows', icon: Workflow, minRole: UserRole.REVIEWER,
          badge: workflowPendingCount > 0 ? workflowPendingCount : undefined, badgeTone: 'amber' },
        { label: 'Revue des acces', href: '/admin/access-reviews', icon: UserCheck2, minRole: UserRole.SUPER_ADMIN },
        { label: t('nav.chartes'), href: '/admin/chartes', icon: Shield, minRole: UserRole.ADMIN },
        { label: 'Certifications', href: '/admin/certificates', icon: Award, minRole: UserRole.ADMIN },
        // --- Content & animation ---
        { label: 'Contenus & animation', href: '#sep-admin-content', icon: Camera, separator: true, minRole: UserRole.ADMIN },
        { label: 'Médiathèque', href: '/admin/media', icon: Camera, minRole: UserRole.ADMIN },
        { label: 'Avis & enquêtes satisfaction', href: '/admin/feedback', icon: Star, minRole: UserRole.ADMIN },
        { label: 'Espaces de ticketing', href: '/admin/ticket-spaces', icon: Inbox, minRole: UserRole.ADMIN },
        // --- Audit ---
        { label: 'Audit & reporting', href: '#sep-admin-3', icon: ClipboardList, separator: true, minRole: UserRole.ADMIN },
        { label: 'Audit (log + chronologie)', href: '/admin/audit', icon: ClipboardList, minRole: UserRole.ADMIN },
        { label: t('nav.reports'), href: '/admin/reports', icon: BarChart3, minRole: UserRole.ADMIN },
        { label: t('nav.adAudit'), href: '/admin/ad-audit', icon: ShieldAlert, minRole: UserRole.ADMIN },
        { label: 'Exports IT', href: '/admin/it-exports', icon: ClipboardCheck, minRole: UserRole.ADMIN },
        // --- Systeme ---
        { label: 'Systeme & configuration', href: '#sep-admin-4', icon: Settings, separator: true, minRole: UserRole.ADMIN },
        { label: 'Santé système', href: '/admin/system-health', icon: Activity, minRole: UserRole.ADMIN,
          statusDot: healthStatus },
        { label: 'Monitoring système', href: '/admin/system-monitoring', icon: Activity, minRole: UserRole.ADMIN },
        { label: t('nav.config'), href: '/admin/config', icon: Settings, minRole: UserRole.SUPER_ADMIN },
        { label: 'Espaces & modules', href: '/admin/spaces', icon: Layers, minRole: UserRole.SUPER_ADMIN },
        { label: 'Sauvegardes', href: '/admin/backups', icon: Database, minRole: UserRole.SUPER_ADMIN },
        { label: 'PCA / Continuité', href: '/admin/pca', icon: ShieldCheck, minRole: UserRole.SUPER_ADMIN },
        // { label: 'Extranet', href: '/extranet', icon: Globe2, minRole: UserRole.ADMIN },
      ],
    },
    {
      id: 'rssi',
      label: t('hub.rssi'),
      href: '/admin/rssi-dashboard',
      icon: Activity,
      accent: '#837274',
      minRole: UserRole.SUPER_ADMIN,
      shortcut: '\u2325\u23185',
      shortcutKey: '5',
      items: [
        { label: 'Dashboard RSSI', href: '/admin/rssi-dashboard', icon: Activity, minRole: UserRole.SUPER_ADMIN },
      ],
    },
  ];

  // -------------------------------------------------------------------------
  // Filtering helpers
  // -------------------------------------------------------------------------

  const moduleOf = (href: string): string => {
    const segments = href.split('/').filter(Boolean);
    if (segments.length === 0) return 'dashboard';
    return segments[0]!;
  };

  const isModuleAllowed = (item: NavItem): boolean => {
    if (item.separator) return true;
    if (!allowedModules) return true;
    return allowedModules.has(moduleOf(item.href));
  };

  const roleOk = (minRole?: UserRole) =>
    !minRole || isRoleAtLeast(safeUserRole, minRole);

  const prestataireItems: NavItem[] = [
    { label: t('nav.mySpace'), href: '/dashboard', icon: LayoutDashboard },
    { label: t('nav.notifications'), href: '/notifications', icon: Bell, badge: unreadCount || undefined },
    { label: t('nav.documents'), href: '/documents', icon: FileText },
    { label: t('nav.tickets'), href: '/tickets', icon: Ticket },
    { label: t('nav.mySignatures'), href: '/signatures', icon: PenLine },
    { label: t('nav.networkFiles'), href: '/files', icon: HardDrive },
    { label: t('nav.mfa'), href: '/mfa', icon: Shield },
  ];

  const matchesFilter = (label: string): boolean => {
    if (!filter.trim()) return true;
    return label.toLowerCase().includes(filter.trim().toLowerCase());
  };

  const stripOrphanSeparators = (items: NavItem[]): NavItem[] => {
    const result: NavItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.separator) {
        let hasChild = false;
        for (let j = i + 1; j < items.length; j++) {
          if (items[j]!.separator) break;
          hasChild = true;
          break;
        }
        if (!hasChild) continue;
      }
      result.push(it);
    }
    return result;
  };

  const filteredHubs: NavHub[] =
    !user || safeUserRole === UserRole.PRESTATAIRE
      ? []
      : hubs
          .filter((hub) => roleOk(hub.minRole))
          .map((hub) => ({
            ...hub,
            items: stripOrphanSeparators(
              hub.items
                .filter((it) => !it.hidden)
                .filter((it) => roleOk(it.minRole))
                .filter(isModuleAllowed),
            ),
          }))
          .filter(
            (hub) =>
              hub.items.some((it) => !it.separator) ||
              hub.id === 'rssi' ||
              hub.id === 'monEspace',
          );

  // Active hub derived from the URL
  const activeHubId = React.useMemo(() => {
    for (const hub of filteredHubs) {
      if (
        hub.items.some(
          (it) => !it.separator && isPathActive(pathname, it.href),
        )
      ) {
        return hub.id;
      }
      if (isPathActive(pathname, hub.href)) return hub.id;
    }
    return filteredHubs[0]?.id ?? null;
  }, [pathname, filteredHubs]);

  // Keep the selected panel hub in sync with the route when the user hasn't
  // explicitly picked another hub.
  React.useEffect(() => {
    if (activeHubId && selectedHubId === null) {
      setSelectedHubId(activeHubId);
    }
  }, [activeHubId, selectedHubId]);

  React.useEffect(() => {
    if (activeHubId) setSelectedHubId(activeHubId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // All leaf items flattened — used for pins / recents resolution
  const leafIndex = React.useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const hub of filteredHubs)
      for (const it of hub.items) if (!it.separator) map.set(it.href, it);
    for (const it of prestataireItems) if (!map.has(it.href)) map.set(it.href, it);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHubs]);

  // ---- Keyboard shortcuts -------------------------------------------------
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Cmd/Ctrl + . -> focus search in the current panel
      if (e.key === '.') {
        e.preventDefault();
        filterInputRef.current?.focus();
        return;
      }
      // Cmd/Ctrl + Alt + 1..5 -> switch hub
      if (e.altKey && /^[1-5]$/.test(e.key)) {
        const target = filteredHubs.find((h) => h.shortcutKey === e.key);
        if (target) {
          e.preventDefault();
          setSelectedHubId(target.id);
          setPanelHidden(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredHubs]);

  // Early-return AFTER all hooks
  if (!user) return null;

  // -------------------------------------------------------------------------
  // Derived render data
  // -------------------------------------------------------------------------

  const isPrestataire = safeUserRole === UserRole.PRESTATAIRE;

  const selectedHub: NavHub | undefined =
    filteredHubs.find((h) => h.id === selectedHubId) ??
    filteredHubs.find((h) => h.id === activeHubId) ??
    filteredHubs[0];

  // Items shown in the panel after the search filter
  const panelItems: NavItem[] = selectedHub
    ? filter.trim()
      ? selectedHub.items
          .filter((it) => !it.separator)
          .filter((it) => matchesFilter(it.label))
      : selectedHub.items
    : [];

  // Pins / recents resolved to real items
  const pinnedItems: NavItem[] = sidebarPinned
    .map((href) => leafIndex.get(href))
    .filter((x): x is NavItem => Boolean(x));
  const recentItems: NavItem[] = sidebarRecents
    .filter((href) => href !== pathname)
    .map((href) => leafIndex.get(href))
    .filter((x): x is NavItem => Boolean(x))
    .slice(0, 3);

  // Global health pill state (bottom of rail)
  const globalStatus: 'ok' | 'warn' | 'error' = (() => {
    if (healthStatus === 'error') return 'error';
    if (ldapPendingCount > 0 || workflowPendingCount > 0) return 'warn';
    if (healthStatus === 'ok') return 'ok';
    return 'ok';
  })();
  const globalStatusColor =
    globalStatus === 'ok'
      ? 'bg-emerald-400'
      : globalStatus === 'warn'
        ? 'bg-amber-400'
        : 'bg-red-500';

  const getInitials = () =>
    `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  // -------------------------------------------------------------------------
  // Prestataire simplified sidebar (single column, no rail)
  // -------------------------------------------------------------------------
  if (isPrestataire) {
    return (
      <>
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
        )}
        <aside
          className={cn(
            'fixed left-0 top-0 z-50 h-screen w-64 bg-[#002a40] text-white flex flex-col',
            'transition-transform duration-200 ease-out',
            // lg:sticky cassait le layout — sticky + h-screen réserve 100vh dans le flow
            'lg:translate-x-0',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <OmnitechLogo className="h-7 w-auto" />
            <button
              type="button"
              className="lg:hidden text-white/70"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent py-2">
            {prestataireItems.map((it) => {
              const Icon = it.icon;
              const active = isPathActive(pathname, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-2 text-sm transition-colors duration-150',
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/75 hover:bg-white/10',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.badge !== undefined && it.badge > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold">
                      {it.badge > 99 ? '99+' : it.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-3 flex items-center gap-2">
            <Avatar
              src={getAvatarUrl(user.avatarUrl)}
              initials={getInitials()}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-[10px] text-white/50 truncate">
                {user.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              aria-label="Deconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Main render: RAIL + PANEL
  // -------------------------------------------------------------------------
  return (
    <>
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        id="main-nav"
        aria-label="Navigation principale"
        className={cn(
          'fixed left-0 top-0 z-50 h-screen flex',
          'transition-transform duration-200 ease-out',
          // NE PAS utiliser lg:sticky — sticky + h-screen réserve 100vh
          // dans le flow et pousse le contenu d'une page complète.
          'lg:translate-x-0',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* =========================================================== */}
        {/* RAIL (56px) — dégradé subtil + ombre droite pour profondeur */}
        {/* =========================================================== */}
        <div
          className={cn(
            'hidden lg:flex w-14 shrink-0 h-screen text-white',
            'bg-gradient-to-b from-[#002a40] via-[#002640] to-[#001f35]',
            'shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]',
            'flex-col items-center py-3',
          )}
        >
          {/* Logo — rail version (icône seule, blanc) — taille maximale dans
              le rail de 56px pour être visible sans déborder. */}
          <Link
            href="/dashboard"
            aria-label="Accueil OMNITECH"
            className="flex h-13 w-13 items-center justify-center rounded-xl mb-3 hover:bg-white/10 transition-all duration-200 ring-1 ring-white/5 hover:ring-[#F9964A]/40"
            style={{ height: 52, width: 52 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-icon-white.png"
              alt="OMNITECH"
              width={52}
              height={52}
              className="object-contain drop-shadow-sm"
              style={{ width: 52, height: 52 }}
            />
          </Link>

          <div className="w-8 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent my-1" />

          {/* Hub rail buttons */}
          <nav className="flex-1 flex flex-col items-center gap-1.5 mt-2 w-full">
            {filteredHubs.map((hub) => {
              const isActive = activeHubId === hub.id;
              const isSelected = selectedHub?.id === hub.id && !panelHidden;
              // Compute an indicative badge per hub (sum of known counters)
              let badge: number | undefined;
              if (hub.id === 'monEspace' && unreadCount > 0) badge = unreadCount;
              if (hub.id === 'admin') {
                const total = ldapPendingCount + workflowPendingCount;
                if (total > 0) badge = total;
              }
              return (
                <RailButton
                  key={hub.id}
                  hub={hub}
                  isActive={isActive}
                  isSelected={isSelected}
                  badge={badge}
                  onClick={() => {
                    if (selectedHub?.id === hub.id) {
                      setPanelHidden((v) => !v);
                    } else {
                      setSelectedHubId(hub.id);
                      setPanelHidden(false);
                    }
                  }}
                  onDoubleClick={() => setPanelHidden((v) => !v)}
                />
              );
            })}
          </nav>

          {/* Footer: global health pill + panel toggle + avatar */}
          <div className="flex flex-col items-center gap-2 mt-2">
            {isRoleAtLeast(safeUserRole, UserRole.ADMIN) && (
              <div className="group/rail relative">
                <Link
                  href="/admin/system-health"
                  aria-label="Santé globale"
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full ring-2 ring-[#002a40] transition-colors duration-200',
                      globalStatusColor,
                      globalStatus === 'error' && 'animate-pulse',
                    )}
                  />
                </Link>
                <RailTooltip
                  label={
                    globalStatus === 'ok'
                      ? 'Tout est en ordre'
                      : globalStatus === 'warn'
                        ? 'Actions en attente'
                        : 'Incident système'
                  }
                  shortcut="Health"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setPanelHidden((v) => !v)}
              aria-label={panelHidden ? 'Afficher le panneau' : 'Masquer le panneau'}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-all duration-150"
            >
              {panelHidden ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            <div className="group/rail relative">
              <button
                type="button"
                onClick={() => router.push('/profile')}
                aria-label={`${user.firstName} ${user.lastName}`}
                className="block rounded-full overflow-hidden ring-2 ring-transparent hover:ring-[#F9964A] transition-all duration-200"
              >
                <Avatar
                  src={getAvatarUrl(user.avatarUrl)}
                  initials={getInitials()}
                  size="sm"
                />
              </button>
              <RailTooltip
                label={`${user.firstName} ${user.lastName}`}
                shortcut={user.email}
              />
            </div>
          </div>
        </div>

        {/* =========================================================== */}
        {/* PANEL (240px)                                                */}
        {/* =========================================================== */}
        <div
          className={cn(
            'h-screen text-white flex flex-col',
            'bg-gradient-to-b from-[#003253] via-[#002a45] to-[#001f35]',
            'shadow-[inset_-1px_0_0_rgba(255,255,255,0.03),4px_0_24px_-8px_rgba(0,0,0,0.3)]',
            'overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            // Mobile : full width drawer ; desktop : 240 / 0
            'w-[240px] lg:w-[240px]',
            panelHidden && 'lg:w-0 lg:opacity-0 lg:pointer-events-none',
          )}
        >
          {selectedHub && (
            <>
              {/* Brand header — marque visible à l'ouverture du panel */}
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 px-4 pt-5 pb-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-full-white.png"
                  alt="OMNITECH Security"
                  className="h-10 w-auto object-contain drop-shadow-sm"
                  style={{ height: 40 }}
                />
              </Link>

              {/* Hub section header avec accent couleur */}
              <div className="px-4 pt-4 pb-3 border-b border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]"
                      style={{ backgroundColor: selectedHub.accent, color: selectedHub.accent }}
                    />
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60 truncate">
                      {selectedHub.label}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="lg:hidden text-white/70 hover:text-white"
                    onClick={() => setMobileSidebarOpen(false)}
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Search */}
                <div className="mt-3 relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                  <input
                    ref={filterInputRef}
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={`Rechercher dans ${selectedHub.label}`}
                    className={cn(
                      'w-full h-8 pl-7 pr-14 rounded-md',
                      'bg-white/5 border border-white/10 text-[12px] text-white placeholder:text-white/40',
                      'focus:outline-none focus:ring-1 focus:ring-[#F9964A] focus:border-[#F9964A]',
                      'transition-all duration-150',
                    )}
                  />
                  {filter ? (
                    <button
                      type="button"
                      onClick={() => setFilter('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white"
                      aria-label="Effacer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/40 pointer-events-none">
                      {'\u2318.'}
                    </span>
                  )}
                </div>
              </div>

              {/* Items */}
              <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent py-2">
                {panelItems.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12px] text-white/40">
                    Aucun résultat
                  </div>
                ) : (
                  panelItems.map((item) => (
                    <PanelItem
                      key={item.href + (item.separator ? '-sep' : '')}
                      item={item}
                      active={!item.separator && isPathActive(pathname, item.href)}
                      accent={selectedHub.accent}
                      filter={filter}
                      pinned={sidebarPinned.includes(item.href)}
                      onTogglePin={togglePinned}
                      onNavigate={() => pushRecent(item.href)}
                    />
                  ))
                )}

                {/* Pinned section */}
                {!filter.trim() && pinnedItems.length > 0 && (
                  <div className="mt-3">
                    <div className="px-3 mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      <Pin className="h-2.5 w-2.5" />
                      Epingles
                    </div>
                    {pinnedItems.map((it) => (
                      <PanelItem
                        key={'pin-' + it.href}
                        item={it}
                        active={isPathActive(pathname, it.href)}
                        accent={selectedHub.accent}
                        filter=""
                        pinned
                        onTogglePin={togglePinned}
                        onNavigate={() => pushRecent(it.href)}
                      />
                    ))}
                  </div>
                )}

                {/* Recents section */}
                {!filter.trim() && recentItems.length > 0 && (
                  <div className="mt-3">
                    <div className="px-3 mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      <History className="h-2.5 w-2.5" />
                      Recents
                    </div>
                    {recentItems.map((it) => (
                      <PanelItem
                        key={'recent-' + it.href}
                        item={it}
                        active={false}
                        accent={selectedHub.accent}
                        filter=""
                        pinned={sidebarPinned.includes(it.href)}
                        onTogglePin={togglePinned}
                        onNavigate={() => pushRecent(it.href)}
                      />
                    ))}
                  </div>
                )}
              </nav>

              {/* Footer */}
              <div className="border-t border-white/5 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                  <span>OMNITECH</span>
                  <span>{APP_VERSION}</span>
                </div>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Deconnexion"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Sortir</span>
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
