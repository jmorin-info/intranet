'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, Button, Badge, Select, EmptyState, ConfirmDialog } from '@omnitech/ui';
import { formatDateTime } from '@/lib/utils';
import { UserPlus, UserMinus, CheckCircle2, Circle, Users, Monitor, Shield, Mail, Key, Laptop, FolderOpen, BookOpen, ClipboardList, Search } from 'lucide-react';
import { ExportButton } from '@/components/ui/export-button';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';

interface PendingOnboarding {
  user: { id: string; firstName: string; lastName: string; email: string };
  steps: Array<{ id: string; stepName: string; description: string; isCompleted: boolean; completedAt: string | null; order: number; stepType: string }>;
}

const ONBOARDING_STEPS_TEMPLATE = [
  { key: 'account-created', label: 'Compte créé sur l\'intranet', auto: true, category: 'admin' },
  { key: 'ldap-synced', label: 'Compte synchronisé Active Directory', auto: true, category: 'it' },
  { key: 'mfa-configured', label: 'MFA (double authentification) activé', category: 'security' },
  { key: 'chartes-signed', label: 'Chartes IT signées', category: 'compliance' },
  { key: 'quiz-completed', label: 'Quiz de sensibilisation sécurité complété', category: 'training' },
  { key: 'department-assigned', label: 'Affecté à un département', category: 'admin' },
  { key: 'manager-assigned', label: 'Manager désigné', category: 'admin' },
  { key: 'welcome-read', label: 'Page d\'accueil consultée', auto: true, category: 'admin' },
  { key: 'first-login', label: 'Première connexion effectuée', auto: true, category: 'admin' },
  { key: 'profile-completed', label: 'Profil complété (photo, téléphone, poste)', category: 'profile' },
  { key: 'fileserver-access', label: 'Accès au serveur de fichiers vérifié', category: 'it' },
  { key: 'email-configured', label: 'Messagerie configurée', category: 'it' },
];

const CATEGORY_LABELS: Record<string, string> = {
  admin: 'Administration',
  security: 'Sécurité',
  compliance: 'Conformité',
  training: 'Formation',
  profile: 'Profil',
  it: 'Infrastructure IT',
};

const CATEGORY_COLORS: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  security: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  compliance: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  training: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  profile: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  it: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
};

const stepIcons: Record<string, React.ElementType> = {
  AD_ACCOUNT: Key,
  EMAIL: Mail,
  HARDWARE: Laptop,
  SOFTWARE: Monitor,
  SECURITY: Shield,
  ACCESS: FolderOpen,
  TRAINING: BookOpen,
  DOCUMENTATION: ClipboardList,
};

function getStepIcon(stepName: string): React.ElementType {
  const lower = stepName.toLowerCase();
  if (lower.includes('ad') || lower.includes('compte') || lower.includes('account')) return Key;
  if (lower.includes('mail') || lower.includes('email')) return Mail;
  if (lower.includes('matériel') || lower.includes('hardware') || lower.includes('poste')) return Laptop;
  if (lower.includes('logiciel') || lower.includes('software')) return Monitor;
  if (lower.includes('sécurité') || lower.includes('security') || lower.includes('antivirus')) return Shield;
  if (lower.includes('accès') || lower.includes('access') || lower.includes('droit')) return FolderOpen;
  if (lower.includes('formation') || lower.includes('training')) return BookOpen;
  if (lower.includes('document') || lower.includes('charte')) return ClipboardList;
  return Circle;
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [actionType, setActionType] = useState('ONBOARDING');
  const [offboardUser, setOffboardUser] = useState<PendingOnboarding | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPending = pending.filter(p =>
    p.user?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.user?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.user?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    Promise.allSettled([
      api.get('/onboarding/pending/all'),
      api.get('/users?limit=100'),
    ]).then(([pendingR, usersR]) => {
      if (pendingR.status === 'fulfilled') {
        const d = pendingR.value.data;
        setPending(Array.isArray(d) ? d : d?.data || []);
      } else console.error('Failed to load onboarding pending:', pendingR.reason);
      if (usersR.status === 'fulfilled') setUsers(usersR.value.data?.data || []);
      else console.error('Failed to load users:', usersR.reason);
    }).finally(() => setLoading(false));
  }, []);

  const handleStart = async () => {
    if (!selectedUser) { toast.error('Sélectionnez un utilisateur'); return; }
    try {
      await api.post(`/onboarding/${selectedUser}/start`, { type: actionType });
      toast.success(`${actionType === 'ONBOARDING' ? 'Onboarding lancé' : 'Offboarding lancé'}`);
      const { data } = await api.get('/onboarding/pending/all');
      setPending(Array.isArray(data) ? data : data?.data || []);
    } catch { toast.error('Erreur lors du lancement du processus'); }
  };

  const handleComplete = async (stepId: string) => {
    try {
      await api.patch(`/onboarding/steps/${stepId}/complete`, { completedBy: 'admin' });
      toast.success('Étape validée');
      const { data } = await api.get('/onboarding/pending/all');
      setPending(Array.isArray(data) ? data : data?.data || []);
    } catch { toast.error('Erreur lors de la validation de l\'étape'); }
  };

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title="Onboarding / Offboarding"
        subtitle="Suivi des arrivées et départs"
        icon={UserPlus}
        hub="admin"
        actions={
          <ExportButton
            filename="onboarding"
            rows={(pending || []) as unknown as Array<Record<string, unknown>>}
            columns={[
              { header: 'ID utilisateur', accessor: (r: any) => r?.user?.id || '' },
              { header: 'Prénom', accessor: (r: any) => r?.user?.firstName || '' },
              { header: 'Nom', accessor: (r: any) => r?.user?.lastName || '' },
              { header: 'Email', accessor: (r: any) => r?.user?.email || '' },
              { header: 'Type', accessor: (r: any) => (r?.steps?.some((s: any) => s?.stepType === 'OFFBOARDING') ? 'offboarding' : 'onboarding') },
              { header: 'Étapes totales', accessor: (r: any) => (Array.isArray(r?.steps) ? r.steps.length : 0) },
              { header: 'Étapes complétées', accessor: (r: any) => (Array.isArray(r?.steps) ? r.steps.filter((s: any) => s?.isCompleted).length : 0) },
              { header: 'Statut', accessor: (r: any) => (Array.isArray(r?.steps) && r.steps.every((s: any) => s?.isCompleted) ? 'Terminé' : 'En cours') },
            ]}
          />
        }
      />

      {/* Summary card */}
      {!loading && pending.length > 0 && (() => {
        const onboardingCount = pending.filter(p => p.steps.some(s => s.stepType === 'ONBOARDING') || !p.steps.some(s => s.stepType === 'OFFBOARDING')).length;
        const offboardingCount = pending.filter(p => p.steps.some(s => s.stepType === 'OFFBOARDING')).length;
        return (
          <Card className="border-l-4 border-l-primary animate-fade-in-up">
            <CardContent className="py-3 flex items-center gap-4">
              <Users className="h-5 w-5 text-primary flex-shrink-0" />
              <p className="text-sm text-navy dark:text-white">
                <span className="font-medium">{onboardingCount}</span> onboarding en cours, <span className="font-medium">{offboardingCount}</span> offboarding en cours
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* Start new process */}
      <Card>
        <CardHeader><h2 className="font-medium text-navy dark:text-white text-sm">Démarrer un processus</h2></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <Select
              label="Utilisateur"
              options={users.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
              placeholder="Sélectionner..."
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="flex-1"
            />
            <Select
              label="Type"
              options={[{ value: 'ONBOARDING', label: 'Arrivée (Onboarding)' }, { value: 'OFFBOARDING', label: 'Départ (Offboarding)' }]}
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-56"
            />
            <Button onClick={handleStart}>
              {actionType === 'ONBOARDING' ? <UserPlus className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
              Démarrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      {!loading && pending.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-up">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-navy dark:text-white">{pending.length}</p>
                <p className="text-xs text-seal-gray-500">En cours</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-navy dark:text-white">{pending.filter(p => p.steps.every(s => s.isCompleted)).length}</p>
                <p className="text-xs text-seal-gray-500">Terminés</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-navy dark:text-white">
                  {pending.length > 0 ? Math.round(pending.reduce((sum, p) => sum + (p.steps.length > 0 ? (p.steps.filter(s => s.isCompleted).length / p.steps.length) * 100 : 0), 0) / pending.length) : 0}%
                </p>
                <p className="text-xs text-seal-gray-500">Progression moyenne</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search filter */}
      {!loading && pending.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, prénom ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white py-2.5 pl-10 pr-4 text-sm placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      {/* Pending processes */}
      {loading ? (
        <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />)}</div>
      ) : filteredPending.length === 0 ? (
        <EmptyState type="users" title="Aucun processus en cours" description={searchTerm ? 'Aucun résultat pour cette recherche.' : 'Démarrez un onboarding ou offboarding ci-dessus.'} />
      ) : (
        <div className="space-y-4">
          {filteredPending.map(p => {
            const completedCount = p.steps.filter(s => s.isCompleted).length;
            const totalSteps = p.steps.length;
            const progress = totalSteps > 0 ? Math.round(completedCount / totalSteps * 100) : 0;
            const progressColor = progress === 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-500';

            return (
              <Card key={p.user.id} className="stagger-item">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F68D2E]/10">
                      <Users className="h-5 w-5 text-[#F68D2E]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-navy dark:text-white text-sm">{p.user.firstName} {p.user.lastName}</h3>
                      <p className="text-[10px] text-seal-gray-500">{p.user.email} — {p.steps[0]?.stepType || '?'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {progress < 100 && (
                        <>
                          <Button variant="outline" size="sm" onClick={async () => {
                            await api.post('/notifications', {
                              userId: p.user.id,
                              type: 'ACK_REQUIRED',
                              title: 'Rappel : étapes d\'intégration en attente',
                              body: `Il vous reste ${p.steps.filter((s: any) => !s.isCompleted).length} étape(s) à compléter dans votre processus d'intégration.`,
                              resourceType: 'Onboarding',
                            });
                            toast.success('Rappel envoyé');
                          }}>
                            <Mail className="h-3.5 w-3.5 mr-1" />
                            Rappeler
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => setOffboardUser(p)}>
                            <UserMinus className="h-3.5 w-3.5 mr-1" />
                            Offboarding
                          </Button>
                        </>
                      )}
                      <Badge variant={progress === 100 ? 'approved' : 'warning'}>
                        {completedCount}/{totalSteps} étapes
                      </Badge>
                    </div>
                  </div>
                  {/* Progress bar & estimated completion */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-seal-gray-500">Progression</span>
                      <div className="flex items-center gap-2">
                        {progress < 100 && totalSteps > 0 && completedCount > 0 && (
                          <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                            Fin estimée : ~{Math.ceil((totalSteps - completedCount) * 2)} jours
                          </span>
                        )}
                        <span className={`text-[10px] font-medium ${progress === 100 ? 'text-emerald-500' : 'text-navy dark:text-white'}`}>{progress}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {p.steps.sort((a, b) => a.order - b.order).map(step => {
                      const StepIcon = getStepIcon(step.stepName);
                      return (
                        <div key={step.id} className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          step.isCompleted
                            ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10'
                            : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/50'
                        }`}>
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${
                            step.isCompleted
                              ? 'bg-emerald-100 dark:bg-emerald-900/30'
                              : 'bg-gray-100 dark:bg-slate-700'
                          }`}>
                            {step.isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <StepIcon className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${step.isCompleted ? 'text-seal-gray-500 line-through' : 'font-medium text-navy dark:text-white'}`}>{step.stepName}</p>
                            {step.description && <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">{step.description}</p>}
                            {step.isCompleted && step.completedAt && (
                              <p className="text-[10px] text-emerald-500 mt-1">Fait le {formatDateTime(step.completedAt)}</p>
                            )}
                          </div>
                          {!step.isCompleted && (
                            <Button size="sm" variant="outline" onClick={() => handleComplete(step.id)} className="flex-shrink-0">Valider</Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Onboarding Steps Template Reference */}
      <Card>
        <CardHeader>
          <h2 className="font-medium text-navy dark:text-white text-sm">Checklist d&apos;intégration (modèle)</h2>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">Étapes standard pour chaque nouvel arrivant</p>
        </CardHeader>
        <CardContent>
          {/* Global progress bar for template overview */}
          {(() => {
            const categories = Object.keys(CATEGORY_LABELS);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((cat) => {
                  const catSteps = ONBOARDING_STEPS_TEMPLATE.filter((s) => s.category === cat);
                  if (catSteps.length === 0) return null;
                  return (
                    <div key={cat} className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                      <div className={`px-4 py-2.5 ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                        <span className="text-xs font-medium">{CATEGORY_LABELS[cat] || cat}</span>
                        <span className="text-xs ml-2 opacity-70">({catSteps.length} etape{catSteps.length > 1 ? 's' : ''})</span>
                      </div>
                      <div className="p-3 space-y-2">
                        {catSteps.map((s) => (
                          <div key={s.key} className="flex items-center gap-2.5">
                            <div className={`flex h-6 w-6 items-center justify-center rounded flex-shrink-0 ${
                              s.auto ? 'bg-emerald-100 dark:bg-emerald-900/20' : 'bg-gray-100 dark:bg-slate-700'
                            }`}>
                              {s.auto ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
                              )}
                            </div>
                            <span className="text-xs text-navy dark:text-white">{s.label}</span>
                            {s.auto && (
                              <Badge variant="approved" className="text-[9px] px-1.5 py-0">auto</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!offboardUser}
        onClose={() => setOffboardUser(null)}
        onConfirm={async () => {
          const u = offboardUser;
          setOffboardUser(null);
          if (!u) return;
          try {
            await api.post(`/onboarding/${u.user.id}/start`, { type: 'OFFBOARDING' });
            toast.success('Offboarding lancé');
            const { data } = await api.get('/onboarding/pending/all');
            setPending(Array.isArray(data) ? data : data?.data || []);
          } catch { toast.error('Erreur lors du lancement de l\'offboarding'); }
        }}
        title="Lancer l'offboarding"
        description={offboardUser ? `Lancer l'offboarding pour ${offboardUser.user.firstName} ${offboardUser.user.lastName} ?` : ''}
        confirmLabel="Lancer l'offboarding"
        variant="danger"
      />
    </div>
  );
}
