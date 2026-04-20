'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Dialog,
  Input,
  EmptyState,
} from '@omnitech/ui';
import {
  Layers,
  Plus,
  Shield,
  ChevronDown,
  ChevronRight,
  FileText,
  Sprout,
  Link2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Framework {
  id: string;
  name: string;
  version: string;
  description: string;
  isActive: boolean;
  _count: { controls: number };
}

interface FrameworkControl {
  id: string;
  code: string;
  title: string;
  titleFr: string | null;
  domain: string;
  description: string | null;
  mappedIsoCode: string | null;
  documentLinks: unknown[];
}

interface FrameworkDetail {
  framework: Framework;
  controls: FrameworkControl[];
}

interface FrameworkSummary {
  framework: Framework;
  total: number;
  covered: number;
  partial: number;
  uncovered: number;
  coveragePercent: number;
  byDomain: Record<string, { total: number; covered: number; partial: number; uncovered: number }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComplianceFrameworks() {
  const user = useAuthStore(s => s.user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [summaries, setSummaries] = useState<Record<string, FrameworkSummary>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, FrameworkDetail>>({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createVersion, setCreateVersion] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // ------- Fetch frameworks -------
  const fetchFrameworks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/frameworks');
      const list: Framework[] = Array.isArray(data) ? data : data?.data || [];
      setFrameworks(list);

      // Fetch summaries in parallel
      const entries = await Promise.all(
        list.map(async (fw) => {
          try {
            const { data: s } = await api.get(`/frameworks/${fw.id}/summary`);
            return [fw.id, s] as const;
          } catch {
            return null;
          }
        }),
      );
      const sumMap: Record<string, FrameworkSummary> = {};
      for (const entry of entries) {
        if (entry) sumMap[entry[0]] = entry[1];
      }
      setSummaries(sumMap);
    } catch {
      // graceful
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFrameworks();
  }, [fetchFrameworks]);

  // ------- Expand / collapse -------
  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);

    if (!details[id]) {
      try {
        const { data } = await api.get(`/frameworks/${id}`);
        setDetails((prev) => ({ ...prev, [id]: data }));
      } catch {
        toast.error('Impossible de charger les contrôles');
      }
    }
  };

  // ------- Seed -------
  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.post('/frameworks/seed');
      toast.success('Référentiels par défaut importés avec succès');
      await fetchFrameworks();
    } catch {
      toast.error("Erreur lors de l'import des référentiels");
    } finally {
      setSeeding(false);
    }
  };

  // ------- Create -------
  const handleCreate = async () => {
    if (!createName.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    setCreating(true);
    try {
      await api.post('/frameworks', {
        name: createName.trim(),
        version: createVersion.trim() || '1.0',
        description: createDescription.trim(),
      });
      toast.success('Référentiel créé avec succès');
      setShowCreate(false);
      setCreateName('');
      setCreateVersion('');
      setCreateDescription('');
      await fetchFrameworks();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  // ------- Coverage ring helper -------
  const CoverageRing = ({ percent, size = 80 }: { percent: number; size?: number }) => {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    const center = size / 2;

    return (
      <svg width={size} height={size} className="flex-shrink-0">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-gray-200 dark:text-slate-700"
          strokeWidth="8"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          className={percent >= 75 ? 'text-emerald-500' : percent >= 40 ? 'text-amber-400' : 'text-red-400'}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-sm font-semibold fill-navy dark:fill-white"
        >
          {percent}%
        </text>
      </svg>
    );
  };

  // ------- Group controls by domain -------
  const groupByDomain = (controls: FrameworkControl[]) => {
    const groups: Record<string, FrameworkControl[]> = {};
    for (const c of controls) {
      const d = c.domain || 'Autre';
      if (!groups[d]) groups[d] = [];
      groups[d].push(c);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  };

  // ------- Loading skeleton -------
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 rounded-card bg-gray-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-seal-navy dark:text-white">Référentiels de conformité</h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            Gestion des référentiels ISO 27001, NIST CSF, NIS2, ANSSI et autres cadres de conformité
          </p>
        </div>
        <div className="flex items-center gap-3">
          {frameworks.length === 0 && isSuperAdmin && (
            <Button variant="outline" onClick={handleSeed} loading={seeding} disabled={seeding}>
              <Sprout className="h-4 w-4" />
              Importer les référentiels par défaut
            </Button>
          )}
          {isSuperAdmin && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Nouveau référentiel
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {frameworks.length === 0 && (
        <EmptyState
          type="general"
          title="Aucun référentiel de conformité"
          description="Aucun référentiel n'a été configuré. Importez les référentiels par défaut (ISO 27001, NIST CSF, NIS2, ANSSI) pour démarrer le suivi de conformité."
          action={
            isSuperAdmin ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSeed} loading={seeding}>
                  <Sprout className="h-4 w-4" /> Importer les référentiels par défaut
                </Button>
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" /> Nouveau référentiel
                </Button>
              </div>
            ) : undefined
          }
        />
      )}

      {/* Framework cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {frameworks.map((fw) => {
          const summary = summaries[fw.id];
          const isExpanded = expandedId === fw.id;
          const detail = details[fw.id];
          const coveragePercent = summary?.coveragePercent ?? 0;

          return (
            <Card
              key={fw.id}
              className={`transition-all duration-200 ${isExpanded ? 'col-span-full ring-2 ring-primary/30' : 'hover:shadow-lg cursor-pointer'}`}
            >
              <CardHeader>
                <div
                  className="flex items-start gap-4 cursor-pointer"
                  onClick={() => toggleExpand(fw.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Réduire' : 'Développer'} ${fw.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(fw.id);
                    }
                  }}
                >
                  {/* Coverage ring */}
                  {summary && <CoverageRing percent={coveragePercent} />}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-medium text-seal-navy dark:text-white truncate">
                        {fw.name}
                      </h3>
                      <Badge variant={fw.isActive ? 'approved' : 'info'}>
                        {fw.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-2">
                      Version {fw.version}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-slate-300 line-clamp-2">
                      {fw.description}
                    </p>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-seal-gray-500 dark:text-slate-400">
                        <Shield className="h-3.5 w-3.5" />
                        <span className="font-semibold text-seal-navy dark:text-white">{fw._count.controls}</span> contrôles
                      </div>
                      {summary && (
                        <>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="text-emerald-600 font-semibold">{summary.covered}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            <span className="text-amber-600 font-semibold">{summary.partial}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="h-2 w-2 rounded-full bg-red-400" />
                            <span className="text-red-500 font-semibold">{summary.uncovered}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expand icon */}
                  <div className="flex-shrink-0 mt-1">
                    {isExpanded
                      ? <ChevronDown className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
                      : <ChevronRight className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
                    }
                  </div>
                </div>
              </CardHeader>

              {/* Expanded: controls grouped by domain */}
              {isExpanded && (
                <CardContent>
                  {/* Domain coverage bars */}
                  {summary && Object.keys(summary.byDomain).length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                      {Object.entries(summary.byDomain).map(([domain, stats]) => {
                        const pct = stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0;
                        const barColor = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
                        return (
                          <div key={domain} className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3">
                            <p className="text-xs font-semibold text-seal-navy dark:text-white truncate mb-1">{domain}</p>
                            <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                              <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 mt-1">
                              {stats.covered}/{stats.total} couverts ({pct}%)
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Controls list */}
                  {!detail ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <span className="ml-3 text-sm text-seal-gray-500 dark:text-slate-400">Chargement des contrôles...</span>
                    </div>
                  ) : detail.controls.length === 0 ? (
                    <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">
                      Aucun contrôle dans ce référentiel.
                    </p>
                  ) : (
                    <div className="space-y-6 max-h-[600px] overflow-y-auto">
                      {groupByDomain(detail.controls).map(([domain, controls]) => (
                        <div key={domain}>
                          <h4 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            {domain}
                            <Badge variant="info">{controls.length}</Badge>
                          </h4>
                          <div className="divide-y divide-gray-100 dark:divide-slate-700 rounded-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
                            {controls.map((ctrl) => (
                              <div
                                key={ctrl.id}
                                className="flex items-start gap-3 px-4 py-3 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                              >
                                <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">
                                  {ctrl.code}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-seal-navy dark:text-white">
                                    {ctrl.titleFr || ctrl.title}
                                  </p>
                                  {ctrl.titleFr && ctrl.title !== ctrl.titleFr && (
                                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">{ctrl.title}</p>
                                  )}
                                  {ctrl.description && (
                                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{ctrl.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {ctrl.mappedIsoCode && (
                                    <Badge variant="navy">
                                      <Link2 className="h-3 w-3 mr-1" />
                                      {ctrl.mappedIsoCode}
                                    </Badge>
                                  )}
                                  {ctrl.documentLinks.length > 0 && (
                                    <Badge variant="primary">
                                      <FileText className="h-3 w-3 mr-1" />
                                      {ctrl.documentLinks.length} doc{ctrl.documentLinks.length !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Create framework dialog */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouveau référentiel de conformité"
        description="Créez un nouveau référentiel pour suivre la conformité de votre organisation."
      >
        <div className="space-y-4">
          <Input
            label="Nom du référentiel"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Ex: ISO 27001, NIST CSF, NIS2, ANSSI..."
          />
          <Input
            label="Version"
            value={createVersion}
            onChange={(e) => setCreateVersion(e.target.value)}
            placeholder="Ex: 2.0"
          />
          <Input
            label="Description"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            placeholder="Description du référentiel..."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} loading={creating} disabled={creating}>
              <Plus className="h-4 w-4" />
              Créer
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
