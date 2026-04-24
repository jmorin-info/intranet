'use client';

/**
 * Dashboard — Prestataire (contractor) view.
 *
 * Restricted dashboard rendered when `user.role === PRESTATAIRE`
 * (ISO 27001 A.5.19 — third-party access segregation). Data is fetched from
 * `/external-access/dashboard` and shows only the contracts, tickets and
 * documents the contractor is entitled to see.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, Badge, EmptyState } from '@omnitech/ui';
import { AlertTriangle, Briefcase, Clock, FileText, Ticket } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';

interface PrestataireDashboardData {
  access?: {
    companyName?: string;
    contractRef?: string;
    accessExpiresAt?: string;
  };
  tickets?: Array<{
    id: string;
    reference?: string;
    title?: string;
    status?: string;
    priority?: string;
    createdAt: string;
  }>;
  documents?: Array<{
    id: string;
    title: string;
    reference?: string;
    status?: string;
  }>;
}

export function DashboardProviderView() {
  const { t } = useTranslation();
  const [data, setData] = useState<PrestataireDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get('/external-access/dashboard')
      .then(({ data }) => setData(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 bg-gray-100 dark:bg-slate-800 rounded-card" />;
  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">{t('dashboard.contractorLoadError')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Espace Prestataire — Tableau de bord"
        subtitle={data?.access ? `${data.access.companyName} — Contrat ${data.access.contractRef}` : undefined}
        icon={Briefcase}
        hub="monEspace"
      />

      {data?.access?.accessExpiresAt && (
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">Accès limité</p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">Expire le {formatDate(data.access.accessExpiresAt)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Ticket className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">Mes tickets</p>
              <p className="text-2xl font-medium text-seal-navy dark:text-white">{data?.tickets?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">Documents contractuels</p>
              <p className="text-2xl font-medium text-seal-navy dark:text-white">{data?.documents?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tickets */}
      <div>
        <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-3">Mes tickets</h2>
        {(data?.tickets?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {data!.tickets!.map((ticket) => (
              <Card key={ticket.id}>
                <CardContent className="py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-seal-navy dark:text-white">{ticket.reference} — {ticket.title}</span>
                    <div className="flex gap-2 mt-1">
                      <Badge variant={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'approved' : 'warning'}>{ticket.status}</Badge>
                      <Badge variant="navy">{ticket.priority}</Badge>
                    </div>
                  </div>
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">{formatDate(ticket.createdAt)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            type="tickets"
            title="Aucun ticket pour le moment"
            description="Vos demandes de support apparaîtront ici."
          />
        )}
      </div>

      {/* Documents */}
      <div>
        <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-3">Documents contractuels</h2>
        {(data?.documents?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {data!.documents!.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-seal-navy dark:text-white">{doc.title}</span>
                    <Badge variant="navy">{doc.reference}</Badge>
                  </div>
                  <Badge variant={doc.status === 'APPROVED' ? 'approved' : 'warning'}>{doc.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            type="documents"
            title="Aucun document contractuel"
            description="Les documents liés à votre contrat apparaîtront ici."
          />
        )}
      </div>
    </div>
  );
}

export default DashboardProviderView;
