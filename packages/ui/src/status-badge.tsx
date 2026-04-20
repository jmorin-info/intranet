import React from 'react';
import { Badge } from './badge';
import type { BadgeProps } from './badge';
import {
  Circle,
  Clock,
  Eye,
  UserCheck,
  CheckCircle2,
  Archive,
  FolderOpen,
  Hand,
  AlertTriangle,
  Search,
  Shield,
  RefreshCw,
} from 'lucide-react';

/**
 * Unified StatusBadge — supports ALL entity statuses:
 *  - Document: DRAFT, IN_REVIEW, REVIEW_APPROVED, PENDING_APPROVAL, APPROVED, OBSOLETE, ARCHIVED
 *  - Ticket: OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED
 *  - Incident: DETECTED, UNDER_INVESTIGATION, CONTAINED, ERADICATED, RECOVERED, CLOSED
 */

type BadgeVariant = NonNullable<BadgeProps['variant']>;

interface StatusConfig {
  label: string;
  variant: BadgeVariant;
  icon: React.ElementType;
}

const statusConfig: Record<string, StatusConfig> = {
  // ── Document statuses ──────────────────────────────────────────
  DRAFT:              { label: 'Brouillon',              variant: 'draft',              icon: Clock },
  IN_REVIEW:          { label: 'En revue',               variant: 'in-review',          icon: Eye },
  REVIEW_APPROVED:    { label: 'Revue validee',          variant: 'seal-blue',          icon: Hand },
  PENDING_APPROVAL:   { label: 'Approbation en attente', variant: 'pending-approval',   icon: UserCheck },
  APPROVED:           { label: 'Approuve',               variant: 'approved',           icon: CheckCircle2 },
  OBSOLETE:           { label: 'Obsolete',               variant: 'obsolete',           icon: Archive },
  ARCHIVED:           { label: 'Archive',                variant: 'archived',           icon: FolderOpen },

  // ── Ticket statuses ────────────────────────────────────────────
  OPEN:               { label: 'Ouvert',                 variant: 'info',               icon: Circle },
  IN_PROGRESS:        { label: 'En cours',               variant: 'warning',            icon: Clock },
  WAITING:            { label: 'En attente',             variant: 'draft',              icon: Clock },
  RESOLVED:           { label: 'Resolu',                 variant: 'approved',           icon: CheckCircle2 },
  CLOSED:             { label: 'Ferme',                  variant: 'archived',           icon: CheckCircle2 },

  // ── Incident statuses ──────────────────────────────────────────
  DETECTED:              { label: 'Detecte',             variant: 'error',              icon: AlertTriangle },
  UNDER_INVESTIGATION:   { label: 'Investigation',       variant: 'warning',            icon: Search },
  CONTAINED:             { label: 'Contenu',             variant: 'info',               icon: Shield },
  ERADICATED:            { label: 'Eradique',            variant: 'seal-blue',          icon: CheckCircle2 },
  RECOVERED:             { label: 'Retabli',             variant: 'approved',           icon: RefreshCw },
  // CLOSED is shared with tickets above
};

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, showIcon = true, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  if (!config) return null;

  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={className}>
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
