'use client';

/**
 * Page /admin/registre — Registre Documentaire SMSI (vue REG_016).
 *
 * Equivalent intranet du fichier Excel REG_016 — toutes les informations
 * documentees du SMSI ISO 27001:2022, avec filtres alignes (categorie,
 * niveau pyramide PRO_040 §7.1, priorite, classification POL_015,
 * caractere bloquant) et export CSV.
 *
 * Endpoints backend consommes (Agent B) :
 *   GET /admin/registre               — liste filtree
 *   GET /admin/registre/stats         — agregats pour les cartes
 *   GET /admin/registre/export        — CSV (responseType: 'blob')
 *
 * Acces : UserRole.ADMIN minimum (RoleGuard).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download } from 'lucide-react';
import { UserRole } from '@omnitech/shared';
import { Button } from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import { RoleGuard } from '@/components/role-guard';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import { downloadFromApi } from '@/lib/download';
import { toast } from 'sonner';
import {
  RegistreFilters,
  EMPTY_REGISTRE_FILTERS,
  type RegistreFiltersState,
} from './_components/registre-filters';
import {
  RegistreStats,
  type RegistreStatsData,
} from './_components/registre-stats';
import {
  RegistreTable,
  type RegistreRow,
} from './_components/registre-table';

/**
 * Convertit l'etat des filtres en parametres de query string compatibles
 * avec le backend (cf. specification GET /admin/registre).
 */
function filtersToParams(
  filters: RegistreFiltersState,
): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  if (filters.categories.length > 0) {
    params.category = filters.categories.join(',');
  }
  if (filters.level) params.level = filters.level;
  if (filters.priority) params.priority = filters.priority;
  if (filters.classification) params.classification = filters.classification;
  if (filters.blocking === 'yes') params.blocking = 'true';
  if (filters.blocking === 'no') params.blocking = 'false';
  return params;
}

export default function AdminRegistrePage() {
  const [filters, setFilters] = useState<RegistreFiltersState>(
    EMPTY_REGISTRE_FILTERS,
  );
  const [rows, setRows] = useState<RegistreRow[]>([]);
  const [stats, setStats] = useState<RegistreStatsData | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [exporting, setExporting] = useState(false);

  const queryParams = useMemo(() => filtersToParams(filters), [filters]);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const res = await api.get('/admin/registre', { params: queryParams });
      const data = res.data?.data ?? res.data ?? [];
      setRows(Array.isArray(data) ? (data as RegistreRow[]) : []);
    } catch (err: unknown) {
      logger.error(err, { page: 'admin/registre', context: 'load rows' });
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Impossible de charger le registre documentaire';
      toast.error(message);
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [queryParams]);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await api.get('/admin/registre/stats', {
        params: queryParams,
      });
      const data = res.data?.data ?? res.data ?? null;
      setStats(data as RegistreStatsData | null);
    } catch (err: unknown) {
      logger.error(err, { page: 'admin/registre', context: 'load stats' });
      // Pas de toast bloquant pour les stats — c'est un complement informatif.
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, [queryParams]);

  useEffect(() => {
    void loadRows();
    void loadStats();
  }, [loadRows, loadStats]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadFromApi(
        '/admin/registre/export',
        `REG_016-registre-documentaire-${today}.csv`,
        queryParams,
      );
      toast.success('Export CSV genere');
    } catch (err: unknown) {
      logger.error(err, { page: 'admin/registre', context: 'export csv' });
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "L'export CSV a echoue";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }, [queryParams]);

  return (
    <RoleGuard minRole={UserRole.ADMIN}>
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
        <AdminGroupTabs group="compliance" />

        <PageHeader
          title="Registre Documentaire SMSI"
          subtitle="Vue REG_016 — toutes les informations documentees du SMSI ISO 27001:2022."
          icon={ClipboardList}
          hub="admin"
          actions={
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleExport}
              disabled={exporting || loadingRows}
              loading={exporting}
              aria-label="Exporter le registre au format CSV"
            >
              <Download className="h-4 w-4" /> Exporter (CSV)
            </Button>
          }
        />

        <RegistreStats stats={stats} loading={loadingStats} />

        <RegistreFilters value={filters} onChange={setFilters} />

        {loadingRows ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="Chargement du registre"
            className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="border-b border-gray-100 dark:border-slate-700 px-4 py-3">
              <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-slate-800" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="px-4 py-3 grid gap-4"
                  style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                >
                  {Array.from({ length: 6 }).map((__, c) => (
                    <div
                      key={c}
                      className="h-3 animate-pulse rounded bg-gray-200 dark:bg-slate-800"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <RegistreTable rows={rows} />
        )}
      </div>
    </RoleGuard>
  );
}
