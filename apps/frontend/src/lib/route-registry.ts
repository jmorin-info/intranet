/**
 * Route Registry — OMNITECH Intranet
 * ====================================
 *
 * Source de verite centralisee pour toutes les routes de l'application.
 * Fournit des metadonnees (labels FR/EN, icone, role requis, groupe)
 * ainsi que des helpers de validation et de lookup.
 */

import { UserRole } from '@omnitech/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteGroup =
  | 'mySpace'
  | 'work'
  | 'security'
  | 'admin'
  | 'rssi'
  | 'public'
  | 'auth'
  | 'hub'
  | 'other';

export interface RouteEntry {
  /** Chemin absolu de la route (ex. "/dashboard") */
  path: string;
  /** Label affiché (français) */
  label: string;
  /** Label affiché (anglais) */
  labelEn: string;
  /** Nom de l'icone Lucide correspondante */
  icon: string;
  /** Role minimum requis pour acceder a la route (undefined = acces libre) */
  requiredRole?: UserRole;
  /** Groupe fonctionnel */
  group: RouteGroup;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ROUTES: readonly RouteEntry[] = [
  // ── mySpace ──────────────────────────────────────────────────────────
  { path: '/dashboard',      label: 'Tableau de bord',      labelEn: 'Dashboard',         icon: 'LayoutDashboard', group: 'mySpace' },
  { path: '/profile',        label: 'Mon profil',           labelEn: 'My Profile',        icon: 'User',            group: 'mySpace' },
  { path: '/notifications',  label: 'Notifications',        labelEn: 'Notifications',     icon: 'Bell',            group: 'mySpace' },
  { path: '/tickets',        label: 'Mes tickets',          labelEn: 'My Tickets',        icon: 'Ticket',          group: 'mySpace' },
  { path: '/signatures',     label: 'Mes signatures',       labelEn: 'My Signatures',     icon: 'PenLine',         group: 'mySpace' },
  { path: '/approvals',      label: 'Mes approbations',     labelEn: 'My Approvals',      icon: 'Workflow',        group: 'mySpace', requiredRole: UserRole.COLLABORATEUR },
  { path: '/certificates',   label: 'Mes certifications',   labelEn: 'My Certifications', icon: 'Award',           group: 'mySpace' },
  { path: '/calendar',       label: 'Calendrier',           labelEn: 'Calendar',          icon: 'Calendar',        group: 'mySpace' },
  { path: '/mfa',            label: 'Authentification MFA', labelEn: 'MFA Authentication',icon: 'Shield',          group: 'mySpace' },

  // ── work ─────────────────────────────────────────────────────────────
  { path: '/documents',         label: 'Documents',              labelEn: 'Documents',           icon: 'FileText',      group: 'work' },
  { path: '/documents/new',     label: 'Nouveau document',       labelEn: 'New Document',        icon: 'FilePlus',      group: 'work' },
  { path: '/documents/pending', label: 'Documents en attente',   labelEn: 'Pending Documents',   icon: 'FileCheck',     group: 'work' },
  { path: '/procedures',        label: 'Procedures',             labelEn: 'Procedures',          icon: 'ClipboardEdit', group: 'work' },
  { path: '/news',              label: 'Actualites',             labelEn: 'News',                icon: 'Newspaper',     group: 'work' },
  { path: '/news/compose',      label: 'Rediger une actualite',  labelEn: 'Compose News',        icon: 'PenSquare',     group: 'work' },
  { path: '/wiki',              label: 'Wiki',                   labelEn: 'Wiki',                icon: 'BookMarked',    group: 'work' },
  { path: '/runbooks',          label: 'Runbooks',               labelEn: 'Runbooks',            icon: 'BookOpen',      group: 'work' },
  { path: '/directory',         label: 'Annuaire',               labelEn: 'Directory',           icon: 'Users',         group: 'work' },
  { path: '/files',             label: 'Fichiers reseau',        labelEn: 'Network Files',       icon: 'HardDrive',     group: 'work' },
  { path: '/search',            label: 'Recherche',              labelEn: 'Search',              icon: 'Search',        group: 'work' },
  { path: '/tools/pdf',         label: 'Outils PDF',             labelEn: 'PDF Tools',           icon: 'FileType',      group: 'work', requiredRole: 'COLLABORATEUR' as UserRole },
  { path: '/quiz',              label: 'Quiz',                   labelEn: 'Quiz',                icon: 'GraduationCap', group: 'work', requiredRole: 'COLLABORATEUR' as UserRole },
  { path: '/satisfaction',      label: 'Satisfaction',            labelEn: 'Satisfaction',        icon: 'Star',          group: 'work', requiredRole: 'COLLABORATEUR' as UserRole },

  // ── security ─────────────────────────────────────────────────────────
  { path: '/incidents',  label: 'Incidents',                labelEn: 'Incidents',         icon: 'ShieldAlert',    group: 'security', requiredRole: 'COLLABORATEUR' as UserRole },
  { path: '/alerts',     label: 'Alertes',                  labelEn: 'Alerts',            icon: 'AlertTriangle',  group: 'security', requiredRole: 'COLLABORATEUR' as UserRole },
  { path: '/veille',     label: 'Veille securite',          labelEn: 'Security Watch',    icon: 'Rss',            group: 'security', requiredRole: 'REVIEWER' as UserRole },
  { path: '/chartes',    label: 'Chartes',                  labelEn: 'Charters',          icon: 'BookOpen',       group: 'security' },
  { path: '/helpdesk',   label: 'Helpdesk',                 labelEn: 'Helpdesk',          icon: 'Headset',        group: 'security' },
  { path: '/tips',       label: 'Conseils securite',        labelEn: 'Security Tips',     icon: 'Lightbulb',      group: 'security' },

  // ── admin ────────────────────────────────────────────────────────────
  { path: '/admin',                 label: 'Administration',            labelEn: 'Administration',        icon: 'Cog',            group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/users',           label: 'Utilisateurs',              labelEn: 'Users',                 icon: 'Users',          group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/users/import',    label: 'Import utilisateurs',       labelEn: 'Import Users',          icon: 'UserPlus',       group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/ldap-pending',    label: 'Validation LDAP',           labelEn: 'LDAP Pending',          icon: 'UserPlus',       group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/departments',     label: 'Departements',              labelEn: 'Departments',           icon: 'Building2',      group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/external-access', label: 'Acces externes',            labelEn: 'External Access',       icon: 'Users',          group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/onboarding',      label: 'Onboarding',                labelEn: 'Onboarding',            icon: 'Users',          group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/compliance',      label: 'Conformite',                labelEn: 'Compliance',            icon: 'ShieldCheck',    group: 'admin', requiredRole: 'REVIEWER' as UserRole },
  { path: '/admin/workflows',       label: "Workflows d'approbation",   labelEn: 'Approval Workflows',    icon: 'Workflow',       group: 'admin', requiredRole: 'REVIEWER' as UserRole },
  { path: '/admin/access-reviews',  label: 'Revue des acces',           labelEn: 'Access Reviews',        icon: 'UserCheck2',     group: 'admin', requiredRole: 'SUPER_ADMIN' as UserRole },
  { path: '/admin/chartes',         label: 'Gestion des chartes',       labelEn: 'Charter Management',    icon: 'Shield',         group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/certificates',    label: 'Certifications',            labelEn: 'Certificates',          icon: 'Award',          group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/feedback',        label: 'Avis & enquêtes satisfaction', labelEn: 'Feedback',          icon: 'MessageCircle',  group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/media',           label: 'Médiathèque (gestion)',     labelEn: 'Media Gallery',         icon: 'Camera',         group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/media',                 label: 'Médiathèque',               labelEn: 'Gallery',               icon: 'Camera',         group: 'work' },
  { path: '/testimonials',          label: 'Mon avis sur l\'intranet',   labelEn: 'My Feedback',           icon: 'MessageCircle',  group: 'mySpace' },
  { path: '/admin/audit',           label: 'Audit',                     labelEn: 'Audit',                 icon: 'ClipboardList',  group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/reports',         label: 'Rapports',                  labelEn: 'Reports',               icon: 'BarChart3',      group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/ad-audit',        label: 'Audit AD',                  labelEn: 'AD Audit',              icon: 'ShieldAlert',    group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/it-exports',      label: 'Exports IT',                labelEn: 'IT Exports',            icon: 'ClipboardCheck', group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/system-health',   label: 'Sante systeme',             labelEn: 'System Health',         icon: 'Activity',       group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/system-monitoring', label: 'Monitoring systeme',       labelEn: 'System Monitoring',     icon: 'Activity',       group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/config',          label: 'Configuration',             labelEn: 'Configuration',         icon: 'Settings',       group: 'admin', requiredRole: 'SUPER_ADMIN' as UserRole },
  { path: '/admin/spaces',          label: 'Espaces & modules',         labelEn: 'Spaces & Modules',      icon: 'Layers',         group: 'admin', requiredRole: 'SUPER_ADMIN' as UserRole },
  { path: '/admin/dark-mode-audit', label: 'Audit dark mode',           labelEn: 'Dark Mode Audit',       icon: 'Moon',           group: 'admin', requiredRole: 'ADMIN' as UserRole },
  { path: '/admin/backups',         label: 'Sauvegardes',               labelEn: 'Backups',               icon: 'Database',       group: 'admin', requiredRole: 'SUPER_ADMIN' as UserRole },

  // ── rssi ─────────────────────────────────────────────────────────────
  { path: '/admin/rssi-dashboard', label: 'Dashboard RSSI', labelEn: 'RSSI Dashboard', icon: 'Activity', group: 'rssi', requiredRole: 'SUPER_ADMIN' as UserRole },

  // ── public ───────────────────────────────────────────────────────────
  { path: '/welcome', label: 'Bienvenue',     labelEn: 'Welcome', icon: 'Home',  group: 'public' },
  { path: '/kiosk',   label: 'Borne d\'accueil', labelEn: 'Kiosk',   icon: 'Monitor', group: 'public' },

  // ── auth ─────────────────────────────────────────────────────────────
  { path: '/login',           label: 'Connexion',              labelEn: 'Login',            icon: 'LogIn',   group: 'auth' },
  { path: '/logout',          label: 'Deconnexion',            labelEn: 'Logout',           icon: 'LogOut',  group: 'auth' },
  { path: '/forgot-password', label: 'Mot de passe oublie',    labelEn: 'Forgot Password',  icon: 'KeyRound', group: 'auth' },
  { path: '/reset-password',  label: 'Reinitialiser le mot de passe', labelEn: 'Reset Password', icon: 'KeyRound', group: 'auth' },

  // ── hub ──────────────────────────────────────────────────────────────
  { path: '/hub/work',     label: 'Hub Travail & Connaissance',  labelEn: 'Work & Knowledge Hub',     icon: 'Briefcase',  group: 'hub' },
  { path: '/hub/security', label: 'Hub Securite & Conformite',   labelEn: 'Security & Compliance Hub', icon: 'ShieldCheck', group: 'hub' },

  // ── other ────────────────────────────────────────────────────────────
  { path: '/chat',            label: 'Chat',               labelEn: 'Chat',              icon: 'MessageSquare', group: 'other' },
  { path: '/changelog',       label: 'Journal des modifications', labelEn: 'Changelog',   icon: 'ScrollText',    group: 'other' },
  { path: '/timeline',        label: 'Frise chronologique', labelEn: 'Timeline',          icon: 'Clock',         group: 'other' },
  { path: '/getting-started', label: 'Premiers pas',        labelEn: 'Getting Started',   icon: 'Sparkles',      group: 'other' },
  { path: '/extranet',        label: 'Extranet',            labelEn: 'Extranet',          icon: 'Globe2',        group: 'other' },
] as const;

// ---------------------------------------------------------------------------
// Lookup maps (built once at module load)
// ---------------------------------------------------------------------------

const routeByPath = new Map<string, RouteEntry>(
  ROUTES.map((r) => [r.path, r]),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifie si un chemin correspond a une route declaree dans le registre.
 * La comparaison est exacte (pas de matching de segments dynamiques).
 */
export function isValidRoute(path: string): boolean {
  const normalized = path.endsWith('/') && path !== '/'
    ? path.slice(0, -1)
    : path;
  return routeByPath.has(normalized);
}

/**
 * Retourne le label d'une route pour la locale demandee.
 * Renvoie le chemin brut si la route n'est pas trouvee.
 *
 * @param path   Chemin absolu de la route
 * @param locale 'fr' (defaut) ou 'en'
 */
export function getRouteLabel(path: string, locale: string = 'fr'): string {
  const normalized = path.endsWith('/') && path !== '/'
    ? path.slice(0, -1)
    : path;
  const entry = routeByPath.get(normalized);
  if (!entry) return path;
  return locale === 'en' ? entry.labelEn : entry.label;
}

/**
 * Retourne l'entree complete d'une route, ou undefined si introuvable.
 */
export function getRouteEntry(path: string): RouteEntry | undefined {
  const normalized = path.endsWith('/') && path !== '/'
    ? path.slice(0, -1)
    : path;
  return routeByPath.get(normalized);
}

/**
 * Retourne toutes les routes appartenant a un groupe donne.
 */
export function getRoutesByGroup(group: RouteGroup): readonly RouteEntry[] {
  return ROUTES.filter((r) => r.group === group);
}
