'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { UserRole, isRoleAtLeast } from '@omnitech/shared';
import { Badge, Button, Card, CardContent, Skeleton, EmptyState } from '@omnitech/ui';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Filter,
  Folder,
  HardDrive,
  Loader2,
  Lock,
  Network,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Category {
  code: string;
  label: string;
  description: string;
  iso: string;
}

interface ItExport {
  id: string;
  category: string;
  fileName: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
  description: string | null;
  uploadedById: string;
  reportPeriod: string | null;
  tags: string[];
  createdAt: string;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface StatsByCategory {
  count: number;
  totalSize: number;
  lastUploadAt: string | null;
}

interface StatsResponse {
  totals: { count: number; totalSize: number; lastUploadAt: string | null };
  byCategory: Record<string, StatsByCategory>;
}

interface VeeamJobSummary {
  name: string;
  type?: string;
  targetRepository?: string;
  isEnabled?: boolean;
  sessionCount?: number;
  successRate?: number;
  lastResult?: string;
  lastRunDate?: string | null;
  lastDurationMinutes?: number;
  lastDataSizeGB?: number;
  averageDurationMinutes?: number;
}

interface VeeamSummary {
  totalJobs?: number;
  totalSessions?: number;
  successCount?: number;
  warningCount?: number;
  failedCount?: number;
  totalBackedUpGB?: number;
  averageDurationMinutes?: number;
  restoreTestsCount?: number;
  restoreTestsSuccess?: number;
}

interface VeeamReport {
  reportId: string;
  reportPeriod: string | null;
  generatedAt: string | null;
  generatedBy?: string | null;
  generatedOn?: string | null;
  uploadedAt: string;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  originalName?: string;
  fileSize?: number;
  summary: VeeamSummary | null;
  jobsCount: number;
  jobs: VeeamJobSummary[];
  alerts: string[];
  restoreTests?: Array<{
    name?: string;
    result?: string;
    startTime?: string;
    endTime?: string | null;
  }>;
  iso27001Compliance?: {
    control?: string;
    secondaryControl?: string;
    standard?: string;
  } | null;
  parseError?: boolean;
}

// -----------------------------------------------------------------------------
// Icon map
// -----------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  AD_AUDIT: Users,
  FORTIGATE_CONFIG: ShieldCheck,
  FORTIMANAGER_CONFIG: ShieldCheck,
  SWITCH_CONFIG: Network,
  VEEAM_BACKUP: HardDrive,
  VEEAM_REPORT: HardDrive,
  VULN_SCAN: ShieldAlert,
  PEN_TEST: ShieldAlert,
  CONFIG_BASELINE: Settings,
  PATCH_REPORT: Settings,
  ANTIVIRUS_REPORT: Shield,
  DLP_REPORT: Lock,
  FIREWALL_LOGS: FileText,
  SIEM_ALERTS: FileText,
  BCP_TEST: Activity,
  OTHER: Folder,
};

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.csv',
  '.xlsx',
  '.json',
  '.xml',
  '.zip',
  '.txt',
  '.log',
  '.conf',
  '.cfg',
  '.bak',
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(input: string | null | undefined): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(input: string | null | undefined): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// -----------------------------------------------------------------------------
// Upload dialog
// -----------------------------------------------------------------------------

interface UploadDialogProps {
  open: boolean;
  file: File | null;
  category: Category;
  onClose: () => void;
  onSubmit: (data: { description: string; reportPeriod: string }) => Promise<void>;
}

function UploadDialog({ open, file, category, onClose, onSubmit }: UploadDialogProps) {
  const [description, setDescription] = useState('');
  const [reportPeriod, setReportPeriod] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDescription('');
      setReportPeriod('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open || !file) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ description, reportPeriod });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-medium text-navy dark:text-white">
              Ajouter un export {category.label}
            </h2>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
              {category.iso ? `ISO 27001 — ${category.iso}` : 'Export libre'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-4 py-3">
            <FileText className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-navy dark:text-white truncate">
                {file.name}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {formatSize(file.size)}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-navy dark:text-slate-200 mb-1">
              Période de référence
            </label>
            <input
              type="text"
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value)}
              placeholder="Ex : 2026-04, Q2-2026, mensuel"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">
              Utilisé pour le classement et les filtres.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-navy dark:text-slate-200 mb-1">
              Description (facultatif)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Contexte, version, commentaires…"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Déposer l&apos;export
          </Button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Veeam latest report widget
// -----------------------------------------------------------------------------

function VeeamReportWidget() {
  const [report, setReport] = useState<VeeamReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    api
      .get('/it-exports/veeam/latest')
      .then((res) => {
        if (!mounted) return;
        setReport(res.data || null);
      })
      .catch(() => {
        if (!mounted) return;
        setError('Impossible de charger le dernier rapport Veeam.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 space-y-3">
          <Skeleton className="h-6 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <Database className="h-8 w-8 text-seal-gray-500 dark:text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-navy dark:text-white">
                Aucun rapport Veeam disponible
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                Uploadez un fichier JSON via le drag-and-drop ci-dessous pour
                alimenter le dashboard. Le script{' '}
                <code className="font-mono text-[11px] bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  Generate-VeeamMonthlyReport.ps1
                </code>{' '}
                (dossier <span className="font-mono">scripts/veeam/</span>)
                peut aussi uploader automatiquement.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (report.parseError) {
    return (
      <Card>
        <CardContent className="py-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-navy dark:text-white">
                Rapport Veeam présent mais non parsable
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                Le fichier <span className="font-mono">{report.originalName}</span>{' '}
                existe mais n&apos;a pas pu être décodé en JSON valide.
                Vérifiez le format produit par le script PowerShell.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = report.summary || {};
  const successCount = summary.successCount ?? 0;
  const warningCount = summary.warningCount ?? 0;
  const failedCount = summary.failedCount ?? 0;
  const totalSessions = summary.totalSessions ?? 0;
  const totalBackedUpGB = summary.totalBackedUpGB ?? 0;
  const totalJobs = summary.totalJobs ?? report.jobsCount;
  const restoreCount = summary.restoreTestsCount ?? 0;
  const restoreOk = summary.restoreTestsSuccess ?? 0;
  const successRate =
    totalSessions > 0
      ? Math.round((successCount / totalSessions) * 100)
      : 0;

  return (
    <Card>
      <CardContent className="py-5 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-navy dark:text-white">
                Dernier rapport Veeam
                {report.reportPeriod && (
                  <span className="ml-2 text-primary">
                    · {report.reportPeriod}
                  </span>
                )}
              </h2>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                Généré {formatDateTime(report.generatedAt)}
                {report.generatedOn && ` sur ${report.generatedOn}`}
                {report.generatedBy && ` par ${report.generatedBy}`}
                {' · '}
                Uploadé {formatDateTime(report.uploadedAt)}
                {report.uploadedBy &&
                  ` par ${report.uploadedBy.firstName} ${report.uploadedBy.lastName}`}
              </p>
            </div>
          </div>
          {report.iso27001Compliance?.control && (
            <Badge variant="info">
              ISO 27001 - {report.iso27001Compliance.control.split(' - ')[0]}
            </Badge>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">
                Succès
              </span>
            </div>
            <p className="text-2xl font-medium text-emerald-700 dark:text-emerald-300 mt-1">
              {successCount}
              <span className="text-sm font-normal text-emerald-600/70 dark:text-emerald-400/70 ml-1">
                / {totalSessions}
              </span>
            </p>
            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
              {successRate}% de réussite
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
                Avertissements
              </span>
            </div>
            <p className="text-2xl font-medium text-amber-700 dark:text-amber-300 mt-1">
              {warningCount}
            </p>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
              à surveiller
            </p>
          </div>

          <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 font-semibold">
                Échecs
              </span>
            </div>
            <p className="text-2xl font-medium text-red-700 dark:text-red-300 mt-1">
              {failedCount}
            </p>
            <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5">
              {failedCount > 0 ? 'action requise' : 'aucun incident'}
            </p>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Jobs actifs
            </p>
            <p className="text-sm font-semibold text-navy dark:text-white mt-0.5">
              {totalJobs}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Volume sauvegardé
            </p>
            <p className="text-sm font-semibold text-navy dark:text-white mt-0.5">
              {totalBackedUpGB.toLocaleString('fr-FR', {
                maximumFractionDigits: 2,
              })}{' '}
              Go
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Durée moyenne
            </p>
            <p className="text-sm font-semibold text-navy dark:text-white mt-0.5">
              {summary.averageDurationMinutes ?? 0} min
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Tests de restore
            </p>
            <p className="text-sm font-semibold text-navy dark:text-white mt-0.5">
              {restoreOk} / {restoreCount}
            </p>
          </div>
        </div>

        {/* Alerts */}
        {report.alerts.length > 0 && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider">
                {report.alerts.length} alerte{report.alerts.length > 1 ? 's' : ''} détectée
                {report.alerts.length > 1 ? 's' : ''}
              </p>
            </div>
            <ul className="space-y-1">
              {report.alerts.map((alert, idx) => (
                <li
                  key={idx}
                  className="text-xs text-red-700 dark:text-red-300 pl-5 relative"
                >
                  <span className="absolute left-1">•</span>
                  {alert}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Jobs table */}
        {report.jobs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-navy dark:text-white uppercase tracking-wider mb-2">
              Jobs ({report.jobsCount})
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-slate-800/60 text-seal-gray-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Nom</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Dernier</th>
                    <th className="text-right px-3 py-2 font-medium">Taux</th>
                    <th className="text-right px-3 py-2 font-medium">Volume</th>
                    <th className="text-right px-3 py-2 font-medium">Durée</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {report.jobs.map((job, idx) => {
                    const result = job.lastResult || 'NoData';
                    const resultClass =
                      result === 'Success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : result === 'Warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : result === 'Failed'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-seal-gray-500 dark:text-slate-500';
                    const rate = job.successRate ?? 0;
                    const rateClass =
                      rate >= 95
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : rate >= 80
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400';
                    return (
                      <tr
                        key={`${job.name}-${idx}`}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2 font-medium text-navy dark:text-white">
                          {job.name}
                          {job.isEnabled === false && (
                            <span className="ml-2 text-[10px] text-red-600 dark:text-red-400 font-normal">
                              (désactivé)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-seal-gray-500 dark:text-slate-400">
                          {job.type || '—'}
                        </td>
                        <td className={`px-3 py-2 font-medium ${resultClass}`}>
                          {result}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${rateClass}`}
                        >
                          {rate}%
                        </td>
                        <td className="px-3 py-2 text-right text-seal-gray-500 dark:text-slate-400">
                          {(job.lastDataSizeGB ?? 0).toLocaleString('fr-FR', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          Go
                        </td>
                        <td className="px-3 py-2 text-right text-seal-gray-500 dark:text-slate-400">
                          {job.lastDurationMinutes ?? 0} min
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {report.jobsCount > report.jobs.length && (
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-2 text-right">
                Affichage de {report.jobs.length} jobs sur {report.jobsCount}.
                Téléchargez le JSON brut pour la liste complète.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Category detail view
// -----------------------------------------------------------------------------

interface CategoryDetailProps {
  category: Category;
  onBack: () => void;
  canUpload: boolean;
  canDelete: boolean;
}

function CategoryDetail({ category, onBack, canUpload, canDelete }: CategoryDetailProps) {
  const [items, setItems] = useState<ItExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  const Icon = CATEGORY_ICONS[category.code] || Folder;

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { category: category.code, limit: '100' };
      if (search.trim()) params.search = search.trim();
      if (periodFilter.trim()) params.period = periodFilter.trim();
      const res = await api.get('/it-exports', { params });
      setItems(res.data?.data || []);
    } catch {
      setError("Impossible de charger les exports de cette catégorie.");
    } finally {
      setLoading(false);
    }
  }, [category.code, search, periodFilter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!canUpload) return;
      const file = accepted[0];
      if (!file) return;
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setError(
          `Extension "${ext}" non autorisée. Autorisées : ${ALLOWED_EXTENSIONS.join(', ')}`,
        );
        return;
      }
      setError('');
      setPendingFile(file);
    },
    [canUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: !canUpload,
    maxSize: 200 * 1024 * 1024,
  });

  const handleUploadSubmit = async ({
    description,
    reportPeriod,
  }: {
    description: string;
    reportPeriod: string;
  }) => {
    if (!pendingFile) return;
    const formData = new FormData();
    formData.append('file', pendingFile);
    formData.append('category', category.code);
    if (description.trim()) formData.append('description', description.trim());
    if (reportPeriod.trim()) formData.append('reportPeriod', reportPeriod.trim());
    try {
      await api.post('/it-exports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPendingFile(null);
      await loadItems();
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { message?: string } } };
      setError(anyErr?.response?.data?.message || "Erreur lors de l'envoi du fichier.");
    }
  };

  const handleDownload = async (item: ItExport) => {
    try {
      const res = await api.get(`/it-exports/${item.id}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: item.mimeType || 'application/octet-stream',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Téléchargement impossible.');
    }
  };

  const handleDelete = async (item: ItExport) => {
    if (!confirm(`Supprimer l'export "${item.originalName}" ?`)) return;
    try {
      await api.delete(`/it-exports/${item.id}`);
      await loadItems();
    } catch {
      setError('Suppression impossible.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-seal-gray-500 dark:text-slate-400 hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux catégories
        </button>
        {category.iso && (
          <Badge variant="info">ISO 27001 — {category.iso}</Badge>
        )}
      </div>

      <Card>
        <CardContent className="py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-medium text-navy dark:text-white">
                {category.label}
              </h2>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
                {category.description}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Veeam dashboard widget - only for VEEAM_BACKUP category */}
      {category.code === 'VEEAM_BACKUP' && <VeeamReportWidget />}

      {/* Dropzone */}
      {canUpload && (
        <div
          {...getRootProps()}
          className={`rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/10'
              : 'border-gray-300 dark:border-slate-600 hover:border-primary hover:bg-primary/5'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                isDragActive
                  ? 'bg-primary/20'
                  : 'bg-gray-100 dark:bg-slate-800'
              }`}
            >
              <Upload
                className={`h-7 w-7 ${
                  isDragActive ? 'text-primary' : 'text-seal-gray-500 dark:text-slate-400'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-navy dark:text-white">
                Glissez vos fichiers ici ou cliquez pour parcourir
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                {ALLOWED_EXTENSIONS.join(', ')} — max 200 Mo
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500 dark:text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un fichier, tag, description…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500 dark:text-slate-500" />
              <input
                type="text"
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                placeholder="Période (ex : 2026-04)"
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Files list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              type="general"
              title="Aucun export"
              description="Aucun fichier n'a encore été déposé dans cette catégorie."
            />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium text-navy dark:text-white truncate">
                      {item.originalName}
                    </p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                      {formatSize(item.fileSize)} · {formatDateTime(item.createdAt)}
                      {item.uploadedBy && (
                        <>
                          {' · '}
                          {item.uploadedBy.firstName} {item.uploadedBy.lastName}
                        </>
                      )}
                    </p>
                    {item.description && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-500 mt-1 truncate">
                        {item.description}
                      </p>
                    )}
                  </div>
                  {item.reportPeriod && (
                    <Badge variant="info">{item.reportPeriod}</Badge>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(item)}
                      className="p-2 rounded-lg hover:bg-primary/10 text-seal-gray-500 dark:text-slate-400 hover:text-primary transition-colors"
                      title="Télécharger"
                      aria-label="Télécharger"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-seal-gray-500 dark:text-slate-400 hover:text-red-600 transition-colors"
                        title="Supprimer"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <UploadDialog
        open={!!pendingFile}
        file={pendingFile}
        category={category}
        onClose={() => setPendingFile(null)}
        onSubmit={handleUploadSubmit}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export default function ItExportsPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const mounted = useRef(true);

  const canUpload = !!user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const canViewStats = !!user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const canDelete = !!user && isRoleAtLeast(user.role, UserRole.SUPER_ADMIN);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [catRes, statsRes] = await Promise.all([
        api.get('/it-exports/categories'),
        canViewStats
          ? api.get('/it-exports/stats').catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      if (!mounted.current) return;
      setCategories(catRes.data || []);
      setStats(statsRes.data || null);
    } catch {
      if (mounted.current) {
        setLoadError('Impossible de charger les catégories.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [canViewStats]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.code === selectedCode) || null,
    [categories, selectedCode],
  );

  const globalCount = stats?.totals?.count ?? 0;
  const globalSize = stats?.totals?.totalSize ?? 0;

  if (selectedCategory) {
    return (
      <CategoryDetail
        category={selectedCategory}
        onBack={() => {
          setSelectedCode(null);
          loadOverview();
        }}
        canUpload={canUpload}
        canDelete={canDelete}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="config" />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-primary" />
            Exports IT &amp; Conformité
          </h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            Dépôt centralisé des preuves d&apos;audit pour la certification ISO 27001:2022.
          </p>
        </div>
        {canViewStats && stats && (
          <div className="flex items-center gap-6 text-xs text-seal-gray-500 dark:text-slate-400">
            <div>
              <p className="text-[10px] uppercase tracking-wider">Total exports</p>
              <p className="text-lg font-medium text-navy dark:text-white">
                {globalCount}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider">Volume</p>
              <p className="text-lg font-medium text-navy dark:text-white">
                {formatSize(globalSize)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider">Dernier dépôt</p>
              <p className="text-lg font-medium text-navy dark:text-white">
                {formatDate(stats.totals.lastUploadAt)}
              </p>
            </div>
          </div>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {loadError}
        </div>
      )}

      {/* Grid of categories */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.code] || Folder;
            const catStats = stats?.byCategory?.[cat.code];
            const count = catStats?.count ?? 0;
            const lastUpload = catStats?.lastUploadAt ?? null;
            return (
              <button
                key={cat.code}
                onClick={() => setSelectedCode(cat.code)}
                className="seal-card text-left group rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy dark:text-white truncate group-hover:text-primary transition-colors">
                      {cat.label}
                    </p>
                    {cat.iso && (
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5 truncate">
                        ISO {cat.iso}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mb-4 min-h-[32px]">
                  {cat.description}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 text-seal-gray-500 dark:text-slate-400 font-medium">
                    {count} export{count > 1 ? 's' : ''}
                  </span>
                  <span className="text-seal-gray-500 dark:text-slate-500">
                    {lastUpload ? formatDate(lastUpload) : 'Vide'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!canUpload && (
        <p className="text-xs text-seal-gray-500 dark:text-slate-500 text-center">
          Seuls les administrateurs peuvent déposer de nouveaux exports.
        </p>
      )}
    </div>
  );
}
