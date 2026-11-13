'use client';

import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import {
  Shield,
  AlertTriangle,
  FileCheck,
  Activity,
  Users,
} from 'lucide-react';
import { Card, CardContent, Skeleton, Tooltip } from '@omnitech/ui';
import { api } from '@/lib/api';

type KpiStatus = 'success' | 'warning' | 'danger';

interface MfaAdoption {
  value: number;
  target: number;
  status: KpiStatus;
  total: number;
  mfaEnabled: number;
}

interface MonthlyIncidents {
  value: number;
  trend: 'up' | 'down' | 'flat';
  previousMonth: number;
}

interface DocumentCompliance {
  value: number;
  total: number;
  approved: number;
}

interface IsoCoverage {
  value: number;
  target: number;
  totalControls: number;
  withEvidence: number;
}

interface CharterAdoption {
  value: number;
  total: number;
  signed: number;
}

interface OpenTicketsByPriority {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

interface SmsiData {
  scope?: 'full' | 'mid' | 'min';
  mfaAdoption?: MfaAdoption;
  monthlyIncidents?: MonthlyIncidents;
  documentCompliance?: DocumentCompliance;
  isoCoverage?: IsoCoverage;
  charterAdoption?: CharterAdoption;
  openTicketsByPriority?: OpenTicketsByPriority;
}

interface KpiCardProps {
  label: string;
  value: string;
  target?: string;
  sublabel?: string;
  icon: LucideIcon;
  status: KpiStatus;
  /** Explication courte affichée au survol/focus (aide contextuelle). */
  help?: string;
}

const CARD_BG: Record<KpiStatus, string> = {
  success:
    'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10',
  warning:
    'border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10',
  danger:
    'border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10',
};

const ICON_COLOR: Record<KpiStatus, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

function KpiCard({ label, value, target, sublabel, icon: Icon, status, help }: KpiCardProps) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${CARD_BG[status]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${ICON_COLOR[status]}`} />
        <span className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 truncate flex-1">
          {label}
        </span>
        {help && (
          <Tooltip
            content={help}
            side="top"
            className="whitespace-normal w-56 text-left leading-snug font-normal"
          >
            <span
              tabIndex={0}
              aria-label={`À propos de l’indicateur « ${label} »`}
              className="shrink-0 cursor-help text-seal-gray-500/50 hover:text-seal-gray-500 dark:text-slate-500 dark:hover:text-slate-300 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy/40 transition-colors"
            >
              <Info className="h-3 w-3" aria-hidden="true" />
            </span>
          </Tooltip>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-semibold ${ICON_COLOR[status]}`}>{value}</span>
        {target && <span className="text-[10px] text-seal-gray-500">/ {target}</span>}
      </div>
      {sublabel && (
        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5 truncate">
          {sublabel}
        </p>
      )}
    </div>
  );
}

function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Indicateurs SMSI
          </h3>
          <span className="text-[10px] uppercase tracking-widest text-seal-gray-500">
            ISO 27001
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function SmsiIndicatorsWidget() {
  const [data, setData] = useState<SmsiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SmsiData>('/reports/smsi-indicators')
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <WidgetShell>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </WidgetShell>
    );
  }

  if (!data) return null;

  const cards: React.ReactNode[] = [];

  if (data.mfaAdoption) {
    cards.push(
      <KpiCard
        key="mfa"
        label="Adoption MFA"
        value={`${data.mfaAdoption.value}%`}
        target={`${data.mfaAdoption.target}%`}
        sublabel={`${data.mfaAdoption.mfaEnabled}/${data.mfaAdoption.total} utilisateurs`}
        icon={Shield}
        status={data.mfaAdoption.status}
        help="Part des comptes utilisateurs ayant activé l'authentification multi-facteur (TOTP). Vise la cible affichée pour respecter la politique d'accès ISO 27001 A.5.16."
      />,
    );
  }

  if (data.monthlyIncidents) {
    const incidentStatus: KpiStatus =
      data.monthlyIncidents.value > 5
        ? 'danger'
        : data.monthlyIncidents.value > 0
          ? 'warning'
          : 'success';
    const incidentSublabel =
      data.monthlyIncidents.trend === 'down'
        ? `↓ vs mois dernier (${data.monthlyIncidents.previousMonth})`
        : data.monthlyIncidents.trend === 'up'
          ? `↑ vs mois dernier (${data.monthlyIncidents.previousMonth})`
          : `= vs mois dernier (${data.monthlyIncidents.previousMonth})`;
    cards.push(
      <KpiCard
        key="incidents"
        label="Incidents critiques"
        value={String(data.monthlyIncidents.value)}
        sublabel={incidentSublabel}
        icon={AlertTriangle}
        status={incidentStatus}
        help="Incidents de sécurité de criticité élevée déclarés sur les 30 derniers jours. Tendance comparée au mois précédent. Objectif : zéro."
      />,
    );
  }

  if (data.documentCompliance) {
    const docStatus: KpiStatus =
      data.documentCompliance.value >= 90
        ? 'success'
        : data.documentCompliance.value >= 80
          ? 'warning'
          : 'danger';
    cards.push(
      <KpiCard
        key="docs"
        label="Conformité docs"
        value={`${data.documentCompliance.value}%`}
        sublabel={`${data.documentCompliance.approved}/${data.documentCompliance.total} approuvés`}
        icon={FileCheck}
        status={docStatus}
        help="Pourcentage de documents en vigueur (statut « approuvé ») par rapport à la base documentaire totale. Vise 100% en certification ISO 27001 A.5.31/A.5.32."
      />,
    );
  }

  if (data.isoCoverage) {
    const isoStatus: KpiStatus =
      data.isoCoverage.value >= data.isoCoverage.target
        ? 'success'
        : data.isoCoverage.value >= 60
          ? 'warning'
          : 'danger';
    cards.push(
      <KpiCard
        key="iso"
        label="Couverture ISO"
        value={`${data.isoCoverage.value}%`}
        target={`${data.isoCoverage.target}%`}
        sublabel={`${data.isoCoverage.withEvidence}/${data.isoCoverage.totalControls} contrôles`}
        icon={Activity}
        status={isoStatus}
        help="Part des contrôles ISO 27001 disposant d'au moins une preuve documentée (politique, procédure, runbook). Indicateur clé d'avancement de la certification."
      />,
    );
  }

  if (data.charterAdoption) {
    const charterStatus: KpiStatus =
      data.charterAdoption.value === 100
        ? 'success'
        : data.charterAdoption.value >= 80
          ? 'warning'
          : 'danger';
    cards.push(
      <KpiCard
        key="charter"
        label="Adhésion chartes"
        value={`${data.charterAdoption.value}%`}
        sublabel={`${data.charterAdoption.signed}/${data.charterAdoption.total} signées`}
        icon={Users}
        help="Part des collaborateurs ayant signé toutes les chartes obligatoires (informatique, confidentialité, télétravail…). Conforme ISO 27001 A.6.2 (sensibilisation)."
        status={charterStatus}
      />,
    );
  }

  if (data.openTicketsByPriority) {
    const criticalTickets = data.openTicketsByPriority.CRITICAL || 0;
    const highTickets = data.openTicketsByPriority.HIGH || 0;
    const ticketStatus: KpiStatus =
      criticalTickets > 0 ? 'danger' : highTickets > 0 ? 'warning' : 'success';
    cards.push(
      <KpiCard
        key="tickets"
        label="Tickets critiques ouverts"
        value={String(criticalTickets)}
        sublabel={`${highTickets} HIGH · ${data.openTicketsByPriority.MEDIUM || 0} MEDIUM`}
        icon={AlertTriangle}
        status={ticketStatus}
        help="Tickets de support actuellement ouverts par criticité. Un volume CRITICAL > 0 doit déclencher l'astreinte ou la procédure d'escalade A.5.26 (gestion d'incidents)."
      />,
    );
  }

  if (cards.length === 0) return null;

  return (
    <WidgetShell>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{cards}</div>
    </WidgetShell>
  );
}
