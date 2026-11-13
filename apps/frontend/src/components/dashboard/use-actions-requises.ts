'use client';

/**
 * `useActionsRequises` — loads every actionable item awaiting the viewer:
 * documents to approve/review, assigned tickets, unread P1 alerts and
 * unsigned chartes. Returns a rank-ordered list of `ActionItem`s ready to be
 * consumed by the dashboard's "Mes tâches" block.
 */

import type { ElementType } from 'react';
import { useEffect, useState } from 'react';
import { Eye, ScrollText, ShieldAlert, Ticket, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { approvalSummary, currentApprovals, type PendingApproval } from '@/lib/approvals';

export interface ActionDetail {
  id: string;
  title: string;
  href: string;
}

export interface ActionItem {
  label: string;
  count: number;
  href: string;
  color: string;
  bgColor: string;
  icon: ElementType;
  urgent?: boolean;
  details?: ActionDetail[];
}

export interface MyTasks {
  pendingSignatures: number;
  docsToReview: number;
  unreadNotifications: number;
  unsignedChartes: number;
}

export function useActionsRequises() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Promise.allSettled([
      api.get('/documents/pending').then((r) => r.data),
      api.get('/tickets', { params: { assigneeId: 'me', status: 'OPEN,IN_PROGRESS' } }).then((r) => r.data),
      api.get('/alerts', { params: { unread: true, severity: 'P1' } }).then((r) => r.data),
      api.get('/chartes/unsigned').then((r) => r.data),
      api.get<PendingApproval[]>('/approval-workflows/pending/me').then((r) => r.data),
    ]).then(([docsR, ticketsR, alertsR, chartesR, approvalsR]) => {
      const items: ActionItem[] = [];
      if (approvalsR.status === 'fulfilled' && Array.isArray(approvalsR.value)) {
        const approvals = currentApprovals(approvalsR.value);
        const overdue = approvalSummary(approvals, Date.now()).overdue;
        if (approvals.length) items.push({
          label: overdue ? `étapes à valider, dont ${overdue} en retard` : 'étapes de circuit à valider',
          count: approvals.length,
          href: '/approvals',
          color: overdue ? 'text-red-700' : 'text-blue-700',
          bgColor: overdue ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30' : 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30',
          icon: UserCheck,
          urgent: overdue > 0,
          details: approvals.slice(0, 3).map((row) => ({ id: row.id,
            title: row.instance.document?.title || row.step.name, href: '/approvals' })),
        });
      }
      if (docsR.status === 'fulfilled') {
        const docs = Array.isArray(docsR.value) ? docsR.value : (docsR.value?.data || []);
        const toApprove = docs.filter((d: any) => d.status === 'REVIEW_APPROVED' || d.status === 'PENDING_APPROVAL');
        const toReview = docs.filter((d: any) => d.status === 'IN_REVIEW');
        if (toApprove.length > 0)
          items.push({
            label: 'documents à approuver',
            count: toApprove.length,
            href: '/documents?status=PENDING_APPROVAL',
            color: 'text-red-600',
            bgColor: 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30',
            icon: UserCheck,
            urgent: true,
            details: toApprove.slice(0, 3).map((d: any) => ({
              id: d.id,
              title: d.title || d.reference || 'Document',
              href: `/documents/${d.id}`,
            })),
          });
        if (toReview.length > 0)
          items.push({
            label: 'documents à revoir',
            count: toReview.length,
            href: '/documents/pending',
            color: 'text-blue-600',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30',
            icon: Eye,
            details: toReview.slice(0, 3).map((d: any) => ({
              id: d.id,
              title: d.title || d.reference || 'Document',
              href: `/documents/${d.id}`,
            })),
          });
      }
      if (ticketsR.status === 'fulfilled') {
        const tickets = Array.isArray(ticketsR.value) ? ticketsR.value : (ticketsR.value?.data || []);
        if (tickets.length > 0)
          items.push({
            label: 'tickets assignés',
            count: tickets.length,
            href: '/tickets?assigneeId=me',
            color: 'text-amber-600',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30',
            icon: Ticket,
            details: tickets.slice(0, 3).map((t: any) => ({
              id: t.id,
              title: `${t.reference || ''} ${t.title || ''}`.trim(),
              href: `/tickets/${t.id}`,
            })),
          });
      }
      if (alertsR.status === 'fulfilled') {
        const alerts = Array.isArray(alertsR.value) ? alertsR.value : (alertsR.value?.data || []);
        if (alerts.length > 0)
          items.push({
            label: 'alertes P1',
            count: alerts.length,
            href: '/alerts?severity=P1',
            color: 'text-red-600',
            bgColor: 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30',
            icon: ShieldAlert,
            urgent: true,
          });
      }
      if (chartesR.status === 'fulfilled') {
        const chartes = Array.isArray(chartesR.value) ? chartesR.value : (chartesR.value?.data || []);
        if (chartes.length > 0)
          items.push({
            label: 'chartes à signer',
            count: chartes.length,
            href: '/admin/chartes',
            color: 'text-violet-600',
            bgColor: 'bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30',
            icon: ScrollText,
            details: chartes.slice(0, 3).map((c: any) => ({
              id: c.id,
              title: c.title || c.name || 'Charte',
              href: '/admin/chartes',
            })),
          });
      }
      setActions(items);
      setLoaded(true);
    });
  }, []);
  return { actions, loaded };
}
