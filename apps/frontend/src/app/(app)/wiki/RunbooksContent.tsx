'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { Card, CardContent, CardHeader, Badge, SearchInput, EmptyState, Button, Dialog, Input, Textarea, Select } from '@omnitech/ui';
import { BookOpen, Play, CheckCircle2, ChevronRight, Clock, User, Filter, Plus, Edit, Save, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

interface Runbook {
  id: string; title: string; slug: string; description: string | null;
  category: string | null; version: string; isPublished: boolean;
  content?: string;
  createdAt?: string;
  author?: { firstName: string; lastName: string } | null;
}

const CATEGORY_FILTERS = ['Tous', 'Infrastructure', 'Sécurité', 'Réseau', 'Active Directory', 'Poste de travail'] as const;

interface RunbookTemplate {
  title: string;
  slug: string;
  description: string;
  category: string;
  steps: string[];
}

const RUNBOOK_TEMPLATES: RunbookTemplate[] = [
  {
    title: 'Procédure incident majeur',
    slug: 'incident-majeur',
    description: 'Gestion d\'un incident de production critique — déclaration, communication, remédiation.',
    category: 'Sécurité',
    steps: [
      'Déclarer l\'incident dans l\'outil de ticketing avec sévérité P1',
      'Alerter le RSSI et l\'astreinte technique via Teams',
      'Créer un canal de crise dédié et convoquer la cellule',
      'Isoler les systèmes impactés (si compromission suspectée)',
      'Collecter les logs et preuves forensiques',
      'Appliquer la remédiation validée par le RSSI',
      'Rédiger le rapport post-mortem sous 48h',
    ],
  },
  {
    title: 'Reboot serveur planifié',
    slug: 'reboot-serveur',
    description: 'Redémarrage contrôlé d\'un serveur de production avec vérifications avant / après.',
    category: 'Infrastructure',
    steps: [
      'Vérifier la fenêtre de maintenance avec le métier',
      'Notifier les utilisateurs impactés 24h avant',
      'Sauvegarder l\'état actuel (snapshot VM / dump config)',
      'Basculer le trafic sur le nœud secondaire',
      'Exécuter shutdown -r now sur le serveur cible',
      'Vérifier le redémarrage des services critiques',
      'Rebasculer le trafic et clôturer le ticket',
    ],
  },
  {
    title: 'Audit sécurité trimestriel',
    slug: 'audit-trimestriel',
    description: 'Contrôles SMSI récurrents : revue des accès, CVE, sauvegardes et journaux.',
    category: 'Sécurité',
    steps: [
      'Extraire la liste des utilisateurs actifs et comparer au référentiel RH',
      'Revoir les accès privilégiés (admins, SSH, bastions)',
      'Scanner les CVE critiques ouvertes (Nessus / OpenVAS)',
      'Vérifier la réussite des sauvegardes des 90 derniers jours',
      'Échantillonner 10 journaux SIEM pour traçabilité ISO A.8.15',
      'Compiler les écarts et ouvrir les tickets de remédiation',
    ],
  },
  {
    title: 'Restauration d\'une sauvegarde',
    slug: 'restauration-sauvegarde',
    description: 'Procédure de restore depuis la baie de sauvegarde Veeam.',
    category: 'Infrastructure',
    steps: [
      'Identifier la donnée à restaurer (date, chemin, taille)',
      'Obtenir la validation du propriétaire de la donnée',
      'Ouvrir la console Veeam et localiser le point de restauration',
      'Choisir la cible (emplacement original ou alternatif)',
      'Lancer la restauration et surveiller la progression',
      'Vérifier l\'intégrité du fichier restauré',
      'Documenter l\'opération dans le runbook d\'exploitation',
    ],
  },
];

function getStepCount(content?: string): number {
  if (!content) return 0;
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function isNewRunbook(createdAt?: string): boolean {
  if (!createdAt) return false;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return new Date(createdAt).getTime() > sevenDaysAgo;
}

const getStoredProgress = (runbookId: string): Set<number> => {
  try {
    const stored = localStorage.getItem(`runbook_progress_${runbookId}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
};

const saveProgress = (runbookId: string, steps: Set<number>) => {
  localStorage.setItem(`runbook_progress_${runbookId}`, JSON.stringify([...steps]));
};

const estimateTime = (stepCount: number): string => {
  const minutes = Math.max(5, stepCount * 3);
  if (minutes >= 60) return `~${Math.round(minutes / 60)}h`;
  return `~${minutes} min`;
};

interface ExecutionStep {
  title: string;
  description?: string;
}

export function RunbooksContent({ onCount }: { onCount?: (count: number) => void } = {}) {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('Tous');
  const [executingRunbook, setExecutingRunbook] = useState<Runbook | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [executionHistory, setExecutionHistory] = useState<Array<{ id: string; startedAt: string; completedAt?: string; status: string; executedBy?: { firstName: string; lastName: string } }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', slug: '', description: '', category: 'Infrastructure', content: '' });
  const [creating, setCreating] = useState(false);
  const [execCounts, setExecCounts] = useState<Record<string, number>>({});
  const [editingRunbook, setEditingRunbook] = useState<Runbook | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '', content: '' });
  const [saving, setSaving] = useState(false);

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const openEdit = async (rb: Runbook) => {
    let runbook = rb;
    if (!rb.content) {
      try {
        const { data } = await api.get(`/runbooks/${rb.id}`);
        runbook = data;
      } catch { /* use what we have */ }
    }
    let stepsText = '';
    try {
      const parsed = JSON.parse(runbook.content || '[]');
      stepsText = (Array.isArray(parsed) ? parsed : []).map((s: string | { title?: string }) => typeof s === 'string' ? s : s.title || '').join('\n');
    } catch { stepsText = ''; }
    setEditForm({
      title: runbook.title,
      description: runbook.description || '',
      category: runbook.category || '',
      content: stepsText,
    });
    setEditingRunbook(runbook);
  };

  const handleSaveEdit = async () => {
    if (!editingRunbook || !editForm.title) { toast.error('Titre requis'); return; }
    setSaving(true);
    try {
      const steps = editForm.content.split('\n').filter(l => l.trim()).map(l => ({ title: l.trim() }));
      await api.patch(`/runbooks/${editingRunbook.id}`, {
        title: editForm.title,
        description: editForm.description || null,
        category: editForm.category || null,
        content: JSON.stringify(steps),
      });
      toast.success('Runbook mis à jour');
      setEditingRunbook(null);
      const { data } = await api.get('/runbooks');
      setRunbooks(Array.isArray(data) ? data : data?.data || []);
    } catch { toast.error('Erreur lors de la mise à jour'); }
    finally { setSaving(false); }
  };

  const handleCreateRunbook = async () => {
    if (!createForm.title || !createForm.slug) { toast.error('Titre et slug requis'); return; }
    setCreating(true);
    try {
      const steps = createForm.content.split('\n').filter(l => l.trim()).map(l => ({ title: l.trim() }));
      await api.post('/runbooks', {
        title: createForm.title,
        slug: createForm.slug.toLowerCase().replace(/\s+/g, '-'),
        description: createForm.description,
        category: createForm.category,
        content: JSON.stringify(steps),
      });
      toast.success('Runbook créé');
      setShowCreate(false);
      setCreateForm({ title: '', slug: '', description: '', category: 'Infrastructure', content: '' });
      const { data } = await api.get('/runbooks');
      setRunbooks(Array.isArray(data) ? data : data?.data || []);
    } catch { toast.error('Erreur lors de la création'); }
    finally { setCreating(false); }
  };

  useEffect(() => {
    api.get('/runbooks').then(({ data }) => {
      const rbList: Runbook[] = Array.isArray(data) ? data : data?.data || [];
      setRunbooks(rbList);
      onCount?.(rbList.length);
      // Fetch execution counts for each runbook
      rbList.forEach(rb => {
        api.get(`/runbooks/${rb.id}/executions`).then(({ data: execs }) => {
          const count = Array.isArray(execs) ? execs.length : 0;
          setExecCounts(prev => ({ ...prev, [rb.id]: count }));
        }).catch(() => {});
      });
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = runbooks.filter(r => {
    const matchesSearch = !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'Tous' || r.category?.toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const handleExecute = async (rb: Runbook) => {
    try {
      // Fetch full runbook details if content not present
      let runbook = rb;
      if (!rb.content) {
        try {
          const { data } = await api.get(`/runbooks/${rb.id}`);
          runbook = data;
        } catch {
          // fallback to what we have
        }
      }

      let steps: ExecutionStep[] = [];
      try {
        const parsed = JSON.parse(runbook.content || '[]');
        steps = Array.isArray(parsed) ? parsed.map((s: string | { title?: string; description?: string }) => typeof s === 'string' ? { title: s } : { title: s.title || '', description: s.description }) : [];
      } catch {
        steps = [{ title: 'Exécuter le runbook', description: runbook.description || undefined }];
      }

      setExecutingRunbook(runbook);
      setExecutionSteps(steps);
      setCompletedSteps(getStoredProgress(runbook.id));

      // Fetch execution history
      setLoadingHistory(true);
      api.get(`/runbooks/${rb.id}/executions`).then(({ data }) => {
        setExecutionHistory(Array.isArray(data) ? data.slice(0, 5) : []);
      }).catch(() => setExecutionHistory([])).finally(() => setLoadingHistory(false));

      // Notify backend of execution start
      try {
        await api.post(`/runbooks/${rb.id}/execute`);
      } catch {
        // Non-blocking — backend may not have this endpoint yet
      }
    } catch {
      // fallback
    }
  };

  const toggleStep = (idx: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      if (executingRunbook) saveProgress(executingRunbook.id, next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Nouveau runbook
          </Button>
        )}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder={t('runbooks.searchPlaceholder')} />

      {/* Category filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
              categoryFilter === cat
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {executingRunbook && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-seal-navy dark:text-white">{executingRunbook.title}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-seal-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {estimateTime(executionSteps.length)}
                </span>
                <span className="text-xs text-seal-gray-500">{completedSteps.size}/{executionSteps.length} {t('runbooks.steps')}</span>
                <Button variant="ghost" size="sm" onClick={() => setExecutingRunbook(null)}>{t('runbooks.close')}</Button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full mt-2">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${executionSteps.length > 0 ? (completedSteps.size / executionSteps.length) * 100 : 0}%` }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {executionSteps.map((step, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${completedSteps.has(i) ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-slate-800'}`}>
                  <button
                    onClick={() => toggleStep(i)}
                    className={`mt-0.5 h-5 w-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${completedSteps.has(i) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-slate-600'}`}
                  >
                    {completedSteps.has(i) && <CheckCircle2 className="h-3 w-3" />}
                  </button>
                  <div>
                    <p className={`text-sm font-semibold ${completedSteps.has(i) ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-seal-navy dark:text-white'}`}>
                      {t('runbooks.step')} {i + 1}: {step.title || String(step)}
                    </p>
                    {step.description && <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">{step.description}</p>}
                  </div>
                </div>
              ))}
            </div>
            {completedSteps.size === executionSteps.length && executionSteps.length > 0 && (
              <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t('runbooks.executionComplete')}</p>
                <p className="text-xs text-seal-gray-500">{new Date().toLocaleString('fr-FR')}</p>
              </div>
            )}
            {/* Dernières exécutions */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
              <h3 className="text-xs font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-seal-gray-500" />
                Dernières exécutions
              </h3>
              {loadingHistory ? (
                <div className="flex gap-2 items-center text-xs text-seal-gray-500">
                  <div className="h-3 w-3 border-2 border-seal-gray-500/30 border-t-taupe rounded-full animate-spin" />
                  Chargement...
                </div>
              ) : executionHistory.length > 0 ? (
                <div className="space-y-1.5">
                  {executionHistory.map((exec) => (
                    <div key={exec.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-gray-50 dark:bg-slate-800">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${exec.status === 'COMPLETED' ? 'bg-emerald-500' : exec.status === 'RUNNING' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}`} />
                      <span className="text-seal-navy dark:text-white font-medium">
                        {new Date(exec.startedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {exec.executedBy && (
                        <span className="text-seal-gray-500 dark:text-slate-400">
                          par {exec.executedBy.firstName} {exec.executedBy.lastName}
                        </span>
                      )}
                      <span className={`ml-auto font-semibold ${exec.status === 'COMPLETED' ? 'text-emerald-600 dark:text-emerald-400' : exec.status === 'RUNNING' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {exec.status === 'COMPLETED' ? 'Terminé' : exec.status === 'RUNNING' ? 'En cours' : exec.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-seal-gray-500 dark:text-slate-500 italic">Aucune exécution précédente</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-6">
          <EmptyState type="documents" title={t('runbooks.empty')} description={t('runbooks.emptyDescription')} />
          {isAdmin && runbooks.length === 0 && (
            <div className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-1">Templates prêts à l'emploi</h3>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-4">
                Démarrez rapidement avec ces procédures courantes. Cliquez pour pré-remplir la création d'un runbook.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {RUNBOOK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.slug}
                    onClick={() => {
                      setCreateForm({
                        title: tpl.title,
                        slug: tpl.slug,
                        description: tpl.description,
                        category: tpl.category,
                        content: tpl.steps.join('\n'),
                      });
                      setShowCreate(true);
                    }}
                    className="text-left rounded-xl border border-gray-100 dark:border-slate-700 p-3 hover:border-primary hover:bg-primary/5 transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-seal-navy dark:text-white">{tpl.title}</h4>
                      <Badge variant="navy">{tpl.category}</Badge>
                    </div>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2">{tpl.description}</p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1.5">
                      {tpl.steps.length} étapes
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(rb => (
            <Card key={rb.id} hoverable className="stagger-item">
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-seal-navy dark:text-white text-sm">{rb.title}</h3>
                      {isNewRunbook(rb.createdAt) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F9964A]/15 text-[#c46714] border border-[#F9964A]/30 dark:bg-[#F9964A]/20 dark:text-[#FBC078] dark:border-[#F9964A]/40">
                          Nouveau
                        </span>
                      )}
                      {rb.category && <Badge variant="navy">{rb.category}</Badge>}
                      <Badge variant="info">v{rb.version}</Badge>
                      {getStepCount(rb.content) > 0 && (
                        <Badge variant="draft">
                          <ListChecks className="h-3 w-3" />
                          {getStepCount(rb.content)} étape{getStepCount(rb.content) > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {execCounts[rb.id] !== undefined && (
                        <Badge variant={execCounts[rb.id]! > 0 ? 'success' : 'warning'}>
                          <Play className="h-3 w-3" />
                          {execCounts[rb.id]!} exécution{execCounts[rb.id]! !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    {rb.description && <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{rb.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-seal-gray-500 dark:text-slate-500">
                      {rb.author && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {rb.author.firstName} {rb.author.lastName}
                        </span>
                      )}
                      {rb.createdAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(rb.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" onClick={() => handleExecute(rb)}>
                      <Play className="h-3 w-3" /> {t('runbooks.execute')}
                    </Button>
                    <Link href={`/runbooks/${rb.slug}`}>
                      <Button size="sm" variant="outline" className="w-full">
                        <ChevronRight className="h-3 w-3" /> Ouvrir
                      </Button>
                    </Link>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(rb)}>
                        <Edit className="h-3 w-3" /> Editer
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create runbook dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau runbook">
        <div className="space-y-3">
          <Input label="Titre" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Procédure de restauration VM" />
          <Input label="Slug (URL)" value={createForm.slug} onChange={e => setCreateForm(f => ({ ...f, slug: e.target.value }))} placeholder="restauration-vm" />
          <Input label="Catégorie" value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))} placeholder="Infrastructure, Sécurité, Réseau..." />
          <Textarea label="Description" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Description courte du runbook" />
          <Textarea label="Étapes (une par ligne)" value={createForm.content} onChange={e => setCreateForm(f => ({ ...f, content: e.target.value }))} placeholder={"Étape 1 : Ouvrir la console Veeam\nÉtape 2 : Sélectionner la VM\nÉtape 3 : Lancer la restauration"} rows={6} />
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button onClick={handleCreateRunbook} loading={creating}>
              <Save className="h-4 w-4" /> Créer
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit runbook dialog */}
      <Dialog open={!!editingRunbook} onClose={() => setEditingRunbook(null)} title="Modifier le runbook">
        <div className="space-y-3">
          <Input label="Titre" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
          <Input label="Catégorie" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} placeholder="Infrastructure, Sécurité, Réseau..." />
          <Textarea label="Description" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Description courte du runbook" />
          <Textarea label="Étapes (une par ligne)" value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} rows={6} />
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => setEditingRunbook(null)}>Annuler</Button>
            <Button onClick={handleSaveEdit} loading={saving}>
              <Save className="h-4 w-4" /> Enregistrer
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
