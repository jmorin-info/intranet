'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Skeleton,
} from '@omnitech/ui';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Upload,
  Play,
  Clock,
  Info,
  Download,
  RefreshCw,
  Server,
  Globe,
  Filter,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';

interface AuditCheck {
  category: string;
  name: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  recommendation?: string;
  isoControl?: string;
  source?: 'ad' | 'intranet';
}

interface AuditReport {
  generatedAt: string;
  overallScore: number;
  checks: AuditCheck[];
  summary: { pass: number; warning: number; fail: number; total: number };
  adDomain?: string;
  adScore?: number;
}

interface HistoryItem {
  id: string;
  createdAt: string;
  metadata: { overallScore: number; pass: number; warning: number; fail: number; total: number; adDomain?: string; adScore?: number; adChecks?: number; dbChecks?: number };
  severity: string;
}

export default function AdAuditPage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Load history on mount
  useEffect(() => {
    api.get('/ad-audit/history').then(r => setHistory(r.data || [])).catch(() => {});
  }, []);

  const runQuickScan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/ad-audit/quick-scan');
      setReport(res.data);
      // Refresh history
      api.get('/ad-audit/history').then(r => setHistory(r.data || [])).catch(() => {});
    } catch {
      setError('Erreur lors du scan. Vérifiez vos permissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      // If it's the intranet JSON from the PS1 script, send as JSON body
      if (ext === 'json' && file.name.includes('intranet')) {
        const text = await file.text();
        const json = JSON.parse(text);
        const res = await api.post('/ad-audit/analyze', json);
        setReport(res.data);
      } else {
        // Standard file upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', ext === 'json' ? 'json' : ext === 'csv' ? 'csv' : 'text');
        const res = await api.post('/ad-audit/analyze', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setReport(res.data);
      }
      // Refresh history
      api.get('/ad-audit/history').then(r => setHistory(r.data || [])).catch(() => {});
    } catch {
      setError('Erreur lors de l\'analyse du fichier.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }, []);

  const exportCSV = useCallback(() => {
    if (!report) return;
    const headers = ['Catégorie', 'Contrôle', 'Statut', 'Description', 'Recommandation', 'ISO 27001', 'Source'];
    const rows = report.checks.map(c => [
      c.category, c.name, c.status.toUpperCase(), c.description,
      c.recommendation || '', c.isoControl || '', c.source || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-ad-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [report]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />;
      case 'fail': return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
      default: return null;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pass': return <Badge variant="approved">OK</Badge>;
      case 'warning': return <Badge variant="warning">Attention</Badge>;
      case 'fail': return <Badge variant="error">Non conforme</Badge>;
      default: return null;
    }
  };

  // Filter checks
  const filteredChecks = report
    ? report.checks.filter(c => {
        if (filterStatus !== 'all' && c.status !== filterStatus) return false;
        if (filterSource !== 'all' && c.source !== filterSource) return false;
        return true;
      })
    : [];

  // Group checks by category
  const groupedChecks = filteredChecks.reduce<Record<string, AuditCheck[]>>((acc, check) => {
    if (!acc[check.category]) acc[check.category] = [];
    acc[check.category]!.push(check);
    return acc;
  }, {});

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const recommendations = report?.checks.filter(c => c.recommendation && c.status !== 'pass') || [];

  // Score trend from history
  const lastScore = history.length > 1 ? history[1]?.metadata?.overallScore : null;
  const scoreTrend = report && lastScore != null ? report.overallScore - lastScore : null;

  // Score ring
  const renderScore = (score: number, size = 140) => {
    const radius = size * 0.385;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const center = size / 2;
    const color = score >= 70 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500';
    return (
      <svg width={size} height={size} className="mx-auto">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor"
          className="text-gray-200 dark:text-slate-700" strokeWidth="12" />
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor"
          className={color} strokeWidth="12"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }} />
        <text x={center} y={center - 5} textAnchor="middle" dominantBaseline="central"
          className="text-3xl font-medium fill-navy dark:fill-white">{score}%</text>
        <text x={center} y={center + 18} textAnchor="middle"
          className="text-[10px] fill-taupe dark:fill-slate-400">Score global</text>
      </svg>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title="Audit Active Directory"
        subtitle="Conformité de l'annuaire et de l'infrastructure"
        icon={ShieldAlert}
        hub="admin"
        actions={
          <>
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept=".json,.txt,.csv" onChange={handleFileUpload} />
              <span className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                <Upload className="h-4 w-4" />
                Importer un rapport
              </span>
            </label>
            <Button onClick={runQuickScan} disabled={loading}>
              <Play className="h-4 w-4" />
              {loading ? 'Analyse...' : 'Scan rapide'}
            </Button>
          </>
        }
      />

      {/* Help card for PS1 script */}
      {!report && !loading && history.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <h3 className="text-sm font-medium text-navy dark:text-white mb-2 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" /> Guide d&apos;utilisation
            </h3>
            <div className="text-xs text-seal-gray-500 dark:text-slate-400 space-y-1">
              <p><strong>Scan rapide :</strong> Analyse les données de l&apos;intranet (MFA, départements, chartes, veille...)</p>
              <p><strong>Rapport PS1 :</strong> Lancez <code className="bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono">AD-ISO27001-Report-v5.ps1</code> sur le DC, puis importez le fichier <code className="bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono">*.intranet.json</code></p>
              <p><strong>Auto-upload :</strong> Ajoutez <code className="bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono">-IntranetApiUrl &quot;https://intranet.omnitech-security.fr/api&quot;</code> pour envoyer automatiquement</p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !report && (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      )}

      {/* Results */}
      {report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <Card className="sm:col-span-1 lg:col-span-1">
              <CardContent className="flex flex-col items-center justify-center py-4">
                {renderScore(report.overallScore, 100)}
                {scoreTrend !== null && (
                  <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${scoreTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {scoreTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {scoreTrend > 0 ? '+' : ''}{scoreTrend}%
                  </div>
                )}
              </CardContent>
            </Card>
            {[
              { label: 'Conformes', value: report.summary.pass, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
              { label: 'Avertissements', value: report.summary.warning, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' },
              { label: 'Non conformes', value: report.summary.fail, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/30' },
              { label: 'Total', value: report.summary.total, icon: ShieldAlert, color: 'text-navy dark:text-white', bg: 'bg-navy/10 dark:bg-slate-700' },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${kpi.bg}`}>
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <div>
                    <p className={`text-xl font-medium ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{kpi.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* AD/Intranet breakdown */}
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex flex-col gap-1.5 w-full">
                  <div className="flex items-center gap-2 text-xs">
                    <Server className="h-3 w-3 text-blue-500" />
                    <span className="text-seal-gray-500 dark:text-slate-400">AD</span>
                    <span className="font-medium text-navy dark:text-white ml-auto">{report.checks.filter(c => c.source === 'ad').length}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Globe className="h-3 w-3 text-primary" />
                    <span className="text-seal-gray-500 dark:text-slate-400">Intranet</span>
                    <span className="font-medium text-navy dark:text-white ml-auto">{report.checks.filter(c => c.source === 'intranet').length}</span>
                  </div>
                  {report.adDomain && (
                    <p className="text-[9px] text-seal-gray-500 dark:text-slate-500 mt-0.5 truncate" title={report.adDomain}>{report.adDomain}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 text-xs font-medium text-seal-gray-500 dark:text-slate-400">
                  <Filter className="h-3.5 w-3.5" /> Filtres
                  {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                <div className="flex gap-1.5">
                  {[
                    { value: 'all', label: 'Tous' },
                    { value: 'fail', label: 'Non conformes' },
                    { value: 'warning', label: 'Avertissements' },
                    { value: 'pass', label: 'Conformes' },
                  ].map(f => (
                    <button key={f.value} onClick={() => setFilterStatus(f.value)}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition ${filterStatus === f.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {showFilters && (
                  <div className="flex gap-1.5 ml-4">
                    {[
                      { value: 'all', label: 'Toutes sources' },
                      { value: 'ad', label: 'Active Directory' },
                      { value: 'intranet', label: 'Intranet' },
                    ].map(f => (
                      <button key={f.value} onClick={() => setFilterSource(f.value)}
                        className={`px-3 py-1 text-xs font-medium rounded-full transition ${filterSource === f.value ? 'bg-navy text-white dark:bg-slate-500' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300'}`}>
                        {f.value === 'ad' && <Server className="h-3 w-3 inline mr-1" />}
                        {f.value === 'intranet' && <Globe className="h-3 w-3 inline mr-1" />}
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">{filteredChecks.length} contrôle(s)</span>
                  <Button size="sm" variant="outline" onClick={exportCSV}>
                    <Download className="h-3 w-3" /> CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Checks by category — collapsible */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-navy dark:text-white">Points de contrôle</h2>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  {new Date(report.generatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(groupedChecks).map(([category, checks]) => {
                  const catPass = checks.filter(c => c.status === 'pass').length;
                  const catFail = checks.filter(c => c.status === 'fail').length;
                  const catWarn = checks.filter(c => c.status === 'warning').length;
                  const isExpanded = expandedCategories.has(category) || expandedCategories.size === 0;

                  return (
                    <div key={category} className="border border-gray-100 dark:border-slate-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-medium text-navy dark:text-white">{category}</h3>
                          <div className="flex items-center gap-1.5">
                            {catPass > 0 && <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">{catPass} OK</span>}
                            {catWarn > 0 && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">{catWarn} WARN</span>}
                            {catFail > 0 && <span className="text-[10px] font-medium text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded">{catFail} FAIL</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Mini progress bar */}
                          <div className="w-20 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${checks.length > 0 ? (catPass / checks.length) * 100 : 0}%` }} />
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-seal-gray-500" /> : <ChevronDown className="h-4 w-4 text-seal-gray-500" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="divide-y divide-gray-50 dark:divide-slate-800">
                          {checks.map((check, i) => (
                            <div key={i} className="flex items-start gap-3 py-2.5 px-4 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                              {statusIcon(check.status)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-navy dark:text-white">{check.name}</span>
                                  {statusBadge(check.status)}
                                  {check.isoControl && (
                                    <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                      {check.isoControl}
                                    </span>
                                  )}
                                  {check.source && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${check.source === 'ad' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-seal-gray-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                      {check.source === 'ad' ? 'AD' : 'Intranet'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">{check.description}</p>
                                {check.recommendation && check.status !== 'pass' && (
                                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 bg-amber-50/50 dark:bg-amber-900/10 px-2 py-1 rounded">
                                    {check.recommendation}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations summary */}
          {recommendations.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader>
                <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
                  <Info className="h-5 w-5 text-amber-500" />
                  Plan d&apos;action ({recommendations.length})
                </h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {recommendations
                    .sort((a, b) => {
                      const sev = { fail: 0, warning: 1, pass: 2 };
                      return (sev[a.status] ?? 2) - (sev[b.status] ?? 2);
                    })
                    .slice(0, 15)
                    .map((check, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        {statusIcon(check.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-navy dark:text-white">{check.name}</span>
                            {check.isoControl && (
                              <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                {check.isoControl}
                              </span>
                            )}
                          </div>
                          <p className="text-seal-gray-500 dark:text-slate-400 mt-0.5">{check.recommendation}</p>
                        </div>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-seal-gray-500" />
              Historique des audits
            </h2>
            <Button variant="outline" size="sm" onClick={() => api.get('/ad-audit/history').then(r => setHistory(r.data || []))}>
              <RefreshCw className="h-3 w-3" /> Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">
              Aucun audit précédent. Lancez un scan rapide pour commencer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700 text-left">
                    <th className="py-2 px-3 font-medium text-seal-gray-500 dark:text-slate-400">Date</th>
                    <th className="py-2 px-3 font-medium text-seal-gray-500 dark:text-slate-400">Score</th>
                    <th className="py-2 px-3 font-medium text-seal-gray-500 dark:text-slate-400">OK</th>
                    <th className="py-2 px-3 font-medium text-seal-gray-500 dark:text-slate-400">Avert.</th>
                    <th className="py-2 px-3 font-medium text-seal-gray-500 dark:text-slate-400">Échecs</th>
                    <th className="py-2 px-3 font-medium text-seal-gray-500 dark:text-slate-400">Sources</th>
                    <th className="py-2 px-3 font-medium text-seal-gray-500 dark:text-slate-400">Sévérité</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, idx) => {
                    const m = item.metadata;
                    const scoreColor = m.overallScore >= 70 ? 'text-emerald-600' : m.overallScore >= 50 ? 'text-amber-600' : 'text-red-500';
                    const prevScore = history[idx + 1]?.metadata?.overallScore;
                    const diff = prevScore != null ? m.overallScore - prevScore : null;
                    return (
                      <tr key={item.id} className="border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-navy dark:text-white">
                          {new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`font-medium ${scoreColor}`}>{m.overallScore}%</span>
                          {diff !== null && diff !== 0 && (
                            <span className={`ml-1 text-[10px] font-medium ${diff > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-emerald-600">{m.pass}</td>
                        <td className="py-2 px-3 text-amber-600">{m.warning}</td>
                        <td className="py-2 px-3 text-red-500">{m.fail}</td>
                        <td className="py-2 px-3 text-xs text-seal-gray-500 dark:text-slate-400">
                          {m.adChecks ? `AD:${m.adChecks}` : ''}{m.adChecks && m.dbChecks ? ' + ' : ''}{m.dbChecks ? `Intranet:${m.dbChecks}` : ''}
                          {!m.adChecks && !m.dbChecks && `${m.total}`}
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant={item.severity === 'INFO' ? 'approved' : item.severity === 'WARN' ? 'warning' : 'error'}>
                            {item.severity}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
