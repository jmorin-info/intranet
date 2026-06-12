'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card, CardContent, CardHeader, Button, Badge, Dialog, Input, Textarea, Select, EmptyState,
} from '@omnitech/ui';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import {
  ClipboardList, Plus, CheckCircle2, AlertTriangle, Clock, Shield, Calendar, Filter, GripVertical,
  ChevronLeft, ChevronRight, Repeat,
} from 'lucide-react';

interface ComplianceTask {
  id: string;
  title: string;
  description: string | null;
  frequency: string;
  responsibleId: string | null;
  status: string;
  nextDueDate: string | null;
  lastCompletedAt: string | null;
  isoControl: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: string; color: string }> = {
  TODO: { label: 'À faire', variant: 'draft', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300' },
  IN_PROGRESS: { label: 'En cours', variant: 'info', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  COMPLETED: { label: 'Terminé', variant: 'success', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  OVERDUE: { label: 'En retard', variant: 'error', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'Mensuel',
  QUARTERLY: 'Trimestriel',
  SEMI_ANNUAL: 'Semestriel',
  ANNUAL: 'Annuel',
  ONE_TIME: 'Ponctuel',
};

function isOverdue(task: ComplianceTask): boolean {
  if (task.status === 'COMPLETED') return false;
  if (!task.nextDueDate) return false;
  return new Date(task.nextDueDate) < new Date();
}

function relativeDeadline(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < -30) return `il y a ${Math.abs(Math.round(diffDays / 30))} mois`;
  if (diffDays < -1) return `il y a ${Math.abs(diffDays)} jours`;
  if (diffDays === -1) return 'hier';
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return 'demain';
  if (diffDays < 30) return `dans ${diffDays} jours`;
  return `dans ${Math.round(diffDays / 30)} mois`;
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-600',
  IN_PROGRESS: 'bg-[#296DC1]/10 text-[#296DC1] dark:bg-[#296DC1]/20 dark:text-blue-300 border border-[#296DC1]/20',
  COMPLETED: 'bg-[#006233]/10 text-[#006233] dark:bg-[#006233]/20 dark:text-emerald-300 border border-[#006233]/20',
  OVERDUE: 'bg-[#892034]/10 text-[#892034] dark:bg-[#892034]/20 dark:text-red-300 border border-[#892034]/20',
};

export function CompliancePlanning() {
  const user = useAuthStore(s => s.user);
  const [tasks, setTasks] = useState<ComplianceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'timeline'>('list');
  const [form, setForm] = useState({
    title: '',
    description: '',
    frequency: 'ANNUAL',
    isoControl: '',
    nextDueDate: '',
  });

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const loadTasks = async () => {
    try {
      const { data } = await api.get('/compliance-tasks');
      setTasks(Array.isArray(data) ? data : data?.data || []);
    } catch {
      /* silent — empty state handles it */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Seed default tasks on first load if empty. Guarded by a ref to éviter un
  // boucle si /seed échoue et laisse tasks.length === 0 indéfiniment.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!loading && tasks.length === 0 && isAdmin) {
      seededRef.current = true;
      api.post('/compliance-tasks/seed').then(() => loadTasks()).catch(() => {});
    }
  }, [loading, tasks.length, isAdmin]);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // Mark overdue tasks visually
    result = result.map(t => ({
      ...t,
      status: isOverdue(t) && t.status !== 'COMPLETED' ? 'OVERDUE' : t.status,
    }));

    if (statusFilter) {
      result = result.filter(t => t.status === statusFilter);
    }

    // Sort by nextDueDate ascending (null at end)
    result.sort((a, b) => {
      if (!a.nextDueDate && !b.nextDueDate) return 0;
      if (!a.nextDueDate) return 1;
      if (!b.nextDueDate) return -1;
      return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();
    });

    return result;
  }, [tasks, statusFilter]);

  const stats = useMemo(() => {
    const all = tasks.map(t => ({
      ...t,
      status: isOverdue(t) && t.status !== 'COMPLETED' ? 'OVERDUE' : t.status,
    }));
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const dueThisMonth = all.filter(t => {
      if (!t.nextDueDate || t.status === 'COMPLETED') return false;
      const d = new Date(t.nextDueDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
    return {
      total: all.length,
      todo: all.filter(t => t.status === 'TODO').length,
      inProgress: all.filter(t => t.status === 'IN_PROGRESS').length,
      completed: all.filter(t => t.status === 'COMPLETED').length,
      overdue: all.filter(t => t.status === 'OVERDUE').length,
      dueThisMonth,
    };
  }, [tasks]);

  const handleComplete = async (id: string) => {
    try {
      await api.post(`/compliance-tasks/${id}/complete`);
      toast.success('Tâche marquée comme terminée');
      loadTasks();
    } catch {
      toast.error('Erreur');
    }
  };

  const handleCreate = async () => {
    const title = form.title.trim();
    if (title.length < 3) {
      toast.error('Le titre doit contenir au moins 3 caractères');
      return;
    }
    if (title.length > 160) {
      toast.error('Le titre est trop long (max 160 caractères)');
      return;
    }
    if (form.nextDueDate) {
      const d = new Date(form.nextDueDate);
      if (Number.isNaN(d.getTime())) {
        toast.error('Date d\'échéance invalide');
        return;
      }
      if (d.getTime() < Date.now() - 24 * 3600 * 1000) {
        toast.error('La date d\'échéance ne peut pas être dans le passé');
        return;
      }
    }
    setCreating(true);
    try {
      await api.post('/compliance-tasks', {
        title: form.title,
        description: form.description || undefined,
        frequency: form.frequency,
        isoControl: form.isoControl || undefined,
        nextDueDate: form.nextDueDate || undefined,
      });
      toast.success('Tâche créée');
      setShowCreate(false);
      setForm({ title: '', description: '', frequency: 'ANNUAL', isoControl: '', nextDueDate: '' });
      loadTasks();
    } catch {
      toast.error('Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/compliance-tasks/${id}`, { status: newStatus });
      toast.success('Statut mis à jour');
      loadTasks();
    } catch {
      toast.error('Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning de conformité"
        subtitle="Suivi des tâches récurrentes ISO 27001, NIS2 et ANSSI — PSSI, audits, revues et formations"
        icon={ClipboardList}
        hub="admin"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 border rounded-lg p-0.5 dark:border-slate-700">
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs rounded font-semibold transition ${viewMode === 'list' ? 'bg-primary text-white' : 'text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                Liste
              </button>
              <button onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 text-xs rounded font-semibold transition ${viewMode === 'kanban' ? 'bg-primary text-white' : 'text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                Kanban
              </button>
              <button onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 text-xs rounded font-semibold transition ${viewMode === 'timeline' ? 'bg-primary text-white' : 'text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                Calendrier
              </button>
            </div>
            {isAdmin && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Nouvelle tâche
              </Button>
            )}
          </div>
        }
      />

      {/* Monthly summary banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-seal-navy/10 bg-seal-navy/5 dark:bg-slate-800/60 px-4 py-3">
        <Calendar className="h-5 w-5 text-seal-navy dark:text-blue-400" />
        <span className="text-sm font-semibold text-seal-navy dark:text-white">Résumé :</span>
        <Badge variant="primary" className="px-3 py-1">
          <span className="font-semibold">{stats.dueThisMonth}</span>&nbsp;tâche{stats.dueThisMonth > 1 ? 's' : ''} à venir ce mois
        </Badge>
        {stats.overdue > 0 && (
          <Badge variant="error" className="px-3 py-1">
            <AlertTriangle className="h-3 w-3 mr-1" />
            <span className="font-semibold">{stats.overdue}</span>&nbsp;en retard
          </Badge>
        )}
        <Badge variant="success" className="px-3 py-1">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          <span className="font-semibold">{stats.completed}</span>&nbsp;complétée{stats.completed > 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-2xl font-medium text-seal-navy dark:text-white">{stats.total}</p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-2xl font-medium text-gray-600 dark:text-slate-300">{stats.todo}</p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">A faire</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-2xl font-medium text-blue-600">{stats.inProgress}</p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">En cours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-2xl font-medium text-emerald-600">{stats.completed}</p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">Terminés</p>
          </CardContent>
        </Card>
        <Card className={stats.overdue > 0 ? 'border-l-4 border-l-red-500' : ''}>
          <CardContent className="py-3">
            <p className="text-2xl font-medium text-red-600">{stats.overdue}</p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">En retard</p>
          </CardContent>
        </Card>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {[
          { value: '', label: 'Toutes' },
          { value: 'TODO', label: 'À faire' },
          { value: 'IN_PROGRESS', label: 'En cours' },
          { value: 'COMPLETED', label: 'Terminés' },
          { value: 'OVERDUE', label: 'En retard' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              statusFilter === tab.value
                ? 'bg-seal-navy text-white dark:bg-slate-600'
                : 'bg-gray-100 text-seal-gray-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {viewMode === 'list' && (
        <>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            type="general"
            title={statusFilter ? `Aucune tâche « ${STATUS_CONFIG[statusFilter]?.label || statusFilter} »` : 'Aucune tâche de conformité'}
            description={
              statusFilter
                ? 'Aucune tâche ne correspond au filtre sélectionné. Essayez un autre statut ou créez une nouvelle tâche.'
                : 'Aucune tâche récurrente n\'a été créée. Ajoutez des tâches ISO 27001, NIS2 ou ANSSI pour suivre vos obligations de conformité (revue PSSI, audits, sensibilisation...).'
            }
            action={
              isAdmin && !statusFilter ? (
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" /> Nouvelle tâche
                </Button>
              ) : statusFilter ? (
                <Button variant="outline" onClick={() => setStatusFilter('')}>
                  Voir toutes les tâches
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredTasks.map(task => {
              const overdue = task.status === 'OVERDUE';
              const cfg = (STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO)!;
              return (
                <Card
                  key={task.id}
                  className={`shadow-sm rounded-xl transition-colors duration-200 ${
                    overdue
                      ? 'border-l-4 border-l-[#892034] bg-red-50/50 dark:bg-red-900/10'
                      : task.status === 'COMPLETED'
                      ? 'border-l-4 border-l-[#006233] opacity-75'
                      : task.status === 'IN_PROGRESS'
                      ? 'border-l-4 border-l-[#296DC1]'
                      : ''
                  }`}
                >
                  <CardContent>
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 ${overdue ? 'text-red-500' : 'text-seal-navy dark:text-white'}`}>
                        {overdue ? (
                          <AlertTriangle className="h-5 w-5" />
                        ) : task.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <ClipboardList className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-seal-navy dark:text-white text-sm">{task.title}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors duration-200 ${STATUS_BADGE_STYLES[task.status] || STATUS_BADGE_STYLES.TODO}`}>
                            {cfg.label}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            {FREQUENCY_LABELS[task.frequency] || task.frequency}
                          </span>
                          {task.isoControl && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                              <Shield className="h-3 w-3" />
                              {task.isoControl}
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-xs text-gray-600 dark:text-slate-400 mb-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-seal-gray-500 dark:text-slate-400">
                          {task.nextDueDate && (
                            <span className={`flex items-center gap-1 ${overdue ? 'text-[#892034] dark:text-red-400 font-semibold' : ''}`}>
                              <Calendar className="h-3 w-3" />
                              {formatDate(task.nextDueDate)} ({relativeDeadline(task.nextDueDate)})
                            </span>
                          )}
                          {task.lastCompletedAt && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Dernière exécution : {formatDate(task.lastCompletedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {task.status !== 'COMPLETED' && isAdmin && (
                          <>
                            {task.status !== 'IN_PROGRESS' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(task.id, 'IN_PROGRESS')}
                              >
                                En cours
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleComplete(task.id)}
                            >
                              <CheckCircle2 className="h-3 w-3" /> Terminé
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </>
      )}

      {/* Kanban view */}
      {viewMode === 'kanban' && (
        <ComplianceKanbanBoard
          tasks={filteredTasks}
          allTasks={tasks}
          loading={loading}
          isAdmin={!!isAdmin}
          onStatusChange={handleStatusChange}
          onComplete={handleComplete}
        />
      )}

      {/* Timeline calendar view */}
      {viewMode === 'timeline' && (
        <ComplianceTimeline tasks={filteredTasks} loading={loading} />
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Nouvelle tâche de conformité">
        <div className="space-y-3">
          <Input
            label="Titre"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Revue des accès trimestrielle"
          />
          <Textarea
            label="Description (optionnel)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description de la tâche..."
          />
          <div>
            <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1.5">Fréquence</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, frequency: key })}
                  className={`px-3 py-2 rounded-lg border text-sm transition ${
                    form.frequency === key
                      ? 'border-seal-navy bg-seal-navy/5 dark:border-slate-400 dark:bg-slate-700 font-medium'
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="Contrôle ISO (optionnel)"
            value={form.isoControl}
            onChange={(e) => setForm({ ...form, isoControl: e.target.value })}
            placeholder="Ex: A.5.1"
          />
          <Input
            label="Prochaine échéance"
            type="date"
            value={form.nextDueDate}
            onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button onClick={handleCreate} loading={creating}>Créer la tâche</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/* ─────── Compliance Kanban Board with HTML5 Drag & Drop ─────── */

const COMPLIANCE_KANBAN_COLUMNS = [
  { status: 'TODO', label: 'À faire', color: 'border-t-gray-400', dropBg: 'bg-gray-50 dark:bg-gray-900/20' },
  { status: 'IN_PROGRESS', label: 'En cours', color: 'border-t-blue-500', dropBg: 'bg-blue-50 dark:bg-blue-900/20' },
  { status: 'COMPLETED', label: 'Terminé', color: 'border-t-emerald-500', dropBg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  { status: 'OVERDUE', label: 'En retard', color: 'border-t-red-500', dropBg: 'bg-red-50 dark:bg-red-900/20' },
];

interface ComplianceKanbanBoardProps {
  tasks: ComplianceTask[];
  allTasks: ComplianceTask[];
  loading: boolean;
  isAdmin: boolean;
  onStatusChange: (id: string, newStatus: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
}

function ComplianceKanbanBoard({ tasks, allTasks, loading, isAdmin, onStatusChange, onComplete }: ComplianceKanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  // Use the computed tasks (with OVERDUE status applied)
  const kanbanTasks = useMemo(() => {
    return tasks;
  }, [tasks]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (!isAdmin) { e.preventDefault(); return; }
    setDraggedId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => { if (el) el.style.opacity = '0.4'; });
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el) el.style.opacity = '1';
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(status);
  };

  const handleDragLeave = () => { setDropTarget(null); };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDropTarget(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = kanbanTasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;
    setMoving(taskId);
    if (newStatus === 'COMPLETED') {
      await onComplete(taskId);
    } else {
      // Map OVERDUE back to TODO for the API since OVERDUE is a derived state
      const apiStatus = newStatus === 'OVERDUE' ? 'TODO' : newStatus;
      await onStatusChange(taskId, apiStatus);
    }
    setMoving(null);
    setDraggedId(null);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COMPLIANCE_KANBAN_COLUMNS.map(col => (
          <div key={col.status} className="rounded-lg border-t-4 border-gray-200 p-3 min-h-[200px] bg-gray-50 dark:bg-slate-800/50">
            <div className="h-5 w-24 bg-gray-200 dark:bg-slate-700 rounded animate-pulse mb-3" />
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-24 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {COMPLIANCE_KANBAN_COLUMNS.map(col => {
        const colTasks = kanbanTasks.filter(t => t.status === col.status);
        const isOver = dropTarget === col.status && draggedId !== null;
        const draggedTask = draggedId ? kanbanTasks.find(t => t.id === draggedId) : null;
        const isDraggedFromHere = draggedTask?.status === col.status;

        return (
          <div
            key={col.status}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
            className={`rounded-lg border-t-4 ${col.color} p-3 min-h-[200px] transition-all duration-200 ${
              isOver && !isDraggedFromHere
                ? `${col.dropBg} ring-2 ring-primary/30 scale-[1.01]`
                : 'bg-gray-50 dark:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">{col.label}</h3>
              <Badge variant={col.status === 'OVERDUE' ? 'error' : 'navy'}>{colTasks.length}</Badge>
            </div>

            {isOver && !isDraggedFromHere && (
              <div className="border-2 border-dashed border-primary/40 rounded-lg p-3 mb-2 text-center">
                <p className="text-xs text-primary font-semibold">Déposer ici → {col.label}</p>
              </div>
            )}

            <div className="space-y-2">
              {colTasks.map(task => {
                const isDragged = draggedId === task.id;
                const isBeingMoved = moving === task.id;
                const overdue = task.status === 'OVERDUE';
                const cfg = (STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO)!;
                return (
                  <div
                    key={task.id}
                    draggable={isAdmin}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-lg p-3 shadow-sm border group transition-all duration-200 ${
                      overdue
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-700'
                    } ${
                      isDragged ? 'opacity-40 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'
                    } ${isBeingMoved ? 'animate-pulse' : ''} ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {isAdmin && (
                        <GripVertical className="h-3 w-3 text-seal-gray-500/30 group-hover:text-seal-gray-500/60 flex-shrink-0" />
                      )}
                      {overdue && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                      {overdue && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600 text-white animate-pulse">
                          En retard
                        </span>
                      )}
                    </div>
                    <p className={`text-xs font-semibold line-clamp-2 mb-2 ${overdue ? 'text-red-700 dark:text-red-400' : 'text-seal-navy dark:text-white'}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {FREQUENCY_LABELS[task.frequency] || task.frequency}
                      </span>
                      {task.isoControl && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          <Shield className="h-2.5 w-2.5" />
                          {task.isoControl}
                        </span>
                      )}
                    </div>
                    {task.nextDueDate && (
                      <div className={`flex items-center gap-1 text-[10px] ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-seal-gray-500 dark:text-slate-400'}`}>
                        <Calendar className="h-3 w-3" />
                        {formatDate(task.nextDueDate)}
                      </div>
                    )}
                  </div>
                );
              })}
              {colTasks.length === 0 && !isOver && (
                <p className="text-xs text-seal-gray-500 dark:text-slate-500 text-center py-8">Aucune tâche</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────── Compliance 12-Month Calendar Timeline ─────── */

const TIMELINE_STATUS_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  COMPLETED: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-400', dot: 'bg-emerald-500' },
  IN_PROGRESS: { bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-400', dot: 'bg-amber-500' },
  OVERDUE: { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-400', dot: 'bg-red-500' },
  TODO: { bg: 'bg-gray-100 dark:bg-gray-800/50', border: 'border-gray-300 dark:border-gray-600', dot: 'bg-gray-400' },
};

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

const FREQUENCY_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
  ONE_TIME: 0,
};

interface ComplianceTimelineProps {
  tasks: ComplianceTask[];
  loading: boolean;
}

function ComplianceTimeline({ tasks, loading }: ComplianceTimelineProps) {
  const now = new Date();
  const [yearOffset, setYearOffset] = useState(0);
  const baseYear = now.getFullYear() + yearOffset;

  // Build 12 months starting from January of baseYear. On extrait month/year
  // de `now` en primitives pour que useMemo recompute QUAND le mois ou l'annee
  // courante change (sinon `isCurrent` peut rester perime si la page reste
  // ouverte au passage d'un mois). `now` lui-meme est un nouvel objet a chaque
  // render et n'est pas une dep utile.
  const nowMonth = now.getMonth();
  const nowYear = now.getFullYear();
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(baseYear, i, 1);
      return {
        month: date.getMonth(),
        year: date.getFullYear(),
        label: MONTH_NAMES[date.getMonth()],
        fullLabel: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        isCurrent: date.getMonth() === nowMonth && date.getFullYear() === nowYear,
      };
    });
  }, [baseYear, nowMonth, nowYear]);

  // Generate repeating occurrences for each task across the 12-month window
  const taskOccurrences = useMemo(() => {
    const startWindow = new Date(baseYear, 0, 1);
    const endWindow = new Date(baseYear, 11, 31);

    return tasks.map(task => {
      const effectiveStatus = isOverdue(task) && task.status !== 'COMPLETED' ? 'OVERDUE' : task.status;
      const occurrences: Array<{ month: number; year: number; isPrimary: boolean }> = [];

      if (task.nextDueDate) {
        const due = new Date(task.nextDueDate);
        const freqMonths = FREQUENCY_MONTHS[task.frequency] || 0;

        if (freqMonths > 0) {
          // Generate repeating pattern: go backward and forward from nextDueDate
          for (let offset = -24; offset <= 24; offset++) {
            const occDate = new Date(due.getFullYear(), due.getMonth() + offset * freqMonths, due.getDate());
            if (occDate >= startWindow && occDate <= endWindow) {
              occurrences.push({
                month: occDate.getMonth(),
                year: occDate.getFullYear(),
                isPrimary: occDate.getMonth() === due.getMonth() && occDate.getFullYear() === due.getFullYear(),
              });
            }
          }
        } else {
          // One-time: show only if within window
          if (due >= startWindow && due <= endWindow) {
            occurrences.push({
              month: due.getMonth(),
              year: due.getFullYear(),
              isPrimary: true,
            });
          }
        }
      }

      return { task, effectiveStatus, occurrences };
    });
  }, [tasks, baseYear]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        type="general"
        title="Aucune tâche à afficher sur le calendrier"
        description="Créez des tâches de conformité avec des échéances pour les voir apparaître sur la timeline."
      />
    );
  }

  return (
    <Card>
      <CardContent>
        {/* Year navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setYearOffset(prev => prev - 1)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
          >
            <ChevronLeft className="h-4 w-4" /> Precedent
          </button>
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
            Calendrier {baseYear}
          </h3>
          <button
            onClick={() => setYearOffset(prev => prev + 1)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
          >
            Suivant <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Timeline grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Month headers */}
            <div className="grid grid-cols-[220px_repeat(12,1fr)] gap-0 mb-1">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">
                Tache
              </div>
              {months.map((m, i) => (
                <div
                  key={i}
                  className={`px-1 py-1.5 text-center text-[10px] font-semibold uppercase transition-colors ${
                    m.isCurrent
                      ? 'text-primary bg-primary/5 dark:bg-primary/10 rounded-t-lg'
                      : 'text-seal-gray-500 dark:text-slate-400'
                  }`}
                >
                  {m.label}
                  {m.isCurrent && (
                    <div className="h-0.5 bg-primary rounded-full mt-0.5 mx-1" />
                  )}
                </div>
              ))}
            </div>

            {/* Task rows */}
            <div className="space-y-0.5">
              {taskOccurrences.map(({ task, effectiveStatus, occurrences }) => {
                const defaultColors = { bg: 'bg-gray-100 dark:bg-gray-800/50', border: 'border-gray-300 dark:border-gray-600', dot: 'bg-gray-400' };
                const colors = TIMELINE_STATUS_COLORS[effectiveStatus] ?? defaultColors;
                return (
                  <div
                    key={task.id}
                    className="grid grid-cols-[220px_repeat(12,1fr)] gap-0 group hover:bg-gray-50 dark:hover:bg-slate-800/30 rounded-lg transition-colors"
                  >
                    {/* Task label */}
                    <div className="flex items-center gap-2 px-2 py-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-seal-navy dark:text-white truncate" title={task.title}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {task.frequency !== 'ONE_TIME' && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-purple-600 dark:text-purple-400">
                              <Repeat className="h-2.5 w-2.5" />
                              {FREQUENCY_LABELS[task.frequency]}
                            </span>
                          )}
                          {task.isoControl && (
                            <span className="text-[9px] text-indigo-600 dark:text-indigo-400">
                              {task.isoControl}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Month cells */}
                    {months.map((m, i) => {
                      const occ = occurrences.find(o => o.month === m.month && o.year === m.year);
                      return (
                        <div
                          key={i}
                          className={`relative flex items-center justify-center py-2 border-l border-gray-100 dark:border-slate-800 ${
                            m.isCurrent ? 'bg-primary/[0.03] dark:bg-primary/[0.05]' : ''
                          }`}
                        >
                          {occ ? (
                            <div
                              className={`w-full mx-0.5 h-6 rounded-md border flex items-center justify-center transition-transform group-hover:scale-105 ${colors.bg} ${colors.border} ${
                                !occ.isPrimary ? 'opacity-50 border-dashed' : ''
                              }`}
                              title={`${task.title} - ${STATUS_CONFIG[effectiveStatus]?.label || effectiveStatus}${
                                task.nextDueDate ? ` (echeance: ${formatDate(task.nextDueDate)})` : ''
                              }${!occ.isPrimary ? ' (recurrence)' : ''}`}
                            >
                              {occ.isPrimary ? (
                                effectiveStatus === 'COMPLETED' ? (
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                ) : effectiveStatus === 'OVERDUE' ? (
                                  <AlertTriangle className="h-3 w-3 text-red-600" />
                                ) : effectiveStatus === 'IN_PROGRESS' ? (
                                  <Clock className="h-3 w-3 text-amber-600" />
                                ) : (
                                  <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                                )
                              ) : (
                                <Repeat className="h-2.5 w-2.5 text-gray-400 dark:text-slate-500" />
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
          <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">Legende :</span>
          {Object.entries(TIMELINE_STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm border ${colors.bg} ${colors.border}`} />
              <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                {STATUS_CONFIG[status]?.label || status}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border border-dashed border-gray-300 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
              <Repeat className="h-2 w-2 text-gray-400 dark:text-slate-500" />
            </div>
            <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">Recurrence</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
