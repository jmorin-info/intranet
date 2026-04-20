/**
 * Role-based personalization — adapts dashboard and navigation priority per role.
 */

export interface RoleConfig {
  dashboardPriority: string[]; // ordered module keys for dashboard widgets
  quickActions: Array<{ label: string; href: string; icon: string }>;
  insightModules: string[]; // which insight modules to show
}

const ROLE_CONFIGS: Record<string, RoleConfig> = {
  SUPER_ADMIN: {
    dashboardPriority: ['security', 'compliance', 'system', 'users', 'documents'],
    quickActions: [
      { label: 'Santé système', href: '/admin/system-health', icon: 'HeartPulse' },
      { label: 'Journal d\'audit', href: '/admin/audit', icon: 'ClipboardList' },
      { label: 'Utilisateurs', href: '/admin/users', icon: 'Users' },
      { label: 'Conformité', href: '/admin/compliance', icon: 'ShieldCheck' },
    ],
    insightModules: ['security', 'compliance', 'documents', 'tickets', 'system', 'profile'],
  },
  ADMIN: {
    dashboardPriority: ['tickets', 'security', 'documents', 'compliance', 'users'],
    quickActions: [
      { label: 'Nouveau ticket', href: '/tickets?create=true', icon: 'Ticket' },
      { label: 'Incidents', href: '/incidents', icon: 'AlertTriangle' },
      { label: 'Utilisateurs', href: '/admin/users', icon: 'Users' },
      { label: 'Veille cyber', href: '/veille', icon: 'Shield' },
    ],
    insightModules: ['security', 'compliance', 'documents', 'tickets', 'profile'],
  },
  DIRECTION: {
    dashboardPriority: ['compliance', 'documents', 'security', 'tickets'],
    quickActions: [
      { label: 'Conformité ISO', href: '/admin/compliance', icon: 'ShieldCheck' },
      { label: 'Rapports', href: '/admin/reports', icon: 'BarChart3' },
      { label: 'Documents', href: '/documents', icon: 'FileText' },
      { label: 'Dashboard RSSI', href: '/admin/rssi-dashboard', icon: 'Shield' },
    ],
    insightModules: ['compliance', 'documents', 'security'],
  },
  REVIEWER: {
    dashboardPriority: ['documents', 'compliance', 'tickets'],
    quickActions: [
      { label: 'File de validation', href: '/documents/pending', icon: 'FileCheck' },
      { label: 'Documents', href: '/documents', icon: 'FileText' },
      { label: 'Procédures', href: '/procedures', icon: 'BookOpen' },
      { label: 'Wiki', href: '/wiki', icon: 'BookOpen' },
    ],
    insightModules: ['documents', 'compliance', 'profile'],
  },
  COLLABORATEUR: {
    dashboardPriority: ['tickets', 'documents', 'news'],
    quickActions: [
      { label: 'Nouveau ticket', href: '/tickets?create=true', icon: 'Ticket' },
      { label: 'Documents', href: '/documents', icon: 'FileText' },
      { label: 'Actualités', href: '/news', icon: 'Newspaper' },
      { label: 'Wiki', href: '/wiki', icon: 'BookOpen' },
    ],
    insightModules: ['tickets', 'documents', 'profile'],
  },
  PRESTATAIRE: {
    dashboardPriority: ['tickets', 'documents'],
    quickActions: [
      { label: 'Mes tickets', href: '/tickets', icon: 'Ticket' },
      { label: 'Documents partagés', href: '/documents', icon: 'FileText' },
    ],
    insightModules: ['tickets', 'documents', 'profile'],
  },
};

export function getRoleConfig(role: string): RoleConfig {
  return ROLE_CONFIGS[role] || ROLE_CONFIGS.COLLABORATEUR!;
}
