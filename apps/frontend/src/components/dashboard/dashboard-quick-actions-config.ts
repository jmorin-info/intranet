'use client';

/**
 * Builds the ordered list of `TaskRowConfig`s rendered inside the dashboard
 * "Mes tâches" card. Kept outside the component so the JSX stays focused on
 * layout.
 */

import type { ElementType } from 'react';
import {
  Bell,
  Eye,
  PenLine,
  ScrollText,
  ShieldAlert,
  Ticket,
  UserCheck,
} from 'lucide-react';
import type { ActionItem, MyTasks } from './use-actions-requises';

export type Urgency = 'critical' | 'urgent' | 'info';

export interface TaskRowConfig {
  icon: ElementType;
  iconColor: string;
  label: string;
  count: number;
  variant: 'error' | 'warning' | 'info' | 'navy';
  cta: string;
  ctaIcon: ElementType;
  ctaClass: string;
  href: string;
  urgency: Urgency;
  showUrgentBadge?: boolean;
  details?: ActionItem['details'];
  detailsClickable?: boolean;
}

interface BuildTaskRowsOptions {
  actions: ActionItem[];
  myTasks: MyTasks | null;
}

export function buildTaskRows({ actions, myTasks }: BuildTaskRowsOptions): TaskRowConfig[] {
  const ticketAction = actions.find((a) => a.label.includes('ticket'));
  const alertAction = actions.find((a) => a.label.includes('alerte'));
  const approveAction = actions.find((a) => a.label.includes('approuver'));
  const charteAction = actions.find((a) => a.label.includes('charte'));
  const reviewAction = actions.find((a) => a.label.includes('revoir'));
  const rows: TaskRowConfig[] = [];

  if (alertAction) {
    rows.push({
      icon: ShieldAlert,
      iconColor: 'text-red-600',
      label: 'Alertes P1',
      count: alertAction.count,
      variant: 'error',
      cta: 'Traiter',
      ctaIcon: ShieldAlert,
      ctaClass: 'bg-red-600 hover:bg-red-700',
      href: alertAction.href,
      urgency: 'critical',
      showUrgentBadge: true,
    });
  }
  if (approveAction) {
    rows.push({
      icon: UserCheck,
      iconColor: 'text-red-600',
      label: 'Documents à approuver',
      count: approveAction.count,
      variant: 'error',
      cta: 'Approuver',
      ctaIcon: UserCheck,
      ctaClass: 'bg-red-600 hover:bg-red-700',
      href: approveAction.href,
      urgency: 'urgent',
      details: approveAction.details,
      detailsClickable: true,
    });
  }
  if (myTasks && myTasks.unsignedChartes > 0) {
    rows.push({
      icon: ScrollText,
      iconColor: 'text-red-600',
      label: 'Chartes à signer',
      count: myTasks.unsignedChartes,
      variant: 'error',
      cta: 'Signer',
      ctaIcon: ScrollText,
      ctaClass: 'bg-red-600 hover:bg-red-700',
      href: '/admin/chartes',
      urgency: myTasks.unsignedChartes > 2 ? 'critical' : 'urgent',
      showUrgentBadge: myTasks.unsignedChartes > 2,
      details: charteAction?.details,
      detailsClickable: false,
    });
  }
  if (myTasks && myTasks.pendingSignatures > 0) {
    rows.push({
      icon: PenLine,
      iconColor: 'text-amber-600',
      label: 'Signatures en attente',
      count: myTasks.pendingSignatures,
      variant: 'warning',
      cta: 'Signer',
      ctaIcon: PenLine,
      ctaClass: 'bg-amber-600 hover:bg-amber-700',
      href: '/documents?tab=signatures',
      urgency: 'info',
    });
  }
  if (ticketAction) {
    rows.push({
      icon: Ticket,
      iconColor: 'text-amber-600',
      label: 'Tickets assignés',
      count: ticketAction.count,
      variant: 'warning',
      cta: 'Voir',
      ctaIcon: Ticket,
      ctaClass: 'bg-amber-600 hover:bg-amber-700',
      href: ticketAction.href,
      urgency: 'info',
      details: ticketAction.details,
      detailsClickable: true,
    });
  }
  if (myTasks && myTasks.docsToReview > 0) {
    rows.push({
      icon: Eye,
      iconColor: 'text-blue-600',
      label: 'Documents à revoir',
      count: myTasks.docsToReview,
      variant: 'info',
      cta: 'Revoir',
      ctaIcon: Eye,
      ctaClass: 'bg-blue-600 hover:bg-blue-700',
      href: '/documents/pending',
      urgency: 'info',
      details: reviewAction?.details,
      detailsClickable: true,
    });
  }
  if (myTasks && myTasks.unreadNotifications > 0) {
    rows.push({
      icon: Bell,
      iconColor: 'text-violet-600',
      label: 'Notifications non lues',
      count: myTasks.unreadNotifications,
      variant: 'navy',
      cta: 'Voir',
      ctaIcon: Bell,
      ctaClass: 'bg-violet-600 hover:bg-violet-700',
      href: '/notifications',
      urgency: 'info',
    });
  }

  return rows;
}
