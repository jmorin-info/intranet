'use client';

/**
 * Pure helpers producing the metric / CTA card arrays rendered by
 * `DashboardStatsGrid`. Kept separate from the JSX to make the grid
 * component itself easier to read.
 */

import type { ElementType } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  PenLine,
  UserCheck,
} from 'lucide-react';

export interface DashboardStats {
  totalDocuments: number;
  approvedDocuments: number;
  pendingReview: number;
  pendingApproval: number;
  overdueRevision: number;
  pendingSignatures: number;
}

export interface Trend {
  direction: 'up' | 'down' | 'flat';
  delta: number;
}

export interface StatCard {
  label: string;
  value: number | string;
  icon: ElementType;
  color: string;
  bg: string;
  gradient: string;
  href?: string;
  show?: boolean;
  trend?: Trend;
  subtext?: string;
  /** Explication courte de l'indicateur, affichée au survol (aide contextuelle). */
  help?: string;
}

export interface ActionCard {
  label: string;
  cta: string;
  value: number | string;
  icon: ElementType;
  color: string;
  bg: string;
  gradient: string;
  href: string;
}

export function computeTrend(current: number | undefined, previous: number | undefined): Trend {
  if (current === undefined || previous === undefined || previous === 0) return { direction: 'flat', delta: 0 };
  const delta = current - previous;
  if (delta > 0) return { direction: 'up', delta };
  if (delta < 0) return { direction: 'down', delta: Math.abs(delta) };
  return { direction: 'flat', delta: 0 };
}

interface BuildStatCardsOptions {
  stats: DashboardStats | null;
  isManager: boolean;
  t: (key: string) => string;
}

export function buildStatCards({ stats, isManager, t }: BuildStatCardsOptions): StatCard[] {
  return [
    {
      label: t('dashboard.stats.documents'),
      value: stats?.totalDocuments ?? '-',
      icon: FileText,
      color: 'text-seal-navy',
      bg: 'bg-seal-navy/10',
      gradient: 'from-seal-navy/5 to-transparent',
      href: '/documents',
      trend: computeTrend(stats?.totalDocuments, undefined),
      subtext: stats
        ? `${stats.approvedDocuments} approuvé${stats.approvedDocuments !== 1 ? 's' : ''} · ${stats.pendingReview} en revue`
        : undefined,
      help: 'Nombre total de documents de la base documentaire ISO 27001, toutes classifications confondues.',
    },
    {
      label: t('dashboard.stats.approved'),
      value: stats?.approvedDocuments ?? '-',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      gradient: 'from-emerald-50 to-transparent',
      href: '/documents?status=APPROVED',
      trend: computeTrend(stats?.approvedDocuments, undefined),
      subtext: stats?.totalDocuments
        ? `${Math.round(((stats.approvedDocuments ?? 0) / stats.totalDocuments) * 100)}% du total`
        : undefined,
      help: 'Documents validés et en vigueur. Le pourcentage indique leur part dans la base documentaire.',
    },
    {
      label: t('dashboard.stats.inReview'),
      value: stats?.pendingReview ?? '-',
      icon: Eye,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      gradient: 'from-blue-50 to-transparent',
      href: '/documents?status=IN_REVIEW',
      show: isManager,
      trend: computeTrend(stats?.pendingReview, undefined),
      subtext: stats?.pendingApproval ? `${stats.pendingApproval} en attente d'approbation` : undefined,
      help: 'Documents en cours de relecture par un relecteur avant de passer à l\'approbation finale.',
    },
    {
      label: t('dashboard.stats.pending'),
      value: stats?.pendingApproval ?? '-',
      icon: UserCheck,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      gradient: 'from-amber-50 to-transparent',
      href: '/documents?status=PENDING_APPROVAL',
      show: isManager,
      trend: computeTrend(stats?.pendingApproval, undefined),
      subtext: stats?.overdueRevision
        ? `${stats.overdueRevision} revue${stats.overdueRevision !== 1 ? 's' : ''} en retard`
        : undefined,
      help: 'Documents relus, en attente de validation finale par un approbateur habilité.',
    },
    {
      label: t('dashboard.stats.overdue'),
      value: stats?.overdueRevision ?? '-',
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      gradient: 'from-red-50 to-transparent',
      href: '/documents?status=EXPIRED',
      show: isManager,
      trend: computeTrend(stats?.overdueRevision, undefined),
      subtext: (stats?.overdueRevision ?? 0) > 0 ? 'Action requise' : 'Aucun retard',
      help: 'Documents dont la date de revue périodique est dépassée. À traiter pour maintenir la conformité ISO 27001.',
    },
    {
      label: 'Signatures',
      value: stats?.pendingSignatures ?? '-',
      icon: PenLine,
      color: 'text-primary',
      bg: 'bg-primary/10',
      gradient: 'from-primary/5 to-transparent',
      href: '/documents?tab=signatures',
      trend: computeTrend(stats?.pendingSignatures, undefined),
      subtext: (stats?.pendingSignatures ?? 0) > 0 ? `${stats?.pendingSignatures} en attente` : 'Tout est signé',
      help: 'Documents nécessitant votre signature électronique (lecture et acceptation).',
    },
  ].filter((c) => c.show !== false);
}

export function buildActionCards(stats: DashboardStats | null): ActionCard[] {
  const cards: ActionCard[] = [];
  const reviewCount = stats?.pendingReview ?? 0;
  if (reviewCount > 0)
    cards.push({
      label: 'Documents à revoir',
      cta: `Revoir ${reviewCount} document${reviewCount > 1 ? 's' : ''}`,
      value: reviewCount,
      icon: Eye,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      gradient: 'from-blue-50 to-transparent',
      href: '/documents?status=IN_REVIEW',
    });
  const approvalCount = stats?.pendingApproval ?? 0;
  if (approvalCount > 0)
    cards.push({
      label: "En attente d'approbation",
      cta: `Approuver ${approvalCount} document${approvalCount > 1 ? 's' : ''}`,
      value: approvalCount,
      icon: UserCheck,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      gradient: 'from-amber-50 to-transparent',
      href: '/documents?status=PENDING_APPROVAL',
    });
  const sigCount = stats?.pendingSignatures ?? 0;
  if (sigCount > 0)
    cards.push({
      label: 'Signatures en attente',
      cta: `Signer ${sigCount} document${sigCount > 1 ? 's' : ''}`,
      value: sigCount,
      icon: PenLine,
      color: 'text-primary',
      bg: 'bg-primary/10',
      gradient: 'from-primary/5 to-transparent',
      href: '/documents?tab=signatures',
    });
  const overdueCount = stats?.overdueRevision ?? 0;
  if (overdueCount > 0)
    cards.push({
      label: 'Revues en retard',
      cta: `${overdueCount} revue${overdueCount > 1 ? 's' : ''} en retard`,
      value: overdueCount,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      gradient: 'from-red-50 to-transparent',
      href: '/documents?overdue=true',
    });
  cards.push({
    label: 'Mes documents',
    cta: 'Voir tous les documents',
    value: stats?.totalDocuments ?? '-',
    icon: FileText,
    color: 'text-seal-navy',
    bg: 'bg-seal-navy/10',
    gradient: 'from-seal-navy/5 to-transparent',
    href: '/documents',
  });
  return cards;
}
