'use client';

/**
 * Barre d'onglets horizontale pour regrouper visuellement des pages admin
 * liées, sans les fusionner dans un même fichier. L'URL reste distincte
 * par onglet (bon pour les liens profonds, breadcrumbs et bookmarks).
 *
 * Usage :
 *   <AdminGroupTabs group="identity" />
 *
 * Affiche toutes les pages du groupe en pills, surligne la courante,
 * filtre les onglets selon le rôle minimum requis.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  UserPlus,
  Building2,
  UserCheck2,
  Users as UsersIcon,
  ShieldAlert,
  ClipboardList,
  Activity,
  BarChart3,
  Monitor,
  Shield,
  ShieldCheck,
  Workflow,
  PenLine,
  Settings,
  Layers,
  ClipboardCheck,
  Moon,
  Award,
  Database,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { useAuthStore } from '@/stores/auth-store';

interface Tab {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole?: UserRole;
}

const GROUPS: Record<string, { label: string; tabs: Tab[] }> = {
  identity: {
    label: 'Identités & Accès',
    tabs: [
      { label: 'Utilisateurs', href: '/admin/users', icon: Users, minRole: UserRole.ADMIN },
      { label: 'Validation LDAP', href: '/admin/ldap-pending', icon: UserPlus, minRole: UserRole.ADMIN },
      { label: 'Départements', href: '/admin/departments', icon: Building2, minRole: UserRole.ADMIN },
      { label: 'Accès & modules', href: '/admin/access', icon: KeyRound, minRole: UserRole.SUPER_ADMIN },
      { label: "Revues d'accès", href: '/admin/access-reviews', icon: UserCheck2, minRole: UserRole.SUPER_ADMIN },
      { label: 'Onboarding', href: '/admin/onboarding', icon: UsersIcon, minRole: UserRole.ADMIN },
      { label: 'Prestataires', href: '/admin/external-access', icon: UsersIcon, minRole: UserRole.ADMIN },
      { label: 'Audit AD', href: '/admin/ad-audit', icon: ShieldAlert, minRole: UserRole.ADMIN },
      { label: 'Certifications', href: '/admin/certificates', icon: Award, minRole: UserRole.ADMIN },
    ],
  },
  audit: {
    label: 'Audit & monitoring',
    tabs: [
      { label: 'Audit (log + frise)', href: '/admin/audit', icon: ClipboardList, minRole: UserRole.ADMIN },
      { label: 'Rétention RGPD', href: '/admin/audit/retention', icon: Shield, minRole: UserRole.SUPER_ADMIN },
      { label: 'Santé système', href: '/admin/system-health', icon: Monitor, minRole: UserRole.ADMIN },
      { label: 'Dashboard RSSI', href: '/admin/rssi-dashboard', icon: BarChart3, minRole: UserRole.SUPER_ADMIN },
      { label: 'Score cyber', href: '/admin/cyber-score', icon: ShieldCheck, minRole: UserRole.SUPER_ADMIN },
      { label: 'Rapports', href: '/admin/reports', icon: BarChart3, minRole: UserRole.ADMIN },
    ],
  },
  compliance: {
    label: 'Conformité & politiques',
    tabs: [
      { label: 'Conformité', href: '/admin/compliance', icon: ShieldCheck, minRole: UserRole.REVIEWER },
      { label: 'Chartes', href: '/admin/chartes', icon: Shield, minRole: UserRole.ADMIN },
      { label: "Workflows d'approbation", href: '/admin/workflows', icon: Workflow, minRole: UserRole.ADMIN },
      { label: 'Signatures', href: '/admin/signatures', icon: PenLine, minRole: UserRole.ADMIN },
    ],
  },
  config: {
    label: 'Configuration système',
    tabs: [
      { label: 'Configuration', href: '/admin/config', icon: Settings, minRole: UserRole.SUPER_ADMIN },
      // Accès & modules (ex-/admin/spaces) a migré dans /admin/access — groupe identity
      { label: 'Accès & modules', href: '/admin/access?tab=users', icon: Layers, minRole: UserRole.SUPER_ADMIN },
      { label: 'Exports IT', href: '/admin/it-exports', icon: ClipboardCheck, minRole: UserRole.ADMIN },
      { label: 'Audit dark mode', href: '/admin/dark-mode-audit', icon: Moon, minRole: UserRole.ADMIN },
      { label: 'Sauvegardes', href: '/admin/backups', icon: Database, minRole: UserRole.SUPER_ADMIN },
    ],
  },
};

interface Props {
  group: keyof typeof GROUPS;
}

export function AdminGroupTabs({ group }: Props) {
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const definition = GROUPS[group];
  if (!definition || !user) return null;

  const visibleTabs = definition.tabs.filter(
    (tab) => !tab.minRole || isRoleAtLeast(user.role, tab.minRole),
  );
  if (visibleTabs.length < 2) return null; // un seul onglet visible → inutile

  // Prefer the longest prefix-match so that nested routes (e.g.
  // /admin/audit/retention) don't trigger the parent tab (/admin/audit) too.
  // Without this, both tabs would render as "active".
  const bestMatch = visibleTabs.reduce<Tab | null>((best, tab) => {
    const matches =
      pathname === tab.href || pathname.startsWith(tab.href + '/');
    if (!matches) return best;
    if (!best) return tab;
    return tab.href.length > best.href.length ? tab : best;
  }, null);

  return (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 mb-2">
        {definition.label}
      </p>
      <nav
        className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1"
        aria-label={`Navigation ${definition.label}`}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = bestMatch?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
