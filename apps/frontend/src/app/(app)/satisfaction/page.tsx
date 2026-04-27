'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card, CardContent, CardHeader, CardFooter, Button, Badge, Dialog, Input, Textarea, EmptyState, Select, ConfirmDialog,
} from '@omnitech/ui';
import {
  Star, Plus, BarChart3, MessageSquare, Users, Calendar, Trash2, GripVertical,
  CheckCircle2, Type, ListChecks, Sliders, ToggleLeft, ChevronDown, ChevronUp, Eye, Send, Edit,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { PageHeader } from '@/components/layout/page-header';

interface SurveyQuestion {
  id: string;
  label: string;
  type: 'rating' | 'text' | 'choice' | 'scale' | 'yesno';
  options: string | null;
  isRequired: boolean;
  order: number;
  description: string | null;
}

interface Survey {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  isAnonymous: boolean;
  expiresAt: string | null;
  _count: { responses: number };
  questions?: SurveyQuestion[];
}

interface GlobalStats {
  globalAverage: number;
  totalSurveys: number;
  totalResponses: number;
  surveys: Array<{ id: string; title: string; responses: number; avg: number; isActive: boolean }>;
}

interface ResponseRateData {
  totalActiveUsers: number;
  surveys: Array<{ surveyId: string; title: string; responses: number; totalUsers: number; rate: number }>;
}

const QUESTION_TYPES = [
  { value: 'rating', label: 'Note (1-5 étoiles)', icon: Star },
  { value: 'text', label: 'Texte libre', icon: Type },
  { value: 'choice', label: 'Choix multiple', icon: ListChecks },
  { value: 'scale', label: 'Échelle (1-10)', icon: Sliders },
  { value: 'yesno', label: 'Oui / Non', icon: ToggleLeft },
];

// ── NPS Gauge (CSS-only) ───────────────────────────────
function NpsGauge({ score }: { score: number }) {
  // NPS ranges from -100 to 100
  const clamped = Math.max(-100, Math.min(100, score));
  const pct = ((clamped + 100) / 200) * 100;
  const color = clamped >= 50 ? '#22c55e' : clamped >= 0 ? '#eab308' : clamped >= -50 ? '#f97316' : '#ef4444';
  const label = clamped >= 50 ? 'Excellent' : clamped >= 0 ? 'Bon' : clamped >= -50 ? 'A ameliorer' : 'Critique';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-32 h-16 overflow-hidden">
        {/* Background arc */}
        <div className="absolute inset-0 rounded-t-full border-[12px] border-b-0 border-gray-200 dark:border-slate-700" />
        {/* Colored arc via conic-gradient */}
        <div
          className="absolute inset-0 rounded-t-full border-[12px] border-b-0 transition-all duration-700"
          style={{
            borderColor: color,
            clipPath: `polygon(0 100%, 0 0, ${pct}% 0, ${pct}% 100%)`,
          }}
        />
        {/* Needle */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom w-0.5 h-12 rounded-full bg-seal-navy dark:bg-white transition-transform duration-700"
          style={{ transform: `translateX(-50%) rotate(${(pct / 100) * 180 - 90}deg)` }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-seal-navy dark:bg-white" />
      </div>
      <span className="text-lg font-bold text-seal-navy dark:text-white">{clamped > 0 ? '+' : ''}{clamped}</span>
      <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Star Distribution Bars (CSS-only) ──────────────────
function StarDistribution({ distribution }: { distribution: Array<{ value: number; count: number }> }) {
  const total = distribution.reduce((s, d) => s + d.count, 0);
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map(n => {
        const d = distribution.find(x => x.value === n);
        const count = d?.count || 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={n} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-right text-seal-gray-500 dark:text-slate-400 font-medium">{n}</span>
            <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0" />
            <div className="flex-1 h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-right text-seal-gray-500 dark:text-slate-400 tabular-nums">{count}</span>
            <span className="w-10 text-right text-[10px] text-seal-gray-500 dark:text-slate-500">{pct > 0 ? `${Math.round(pct)}%` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Survey Preview Panel ───────────────────────────────
function SurveyPreview({ title, description, questions, anonymous }: {
  title: string;
  description: string;
  questions: Array<{ label: string; type: string; options: string[]; isRequired: boolean; description: string }>;
  anonymous: boolean;
}) {
  const validQs = questions.filter(q => q.label.trim());
  const typeLabels: Record<string, string> = { rating: 'Note 1-5', text: 'Texte libre', choice: 'Choix multiple', scale: 'Echelle 1-10', yesno: 'Oui / Non' };
  return (
    <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3 animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">Apercu du questionnaire</span>
      </div>
      <h4 className="text-sm font-medium text-seal-navy dark:text-white">{title || 'Sans titre'}</h4>
      {description && <p className="text-xs text-seal-gray-500 dark:text-slate-400">{description}</p>}
      {anonymous && <Badge variant="info">Anonyme</Badge>}
      {validQs.length === 0 ? (
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 italic">Aucune question renseignee</p>
      ) : (
        <ol className="space-y-2">
          {validQs.map((q, i) => (
            <li key={i} className="rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-seal-navy dark:text-white font-medium">
                  {i + 1}. {q.label}
                  {q.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                <Badge variant="info" className="text-[9px] flex-shrink-0">{typeLabels[q.type] ?? q.type}</Badge>
              </div>
              {q.description && <p className="text-[10px] text-seal-gray-500 mt-1">{q.description}</p>}
              {q.type === 'rating' && (
                <div className="flex gap-1 mt-1.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} className="h-4 w-4 text-gray-300 dark:text-slate-600" />)}</div>
              )}
              {q.type === 'choice' && q.options.filter(o => o.trim()).length > 0 && (
                <div className="mt-1.5 space-y-1">{q.options.filter(o => o.trim()).map((o, j) => (
                  <div key={j} className="flex items-center gap-2 text-[10px] text-seal-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-full border border-gray-300 dark:border-slate-600" />{o}</div>
                ))}</div>
              )}
              {q.type === 'scale' && (
                <div className="flex gap-0.5 mt-1.5">{Array.from({ length: 10 }, (_, k) => (
                  <div key={k} className="h-5 w-5 rounded bg-gray-100 dark:bg-slate-700 text-[8px] flex items-center justify-center text-seal-gray-500">{k + 1}</div>
                ))}</div>
              )}
              {q.type === 'yesno' && (
                <div className="flex gap-2 mt-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-seal-gray-500 dark:text-slate-400">Oui</span>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-seal-gray-500 dark:text-slate-400">Non</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function SatisfactionPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [savingAttempted, setSavingAttempted] = useState(false);
  const [respondingSurvey, setRespondingSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [expandedSurvey, setExpandedSurvey] = useState<string | null>(null);
  const [deletingSurveyId, setDeletingSurveyId] = useState<string | null>(null);
  const [surveyResults, setSurveyResults] = useState<Record<string, any>>({});
  const [loadingResults, setLoadingResults] = useState<string | null>(null);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended'>('all');
  const [responseRates, setResponseRates] = useState<ResponseRateData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Create form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formAnonymous, setFormAnonymous] = useState(false);
  const [formExpiry, setFormExpiry] = useState('');
  const [formQuestions, setFormQuestions] = useState<Array<{
    label: string; type: string; options: string[]; isRequired: boolean; description: string;
  }>>([
    { label: '', type: 'rating', options: [], isRequired: true, description: '' },
  ]);

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const fetchData = useCallback(async () => {
    try {
      const [surveysRes] = await Promise.all([
        api.get('/satisfaction/surveys'),
        isAdmin ? api.get('/satisfaction/stats').then(({ data }) => setStats(data)).catch(() => {}) : Promise.resolve(),
        isAdmin ? api.get('/satisfaction/response-rate').then(({ data }) => setResponseRates(data)).catch(() => {}) : Promise.resolve(),
      ]);
      setSurveys(surveysRes.data);
    } catch { /* silent — page shows empty state */ }
    finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Create survey ────────────────────────────────────
  const addQuestion = () => {
    setFormQuestions(prev => [...prev, { label: '', type: 'rating', options: [], isRequired: true, description: '' }]);
  };

  const removeQuestion = (idx: number) => {
    setFormQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: string, value: any) => {
    setFormQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  const handleCreate = async () => {
    setSavingAttempted(true);
    if (!formTitle) { toast.error('Titre requis'); return; }
    const validQuestions = formQuestions.filter(q => q.label.trim());
    if (validQuestions.length === 0) { toast.error('Ajoutez au moins une question'); return; }
    setSavingSurvey(true);
    try {
      await api.post('/satisfaction/surveys', {
        title: formTitle,
        description: formDesc || undefined,
        expiresAt: formExpiry || undefined,
        isAnonymous: formAnonymous,
        questions: validQuestions.map(q => ({
          label: q.label,
          type: q.type,
          options: q.type === 'choice' && q.options.length > 0 ? q.options.filter(o => o.trim()) : undefined,
          isRequired: q.isRequired,
          description: q.description || undefined,
        })),
      });
      toast.success('Enquête créée');
      setShowCreate(false);
      setFormTitle(''); setFormDesc(''); setFormAnonymous(false); setFormExpiry('');
      setFormQuestions([{ label: '', type: 'rating', options: [], isRequired: true, description: '' }]);
      fetchData();
    } catch { toast.error('Erreur lors de la création'); }
  };

  // ── Delete survey ────────────────────────────────────
  const handleDeleteSurvey = async () => {
    if (!deletingSurveyId) return;
    try {
      await api.delete(`/satisfaction/surveys/${deletingSurveyId}`);
      toast.success('Enquête supprimée');
      setDeletingSurveyId(null);
      fetchData();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  // ── Edit survey ──────────────────────────────────────
  const openEditSurvey = async (surveyId: string) => {
    try {
      const { data } = await api.get(`/satisfaction/surveys/${surveyId}`);
      setEditingSurvey(data);
      setFormTitle(data.title || '');
      setFormDesc(data.description || '');
      setFormAnonymous(data.isAnonymous || false);
      setFormExpiry(data.expiresAt ? data.expiresAt.slice(0, 10) : '');
      if (data.questions && data.questions.length > 0) {
        setFormQuestions(data.questions.map((q: SurveyQuestion) => ({
          label: q.label,
          type: q.type,
          options: q.options ? JSON.parse(q.options) : [],
          isRequired: q.isRequired,
          description: q.description || '',
        })));
      } else {
        setFormQuestions([{ label: '', type: 'rating', options: [], isRequired: true, description: '' }]);
      }
      setShowCreate(true);
    } catch { toast.error('Impossible de charger les données de l\'enquête'); }
  };

  const handleUpdateSurvey = async () => {
    if (!editingSurvey || !formTitle) { toast.error('Titre requis'); return; }
    const validQuestions = formQuestions.filter(q => q.label.trim());
    if (validQuestions.length === 0) { toast.error('Ajoutez au moins une question'); return; }
    try {
      await api.patch(`/satisfaction/surveys/${editingSurvey.id}`, {
        title: formTitle,
        description: formDesc || undefined,
        expiresAt: formExpiry || undefined,
        isAnonymous: formAnonymous,
        questions: validQuestions.map(q => ({
          label: q.label,
          type: q.type,
          options: q.type === 'choice' && q.options.length > 0 ? q.options.filter(o => o.trim()) : undefined,
          isRequired: q.isRequired,
          description: q.description || undefined,
        })),
      });
      toast.success('Enquête mise à jour');
      setShowCreate(false);
      setEditingSurvey(null);
      setFormTitle(''); setFormDesc(''); setFormAnonymous(false); setFormExpiry('');
      setFormQuestions([{ label: '', type: 'rating', options: [], isRequired: true, description: '' }]);
      fetchData();
    } catch { toast.error('Erreur lors de la mise à jour'); }
  };

  // ── Fetch results for a survey ────────────────────────
  const fetchResults = async (surveyId: string) => {
    if (surveyResults[surveyId]) return; // already loaded
    setLoadingResults(surveyId);
    try {
      const { data } = await api.get(`/satisfaction/surveys/${surveyId}/results`);
      setSurveyResults(prev => ({ ...prev, [surveyId]: data }));
    } catch { toast.error('Erreur lors du chargement des résultats'); }
    finally { setLoadingResults(null); }
  };

  const toggleResults = (surveyId: string) => {
    if (expandedSurvey === surveyId) {
      setExpandedSurvey(null);
    } else {
      setExpandedSurvey(surveyId);
      fetchResults(surveyId);
    }
  };

  // ── Respond to survey ────────────────────────────────
  const openSurvey = async (surveyId: string) => {
    try {
      const { data } = await api.get(`/satisfaction/surveys/${surveyId}`);
      setRespondingSurvey(data);
      setAnswers({});
    } catch { toast.error('Impossible de charger le formulaire'); }
  };

  const handleRespond = async () => {
    if (!respondingSurvey) return;
    setSubmitting(true);
    try {
      const answersList = Object.entries(answers)
        .filter(([, v]) => v.trim())
        .map(([questionId, value]) => ({ questionId, value }));

      // Calculate legacy rating from first rating question
      const firstRating = respondingSurvey.questions?.find(q => q.type === 'rating');
      const ratingValue = firstRating && answers[firstRating.id] ? parseInt(answers[firstRating.id] ?? '0') : 0;

      await api.post(`/satisfaction/surveys/${respondingSurvey.id}/respond`, {
        rating: ratingValue || 3,
        answers: answersList,
      });
      toast.success('Merci pour votre retour !');
      setRespondingSurvey(null);
      setAnswers({});
      fetchData();
    } catch { toast.error('Erreur lors de l\'envoi'); }
    finally { setSubmitting(false); }
  };

  // ── Render a question in the respond form ────────────
  const renderQuestion = (q: SurveyQuestion) => {
    const value = answers[q.id] || '';
    const setValue = (v: string) => setAnswers(prev => ({ ...prev, [q.id]: v }));

    return (
      <div key={q.id} className="space-y-2">
        <label className="block text-sm font-medium text-seal-navy dark:text-white">
          {q.label}
          {q.isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {q.description && <p className="text-xs text-seal-gray-500 dark:text-slate-400">{q.description}</p>}

        {q.type === 'rating' && (
          <div className="flex gap-1 py-1" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setValue(String(n))}
                role="radio"
                aria-checked={parseInt(value) === n}
                aria-label={`Note ${n} sur 5`}
                className="h-11 w-11 flex items-center justify-center rounded-lg transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Star className={`h-7 w-7 transition ${n <= (parseInt(value) || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-slate-600'}`} />
              </button>
            ))}
          </div>
        )}

        {q.type === 'text' && (
          <textarea value={value} onChange={e => setValue(e.target.value)}
            placeholder="Votre réponse..."
            className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-seal-navy dark:text-white px-3 py-2 min-h-[80px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
        )}

        {q.type === 'choice' && (() => {
          const options = q.options ? JSON.parse(q.options) as string[] : [];
          return (
            <div className="space-y-1.5">
              {options.map((opt, i) => (
                <label key={i} className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                  <input type="radio" name={`q-${q.id}`} value={opt} checked={value === opt}
                    onChange={() => setValue(opt)}
                    className="h-4 w-4 text-primary border-gray-300 dark:border-slate-600 dark:bg-slate-900 focus:ring-primary" />
                  <span className="text-sm text-seal-navy dark:text-white">{opt}</span>
                </label>
              ))}
            </div>
          );
        })()}

        {q.type === 'scale' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-seal-gray-500" aria-hidden="true">1</span>
            <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Échelle de 1 à 10">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" onClick={() => setValue(String(n))}
                  role="radio"
                  aria-checked={parseInt(value) === n}
                  aria-label={`Note ${n} sur 10`}
                  className={`h-11 w-11 sm:h-9 sm:w-9 rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    parseInt(value) === n
                      ? 'bg-primary text-white scale-110 shadow-md'
                      : parseInt(value) >= n
                        ? 'bg-primary/20 text-primary'
                        : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
            <span className="text-xs text-seal-gray-500" aria-hidden="true">10</span>
          </div>
        )}

        {q.type === 'yesno' && (
          <div className="flex gap-3" role="radiogroup" aria-label="Oui ou Non">
            {[{ v: 'Oui', color: 'bg-emerald-50 border-emerald-300 text-emerald-700' }, { v: 'Non', color: 'bg-red-50 border-red-300 text-red-700' }].map(opt => (
              <button key={opt.v} type="button" onClick={() => setValue(opt.v)}
                role="radio"
                aria-checked={value === opt.v}
                aria-label={opt.v}
                className={`flex-1 min-h-[44px] py-3 rounded-lg border-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  value === opt.v ? opt.color : 'border-gray-200 dark:border-slate-600 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}>
                {opt.v}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('satisfaction.title')}
        subtitle={t('satisfaction.subtitle')}
        icon={Star}
        hub="security"
        actions={isAdmin ? (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> {t('satisfaction.newSurvey')}
          </Button>
        ) : undefined}
      />

      {/* Admin stats */}
      {isAdmin && stats && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="stagger-item">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
                  <Star className="h-6 w-6 text-amber-500 fill-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-medium text-seal-navy dark:text-white">{stats.globalAverage.toFixed(1)}</p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">Note moyenne</p>
                </div>
              </CardContent>
            </Card>
            <Card className="stagger-item">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-medium text-seal-navy dark:text-white">{stats.totalSurveys}</p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">Enquetes</p>
                </div>
              </CardContent>
            </Card>
            <Card className="stagger-item">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                  <MessageSquare className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-medium text-seal-navy dark:text-white">{stats.totalResponses}</p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">Reponses</p>
                </div>
              </CardContent>
            </Card>
            <Card className="stagger-item">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-medium text-seal-navy dark:text-white">{stats.totalResponses > 0 ? Math.round((stats.totalResponses / Math.max(1, stats.totalSurveys)) * 10) / 10 : 0}</p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">Moy. reponses/enquete</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* NPS Gauge + global distribution */}
          {stats.totalResponses > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-item">
              <Card>
                <CardContent className="py-4">
                  <h4 className="text-xs font-semibold text-seal-navy dark:text-white uppercase tracking-wide mb-3">Score NPS estime</h4>
                  <div className="flex justify-center">
                    <NpsGauge score={Math.round((stats.globalAverage - 3) * 50)} />
                  </div>
                  <p className="text-[10px] text-center text-seal-gray-500 dark:text-slate-500 mt-2">
                    Base sur la note moyenne ({stats.globalAverage.toFixed(1)}/5) de {stats.totalResponses} reponses
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <h4 className="text-xs font-semibold text-seal-navy dark:text-white uppercase tracking-wide mb-3">Repartition globale par enquete</h4>
                  <div className="space-y-2">
                    {stats.surveys.filter(s => s.responses > 0).slice(0, 6).map(s => {
                      const maxR = Math.max(1, ...stats.surveys.map(x => x.responses));
                      const pct = (s.responses / maxR) * 100;
                      return (
                        <div key={s.id} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-seal-navy dark:text-white font-medium truncate mr-2">{s.title}</span>
                            <span className="text-seal-gray-500 dark:text-slate-400 flex-shrink-0 tabular-nums">
                              {s.responses} rep. &middot; {s.avg.toFixed(1)}/5
                            </span>
                          </div>
                          <div className="h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${s.isActive ? 'bg-primary' : 'bg-gray-400 dark:bg-slate-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex gap-1.5 items-center flex-wrap" role="group" aria-label="Filtrer les enquêtes par statut">
        {([
          { value: 'all' as const, label: 'Toutes' },
          { value: 'active' as const, label: 'Actives' },
          { value: 'ended' as const, label: 'Terminées' },
        ]).map(chip => (
          <button
            key={chip.value}
            onClick={() => setStatusFilter(chip.value)}
            aria-pressed={statusFilter === chip.value}
            className={`rounded-full px-3 min-h-[36px] text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              statusFilter === chip.value
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
            }`}
          >
            {chip.label}
            {chip.value === 'active' && surveys.filter(s => s.isActive).length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-white/20 text-[10px]">{surveys.filter(s => s.isActive).length}</span>
            )}
            {chip.value === 'ended' && surveys.filter(s => !s.isActive).length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-white/20 text-[10px]">{surveys.filter(s => !s.isActive).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Surveys list */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des enquêtes">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1/3 rounded shimmer" />
                <div className="h-4 w-16 rounded-full shimmer" />
              </div>
              <div className="h-3 w-2/3 rounded shimmer" />
              <div className="h-2 w-full rounded-full shimmer mt-2" />
            </div>
          ))}
        </div>
      ) : surveys.length === 0 ? (
        <EmptyState
          type="general"
          title="Aucune enquête en cours"
          description={isAdmin
            ? "Créez votre première enquête pour recueillir les retours des collaborateurs et piloter la qualité de service. Les résultats sont consultables en temps réel."
            : "Les enquêtes de satisfaction créées par l'équipe de direction ou les RH apparaîtront ici. Vous serez notifié dès qu'une nouvelle enquête sera disponible."}
          action={isAdmin ? (
            <Button onClick={() => setShowCreate(true)} className="animate-fade-in-up">
              <Plus className="h-4 w-4" /> Créer une enquête
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {surveys.filter(s => statusFilter === 'all' ? true : statusFilter === 'active' ? s.isActive : !s.isActive).map((survey, idx) => (
            <Card key={survey.id} className={`animate-fade-in-up stagger-item cursor-default`} style={{ animationDelay: `${idx * 60}ms` }}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-medium text-seal-navy dark:text-white">{survey.title}</h3>
                      {survey.isActive ? <Badge variant="approved">Active</Badge> : <Badge variant="draft">Terminée</Badge>}
                      {survey.isAnonymous && <Badge variant="info">Anonyme</Badge>}
                      {survey.expiresAt && (
                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {new Date(survey.expiresAt).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                    {survey.description && <p className="text-xs text-seal-gray-500 dark:text-slate-400">{survey.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {survey._count.responses} réponse{survey._count.responses !== 1 ? 's' : ''}
                      </span>
                      {isAdmin && (
                        <button onClick={() => toggleResults(survey.id)}
                          className="text-[10px] text-primary flex items-center gap-1 hover:underline">
                          <Eye className="h-3 w-3" /> Voir les résultats
                          {expandedSurvey === survey.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                    {/* Participation rate bar */}
                    {responseRates && (() => {
                      const rateInfo = responseRates.surveys.find(s => s.surveyId === survey.id);
                      const totalUsers = responseRates.totalActiveUsers;
                      const responses = rateInfo?.responses ?? survey._count.responses;
                      const rate = totalUsers > 0 ? Math.min(100, Math.round((responses / totalUsers) * 1000) / 10) : 0;
                      return (
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {rate}% des collaborateurs ont répondu
                            </span>
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">{responses}/{totalUsers}</span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                rate >= 75 ? 'bg-emerald-500' : rate >= 50 ? 'bg-blue-500' : rate >= 25 ? 'bg-amber-500' : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.max(rate, 1)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => openEditSurvey(survey.id)}>
                        <Edit className="h-3.5 w-3.5" /> Éditer
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => setDeletingSurveyId(survey.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {survey.isActive && (
                      <Button size="sm" onClick={() => openSurvey(survey.id)}>
                        <Send className="h-3.5 w-3.5" /> Répondre
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>

              {/* ── Inline Results Panel ──────────────────── */}
              {expandedSurvey === survey.id && (
                <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-4 bg-gray-50/50 dark:bg-slate-800/30">
                  {loadingResults === survey.id ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  ) : surveyResults[survey.id] ? (
                    <div className="space-y-5">
                      {/* Global stats summary */}
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-seal-gray-500 dark:text-slate-400">
                          <strong className="text-seal-navy dark:text-white">{surveyResults[survey.id].stats.totalResponses}</strong> réponse{surveyResults[survey.id].stats.totalResponses !== 1 ? 's' : ''}
                        </span>
                        {surveyResults[survey.id].stats.averageRating > 0 && (
                          <span className="text-seal-gray-500 dark:text-slate-400">
                            Note moy. <strong className="text-seal-navy dark:text-white">{surveyResults[survey.id].stats.averageRating}/5</strong>
                          </span>
                        )}
                      </div>

                      {/* Per-question results */}
                      {surveyResults[survey.id].questionResults?.map((qr: any) => (
                        <div key={qr.questionId} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-800 space-y-2">
                          <p className="text-xs font-medium text-seal-navy dark:text-white">{qr.label}</p>
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">{qr.aggregation.total} réponse{qr.aggregation.total !== 1 ? 's' : ''}</p>

                          {/* Rating: donut chart */}
                          {qr.type === 'rating' && qr.aggregation.distribution && (
                            <div className="flex items-center gap-4">
                              <svg viewBox="0 0 120 120" className="h-24 w-24 flex-shrink-0">
                                {(() => {
                                  const total = qr.aggregation.distribution.reduce((s: number, d: any) => s + d.count, 0);
                                  if (total === 0) return <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="16" />;
                                  const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
                                  let offset = 0;
                                  const circumference = 2 * Math.PI * 50;
                                  return qr.aggregation.distribution.map((d: any, i: number) => {
                                    const pct = d.count / total;
                                    const dashArray = `${pct * circumference} ${circumference}`;
                                    const rotation = offset * 360 - 90;
                                    offset += pct;
                                    if (d.count === 0) return null;
                                    return <circle key={i} cx="60" cy="60" r="50" fill="none" stroke={colors[i]} strokeWidth="16"
                                      strokeDasharray={dashArray} transform={`rotate(${rotation} 60 60)`} />;
                                  });
                                })()}
                                <text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor" className="text-seal-navy dark:text-white">{qr.aggregation.average}</text>
                                <text x="60" y="72" textAnchor="middle" fontSize="10" fill="#9ca3af">/5</text>
                              </svg>
                              <div className="flex-1 space-y-1">
                                {[5, 4, 3, 2, 1].map((n: number) => {
                                  const d = qr.aggregation.distribution.find((x: any) => x.value === n);
                                  const count = d?.count || 0;
                                  const total = qr.aggregation.distribution.reduce((s: number, x: any) => s + x.count, 0);
                                  const pct = total > 0 ? (count / total) * 100 : 0;
                                  return (
                                    <div key={n} className="flex items-center gap-2 text-[10px]">
                                      <span className="w-3 text-right text-seal-gray-500 dark:text-slate-400">{n}</span>
                                      <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.max(pct, 0)}%` }} />
                                      </div>
                                      <span className="w-6 text-right text-seal-gray-500 dark:text-slate-400">{count}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Scale: bar chart */}
                          {qr.type === 'scale' && qr.aggregation.distribution && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 mb-1">Moyenne : <strong>{qr.aggregation.average}/10</strong></p>
                              <svg viewBox="0 0 300 80" className="w-full h-16">
                                {(() => {
                                  const maxCount = Math.max(1, ...qr.aggregation.distribution.map((d: any) => d.count));
                                  const barWidth = 24;
                                  const gap = 6;
                                  return qr.aggregation.distribution.map((d: any, i: number) => {
                                    const barHeight = maxCount > 0 ? (d.count / maxCount) * 55 : 0;
                                    const x = i * (barWidth + gap) + 5;
                                    return (
                                      <g key={i}>
                                        <rect x={x} y={60 - barHeight} width={barWidth} height={Math.max(barHeight, 1)} rx="3" fill={d.value <= 3 ? '#ef4444' : d.value <= 6 ? '#f97316' : d.value <= 8 ? '#eab308' : '#22c55e'} />
                                        <text x={x + barWidth / 2} y={75} textAnchor="middle" fontSize="8" fill="#9ca3af">{d.value}</text>
                                        {d.count > 0 && <text x={x + barWidth / 2} y={57 - barHeight} textAnchor="middle" fontSize="7" fill="#6b7280">{d.count}</text>}
                                      </g>
                                    );
                                  });
                                })()}
                              </svg>
                            </div>
                          )}

                          {/* Choice / Yesno: horizontal bar chart */}
                          {(qr.type === 'choice' || qr.type === 'yesno') && qr.aggregation.choices && (
                            <div className="space-y-1.5">
                              {qr.aggregation.choices.map((c: any, i: number) => {
                                const total = qr.aggregation.choices.reduce((s: number, x: any) => s + x.count, 0);
                                const pct = total > 0 ? (c.count / total) * 100 : 0;
                                const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#6366f1', '#10b981'];
                                return (
                                  <div key={i}>
                                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                                      <span className="text-seal-navy dark:text-white font-medium truncate mr-2">{c.label}</span>
                                      <span className="text-seal-gray-500 dark:text-slate-400 flex-shrink-0">{c.count} ({Math.round(pct)}%)</span>
                                    </div>
                                    <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: colors[i % colors.length] }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Text responses: scrollable list */}
                          {qr.type === 'text' && qr.aggregation.texts && (
                            <div className="max-h-40 overflow-y-auto space-y-1.5">
                              {qr.aggregation.texts.length === 0 ? (
                                <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 italic">Aucune réponse texte</p>
                              ) : (
                                qr.aggregation.texts.map((t: string, i: number) => (
                                  <div key={i} className="text-xs text-seal-navy dark:text-slate-300 bg-gray-50 dark:bg-slate-900 rounded p-2 border-l-2 border-primary/40">
                                    {t}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Fallback if no question results */}
                      {(!surveyResults[survey.id].questionResults || surveyResults[survey.id].questionResults.length === 0) && surveyResults[survey.id].stats.totalResponses > 0 && (
                        <div className="flex items-center gap-4">
                          <svg viewBox="0 0 120 120" className="h-20 w-20 flex-shrink-0">
                            {(() => {
                              const dist = surveyResults[survey.id].stats.distribution;
                              const total = dist.reduce((s: number, d: any) => s + d.count, 0);
                              if (total === 0) return <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="16" />;
                              const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
                              let offset = 0;
                              const circumference = 2 * Math.PI * 50;
                              return dist.map((d: any, i: number) => {
                                const pct = d.count / total;
                                const dashArray = `${pct * circumference} ${circumference}`;
                                const rotation = offset * 360 - 90;
                                offset += pct;
                                if (d.count === 0) return null;
                                return <circle key={i} cx="60" cy="60" r="50" fill="none" stroke={colors[i]} strokeWidth="16"
                                  strokeDasharray={dashArray} transform={`rotate(${rotation} 60 60)`} />;
                              });
                            })()}
                            <text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor" className="text-seal-navy dark:text-white">{surveyResults[survey.id].stats.averageRating}</text>
                            <text x="60" y="72" textAnchor="middle" fontSize="10" fill="#9ca3af">/5</text>
                          </svg>
                          <div className="flex-1 space-y-1">
                            {[5, 4, 3, 2, 1].map((n: number) => {
                              const d = surveyResults[survey.id].stats.distribution.find((x: any) => x.rating === n);
                              const count = d?.count || 0;
                              const total = surveyResults[survey.id].stats.distribution.reduce((s: number, x: any) => s + x.count, 0);
                              const pct = total > 0 ? (count / total) * 100 : 0;
                              return (
                                <div key={n} className="flex items-center gap-2 text-[10px]">
                                  <span className="w-3 text-right text-seal-gray-500 dark:text-slate-400">{n}</span>
                                  <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                                  <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.max(pct, 0)}%` }} />
                                  </div>
                                  <span className="w-6 text-right text-seal-gray-500 dark:text-slate-400">{count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Create Survey Dialog (Google Forms-like) ──────── */}
      <Dialog open={showCreate} onClose={() => { setShowCreate(false); setEditingSurvey(null); setFormTitle(''); setFormDesc(''); setFormAnonymous(false); setFormExpiry(''); setFormQuestions([{ label: '', type: 'rating', options: [], isRequired: true, description: '' }]); }} title={editingSurvey ? 'Éditer l\'enquête' : 'Créer une enquête'}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input label="Titre de l'enquête" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Satisfaction T1 2026" />
          <Textarea label="Description (optionnel)" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Contexte et objectif..." />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-seal-navy dark:text-white mb-1">Date d&apos;expiration</label>
              <input type="date" value={formExpiry} onChange={e => setFormExpiry(e.target.value)}
                aria-label="Date d'expiration"
                className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formAnonymous} onChange={e => setFormAnonymous(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-900 text-primary focus:ring-primary" />
                <span className="text-sm text-seal-navy dark:text-white">Réponses anonymes</span>
              </label>
            </div>
          </div>

          {/* Questions builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-medium text-seal-navy dark:text-white">Questions</label>
              <Button variant="outline" size="sm" onClick={addQuestion}><Plus className="h-3 w-3" /> Question</Button>
            </div>
            <div className="space-y-3">
              {formQuestions.map((q, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 space-y-2 bg-gray-50/50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-seal-gray-500/30 flex-shrink-0" />
                    <span className="text-xs font-medium text-seal-gray-500 dark:text-slate-400 w-6">{idx + 1}.</span>
                    <input value={q.label} onChange={e => updateQuestion(idx, 'label', e.target.value)}
                      placeholder="Intitulé de la question"
                      aria-label={`Question ${idx + 1} - intitulé`}
                      className={`flex-1 rounded border px-2 py-1.5 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${savingAttempted && !q.label.trim() ? 'border-red-400' : 'border-gray-300 dark:border-slate-600'}`} />
                    <select value={q.type} onChange={e => updateQuestion(idx, 'type', e.target.value)}
                      aria-label={`Question ${idx + 1} - type`}
                      className="rounded border border-gray-300 dark:border-slate-600 px-2 py-1.5 text-xs dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                      {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {formQuestions.length > 1 && (
                      <button onClick={() => removeQuestion(idx)} title="Supprimer la question" className="p-1 text-red-400 hover:text-red-600 transition-colors cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {q.type === 'choice' && (
                    <div className="ml-8 space-y-1">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full border border-gray-300 dark:border-slate-600" />
                          <input value={opt} onChange={e => {
                            const newOpts = [...q.options];
                            newOpts[oi] = e.target.value;
                            updateQuestion(idx, 'options', newOpts);
                          }} placeholder={`Option ${oi + 1}`}
                            aria-label={`Option ${oi + 1}`}
                            className="flex-1 rounded border border-gray-200 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                          <button onClick={() => updateQuestion(idx, 'options', q.options.filter((_, i) => i !== oi))}
                            title="Supprimer l'option" className="text-red-400 hover:text-red-600 transition-colors cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}
                      <button onClick={() => updateQuestion(idx, 'options', [...q.options, ''])}
                        className="text-xs text-primary hover:underline ml-5">+ Ajouter une option</button>
                    </div>
                  )}

                  <div className="ml-8 flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={q.isRequired} onChange={e => updateQuestion(idx, 'isRequired', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-900 text-primary focus:ring-primary" />
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">Obligatoire</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview toggle */}
          <div className="border-t border-gray-100 dark:border-slate-700 pt-3">
            <button
              type="button"
              onClick={() => setShowPreview(p => !p)}
              className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? 'Masquer l\'apercu' : 'Apercu du questionnaire'}
            </button>
          </div>

          {showPreview && (
            <SurveyPreview
              title={formTitle}
              description={formDesc}
              questions={formQuestions}
              anonymous={formAnonymous}
            />
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditingSurvey(null); setShowPreview(false); }}>Annuler</Button>
            <Button onClick={editingSurvey ? handleUpdateSurvey : handleCreate}>
              {editingSurvey ? 'Enregistrer' : `Créer l'enquête (${formQuestions.filter(q => q.label.trim()).length} question${formQuestions.filter(q => q.label.trim()).length > 1 ? 's' : ''})`}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Delete Survey Confirm Dialog ──────────────────── */}
      <ConfirmDialog
        open={!!deletingSurveyId}
        onClose={() => setDeletingSurveyId(null)}
        onConfirm={handleDeleteSurvey}
        title="Supprimer l'enquête"
        description="Êtes-vous sûr de vouloir supprimer cette enquête ? Cette action est irréversible et supprimera toutes les réponses associées."
      />

      {/* ── Respond to Survey Dialog (Google Forms-like) ──── */}
      <Dialog open={!!respondingSurvey} onClose={() => setRespondingSurvey(null)}
        title={respondingSurvey?.title || 'Enquête'}>
        {respondingSurvey && (
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            {respondingSurvey.description && (
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                {respondingSurvey.description}
              </p>
            )}

            {respondingSurvey.questions && respondingSurvey.questions.length > 0 ? (
              respondingSurvey.questions.map(q => (
                <div key={q.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                  {renderQuestion(q)}
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-sm text-seal-gray-500">
                <p>Cette enquête ne contient pas encore de questions.</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setRespondingSurvey(null)}>Annuler</Button>
              <Button onClick={handleRespond} loading={submitting}>
                <Send className="h-4 w-4" /> Envoyer
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
