/**
 * Intelligence Engine — Generates contextual insights for dashboard.
 * Pure heuristic, no ML. Reads from existing API endpoints.
 */

export interface Insight {
  id: string;
  type: 'warning' | 'info' | 'success' | 'action';
  icon: string; // lucide icon name
  title: string;
  description: string;
  href?: string;
  priority: number; // 0-100, higher = more important
  module: string;
}

export function generateInsights(data: {
  pendingDocs?: number;
  overdueReviews?: number;
  openTickets?: number;
  criticalAlerts?: number;
  unsignedChartes?: number;
  mfaEnabled?: boolean;
  profileComplete?: boolean;
  lastLogin?: string | null;
  userRole?: string;
}): Insight[] {
  const insights: Insight[] = [];
  const now = Date.now();

  // Critical: unsigned chartes
  if (data.unsignedChartes && data.unsignedChartes > 0) {
    insights.push({
      id: 'unsigned-chartes',
      type: 'warning',
      icon: 'FileSignature',
      title: `${data.unsignedChartes} charte(s) à signer`,
      description: 'Des chartes obligatoires nécessitent votre signature pour accéder à l\'ensemble des fonctionnalités.',
      href: '/chartes',
      priority: 95,
      module: 'compliance',
    });
  }

  // Critical: P1 alerts
  if (data.criticalAlerts && data.criticalAlerts > 0) {
    insights.push({
      id: 'critical-alerts',
      type: 'warning',
      icon: 'AlertTriangle',
      title: `${data.criticalAlerts} alerte(s) critique(s)`,
      description: 'Des alertes de sécurité prioritaires requièrent votre attention immédiate.',
      href: '/alerts',
      priority: 90,
      module: 'security',
    });
  }

  // High: overdue document reviews
  if (data.overdueReviews && data.overdueReviews > 0) {
    insights.push({
      id: 'overdue-reviews',
      type: 'warning',
      icon: 'Clock',
      title: `${data.overdueReviews} document(s) en retard de revue`,
      description: 'Des documents dépassent leur date de révision ISO 27001. Planifiez une revue rapidement.',
      href: '/documents?status=overdue',
      priority: 75,
      module: 'documents',
    });
  }

  // Medium: pending documents to approve
  if (data.pendingDocs && data.pendingDocs > 0) {
    insights.push({
      id: 'pending-docs',
      type: 'action',
      icon: 'FileCheck',
      title: `${data.pendingDocs} document(s) en attente`,
      description: 'Des documents attendent votre validation ou votre relecture.',
      href: '/documents/pending',
      priority: 60,
      module: 'documents',
    });
  }

  // Medium: open tickets assigned
  if (data.openTickets && data.openTickets > 0) {
    insights.push({
      id: 'open-tickets',
      type: 'info',
      icon: 'Ticket',
      title: `${data.openTickets} ticket(s) ouvert(s)`,
      description: 'Des tickets vous sont assignés et attendent une réponse.',
      href: '/tickets?status=OPEN',
      priority: 50,
      module: 'tickets',
    });
  }

  // Onboarding: MFA not enabled
  if (data.mfaEnabled === false) {
    insights.push({
      id: 'mfa-disabled',
      type: 'action',
      icon: 'Shield',
      title: 'MFA non activé',
      description: 'Renforcez la sécurité de votre compte en activant l\'authentification multi-facteurs.',
      href: '/mfa',
      priority: 45,
      module: 'security',
    });
  }

  // Onboarding: profile incomplete
  if (data.profileComplete === false) {
    insights.push({
      id: 'profile-incomplete',
      type: 'info',
      icon: 'User',
      title: 'Profil incomplet',
      description: 'Ajoutez votre photo et vos coordonnées pour faciliter la collaboration avec vos collègues.',
      href: '/profile',
      priority: 30,
      module: 'profile',
    });
  }

  // All clear
  if (insights.length === 0) {
    insights.push({
      id: 'all-clear',
      type: 'success',
      icon: 'CheckCircle2',
      title: 'Tout est en ordre',
      description: 'Aucune action en attente. Bonne continuation !',
      priority: 0,
      module: 'general',
    });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}
