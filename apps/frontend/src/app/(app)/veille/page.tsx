'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card, CardContent, CardHeader, Button, Badge, SearchInput, Select, EmptyState, Tabs,
} from '@omnitech/ui';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import DOMPurify from 'dompurify';
import {
  Shield, AlertTriangle, ExternalLink, CheckCircle2, RefreshCw, Rss, AlertOctagon, Info, Filter, Newspaper, X, Sparkles, Calendar, ChevronDown, ChevronUp, Trash2, ToggleLeft, ToggleRight, Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { ExportCsvButton } from '@/components/ui/export-csv-button';
import { useTranslation } from '@/lib/i18n';

interface VeilleItem {
  id: string;
  title: string;
  description: string | null;
  sourceUrl: string;
  sourceName: string;
  severity: string | null;
  cveId: string | null;
  publishedAt: string;
  isProcessed: boolean;
  acks: Array<{ user: { id: string; firstName: string; lastName: string }; action: string; comment: string | null }>;
}

interface VeilleBulletin {
  id: string;
  title: string;
  weekStart: string;
  weekEnd: string;
  content: string;
  itemCount: number;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface VeilleSource {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
}

interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  total: number;
  bySeverity: Record<string, number>;
  top5Critical: Array<{ id: string; title: string; severity: string; cveId: string | null; sourceName: string; publishedAt: string; sourceUrl: string }>;
  productsAffected: string[];
}

// Detect theme from title/description
function detectTheme(item: VeilleItem): string {
  const t = (item.title + ' ' + (item.description || '')).toLowerCase();
  if (t.includes('microsoft') || t.includes('windows') || t.includes('azure') || t.includes('office')) return 'Microsoft';
  if (t.includes('linux') || t.includes('kernel') || t.includes('debian') || t.includes('ubuntu')) return 'Linux';
  if (t.includes('cisco') || t.includes('fortinet') || t.includes('palo alto') || t.includes('juniper')) return 'Réseau / Firewall';
  if (t.includes('chrome') || t.includes('firefox') || t.includes('mozilla') || t.includes('navigateur')) return 'Navigateurs';
  if (t.includes('apache') || t.includes('nginx') || t.includes('php') || t.includes('node') || t.includes('java')) return 'Serveurs / Web';
  if (t.includes('vmware') || t.includes('veeam') || t.includes('citrix') || t.includes('virtualisation')) return 'Virtualisation';
  if (t.includes('ransomware') || t.includes('malware') || t.includes('phishing') || t.includes('attaque')) return 'Menaces';
  if (t.includes('cve-')) return 'CVE';
  return 'Autre';
}

export default function VeillePage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [items, setItems] = useState<VeilleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('false');
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [themeFilter, setThemeFilter] = useState('');
  const [fetching, setFetching] = useState(false);
  const [stats, setStats] = useState<{ total: number; unprocessed: number; processed: number; bySeverity?: Record<string, number>; bySource?: Record<string, number>; lastCollect?: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'bulletins'>('alerts');
  const [bulletins, setBulletins] = useState<VeilleBulletin[]>([]);
  const [bulletinsLoading, setBulletinsLoading] = useState(false);
  const [selectedBulletin, setSelectedBulletin] = useState<VeilleBulletin | null>(null);
  const [generating, setGenerating] = useState(false);
  const PRODUCTS = ['FortiGate', 'VMware', 'Microsoft', 'ESET', 'Veeam', 'Cisco', 'Linux', 'Fortinet', 'Palo Alto', 'SonicWall'];
  const [productFilter, setProductFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [bulletinItems, setBulletinItems] = useState<VeilleItem[]>([]);
  const [bulletinItemsLoading, setBulletinItemsLoading] = useState(false);

  // --- Sources RSS state ---
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources, setSources] = useState<VeilleSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [addingSource, setAddingSource] = useState(false);

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const canAck = user && isRoleAtLeast(user.role, UserRole.REVIEWER);
  const canSeeWeeklySummary = user && isRoleAtLeast(user.role, UserRole.REVIEWER);

  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(false);

  const fetchWeeklySummary = useCallback(async () => {
    if (!canSeeWeeklySummary) return;
    setWeeklySummaryLoading(true);
    try {
      const { data } = await api.get('/veille/weekly-summary');
      setWeeklySummary(data);
    } catch (err) { console.error('Failed to load weekly summary:', err); }
    finally { setWeeklySummaryLoading(false); }
  }, [canSeeWeeklySummary]);

  useEffect(() => { fetchWeeklySummary(); }, [fetchWeeklySummary]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      // Time period filter
      if (period === 'week') params.dateFrom = new Date(Date.now() - 7 * 86400000).toISOString();
      else if (period === 'month') params.dateFrom = new Date(Date.now() - 30 * 86400000).toISOString();
      if (filter) params.isProcessed = filter;
      if (search) { params.search = search; delete params.dateFrom; params.limit = '100'; }
      const [itemsRes, statsRes] = await Promise.allSettled([
        api.get('/veille', { params }),
        isAdmin ? api.get('/veille/stats') : Promise.resolve({ data: null }),
      ]);
      if (itemsRes.status === 'fulfilled') setItems(itemsRes.value.data?.data || []);
      else console.error('Failed to load veille items:', itemsRes.reason);
      if (statsRes.status === 'fulfilled' && statsRes.value.data) setStats(statsRes.value.data);
    } catch (err) { console.error('Failed to load veille items:', err); } finally { setLoading(false); }
  }, [search, filter, isAdmin, period]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleFetch = async () => {
    setFetching(true);
    try {
      await api.post('/veille/fetch-now');
      toast.success('Collecte terminée — flux RSS actualisés');
      fetchItems();
    } catch (err) { toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur de récupération'); } finally { setFetching(false); }
  };

  const handleAck = async (itemId: string, action: string) => {
    try {
      await api.post(`/veille/${itemId}/acknowledge`, { action });
      toast.success(action === 'APPLIED' ? 'Marqué comme appliqué' : action === 'NOT_APPLICABLE' ? 'Marqué N/A' : 'Risque accepté');
      fetchItems();
    } catch (err) { toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur lors de la mise à jour de la veille'); }
  };

  const [bulkProcessing, setBulkProcessing] = useState(false);
  const handleBulkProcess = async () => {
    setBulkProcessing(true);
    try {
      await api.post('/veille/bulk-process');
      toast.success('Toutes les alertes ont été marquées comme traitées');
      fetchItems();
    } catch (err) { toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur lors du traitement en masse'); }
    finally { setBulkProcessing(false); }
  };

  const fetchSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const { data } = await api.get('/veille/sources');
      setSources(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load sources:', err); } finally { setSourcesLoading(false); }
  }, []);

  useEffect(() => {
    if (sourcesOpen && isAdmin) fetchSources();
  }, [sourcesOpen, isAdmin, fetchSources]);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSourceName.trim();
    const url = newSourceUrl.trim();
    if (!name || !url) return;
    // Validate URL structure (must be http/https) before hitting the API
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        toast.error('L\'URL doit commencer par http:// ou https://');
        return;
      }
    } catch {
      toast.error('URL invalide');
      return;
    }
    setAddingSource(true);
    try {
      await api.post('/veille/sources', { name, url });
      toast.success('Source ajoutée');
      setNewSourceName('');
      setNewSourceUrl('');
      fetchSources();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'ajout';
      toast.error(msg);
    } finally { setAddingSource(false); }
  };

  const handleToggleSource = async (source: VeilleSource) => {
    try {
      await api.patch(`/veille/sources/${source.id}`, { isActive: !source.isActive });
      toast.success(source.isActive ? 'Source désactivée' : 'Source activée');
      fetchSources();
    } catch (err) { toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur lors de la mise à jour'); }
  };

  const handleDeleteSource = async (source: VeilleSource) => {
    if (!window.confirm(`Supprimer la source "${source.name}" ?`)) return;
    try {
      await api.delete(`/veille/sources/${source.id}`);
      toast.success('Source supprimée');
      fetchSources();
    } catch (err) { toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur lors de la suppression'); }
  };

  const handleSeedSources = async () => {
    try {
      const { data } = await api.post('/veille/sources/seed');
      toast.success(`Sources par défaut ajoutées : ${data.inserted} insérées, ${data.skipped} déjà présentes`);
      fetchSources();
    } catch (err) { toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur lors du chargement des sources par défaut'); }
  };

  const fetchBulletins = useCallback(async () => {
    setBulletinsLoading(true);
    try {
      const { data } = await api.get('/veille/bulletins', { params: { limit: '20' } });
      setBulletins(data?.data || []);
    } catch (err) { console.error('Failed to load bulletins:', err); } finally { setBulletinsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'bulletins') fetchBulletins();
  }, [activeTab, fetchBulletins]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post('/veille/bulletins/generate');
      toast.success('Bulletin hebdomadaire généré');
      fetchBulletins();
    } catch (err) { toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur de génération'); }
    finally { setGenerating(false); }
  };

  const handleSelectBulletin = async (bulletin: VeilleBulletin) => {
    try {
      const { data } = await api.get(`/veille/bulletins/${bulletin.id}`);
      setSelectedBulletin(data);
      // Fetch linked veille items for this bulletin
      setBulletinItemsLoading(true);
      try {
        const itemsRes = await api.get('/veille', { params: { limit: '50', bulletinId: bulletin.id } });
        setBulletinItems(itemsRes.data?.data || []);
      } catch { setBulletinItems([]); }
      finally { setBulletinItemsLoading(false); }
    } catch {
      setSelectedBulletin(bulletin);
    }
  };

  // Compute themes from items
  const themes = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(item => {
      const theme = detectTheme(item);
      map.set(theme, (map.get(theme) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filteredItems = useMemo(() => {
    const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    let result = items;
    if (themeFilter) result = result.filter(item => detectTheme(item) === themeFilter);
    if (productFilter) result = result.filter(item => {
      const text = (item.title + ' ' + (item.description || '')).toLowerCase();
      return text.includes(productFilter.toLowerCase());
    });
    if (severityFilter) result = result.filter(item => (item.severity || 'LOW') === severityFilter);
    return [...result].sort((a, b) => (severityOrder[a.severity || 'LOW'] ?? 3) - (severityOrder[b.severity || 'LOW'] ?? 3));
  }, [items, themeFilter, productFilter, severityFilter]);

  // Compute severity counts from loaded items
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    items.forEach(item => {
      const sev = item.severity || 'LOW';
      counts[sev] = (counts[sev] || 0) + 1;
    });
    return counts;
  }, [items]);

  const severityIcon = (s: string | null) => {
    switch (s) {
      case 'CRITICAL': return <AlertOctagon className="h-4 w-4 text-red-500" />;
      case 'HIGH': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'MEDIUM': return <Info className="h-4 w-4 text-blue-500" />;
      default: return <Shield className="h-4 w-4 text-gray-400 dark:text-slate-500" />;
    }
  };

  const severityBadge = (s: string | null) => {
    switch (s) {
      case 'CRITICAL': return <Badge variant="error">Critique</Badge>;
      case 'HIGH': return <Badge variant="warning">Haute</Badge>;
      case 'MEDIUM': return <Badge variant="info">Moyenne</Badge>;
      default: return <Badge variant="navy">Basse</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={t('veille.title')}
        subtitle={t('veille.subtitle')}
        icon={Shield}
        hub="security"
        actions={
          <>
            <ExportCsvButton
              endpoint="/veille/export/csv"
              filename="veille"
              params={{
                ...(filter !== '' ? { isProcessed: filter } : {}),
                ...(search ? { search } : {}),
                ...(period === 'week' ? { dateFrom: new Date(Date.now() - 7 * 86400000).toISOString() } : {}),
                ...(period === 'month' ? { dateFrom: new Date(Date.now() - 30 * 86400000).toISOString() } : {}),
              }}
            />
            {isAdmin && (
              <>
                <Button onClick={handleBulkProcess} loading={bulkProcessing} variant="outline" size="sm" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                  <CheckCircle2 className="h-4 w-4" /> Tout traiter
                </Button>
                <Button onClick={handleFetch} loading={fetching} variant="secondary">
                  <RefreshCw className="h-4 w-4" /> {t('veille.refresh')}
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Weekly Summary — REVIEWER+ only */}
      {canSeeWeeklySummary && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white">Résumé hebdomadaire</h2>
              {weeklySummary && (
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 ml-auto">
                  {new Date(weeklySummary.weekStart).toLocaleDateString('fr-FR')} — {new Date(weeklySummary.weekEnd).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {weeklySummaryLoading ? (
              <div className="space-y-2">
                <div className="h-8 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
                <div className="h-6 animate-pulse rounded bg-gray-100 dark:bg-slate-800 w-3/4" />
              </div>
            ) : weeklySummary ? (
              <div className="space-y-4">
                {/* Total + severity pills */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-medium text-seal-navy dark:text-white">{weeklySummary.total}</span>
                    <span className="text-xs text-seal-gray-500 dark:text-slate-400">alertes cette semaine</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => {
                      const count = weeklySummary.bySeverity[sev] || 0;
                      if (count === 0) return null;
                      const cls =
                        sev === 'CRITICAL' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        sev === 'HIGH'     ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        sev === 'MEDIUM'   ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                             'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400';
                      const label = sev === 'CRITICAL' ? 'Critique' : sev === 'HIGH' ? 'Haute' : sev === 'MEDIUM' ? 'Moyenne' : 'Basse';
                      return (
                        <span key={sev} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
                          {label}: {count}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Top 5 critical items */}
                {weeklySummary.top5Critical.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1.5">Top alertes critiques</p>
                    <div className="space-y-1.5">
                      {weeklySummary.top5Critical.map(item => (
                        <div key={item.id} className="flex items-start gap-2 rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 px-3 py-2">
                          <AlertOctagon className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-seal-navy dark:text-white line-clamp-1">{item.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.cveId && (
                                <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 rounded">{item.cveId}</span>
                              )}
                              <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">{item.sourceName}</span>
                              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline ml-auto">
                                Voir <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Products affected */}
                {weeklySummary.productsAffected.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1.5">Produits du parc affectés</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weeklySummary.productsAffected.map(product => (
                        <span key={product} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-seal-navy/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300">
                          {product}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {weeklySummary.total === 0 && (
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-2">Aucune alerte recens\u00e9e cette semaine. La prochaine collecte mettra \u00e0 jour ce r\u00e9sum\u00e9.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-2">Résumé indisponible.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="shadow-sm rounded-xl"><CardContent className="py-3 px-4 flex items-center gap-3">
            <Rss className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <div><p className="text-[11px] text-seal-gray-500 dark:text-slate-400">Total</p><p className="text-xl font-medium text-seal-navy dark:text-white">{stats.total}</p></div>
          </CardContent></Card>
          <Card className="shadow-sm rounded-xl"><CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertOctagon className="h-5 w-5 text-red-500" />
            <div><p className="text-[11px] text-seal-gray-500 dark:text-slate-400">Critiques</p><p className="text-xl font-medium text-red-600">{stats.bySeverity?.CRITICAL || 0}</p></div>
          </CardContent></Card>
          <Card className="shadow-sm rounded-xl"><CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div><p className="text-[11px] text-seal-gray-500 dark:text-slate-400">Non traites</p><p className="text-xl font-medium text-amber-600">{stats.unprocessed}</p></div>
          </CardContent></Card>
          <Card className="shadow-sm rounded-xl"><CardContent className="py-3 px-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-seal-blue" />
            <div><p className="text-[11px] text-seal-gray-500 dark:text-slate-400">Derniere collecte</p><p className="text-sm font-medium text-seal-blue">{stats.lastCollect ? formatRelativeTime(stats.lastCollect) : 'Jamais'}</p></div>
          </CardContent></Card>
        </div>
      )}

      {/* Severity distribution */}
      {stats && stats.bySeverity && (
        <Card><CardContent className="py-3">
          <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">Répartition par sévérité</p>
          <div className="flex gap-1 h-6 rounded-full overflow-hidden">
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => {
              const count = stats.bySeverity![sev] || 0;
              const pct = stats.unprocessed > 0 ? (count / stats.unprocessed) * 100 : 0;
              const colors: Record<string, string> = { CRITICAL: 'bg-red-500', HIGH: 'bg-amber-500', MEDIUM: 'bg-blue-500', LOW: 'bg-gray-400' };
              return pct > 0 ? <div key={sev} className={`${colors[sev]} transition-all`} style={{ width: `${Math.max(pct, 5)}%` }} title={`${sev}: ${count}`} /> : null;
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-seal-gray-500 dark:text-slate-500">
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => (
              <span key={sev}>{sev}: {stats.bySeverity![sev] || 0}</span>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* Severity summary - clickable filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSeverityFilter(null)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              !severityFilter ? 'bg-seal-navy text-white dark:bg-primary' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'
            }`}
          >
            Toutes ({items.length})
          </button>
          <button
            onClick={() => setSeverityFilter(severityFilter === 'CRITICAL' ? null : 'CRITICAL')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              severityFilter === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Critique ({severityCounts.CRITICAL})
          </button>
          <button
            onClick={() => setSeverityFilter(severityFilter === 'HIGH' ? null : 'HIGH')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              severityFilter === 'HIGH' ? 'bg-amber-500 text-white' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Haute ({severityCounts.HIGH})
          </button>
          <button
            onClick={() => setSeverityFilter(severityFilter === 'MEDIUM' ? null : 'MEDIUM')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              severityFilter === 'MEDIUM' ? 'bg-blue-500 text-white' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Moyenne ({severityCounts.MEDIUM})
          </button>
          <button
            onClick={() => setSeverityFilter(severityFilter === 'LOW' ? null : 'LOW')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              severityFilter === 'LOW' ? 'bg-gray-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            Basse ({severityCounts.LOW})
          </button>
        </div>
      )}

      {/* Sources RSS — admin only collapsible section */}
      {isAdmin && (
        <Card>
          <CardContent className="py-3">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setSourcesOpen(o => !o)}
            >
              <div className="flex items-center gap-2">
                <Rss className="h-4 w-4 text-seal-navy dark:text-blue-400" />
                <span className="text-sm font-semibold text-seal-navy dark:text-white">Gérer les sources RSS</span>
              </div>
              {sourcesOpen ? <ChevronUp className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" /> : <ChevronDown className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />}
            </button>

            {sourcesOpen && (
              <div className="mt-4 space-y-4">
                {/* Seed button */}
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={handleSeedSources}>
                    <Plus className="h-3.5 w-3.5" /> Charger les sources par défaut
                  </Button>
                </div>

                {/* Sources list */}
                {sourcesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />)}
                  </div>
                ) : sources.length === 0 ? (
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-4">
                    Aucune source configurée. Cliquez sur &laquo;&nbsp;Charger les sources par défaut&nbsp;&raquo; pour commencer.
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-slate-700 border border-gray-100 dark:border-slate-700 rounded-lg overflow-hidden">
                    {sources.map(source => (
                      <div key={source.id} className={`flex items-center gap-3 px-3 py-2.5 ${source.isActive ? '' : 'opacity-50 bg-gray-50 dark:bg-slate-800/50'}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-seal-navy dark:text-white truncate">{source.name}</p>
                          <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 truncate">{source.url}</p>
                        </div>
                        <button
                          onClick={() => handleToggleSource(source)}
                          className="flex-shrink-0 text-seal-gray-500 hover:text-primary dark:text-slate-400 dark:hover:text-blue-400 transition"
                          title={source.isActive ? 'Désactiver' : 'Activer'}
                          aria-label={source.isActive ? 'Désactiver la source' : 'Activer la source'}
                        >
                          {source.isActive
                            ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                            : <ToggleLeft className="h-5 w-5" />}
                        </button>
                        <button
                          onClick={() => handleDeleteSource(source)}
                          className="flex-shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-400 transition"
                          title="Supprimer"
                          aria-label="Supprimer la source"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add source form */}
                <form onSubmit={handleAddSource} className="flex gap-2 flex-wrap pt-2 border-t border-gray-100 dark:border-slate-700">
                  <input
                    type="text"
                    placeholder="Nom de la source"
                    value={newSourceName}
                    onChange={e => setNewSourceName(e.target.value)}
                    className="flex-1 min-w-[140px] rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm px-3 py-1.5 text-seal-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <input
                    type="url"
                    placeholder="https://example.com/feed.xml"
                    value={newSourceUrl}
                    onChange={e => setNewSourceUrl(e.target.value)}
                    className="flex-[2] min-w-[200px] rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm px-3 py-1.5 text-seal-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <Button type="submit" loading={addingSource} size="sm">
                    <Plus className="h-4 w-4" /> Ajouter
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab switcher */}
      <Card>
        <Tabs
          tabs={[
            { id: 'alerts', label: 'Alertes' },
            { id: 'bulletins', label: 'Bulletins hebdo' },
          ]}
          activeTab={activeTab}
          onChange={(tab: string) => setActiveTab(tab as 'alerts' | 'bulletins')}
        />
      </Card>

      {/* Bulletins tab */}
      {activeTab === 'bulletins' && (
        <>
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={handleGenerate} loading={generating} variant="secondary">
                <Sparkles className="h-4 w-4" /> Générer un bulletin
              </Button>
            </div>
          )}

          {bulletinsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-card bg-gray-100 dark:bg-slate-800 shimmer" />
              ))}
            </div>
          ) : bulletins.length === 0 ? (
            <EmptyState
              type="general"
              title="Aucun bulletin hebdomadaire"
              description="Les bulletins synthétisent chaque semaine les alertes CERT-FR, ANSSI et NVD pour l'équipe. Générez le premier bulletin pour centraliser la veille cybersécurité d'OMNITECH."
              action={isAdmin ? <Button onClick={handleGenerate} loading={generating}><Sparkles className="h-4 w-4" /> Générer</Button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bulletins.map(bulletin => (
                <Card
                  key={bulletin.id}
                  hoverable
                  className="stagger-item"
                  onClick={() => handleSelectBulletin(bulletin)}
                >
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <Newspaper className="h-5 w-5 text-seal-navy dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-seal-navy dark:text-white line-clamp-2">{bulletin.title}</h3>
                        <div className="flex items-center gap-1.5 mt-2">
                          <Calendar className="h-3 w-3 text-seal-gray-500 dark:text-slate-400" />
                          <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                            {formatDate(bulletin.weekStart)} — {formatDate(bulletin.weekEnd)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <Badge variant="navy">{bulletin.itemCount} alerte{bulletin.itemCount > 1 ? 's' : ''}</Badge>
                      {bulletin.isPublished ? (
                        <Badge variant="approved">Publié</Badge>
                      ) : (
                        <Badge variant="warning">Brouillon</Badge>
                      )}
                    </div>
                    {bulletin.publishedAt && (
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-2">
                        Publié le {formatDate(bulletin.publishedAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Bulletin detail modal */}
          {selectedBulletin && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 overflow-y-auto bg-black/50" onClick={() => setSelectedBulletin(null)}>
              <div className="w-full max-w-4xl mx-4" onClick={(e) => e.stopPropagation()}>
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-medium text-seal-navy dark:text-white">{selectedBulletin.title}</h2>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                            {formatDate(selectedBulletin.weekStart)} — {formatDate(selectedBulletin.weekEnd)}
                          </span>
                          <Badge variant="navy">{selectedBulletin.itemCount} alerte{selectedBulletin.itemCount > 1 ? 's' : ''}</Badge>
                          {selectedBulletin.isPublished ? (
                            <Badge variant="approved">Publié</Badge>
                          ) : (
                            <Badge variant="warning">Brouillon</Badge>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedBulletin(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedBulletin.content) }}
                    />
                    {/* Linked veille items */}
                    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
                      <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-3">Alertes liées ({bulletinItems.length})</h3>
                      {bulletinItemsLoading ? (
                        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />)}</div>
                      ) : bulletinItems.length > 0 ? (
                        <div className="space-y-2">
                          {bulletinItems.map(item => (
                            <details key={item.id} className="group rounded-lg border border-gray-200 dark:border-slate-700">
                              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800">
                                {severityIcon(item.severity)}
                                <span className="text-xs font-semibold text-seal-navy dark:text-white flex-1 line-clamp-1">{item.title}</span>
                                {severityBadge(item.severity)}
                                {item.cveId && <Badge variant="error">{item.cveId}</Badge>}
                              </summary>
                              <div className="px-3 pb-3 text-xs text-seal-gray-500 dark:text-slate-400">
                                {item.description && <p className="mb-1">{item.description}</p>}
                                <div className="flex items-center gap-3 mt-1">
                                  <span>{formatDate(item.publishedAt)}</span>
                                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                    Source <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            </details>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-2">Aucune alerte liée trouvée</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* Alerts tab */}
      {activeTab === 'alerts' && (<>
      {/* Alertes critiques — priority section */}
      {(() => {
        const criticalUnprocessed = items.filter(item => item.severity === 'CRITICAL' && !item.isProcessed);
        if (criticalUnprocessed.length === 0) return null;
        return (
          <div className="rounded-xl border-2 border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-900/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertOctagon className="h-5 w-5 text-red-500" />
              <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
                Alertes critiques non traitées ({criticalUnprocessed.length})
              </h2>
            </div>
            <div className="space-y-2">
              {criticalUnprocessed.slice(0, 5).map(item => (
                <div key={item.id} className="flex flex-col sm:flex-row items-start gap-3 bg-white dark:bg-slate-900 rounded-lg border border-red-200 dark:border-red-800 p-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <AlertOctagon className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <Badge variant="error">Critique</Badge>
                        {item.cveId && <Badge variant="error">{item.cveId}</Badge>}
                        <Badge variant="navy">{item.sourceName}</Badge>
                      </div>
                      <h3 className="text-sm font-semibold text-seal-navy dark:text-white line-clamp-1">{item.title}</h3>
                      {item.description && <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-1 mt-0.5">{item.description}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">{formatDate(item.publishedAt)}</span>
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                          Voir <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                  {canAck && (
                    <div className="flex gap-1 flex-shrink-0 w-full sm:w-auto">
                      <Button size="sm" onClick={() => handleAck(item.id, 'APPLIED')} className="flex-1 sm:flex-initial min-h-[44px]">Appliqué</Button>
                      <Button size="sm" variant="outline" onClick={() => handleAck(item.id, 'NOT_APPLICABLE')} className="flex-1 sm:flex-initial min-h-[44px]">N/A</Button>
                    </div>
                  )}
                </div>
              ))}
              {criticalUnprocessed.length > 5 && (
                <p className="text-xs text-red-600 dark:text-red-400 text-center pt-1 font-medium">
                  + {criticalUnprocessed.length - 5} autre{criticalUnprocessed.length - 5 > 1 ? 's' : ''} alerte{criticalUnprocessed.length - 5 > 1 ? 's' : ''} critique{criticalUnprocessed.length - 5 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <SearchInput value={search} onChange={setSearch} placeholder="Rechercher CVE, titre, produit..." className="flex-1 min-w-0 sm:min-w-[200px]" />
            <Select
              options={[{ value: 'false', label: 'À traiter' }, { value: 'true', label: 'Traitées' }]}
              value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full sm:w-36"
            />
            <div className="flex items-center gap-1 border rounded-lg p-0.5 dark:border-slate-700">
              {([
                { id: 'week', label: '7 jours' },
                { id: 'month', label: '30 jours' },
                { id: 'all', label: 'Tout' },
              ] as const).map(p => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`px-2.5 py-1 text-[11px] rounded font-semibold transition ${period === p.id ? 'bg-primary text-white' : 'text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {/* Theme tags */}
          {themes.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={() => setThemeFilter('')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${!themeFilter ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}
              >
                Tous ({items.length})
              </button>
              {themes.map(([theme, count]) => (
                <button
                  key={theme}
                  onClick={() => setThemeFilter(themeFilter === theme ? '' : theme)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${themeFilter === theme ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}
                >
                  {theme} ({count})
                </button>
              ))}
            </div>
          )}
          {/* Product filter */}
          <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
            <Filter className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400 mt-0.5" />
            <button
              onClick={() => setProductFilter('')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${!productFilter ? 'bg-seal-navy text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}
            >
              Tous produits
            </button>
            {PRODUCTS.map(prod => {
              const count = items.filter(item => {
                const text = (item.title + ' ' + (item.description || '')).toLowerCase();
                return text.includes(prod.toLowerCase());
              }).length;
              if (count === 0 && productFilter !== prod) return null;
              return (
                <button
                  key={prod}
                  onClick={() => setProductFilter(productFilter === prod ? '' : prod)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${productFilter === prod ? 'bg-seal-navy text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}
                >
                  {prod} ({count})
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-card bg-gray-100 dark:bg-slate-800 shimmer" />)}</div>
      ) : filteredItems.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            type="general"
            title="Aucune alerte de veille"
            description={isAdmin
              ? "Lancez une collecte pour récupérer les dernières alertes CERT-FR, ANSSI et NVD."
              : "Les analystes cybersécurité publient ici les bulletins de veille et alertes critiques. Aucun contenu n\u2019est disponible pour le moment."}
            action={isAdmin ? (
              <Button onClick={handleFetch} loading={fetching} className="animate-fade-in-up">
                <Rss className="h-4 w-4" /> Lancer une collecte
              </Button>
            ) : undefined}
          />
        ) : (
          <EmptyState type="search" title="Aucune alerte pour ces crit\u00e8res" description="Aucune alerte de veille cybers\u00e9curit\u00e9 ne correspond aux filtres s\u00e9lectionn\u00e9s. Modifiez vos crit\u00e8res ou r\u00e9cup\u00e9rez les derniers flux CERT-FR et ANSSI."
            action={isAdmin ? <Button onClick={handleFetch} loading={fetching}><Rss className="h-4 w-4" /> Récupérer les flux</Button> : undefined} />
        )
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => {
            const sourceColor =
              item.sourceName.includes('CERT') ? 'bg-seal-bordeaux/10 text-seal-bordeaux dark:bg-red-900/20 dark:text-red-400' :
              item.sourceName.includes('ANSSI') ? 'bg-seal-blue/10 text-seal-blue dark:bg-blue-900/20 dark:text-blue-400' :
              item.sourceName.includes('CVE') ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
              item.sourceName.includes('NVD') ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
              'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400';
            return (
            <Card key={item.id} className={`stagger-item shadow-sm rounded-xl ${item.isProcessed ? 'opacity-50' : ''} ${item.severity === 'CRITICAL' ? 'border-l-4 border-l-red-500' : item.severity === 'HIGH' ? 'border-l-4 border-l-amber-400' : ''}`}>
              <CardContent className="py-2.5 px-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex-shrink-0">{severityIcon(item.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceColor}`}>
                        {item.sourceName}
                      </span>
                      {severityBadge(item.severity)}
                      {item.cveId && <Badge variant="error">{item.cveId}</Badge>}
                      {Date.now() - new Date(item.publishedAt).getTime() < 86400000 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Nouveau
                        </span>
                      )}
                      {item.isProcessed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium text-seal-navy dark:text-white hover:text-primary transition duration-200 line-clamp-1 block">
                      {item.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
                      <span>{formatRelativeTime(item.publishedAt)}</span>
                      {item.acks.length > 0 && item.acks.map(ack => (
                        <span key={ack.user.id} className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-2.5 w-2.5" /> {ack.user.firstName}
                        </span>
                      ))}
                    </div>
                  </div>
                  {canAck && !item.isProcessed && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleAck(item.id, 'APPLIED')}
                        className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition duration-200"
                        title="Marquer comme traite">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleAck(item.id, 'NOT_APPLICABLE')}
                        className="p-1.5 rounded-lg text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition duration-200"
                        title="Non applicable">
                        <X className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleAck(item.id, 'RISK_ACCEPTED')}
                        className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition duration-200"
                        title="Risque accepte">
                        <Shield className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}
