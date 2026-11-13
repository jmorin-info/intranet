'use client';

/**
 * Dashboard — admin-only panels.
 *
 * Bundles every admin / manager-only block rendered on the dashboard outside
 * the main grid:
 * - System health + pending LDAP imports (ADMIN+)
 * - UX Command Center (ADMIN+)
 * - Compliance / Tickets / Veille overview row (REVIEWER+ sees compliance,
 *   ADMIN+ sees tickets + veille).
 *
 * All heavy widgets are lazy-loaded, matching the pre-refactor behaviour.
 */

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, Tooltip } from '@omnitech/ui';
import { Info, Rss, ShieldCheck, Ticket } from 'lucide-react';

/** Libellé d'un KPI avec une infobulle d'aide contextuelle (survol + focus). */
function KpiLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-seal-gray-500 dark:text-slate-400">{label}</span>
      <Tooltip content={help} side="top" className="whitespace-normal w-56 text-left leading-snug font-normal">
        <span
          tabIndex={0}
          aria-label={`À propos de l’indicateur « ${label} »`}
          className="shrink-0 cursor-help text-seal-gray-500/50 hover:text-seal-gray-500 dark:text-slate-500 dark:hover:text-slate-300 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy/40 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Info className="h-3 w-3" aria-hidden="true" />
        </span>
      </Tooltip>
    </span>
  );
}

const SystemHealthCompact = dynamic(
  () => import('@/components/widgets/system-health-compact').then((m) => m.SystemHealthCompact),
  { ssr: false },
);
const LdapPendingWidget = dynamic(
  () => import('@/components/widgets/ldap-pending-widget').then((m) => m.LdapPendingWidget),
  { ssr: false },
);
const UXCommandCenter = dynamic(
  () => import('@/components/ux/ux-command-center').then((m) => m.UXCommandCenter),
  { ssr: false },
);

interface ComplianceSummary {
  total: number;
  covered: number;
  coveragePercent: number;
}

interface TicketStats {
  open: number;
  inProgress: number;
}

interface VeilleStats {
  total: number;
  unprocessed: number;
}

interface DashboardAdminPanelProps {
  isAdmin: boolean;
  isManager: boolean;
  compliance: ComplianceSummary | null;
  ticketStats: TicketStats | null;
  veilleStats: VeilleStats | null;
}

export function DashboardAdminPanel({
  isAdmin,
  isManager,
  compliance,
  ticketStats,
  veilleStats,
}: DashboardAdminPanelProps) {
  const showOverview = isManager && (compliance || ticketStats || veilleStats);

  return (
    <>
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SystemHealthCompact />
          <LdapPendingWidget />
        </div>
      )}

      {/* UX Intelligence — admin-only, event-driven friction detection */}
      {isAdmin && (
        <Card>
          <CardContent className="p-4">
            <UXCommandCenter />
          </CardContent>
        </Card>
      )}

      {/* Compliance + Tickets + Veille row */}
      {showOverview && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
            Vue d&apos;ensemble
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {compliance && (
              <Link href="/admin/compliance" className="flex stagger-item">
                <Card hoverable accent className="h-full w-full">
                  <CardContent className="flex items-center gap-4 h-full">
                    <div className="h-12 w-12 rounded-xl bg-seal-navy/10 dark:bg-slate-700 flex items-center justify-center">
                      <ShieldCheck className="h-6 w-6 text-seal-navy dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <KpiLabel
                        label="Conformité ISO"
                        help="Part des contrôles ISO 27001 couverts par au moins une mesure documentée. L'objectif de certification vise une couverture maximale."
                      />
                      <p className="text-xl font-medium text-seal-navy dark:text-white">{compliance.coveragePercent}%</p>
                      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-1 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${compliance.coveragePercent}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
            {ticketStats && (
              <Link href="/tickets" className="flex stagger-item">
                <Card hoverable className="h-full w-full">
                  <CardContent className="flex items-center gap-4 h-full">
                    <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <Ticket className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <KpiLabel
                        label="Tickets IT"
                        help="Tickets de support informatique actuellement ouverts ou en cours de traitement par l'équipe."
                      />
                      <p className="text-xl font-medium text-seal-navy dark:text-white">
                        {ticketStats.open + ticketStats.inProgress}
                      </p>
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                        {ticketStats.open} ouverts, {ticketStats.inProgress} en cours
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
            {veilleStats && (
              <Link href="/veille" className="flex stagger-item">
                <Card hoverable className="h-full w-full">
                  <CardContent className="flex items-center gap-4 h-full">
                    <div className="h-12 w-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                      <Rss className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <KpiLabel
                        label="Veille cyber"
                        help="Alertes de veille sécurité (CVE, bulletins CERT-FR, sources spécialisées) non encore qualifiées par l'équipe."
                      />
                      <p className="text-xl font-medium text-seal-navy dark:text-white">{veilleStats.unprocessed}</p>
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                        alertes à traiter sur {veilleStats.total}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default DashboardAdminPanel;
