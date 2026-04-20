'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  SearchInput,
  Select,
  Skeleton,
} from '@omnitech/ui';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  TrendingUp,
  Download,
  ScanSearch,
} from 'lucide-react';
import { toast } from 'sonner';

interface ComplianceSummary {
  total: number;
  covered: number;
  partial: number;
  uncovered: number;
  coveragePercent: number;
  byDomain: Record<string, { total: number; covered: number; partial: number; uncovered: number }>;
  uncoveredControls: Array<{ code: string; title: string; domain: string }>;
}

interface GapItem {
  controlCode: string;
  controlTitle: string;
  domain: string;
  status: 'COUVERT' | 'PARTIELLEMENT_COUVERT' | 'NON_COUVERT';
  documentCount: number;
  documents: Array<{ id: string; reference: string; title: string }>;
}

export function ComplianceOverview() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [previousCoverage, setPreviousCoverage] = useState<number | null>(null);
  const [lastAuditDate, setLastAuditDate] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ scanned: number; assigned: number; errors: number; details?: any[] } | null>(null);

  useEffect(() => {
    async function fetch() {
      try {
        const [summaryRes, gapRes] = await Promise.all([
          api.get('/iso-analyzer/compliance-summary'),
          api.get('/iso-analyzer/gap-analysis'),
        ]);
        setSummary(summaryRes.data);
        setGaps(gapRes.data);

        // Try to fetch previous coverage from audit logs for trend comparison
        try {
          const lastMonth = new Date();
          lastMonth.setMonth(lastMonth.getMonth() - 1);
          const { data: auditData } = await api.get('/audit', {
            params: {
              action: 'COMPLIANCE_SCAN',
              resourceType: 'ISO_CONTROL',
              dateTo: lastMonth.toISOString(),
              limit: 1,
            },
          });
          const entries = auditData?.data || (Array.isArray(auditData) ? auditData : []);
          if (entries.length > 0) {
            if (entries[0].createdAt) {
              setLastAuditDate(entries[0].createdAt as string);
            }
            if (entries[0].metadata) {
              const meta = typeof entries[0].metadata === 'string' ? JSON.parse(entries[0].metadata) : entries[0].metadata;
              if (meta.coveragePercent !== undefined) {
                setPreviousCoverage(meta.coveragePercent);
              }
            }
          }
        } catch {
          // Audit logs may not be available — trend indicator simply won't show
        }
      } catch {
        // graceful
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const filteredGaps = gaps.filter((g) => {
    if (search) {
      const s = search.toLowerCase();
      if (!g.controlCode.toLowerCase().includes(s) && !g.controlTitle.toLowerCase().includes(s)) {
        return false;
      }
    }
    if (domainFilter && !g.domain.startsWith(domainFilter)) return false;
    if (statusFilter && g.status !== statusFilter) return false;
    return true;
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case 'COUVERT': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'PARTIELLEMENT_COUVERT': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'NON_COUVERT': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'COUVERT': return <Badge variant="approved">{t('compliance.status.covered')}</Badge>;
      case 'PARTIELLEMENT_COUVERT': return <Badge variant="warning">{t('compliance.status.partial')}</Badge>;
      case 'NON_COUVERT': return <Badge variant="error">{t('compliance.status.uncovered')}</Badge>;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-card" />
      </div>
    );
  }

  const handleFullScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const { data } = await api.post('/iso-analyzer/scan-all');
      setScanResult(data);
      toast.success(`Scan terminé : ${data.scanned} documents analysés, ${data.assigned} contrôles assignés${data.errors > 0 ? `, ${data.errors} erreur(s)` : ''}`);
      // Refresh data
      const [summaryRes, gapRes] = await Promise.all([
        api.get('/iso-analyzer/compliance-summary'),
        api.get('/iso-analyzer/gap-analysis'),
      ]);
      setSummary(summaryRes.data);
      setGaps(gapRes.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur lors du scan');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-seal-navy dark:text-white">{t('compliance.title')}</h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            {t('compliance.subtitle')}
          </p>
        </div>
        <Button onClick={handleFullScan} loading={scanning} disabled={scanning}>
          <ScanSearch className="h-4 w-4" />
          {scanning ? 'Analyse en cours...' : 'Scanner tous les documents'}
        </Button>
      </div>

      {/* Scan results */}
      {scanResult && (
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">
                    Scan terminé — {scanResult.scanned} documents analysés
                  </p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                    {scanResult.assigned} contrôles assignés{scanResult.errors > 0 ? ` · ${scanResult.errors} erreur(s)` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setScanResult(null)} className="text-seal-gray-500 hover:text-seal-navy dark:hover:text-white">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            {scanResult.details && scanResult.details.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto">
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  {scanResult.details.filter((d: any) => d.controls > 0).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-2.5 w-2.5" /> {d.reference} ({d.controls})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hero coverage ring + stats */}
      {summary && (() => {
        const radius = 80;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (summary.coveragePercent / 100) * circumference;
        return (
          <Card className="shadow-sm rounded-xl">
            <CardContent>
              <div className="flex flex-col md:flex-row items-center gap-8">
                {/* Large ring chart */}
                <div className="flex-shrink-0 flex flex-col items-center">
                  <svg width="200" height="200" className="mx-auto">
                    <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" className="text-gray-200 dark:text-slate-700" strokeWidth="14" />
                    <circle cx="100" cy="100" r={radius} fill="none" stroke="url(#coverageGradient)" strokeWidth="14"
                      strokeDasharray={circumference} strokeDashoffset={offset}
                      transform="rotate(-90 100 100)" strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
                    <defs>
                      <linearGradient id="coverageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#F68D2E" />
                        <stop offset="100%" stopColor="#006233" />
                      </linearGradient>
                    </defs>
                    <text x="100" y="92" textAnchor="middle" dominantBaseline="central"
                      className="text-4xl font-bold fill-navy dark:fill-white">{summary.coveragePercent}%</text>
                    <text x="100" y="118" textAnchor="middle" dominantBaseline="central"
                      className="text-xs fill-taupe dark:fill-slate-400">couverture ISO</text>
                  </svg>
                  {/* Trend indicator vs last month */}
                  {previousCoverage !== null && (() => {
                    const diff = summary.coveragePercent - previousCoverage;
                    if (diff === 0) return (
                      <p className="text-center text-[11px] text-seal-gray-500 dark:text-slate-400 mt-2">
                        = vs mois dernier
                      </p>
                    );
                    const isUp = diff > 0;
                    return (
                      <p className={`text-center text-[11px] font-semibold mt-2 flex items-center justify-center gap-0.5 ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        <TrendingUp className={`h-3.5 w-3.5 ${isUp ? '' : 'rotate-180'}`} />
                        {isUp ? '+' : ''}{diff}% vs mois dernier
                      </p>
                    );
                  })()}
                  {/* Last audit date */}
                  {lastAuditDate && (
                    <p className="text-center text-[11px] text-seal-gray-500 dark:text-slate-400 mt-1.5 flex items-center justify-center gap-1">
                      <FileText className="h-3 w-3" />
                      Dernier audit : {new Date(lastAuditDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>

                {/* Right side: stats cards + bars */}
                <div className="flex-1 min-w-0 w-full">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    <div className="flex items-center gap-3 rounded-xl bg-seal-navy/5 dark:bg-slate-800/60 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-seal-navy/10">
                        <Shield className="h-5 w-5 text-seal-navy" />
                      </div>
                      <div>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{t('compliance.totalControls')}</p>
                        <p className="text-xl font-medium text-seal-navy dark:text-white">{summary.total}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{t('compliance.covered')}</p>
                        <p className="text-xl font-medium text-emerald-600">{summary.covered}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{t('compliance.partial')}</p>
                        <p className="text-xl font-medium text-amber-600">{summary.partial}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/40">
                        <XCircle className="h-5 w-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{t('compliance.uncovered')}</p>
                        <p className="text-xl font-medium text-red-500">{summary.uncovered}</p>
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-3">{t('compliance.globalCoverage')}</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400 w-20">{t('compliance.legend.covered')}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(summary.covered / summary.total) * 100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-seal-navy dark:text-white w-8 text-right">{summary.covered}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400 w-20">{t('compliance.legend.partial')}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${(summary.partial / summary.total) * 100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-seal-navy dark:text-white w-8 text-right">{summary.partial}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-red-400 flex-shrink-0" />
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400 w-20">{t('compliance.legend.uncovered')}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${(summary.uncovered / summary.total) * 100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-seal-navy dark:text-white w-8 text-right">{summary.uncovered}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* By domain — color-coded bars */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(summary.byDomain).map(([domain, stats]) => {
            const pct = stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0;
            const barColor = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
            const textColor = pct === 100 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500';
            const ringColor = pct === 100 ? 'ring-emerald-200 dark:ring-emerald-900/40' : pct >= 50 ? 'ring-amber-200 dark:ring-amber-900/40' : 'ring-red-200 dark:ring-red-900/40';
            return (
              <Card key={domain} className={`shadow-sm rounded-xl ring-2 ${ringColor}`}>
                <CardContent>
                  <p className="text-xs font-semibold text-seal-navy dark:text-white mb-2 truncate">{domain}</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className={`text-xl font-medium ${textColor}`}>{pct}%</span>
                    <span className="text-xs text-seal-gray-500 dark:text-slate-400 mb-0.5">
                      {stats.covered}/{stats.total} {t('compliance.coveredCount')}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-seal-gray-500 dark:text-slate-400">
                    <span>{stats.covered} couvert{stats.covered !== 1 ? 's' : ''}</span>
                    <span>{stats.partial} partiel{stats.partial !== 1 ? 's' : ''}</span>
                    <span>{stats.uncovered} manquant{stats.uncovered !== 1 ? 's' : ''}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Gap analysis detail */}
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-seal-navy dark:text-white">{t('compliance.detailTitle')}</h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">{filteredGaps.length} {t('compliance.totalControls').toLowerCase()}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const header = 'Code;Titre;Domaine;Statut;Documents;Références\n';
                  const rows = filteredGaps.map((g) =>
                    `${g.controlCode};${g.controlTitle.replace(/;/g, ',')};${g.domain};${g.status};${g.documentCount};${g.documents.map((d) => d.reference).join(', ')}`
                  ).join('\n');
                  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `gap-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-4 w-4" />
                Télécharger CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('compliance.searchPlaceholder')}
              className="flex-1"
            />
            <Select
              options={[
                { value: 'A.5', label: t('compliance.domain.a5') },
                { value: 'A.6', label: t('compliance.domain.a6') },
                { value: 'A.7', label: t('compliance.domain.a7') },
                { value: 'A.8', label: t('compliance.domain.a8') },
              ]}
              placeholder={t('compliance.domain')}
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="w-48"
            />
            <Select
              options={[
                { value: 'COUVERT', label: t('compliance.status.covered') },
                { value: 'PARTIELLEMENT_COUVERT', label: t('compliance.status.partial') },
                { value: 'NON_COUVERT', label: t('compliance.status.uncovered') },
              ]}
              placeholder={t('compliance.status')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
            {filteredGaps.map((gap) => (
              <div
                key={gap.controlCode}
                className="flex items-start gap-3 py-3 px-1"
              >
                {statusIcon(gap.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-seal-navy dark:text-white">{gap.controlCode}</span>
                    {statusBadge(gap.status)}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-slate-300 mt-0.5">{gap.controlTitle}</p>
                  {gap.documents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {gap.documents.map((doc) => (
                        <Link
                          key={doc.id}
                          href={`/documents/${doc.id}`}
                          className="inline-flex items-center gap-1 rounded bg-primary-light px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                        >
                          <FileText className="h-3 w-3" />
                          {doc.reference}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
                  {gap.documentCount} doc{gap.documentCount !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
