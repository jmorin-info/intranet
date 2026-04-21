'use client';

/**
 * Audit Log View
 * -----------------------------------------------------------------------------
 * Extrait de `app/(app)/admin/audit-log/page.tsx` pour être ré-utilisé dans la
 * page unifiée `/admin/audit` (onglet « Journal d'audit »).
 *
 * Zero changement de logique métier par rapport au fichier d'origine : seul
 * le <PageHeader> global a été retiré (c'est le parent qui le pose) pour
 * éviter un double titre.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  DataTable,
  SearchInput,
  Select,
  Badge,
  Button,
  EmptyState,
} from '@omnitech/ui';
import type { Column } from '@omnitech/ui';
import { formatDateTime } from '@/lib/utils';
import {
  ClipboardList,
  AlertTriangle,
  Info,
  AlertOctagon,
  Calendar,
  RefreshCw,
  Download,
  LogIn,
  LogOut,
  FilePlus,
  FileCheck,
  FileX,
  UserPlus,
  UserMinus,
  UserCog,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  XCircle,
  Bug,
  Ticket,
  TicketCheck,
  FileEdit,
  Eye,
  Trash2,
} from 'lucide-react';
import { downloadCsv } from '@/lib/export-csv';
import type { CsvColumn } from '@/lib/export-csv';

interface AuditEntry {
  id: string;
  userId: string;
  user?: { firstName: string; lastName: string; email: string };
  ipAddress: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  createdAt: string;
}

interface PaginatedAudit {
  data: AuditEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AuditLogViewProps {
  /** Rend les actions barre d'outils (auto-refresh / export). Utilisé par le parent
   * pour composer avec son propre <PageHeader>. Si non fourni, la barre est rendue
   * en tête du composant. */
  renderToolbar?: (toolbar: React.ReactNode) => React.ReactNode;
}

export function AuditLogView({ renderToolbar }: AuditLogViewProps = {}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<PaginatedAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [action, setAction] = useState('');
  const [bulkOnly, setBulkOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 30 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (severity) params.severity = severity;
      if (action) params.action = action;
      if (bulkOnly) params.bulk = 'true';
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const { data } = await api.get('/audit', { params });
      setEntries(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Impossible de charger le journal');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, severity, action, bulkOnly, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

  const severityIcon = (s: string) => {
    switch (s) {
      case 'CRITICAL': return <AlertOctagon className="h-4 w-4 text-[#892034]" />;
      case 'WARN': return <AlertTriangle className="h-4 w-4 text-[#F68D2E]" />;
      default: return <Info className="h-4 w-4 text-[#296DC1]" />;
    }
  };

  const severityBadgeClass = (s: string) => {
    switch (s) {
      case 'CRITICAL': return 'bg-[#892034]/10 text-[#892034] dark:bg-[#892034]/20 dark:text-red-300 border border-[#892034]/20';
      case 'WARN': return 'bg-[#F68D2E]/10 text-[#F68D2E] dark:bg-[#F68D2E]/20 dark:text-orange-300 border border-[#F68D2E]/20';
      default: return 'bg-[#296DC1]/10 text-[#296DC1] dark:bg-[#296DC1]/20 dark:text-blue-300 border border-[#296DC1]/20';
    }
  };

  const severityVariant = (s: string) => {
    switch (s) {
      case 'CRITICAL': return 'error' as const;
      case 'WARN': return 'warning' as const;
      default: return 'info' as const;
    }
  };

  const actionIcon = (a: string) => {
    const cls = 'h-4 w-4 text-seal-gray-500 dark:text-slate-400';
    if (a === 'LOGIN') return <LogIn className={cls} />;
    if (a === 'LOGOUT') return <LogOut className={cls} />;
    if (a === 'LOGIN_FAILED') return <XCircle className="h-4 w-4 text-[#892034]" />;
    if (a.startsWith('DOCUMENT_CREATED')) return <FilePlus className={cls} />;
    if (a.startsWith('DOCUMENT_APPROVED')) return <FileCheck className={cls} />;
    if (a.startsWith('DOCUMENT_REJECTED')) return <FileX className={cls} />;
    if (a.startsWith('DOCUMENT_UPDATED') || a.startsWith('DOCUMENT_EDIT')) return <FileEdit className={cls} />;
    if (a.startsWith('DOCUMENT_VIEWED')) return <Eye className={cls} />;
    if (a.startsWith('DOCUMENT_DELETED')) return <Trash2 className="h-4 w-4 text-[#892034]" />;
    if (a.startsWith('DOCUMENT_')) return <FileCheck className={cls} />;
    if (a.startsWith('TICKET_CREATED')) return <Ticket className={cls} />;
    if (a.startsWith('TICKET_RESOLVED') || a.startsWith('TICKET_CLOSED')) return <TicketCheck className={cls} />;
    if (a.startsWith('TICKET_')) return <Ticket className={cls} />;
    if (a.startsWith('INCIDENT_')) return <Bug className="h-4 w-4 text-[#892034]" />;
    if (a === 'USER_CREATED') return <UserPlus className={cls} />;
    if (a === 'USER_DEACTIVATED') return <UserMinus className={cls} />;
    if (a === 'USER_ROLE_CHANGED') return <UserCog className={cls} />;
    if (a === 'USER_PASSWORD_RESET') return <KeyRound className={cls} />;
    if (a === 'MFA_ENABLED') return <ShieldCheck className={cls} />;
    if (a === 'MFA_DISABLED') return <ShieldOff className={cls} />;
    return <ClipboardList className={cls} />;
  };

  const severityRowClass = (s: string) => {
    switch (s) {
      case 'CRITICAL': return 'border-l-4 border-l-[#892034]';
      case 'WARN': return 'border-l-4 border-l-[#F68D2E]';
      default: return '';
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "a l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH}h`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return `il y a ${diffD}j`;
    return formatDateTime(dateStr);
  };

  const [exporting, setExporting] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');

  const auditCsvColumns: CsvColumn<Record<string, unknown>>[] = [
    { header: 'Date', accessor: (r) => (r as unknown as AuditEntry).createdAt },
    { header: 'Utilisateur', accessor: (r) => { const e = r as unknown as AuditEntry; return e.user ? `${e.user.firstName} ${e.user.lastName}` : e.userId; } },
    { header: 'Email', accessor: (r) => (r as unknown as AuditEntry).user?.email || '' },
    { header: 'Action', accessor: (r) => (r as unknown as AuditEntry).action },
    { header: 'Severite', accessor: (r) => (r as unknown as AuditEntry).severity },
    { header: 'Ressource', accessor: (r) => (r as unknown as AuditEntry).resourceType },
    { header: 'ID Ressource', accessor: (r) => (r as unknown as AuditEntry).resourceId || '' },
    { header: 'IP', accessor: (r) => (r as unknown as AuditEntry).ipAddress },
  ];

  const exportCsv = () => {
    if (!entries?.data) return;
    downloadCsv('audit-log', entries.data as unknown as Array<Record<string, unknown>>, auditCsvColumns, 'Journal d\'audit');
    toast.success(`Export généré : ${entries.data.length} ligne(s)`);
  };

  const exportCsvWithDateRange = async () => {
    setExporting(true);
    try {
      const params: Record<string, string | number> = { limit: 5000 };
      if (exportDateFrom) params.dateFrom = exportDateFrom;
      if (exportDateTo) params.dateTo = exportDateTo;
      if (severity) params.severity = severity;
      if (action) params.action = action;
      if (bulkOnly) params.bulk = 'true';
      const { data } = await api.get('/audit', { params });
      const allEntries: AuditEntry[] = data?.data || [];
      if (allEntries.length === 0) { toast.error('Aucune entrée à exporter pour cette période'); setExporting(false); return; }
      downloadCsv('audit-log', allEntries as unknown as Array<Record<string, unknown>>, auditCsvColumns, 'Journal d\'audit');
      toast.success(`Export généré : ${allEntries.length} ligne(s)`);
      setShowExportPanel(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'export";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<AuditEntry>[] = useMemo(() => [
    {
      key: 'severity',
      header: '',
      className: 'w-10',
      render: (e) => (
        <div className={`flex items-center gap-1 -ml-3 pl-2 ${severityRowClass(e.severity)}`}>
          {severityIcon(e.severity)}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: t('auditLog.header.date'),
      sortable: true,
      className: 'w-44',
      render: (e) => (
        <span className="text-xs font-mono text-seal-navy dark:text-white">{formatDateTime(e.createdAt)}</span>
      ),
    },
    {
      key: 'user',
      header: t('auditLog.header.user'),
      render: (e) => (
        <span className="text-sm text-seal-navy dark:text-white">
          {e.user ? `${e.user.firstName} ${e.user.lastName}` : e.userId}
        </span>
      ),
    },
    {
      key: 'action',
      header: t('auditLog.header.action'),
      render: (e) => (
        <div className="flex items-center gap-2">
          {actionIcon(e.action)}
          <Badge variant={severityVariant(e.severity)}>{e.action}</Badge>
        </div>
      ),
    },
    {
      key: 'resourceType',
      header: t('auditLog.header.resource'),
      render: (e) => (
        <div className="text-xs text-seal-gray-500 dark:text-slate-400">
          <span className="font-semibold">{e.resourceType}</span>
          {e.resourceId && <span className="font-mono ml-1">#{e.resourceId.slice(0, 8)}</span>}
        </div>
      ),
    },
    {
      key: 'ipAddress',
      header: t('auditLog.header.ip'),
      className: 'w-32',
      render: (e) => (
        <span className="text-xs font-mono text-seal-gray-500 dark:text-slate-400">{e.ipAddress}</span>
      ),
    },
  ], [t]);

  const toolbar = (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs text-seal-gray-500 dark:text-slate-400">{t('audit.live')}</span>
      </div>
      <Button
        variant={autoRefresh ? 'primary' : 'outline'}
        size="sm"
        onClick={() => setAutoRefresh(!autoRefresh)}
      >
        <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
        {autoRefresh ? 'Auto' : 'Manuel'}
      </Button>
      <Button variant="outline" size="sm" onClick={fetchLogs}>
        <RefreshCw className="h-4 w-4" />
        Rafraîchir
      </Button>
      <Button variant="outline" size="sm" onClick={() => setShowExportPanel(!showExportPanel)}>
        <Download className="h-4 w-4" />
        Exporter CSV
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {renderToolbar ? renderToolbar(toolbar) : <div className="flex justify-end">{toolbar}</div>}

      {/* Quick action chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { value: 'LOGIN', label: 'Login', icon: LogIn },
          { value: 'DOCUMENT_CREATED', label: 'Doc créé', icon: FilePlus },
          { value: 'DOCUMENT_APPROVED', label: 'Doc approuvé', icon: FileCheck },
          { value: 'TICKET_CREATED', label: 'Ticket créé', icon: ClipboardList },
          { value: 'QUIZ_COMPLETED', label: 'Quiz terminé', icon: ShieldCheck },
          { value: 'LDAP_SYNC', label: 'Sync LDAP', icon: RefreshCw },
        ].map((chip) => {
          const Icon = chip.icon;
          const isActive = action === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => { setAction(isActive ? '' : chip.value); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:border-primary/50 hover:text-primary'
              }`}
            >
              <Icon className="h-3 w-3" />
              {chip.label}
            </button>
          );
        })}
        {action && (
          <button
            onClick={() => { setAction(''); setPage(1); }}
            className="text-xs text-primary hover:underline ml-1"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Export panel with date range */}
      {showExportPanel && (
        <Card className="border-2 border-primary/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-3">
              <Download className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Exporter le journal d&apos;audit</h3>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
              <div>
                <label className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">Date début</label>
                <input
                  type="date"
                  value={exportDateFrom}
                  onChange={(e) => setExportDateFrom(e.target.value)}
                  className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-seal-navy dark:text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">Date fin</label>
                <input
                  type="date"
                  value={exportDateTo}
                  onChange={(e) => setExportDateTo(e.target.value)}
                  className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-seal-navy dark:text-white"
                />
              </div>
              <Button size="sm" onClick={exportCsvWithDateRange} loading={exporting}>
                <Download className="h-3.5 w-3.5" /> Exporter la période
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                Page courante uniquement
              </Button>
              <button
                onClick={() => setShowExportPanel(false)}
                className="text-xs text-seal-gray-500 hover:text-seal-navy dark:hover:text-white transition-colors ml-auto"
              >
                Fermer
              </button>
            </div>
            {!exportDateFrom && !exportDateTo && (
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-2">
                Sans dates, l&apos;export inclura les 5000 entrées les plus récentes.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder={t('auditLog.searchPlaceholder')}
              className="flex-1"
            />
            <Select
              options={[
                { value: 'INFO', label: t('auditLog.severity.info') },
                { value: 'WARN', label: t('auditLog.severity.warning') },
                { value: 'CRITICAL', label: t('auditLog.severity.critical') },
              ]}
              placeholder={t('auditLog.allSeverities')}
              value={severity}
              onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
              className="w-full sm:w-44"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <Select
              options={[
                { value: 'LOGIN', label: t('auditLog.action.login') },
                { value: 'LOGOUT', label: t('auditLog.action.logout') },
                { value: 'LOGIN_FAILED', label: t('auditLog.action.loginFailed') },
                { value: 'USER_CREATED', label: t('auditLog.action.userCreated') },
                { value: 'USER_ROLE_CHANGED', label: t('auditLog.action.roleChanged') },
                { value: 'USER_DEACTIVATED', label: t('auditLog.action.userDeactivated') },
                { value: 'USER_PASSWORD_RESET', label: t('auditLog.action.passwordReset') },
                { value: 'DOCUMENT_CREATED', label: t('auditLog.action.docCreated') },
                { value: 'DOCUMENT_APPROVED', label: t('auditLog.action.docApproved') },
                { value: 'DOCUMENT_REJECTED', label: t('auditLog.action.docRejected') },
                { value: 'MFA_ENABLED', label: t('auditLog.action.mfaEnabled') },
                { value: 'MFA_DISABLED', label: t('auditLog.action.mfaDisabled') },
              ]}
              placeholder={t('auditLog.allActions')}
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              className="w-full sm:w-52"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 hidden sm:block" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-seal-navy dark:text-white w-full sm:w-auto"
              />
              <span className="text-xs text-seal-gray-500 dark:text-slate-400 hidden sm:inline">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="text-xs border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-seal-navy dark:text-white w-full sm:w-auto"
              />
            </div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-xs text-seal-navy dark:text-white whitespace-nowrap">
              <input
                type="checkbox"
                checked={bulkOnly}
                onChange={(e) => { setBulkOnly(e.target.checked); setPage(1); }}
                className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-primary"
              />
              Actions en masse uniquement
            </label>
            {(action || dateFrom || dateTo || severity || search || bulkOnly) && (
              <button
                onClick={() => { setSearch(''); setSeverity(''); setAction(''); setBulkOnly(false); setDateFrom(''); setDateTo(''); setPage(1); }}
                className="text-xs text-primary hover:underline whitespace-nowrap"
              >
                {t('auditLog.resetFilters')}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View toggle */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${viewMode === 'table' ? 'bg-primary text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${viewMode === 'timeline' ? 'bg-primary text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            Timeline
          </button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <Card className="shadow-sm rounded-xl">
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-14 rounded-lg shimmer" />
                ))}
              </div>
            ) : !entries?.data?.length ? (
              <EmptyState type="general" title={t('auditLog.empty')} description="Aucune entrée ne correspond aux filtres actuels." />
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200 dark:bg-slate-700" />
                <div className="space-y-1">
                  {entries.data.map((entry) => (
                    <div
                      key={entry.id}
                      className={`relative flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors duration-200 ${severityRowClass(entry.severity)}`}
                    >
                      {/* Icon dot */}
                      <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700">
                        {actionIcon(entry.action)}
                      </div>
                      {/* Timestamp */}
                      <div className="flex-shrink-0 w-24 hidden sm:block">
                        <p className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-400">{formatRelativeTime(entry.createdAt)}</p>
                      </div>
                      {/* Action badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 max-w-[120px] truncate ${severityBadgeClass(entry.severity)}`}>
                        {entry.action}
                      </span>
                      {/* User */}
                      <span className="text-xs font-medium text-seal-navy dark:text-white flex-shrink-0 hidden md:inline">
                        {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : entry.userId.slice(0, 8)}
                      </span>
                      {/* Resource */}
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 truncate hidden lg:inline">
                        {entry.resourceType}{entry.resourceId ? ` #${entry.resourceId.slice(0, 8)}` : ''}
                      </span>
                      {/* IP */}
                      <span className="ml-auto text-[10px] font-mono text-seal-gray-500 dark:text-slate-400 flex-shrink-0 hidden sm:inline">
                        {entry.ipAddress}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Pagination for timeline */}
            {entries && entries.meta.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">{entries.meta.total} entrees</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('audit.prev')}</Button>
                  <span className="text-xs text-seal-navy dark:text-white font-medium">{page} / {entries.meta.totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= entries.meta.totalPages} onClick={() => setPage(p => p + 1)}>{t('audit.next')}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
      <DataTable
        columns={columns}
        data={entries?.data || []}
        keyExtractor={(e) => e.id}
        loading={loading}
        page={page}
        totalPages={entries?.meta.totalPages || 1}
        total={entries?.meta.total}
        onPageChange={setPage}
        emptyMessage={t('auditLog.empty')}
        emptyIcon={<ClipboardList className="h-12 w-12 text-seal-gray-500 dark:text-slate-500" />}
      />
      )}
    </div>
  );
}
