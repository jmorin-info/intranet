/**
 * Automation Engine — Lightweight heuristic automation for the intranet.
 *
 * Generates proactive suggestions based on user activity patterns.
 * No ML required — pure rule-based heuristics.
 */

export interface AutomationHint {
  id: string;
  type: 'reminder' | 'suggestion' | 'anomaly';
  title: string;
  description: string;
  href?: string;
  icon: string;
  priority: number;
  dismissable: boolean;
}

interface AutomationContext {
  // User data
  userRole: string;
  mfaEnabled: boolean;
  profileComplete: boolean;
  lastLogin: string | null;
  // Module data
  openTicketsCount: number;
  pendingDocsCount: number;
  unsignedChartesCount: number;
  overdueReviewsCount: number;
  // Activity
  daysSinceLastLogin: number;
}

/**
 * Generate automation hints based on context.
 * Returns sorted by priority (highest first), max 3 hints.
 */
export function generateAutomationHints(ctx: AutomationContext): AutomationHint[] {
  const hints: AutomationHint[] = [];

  // Rule 1: Auto-suggest ticket creation if user has high ticket volume
  if (ctx.openTicketsCount > 5) {
    hints.push({
      id: 'high-ticket-volume',
      type: 'suggestion',
      title: 'Volume de tickets élevé',
      description: `Vous avez ${ctx.openTicketsCount} tickets ouverts. Priorisez les plus anciens pour éviter les dépassements de SLA.`,
      href: '/tickets?sort=oldest',
      icon: 'Ticket',
      priority: 70,
      dismissable: true,
    });
  }

  // Rule 2: Overdue document reviews
  if (ctx.overdueReviewsCount > 0) {
    hints.push({
      id: 'overdue-reviews-reminder',
      type: 'reminder',
      title: 'Revues documentaires en retard',
      description: `${ctx.overdueReviewsCount} document(s) dépassent leur date de révision. Planifiez une revue pour rester conforme ISO 27001.`,
      href: '/documents?status=overdue',
      icon: 'Clock',
      priority: 85,
      dismissable: true,
    });
  }

  // Rule 3: Unsigned chartes
  if (ctx.unsignedChartesCount > 0) {
    hints.push({
      id: 'sign-chartes',
      type: 'reminder',
      title: 'Chartes à signer',
      description: `${ctx.unsignedChartesCount} charte(s) obligatoire(s) en attente de signature. Accédez-y pour débloquer l'ensemble des fonctionnalités.`,
      href: '/chartes',
      icon: 'FileSignature',
      priority: 95,
      dismissable: false,
    });
  }

  // Rule 4: MFA not enabled
  if (!ctx.mfaEnabled) {
    hints.push({
      id: 'enable-mfa',
      type: 'suggestion',
      title: 'Sécurisez votre compte',
      description: 'L\'authentification multi-facteurs (MFA) n\'est pas activée. Protégez votre compte en 2 minutes.',
      href: '/mfa',
      icon: 'Shield',
      priority: 60,
      dismissable: true,
    });
  }

  // Rule 5: Profile incomplete
  if (!ctx.profileComplete) {
    hints.push({
      id: 'complete-profile',
      type: 'suggestion',
      title: 'Complétez votre profil',
      description: 'Ajoutez votre photo et vos coordonnées pour faciliter la collaboration avec vos collègues.',
      href: '/profile',
      icon: 'User',
      priority: 30,
      dismissable: true,
    });
  }

  // Rule 6: Inactivity detection (admin-visible)
  if (ctx.daysSinceLastLogin > 14 && (ctx.userRole === 'ADMIN' || ctx.userRole === 'SUPER_ADMIN')) {
    hints.push({
      id: 'user-inactivity',
      type: 'anomaly',
      title: 'Activité inhabituelle détectée',
      description: 'Certains utilisateurs n\'ont pas accédé à l\'intranet depuis plus de 14 jours. Vérifiez les comptes inactifs.',
      href: '/admin/users?status=inactive',
      icon: 'AlertTriangle',
      priority: 50,
      dismissable: true,
    });
  }

  // Rule 7: Pending docs for reviewers
  if (ctx.pendingDocsCount > 0 && (ctx.userRole === 'REVIEWER' || ctx.userRole === 'DIRECTION' || ctx.userRole === 'ADMIN' || ctx.userRole === 'SUPER_ADMIN')) {
    hints.push({
      id: 'pending-approvals',
      type: 'reminder',
      title: `${ctx.pendingDocsCount} document(s) en attente`,
      description: 'Des documents attendent votre validation. Traitez-les pour fluidifier le workflow documentaire.',
      href: '/documents/pending',
      icon: 'FileCheck',
      priority: 65,
      dismissable: true,
    });
  }

  return hints
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
}
