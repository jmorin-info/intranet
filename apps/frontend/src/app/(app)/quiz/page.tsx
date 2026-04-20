'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardFooter, Button, Badge, Dialog, Input, Textarea, ConfirmDialog } from '@omnitech/ui';
import {
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Trophy,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  BookOpen,
  Target,
  BarChart3,
  Shuffle,
  Download,
  Clock,
  Award,
  TrendingUp,
  History,
  Shield,
  Star,
  AlertTriangle,
  PartyPopper,
  Lightbulb,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: string;
}

interface Campaign {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  questions: string | QuizQuestion[];
  passingScore: number;
  createdAt: string;
}

interface LeaderboardEntry {
  user: { id: string; firstName: string; lastName: string };
  score: number;
  total: number;
  date: string;
}

interface MyResult {
  id: string;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  campaignTitle: string;
  completedAt: string;
}

type PageView = 'campaigns' | 'quiz';
type QuizState = 'ready' | 'in-progress' | 'finished';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseQuestions(raw: string | QuizQuestion[]): QuizQuestion[] {
  let arr: any[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(q => q && q.question && Array.isArray(q.options) && q.options.length > 0);
}

function estimateTime(questionCount: number): string {
  const minutes = Math.max(2, Math.round(questionCount * 1.5));
  return `~${minutes} min`;
}

function getDifficultyBadge(passingScore: number): { label: string; color: string } {
  if (passingScore >= 85) return { label: 'Difficile', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
  if (passingScore >= 70) return { label: 'Moyen', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  return { label: 'Facile', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
}

function newBlankQuestion(): QuizQuestion {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    explanation: '',
    category: '',
  };
}

function getGamificationLevel(quizCount: number): { label: string; icon: typeof Shield; color: string } {
  if (quizCount > 10) return { label: 'Champion OMNITECH', icon: Trophy, color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700' };
  if (quizCount >= 6) return { label: 'Expert cyber', icon: Star, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700' };
  if (quizCount >= 3) return { label: 'Sensibilisé', icon: Shield, color: 'text-seal-blue bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' };
  return { label: 'Débutant', icon: BookOpen, color: 'text-seal-gray-500 bg-gray-50 dark:bg-slate-800 border-gray-300 dark:border-slate-600' };
}

const MEDAL_ICONS = ['🥇', '🥈', '🥉'] as const;

function ScoreFeedback({ percentage }: { percentage: number }) {
  if (percentage >= 80) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 animate-fade-in-up">
        <div className="flex items-start gap-3">
          <PartyPopper className="h-6 w-6 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Excellent ! Vous maîtrisez parfaitement le sujet !
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              Votre vigilance contribue activement à la sécurité d&apos;OMNITECH. Continuez à partager vos connaissances avec vos collègues.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (percentage >= 50) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 animate-fade-in-up">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Pas mal ! Quelques notions à approfondir.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Consultez la{' '}
              <a href="/wiki" className="underline font-medium hover:text-amber-800 dark:hover:text-amber-200">
                base de connaissances
              </a>{' '}
              pour renforcer vos acquis en cybersécurité.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 animate-fade-in-up">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            Attention — des lacunes importantes ont été détectées.
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            La sécurité de l&apos;information est essentielle. Nous vous recommandons de consulter&nbsp;:
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 mt-1 list-disc list-inside space-y-0.5">
            <li><a href="/wiki" className="underline font-medium hover:text-red-800 dark:hover:text-red-200">Wiki sécurité</a> — Bonnes pratiques au quotidien</li>
            <li><a href="/procedures" className="underline font-medium hover:text-red-800 dark:hover:text-red-200">Procédures</a> — Réagir en cas d&apos;incident</li>
            <li><a href="/veille" className="underline font-medium hover:text-red-800 dark:hover:text-red-200">Veille cyber</a> — Menaces actuelles</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign creation dialog
// ---------------------------------------------------------------------------

interface CreateCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialData?: Campaign | null;
}

function CreateCampaignDialog({ open, onClose, onCreated, initialData }: CreateCampaignDialogProps) {
  const isEditMode = !!initialData;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [passingScore, setPassingScore] = useState(70);
  const [questions, setQuestions] = useState<QuizQuestion[]>([newBlankQuestion()]);
  const [saving, setSaving] = useState(false);

  // Populate fields when initialData changes (edit mode)
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setPassingScore(initialData.passingScore || 70);
      const parsed = parseQuestions(initialData.questions);
      setQuestions(parsed.length > 0 ? parsed : [newBlankQuestion()]);
    } else {
      reset();
    }
  }, [initialData]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPassingScore(70);
    setQuestions([newBlankQuestion()]);
    setSaving(false);
  };

  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const opts = [...q.options];
        opts[oIndex] = value;
        return { ...q, options: opts };
      }),
    );
  };

  const addQuestion = () => setQuestions((prev) => [...prev, newBlankQuestion()]);

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const canSave =
    title.trim().length > 0 &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        q.question.trim() &&
        q.options.every((o) => o.trim()) &&
        q.explanation.trim() &&
        q.category.trim(),
    );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEditMode && initialData) {
        await api.patch(`/quiz/campaigns/${initialData.id}`, {
          title: title.trim(),
          description: description.trim(),
          questions: JSON.stringify(questions),
          passingScore,
        });
        toast.success('Campagne mise à jour');
      } else {
        await api.post('/quiz/campaigns', {
          title: title.trim(),
          description: description.trim(),
          questions: JSON.stringify(questions),
          passingScore,
        });
        toast.success('Campagne créée avec succès');
      }
      reset();
      onClose();
      onCreated();
    } catch {
      toast.error(isEditMode ? 'Erreur lors de la mise à jour' : 'Erreur lors de la création de la campagne');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={isEditMode ? 'Éditer la campagne' : 'Nouvelle campagne de quiz'} className="max-w-2xl max-h-[90vh] flex flex-col">
      <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
        <Input label="Titre" placeholder="ex: Sensibilisation Sécurité Q2" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Description" placeholder="Description de la campagne..." value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input
          label="Score minimum pour réussir (%)"
          type="number"
          min={0}
          max={100}
          value={passingScore}
          onChange={(e) => setPassingScore(Number(e.target.value))}
        />

        <div className="border-t border-gray-200 dark:border-slate-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-seal-navy dark:text-white">Questions ({questions.length})</p>
            <Button size="sm" variant="outline" onClick={addQuestion}>
              <Plus className="h-3 w-3 mr-1" /> Ajouter
            </Button>
          </div>

          {questions.map((q, qi) => (
            <div key={q.id} className="border rounded-lg p-3 mb-3 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400">Question {qi + 1}</span>
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(qi)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Input placeholder="Question" value={q.question} onChange={(e) => updateQuestion(qi, { question: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === oi}
                      onChange={() => updateQuestion(qi, { correctIndex: oi })}
                      className="accent-primary"
                    />
                    <Input
                      placeholder={`Option ${oi + 1}`}
                      value={opt}
                      onChange={(e) => updateOption(qi, oi, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <Input placeholder="Catégorie" value={q.category} onChange={(e) => updateQuestion(qi, { category: e.target.value })} />
              <Textarea placeholder="Explication de la bonne réponse" value={q.explanation} onChange={(e) => updateQuestion(qi, { explanation: e.target.value })} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
        <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={!canSave}>
          {isEditMode ? 'Enregistrer' : 'Créer la campagne'}
        </Button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function QuizPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  // -- Campaign list state --
  const [pageView, setPageView] = useState<PageView>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // -- Active quiz state --
  const [activeCampaign, setActiveCampaign] = useState<{ title: string; passingScore: number } | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizState, setQuizState] = useState<QuizState>('ready');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [score, setScore] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; percentage: number; passed: boolean; auditLogId?: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [completedCampaigns, setCompletedCampaigns] = useState<Record<string, { score: number; total: number }>>({});
  const [myResults, setMyResults] = useState<MyResult[]>([]);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const { data } = await api.get('/quiz/campaigns');
      setCampaigns(data);
    } catch {
      /* silent — page shows empty state */
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  const toggleCampaignActive = async (campaign: Campaign) => {
    try {
      await api.patch(`/quiz/campaigns/${campaign.id}`, { isActive: !campaign.isActive });
      toast.success(campaign.isActive ? 'Campagne désactivée' : 'Campagne activée');
      loadCampaigns();
    } catch { toast.error('Erreur'); }
  };

  const handleDeleteCampaign = async () => {
    if (!deletingCampaignId) return;
    try {
      await api.delete(`/quiz/campaigns/${deletingCampaignId}`);
      toast.success('Campagne supprimée');
      setDeletingCampaignId(null);
      loadCampaigns();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const loadLeaderboard = useCallback(async () => {
    try {
      const { data } = await api.get('/quiz/leaderboard');
      setLeaderboard(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
    loadLeaderboard();
    // Load user completion data from personal results
    api.get('/quiz/my-results?limit=100').then(({ data }) => {
      const completed: Record<string, { score: number; total: number }> = {};
      if (Array.isArray(data)) {
        setMyResults(data as MyResult[]);
        data.forEach((r: { campaignTitle?: string; score: number; total: number }) => {
          if (r.campaignTitle) completed[r.campaignTitle] = { score: r.score, total: r.total };
        });
      }
      setCompletedCampaigns(completed);
    }).catch(() => { /* endpoint may not exist yet */ });
  }, [loadCampaigns, loadLeaderboard]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/quiz/stats').then((r) => setStats(r.data)).catch(console.error);
    }
  }, [isAdmin]);

  // -----------------------------------------------------------------------
  // Start a campaign quiz
  // -----------------------------------------------------------------------

  const startCampaignQuiz = async (campaign: Campaign) => {
    try {
      const { data } = await api.get(`/quiz/campaigns/${campaign.id}`);
      const parsed = parseQuestions(data.questions);
      if (parsed.length === 0) {
        toast.error('Cette campagne ne contient aucune question valide');
        return;
      }
      setQuestions(parsed);
      setActiveCampaign({ title: data.title, passingScore: data.passingScore });
      resetQuizState();
      setQuizState('ready');
      setPageView('quiz');
    } catch {
      toast.error('Erreur lors du chargement de la campagne');
    }
  };

  const startLegacyQuiz = async () => {
    try {
      const { data } = await api.get('/quiz/questions');
      if (!data || data.length === 0) {
        toast.error('Aucune question disponible');
        return;
      }
      setQuestions(data);
      setActiveCampaign({ title: 'Quiz par défaut', passingScore: 70 });
      resetQuizState();
      setQuizState('ready');
      setPageView('quiz');
    } catch {
      toast.error('Erreur lors du chargement des questions');
    }
  };

  const resetQuizState = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setAnswers({});
    setScore(0);
    setShowExplanation(false);
    setResult(null);
  };

  const backToCampaigns = () => {
    setPageView('campaigns');
    setActiveCampaign(null);
    setQuestions([]);
    resetQuizState();
  };

  // -----------------------------------------------------------------------
  // Quiz interaction
  // -----------------------------------------------------------------------

  const beginQuiz = () => {
    resetQuizState();
    setQuizState('in-progress');
  };

  const handleAnswer = (optionIndex: number) => {
    if (showExplanation) return;
    setSelectedAnswer(optionIndex);
  };

  const confirmAnswer = () => {
    if (selectedAnswer === null) return;
    const question = questions[currentIndex]!;
    const isCorrect = selectedAnswer === question.correctIndex;
    const newScore = isCorrect ? score + 1 : score;
    setScore(newScore);
    setAnswers((prev) => ({ ...prev, [question.id]: selectedAnswer }));
    setShowExplanation(true);
  };

  const nextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      try {
        const { data } = await api.post('/quiz/submit', {
          score,
          total: questions.length,
          answers,
          campaignTitle: activeCampaign?.title,
        });
        setResult(data);
        loadLeaderboard();
        // Reload personal results for gamification level update
        api.get('/quiz/my-results?limit=100').then(({ data: results }) => {
          if (Array.isArray(results)) setMyResults(results as MyResult[]);
        }).catch(() => {});
      } catch {
        toast.error('Erreur lors de la soumission');
      }
      setQuizState('finished');
    }
  };

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const gamificationLevel = useMemo(() => getGamificationLevel(myResults.length), [myResults.length]);
  const GamificationIcon = gamificationLevel.icon;

  const progress = questions.length > 0 ? ((currentIndex + (showExplanation ? 1 : 0)) / questions.length) * 100 : 0;

  const allCategories = useMemo(() => {
    const cats: string[] = [];
    questions.forEach((q) => {
      if (!cats.includes(q.category)) cats.push(q.category);
    });
    return cats;
  }, [questions]);

  const answeredCategories = useMemo(() => {
    const cats = new Set<string>();
    questions.forEach((q) => {
      if (answers[q.id] !== undefined) cats.add(q.category);
    });
    return cats;
  }, [questions, answers]);

  const categoryScores = useMemo(() => {
    const scores: Record<string, { correct: number; total: number }> = {};
    questions.forEach((q) => {
      if (!scores[q.category]) scores[q.category] = { correct: 0, total: 0 };
      scores[q.category]!.total++;
      if (answers[q.id] !== undefined && answers[q.id] === q.correctIndex) {
        scores[q.category]!.correct++;
      }
    });
    return scores;
  }, [questions, answers]);

  // =======================================================================
  // RENDER: Campaign list view
  // =======================================================================

  if (pageView === 'campaigns') {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-medium text-seal-navy dark:text-white flex items-center gap-2">
              <GraduationCap className="h-7 w-7 text-primary" aria-hidden="true" />
              {t('quiz.campaigns')}
            </h1>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 max-w-2xl">
              Les campagnes de quiz permettent à OMNITECH SECURITY de mesurer et d&apos;entretenir la vigilance de chaque collaborateur face aux risques cyber. Choisissez une campagne active et testez vos connaissances en sécurité de l&apos;information, conformité RGPD et bonnes pratiques du quotidien.
            </p>
            {/* Gamification level badge */}
            {myResults.length > 0 && (
              <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${gamificationLevel.color}`}>
                <GamificationIcon className="h-3.5 w-3.5" />
                {gamificationLevel.label} — {myResults.length} quiz completes
              </div>
            )}
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> {t('quiz.newCampaign')}
            </Button>
          )}
        </div>

        {/* Admin stats */}
        {isAdmin && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="stagger-item">
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-medium text-seal-navy dark:text-white">{stats.participationRate}%</p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Participation</p>
              </CardContent>
            </Card>
            <Card className="stagger-item">
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-medium text-primary">{stats.participants}/{stats.totalUsers}</p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Participants</p>
              </CardContent>
            </Card>
            <Card className="stagger-item">
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-medium text-seal-navy dark:text-white">{stats.averageScore}%</p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Score moyen</p>
              </CardContent>
            </Card>
            <Card className="stagger-item">
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-medium text-emerald-600">{stats.passingRate}%</p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Taux de réussite</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Campaign cards */}
        {loadingCampaigns ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Legacy "default quiz" card */}
            <Card className="hover:shadow-md transition-all duration-200 cursor-pointer group shadow-sm rounded-xl" onClick={startLegacyQuiz}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Shuffle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-seal-navy dark:text-white group-hover:text-primary transition-colors">
                      Quiz par défaut
                    </h3>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      Questions aléatoires sur la sécurité de l&apos;information
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardFooter className="pt-0">
                <div className="flex items-center gap-3 text-xs text-seal-gray-500 dark:text-slate-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" /> 20 {t('quiz.questions')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" /> 70%
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {estimateTime(20)}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getDifficultyBadge(70).color}`}>
                    {getDifficultyBadge(70).label}
                  </span>
                  {completedCampaigns['Quiz par défaut'] && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Complété ({Math.round((completedCampaigns['Quiz par défaut'].score / completedCampaigns['Quiz par défaut'].total) * 100)}%)
                    </span>
                  )}
                </div>
              </CardFooter>
            </Card>

            {/* Campaign cards */}
            {campaigns.length === 0 && (
              <Card className="border-2 border-dashed border-gray-200 dark:border-slate-700 shadow-none flex items-center justify-center">
                <CardContent className="py-8 text-center">
                  <GraduationCap className="h-8 w-8 text-seal-gray-500/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-seal-gray-500 dark:text-slate-400">Aucune campagne de quiz pour le moment</p>
                  <p className="text-xs text-seal-gray-500/70 dark:text-slate-500 mt-1 max-w-xs mx-auto">
                    Les campagnes de sensibilisation à la cybersécurité créées par les administrateurs apparaîtront ici.
                  </p>
                </CardContent>
              </Card>
            )}
            {campaigns.map((campaign) => {
              const questionCount = parseQuestions(campaign.questions).length;
              const difficulty = getDifficultyBadge(campaign.passingScore);
              const completed = completedCampaigns[campaign.title];
              return (
                <Card
                  key={campaign.id}
                  className={`transition-all duration-200 group shadow-sm rounded-xl ${questionCount > 0 ? 'hover:shadow-md cursor-pointer' : 'opacity-75'}`}
                  onClick={() => questionCount > 0 ? startCampaignQuiz(campaign) : undefined}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl relative ${questionCount > 0 ? 'bg-primary/10' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                        <GraduationCap className={`h-5 w-5 ${questionCount > 0 ? 'text-primary' : 'text-amber-500'}`} />
                        {completed && (
                          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-seal-navy dark:text-white group-hover:text-primary transition-colors truncate">
                            {campaign.title}
                          </h3>
                          {campaign.isActive ? (
                            <Badge variant="success" className="flex-shrink-0">Actif</Badge>
                          ) : (
                            <Badge variant="warning" className="flex-shrink-0">Inactif</Badge>
                          )}
                          {questionCount === 0 && (
                            <Badge variant="error" className="flex-shrink-0">Vide</Badge>
                          )}
                        </div>
                        {campaign.description && (
                          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {campaign.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardFooter className="pt-0">
                    {/* Completion progress bar */}
                    {completed && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <Award className="h-3 w-3" /> Déjà complété
                          </span>
                          <span className="text-seal-gray-500 dark:text-slate-400">{Math.round((completed.score / completed.total) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${Math.round((completed.score / completed.total) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-seal-gray-500 dark:text-slate-400 flex-wrap">
                      <span className={`flex items-center gap-1 ${questionCount === 0 ? 'text-amber-500 font-semibold' : ''}`}>
                        <BookOpen className="h-3.5 w-3.5" /> {questionCount === 0 ? 'Aucune question' : `${questionCount} question${questionCount > 1 ? 's' : ''}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="h-3.5 w-3.5" /> {campaign.passingScore}%
                      </span>
                      {questionCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {estimateTime(questionCount)}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${difficulty.color}`}>
                        {difficulty.label}
                      </span>
                      {isAdmin && (
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingCampaign(campaign); }}
                            className="px-2 py-0.5 text-[10px] font-semibold text-primary rounded hover:bg-primary/10 transition"
                          >
                            Éditer
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleCampaignActive(campaign); }}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded transition ${campaign.isActive ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                          >
                            {campaign.isActive ? 'Désactiver' : 'Activer'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingCampaignId(campaign.id); }}
                            className="px-2 py-0.5 text-[10px] font-semibold text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Leaderboard on campaign list page — enhanced with medals */}
        {leaderboard.length > 0 && (
          <Card className="animate-fade-in-up">
            <CardHeader>
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Classement global
              </h3>
            </CardHeader>
            <CardContent>
              {/* Top 3 podium */}
              {leaderboard.length >= 3 && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[1, 0, 2].map((podiumIdx) => {
                    const entry = leaderboard[podiumIdx];
                    if (!entry) return null;
                    const pct = Math.round((entry.score / entry.total) * 100);
                    return (
                      <div
                        key={entry.user.id}
                        className={`stagger-item text-center p-3 rounded-xl border transition-all ${
                          podiumIdx === 0
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 order-2 scale-105'
                            : podiumIdx === 1
                            ? 'bg-gray-50 dark:bg-slate-800 border-gray-300 dark:border-slate-600 order-1'
                            : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800 order-3'
                        }`}
                      >
                        <span className="text-2xl">{MEDAL_ICONS[podiumIdx]}</span>
                        <p className="text-xs font-semibold text-seal-navy dark:text-white mt-1 truncate">
                          {entry.user.firstName} {entry.user.lastName}
                        </p>
                        <p className="text-lg font-bold text-seal-navy dark:text-white">{pct}%</p>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{entry.score}/{entry.total}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Rest of leaderboard */}
              <div className="space-y-2">
                {leaderboard.slice(leaderboard.length >= 3 ? 3 : 0).map((entry, idx) => {
                  const rank = leaderboard.length >= 3 ? idx + 4 : idx + 1;
                  return (
                    <div
                      key={entry.user.id}
                      className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                    >
                      <span className="text-sm font-semibold w-6 text-center text-seal-gray-500 dark:text-slate-400">
                        {rank}
                      </span>
                      <span className="text-sm font-medium text-seal-navy dark:text-white flex-1">
                        {entry.user.firstName} {entry.user.lastName}
                      </span>
                      <Badge variant={entry.score / entry.total >= 0.7 ? 'success' : 'warning'}>
                        {Math.round((entry.score / entry.total) * 100)}%
                      </Badge>
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                        {entry.score}/{entry.total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mon historique */}
        {myResults.length > 0 && (
          <Card className="animate-fade-in-up">
            <CardHeader>
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Mon historique
              </h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {myResults.slice(0, 10).map((r) => {
                  const date = new Date(r.completedAt);
                  return (
                    <div
                      key={r.id}
                      className="stagger-item flex items-center gap-3 py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                    >
                      {r.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium text-seal-navy dark:text-white flex-1 truncate">
                        {r.campaignTitle}
                      </span>
                      <Badge variant={r.passed ? 'success' : 'warning'}>
                        {r.percentage}%
                      </Badge>
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                        {r.score}/{r.total}
                      </span>
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 hidden sm:inline">
                        {date.toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create campaign dialog */}
        {isAdmin && (
          <CreateCampaignDialog
            open={showCreateDialog}
            onClose={() => setShowCreateDialog(false)}
            onCreated={loadCampaigns}
          />
        )}

        {/* Edit campaign dialog */}
        {isAdmin && (
          <CreateCampaignDialog
            open={!!editingCampaign}
            onClose={() => setEditingCampaign(null)}
            onCreated={loadCampaigns}
            initialData={editingCampaign}
          />
        )}

        {/* Delete campaign confirmation */}
        <ConfirmDialog
          open={!!deletingCampaignId}
          onClose={() => setDeletingCampaignId(null)}
          onConfirm={handleDeleteCampaign}
          title="Supprimer la campagne"
          description="Êtes-vous sûr de vouloir supprimer cette campagne ? Cette action est irréversible."
          confirmLabel="Supprimer"
          variant="danger"
        />
      </div>
    );
  }

  // =======================================================================
  // RENDER: Quiz view (ready / in-progress / finished)
  // =======================================================================

  const passingThreshold = activeCampaign?.passingScore ?? 70;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" aria-hidden="true" />
            {activeCampaign?.title ?? 'Quiz'}
          </h2>
          <button
            onClick={backToCampaigns}
            className="text-sm text-primary hover:underline mt-1 flex items-center gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Retour aux campagnes
          </button>
        </div>
      </div>

      {/* ---- READY ---- */}
      {quizState === 'ready' && (
        <>
          <Card className="animate-fade-in-up">
            <CardContent className="py-8 text-center">
              <GraduationCap className="h-16 w-16 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-medium text-seal-navy dark:text-white mb-2">
                Prêt pour le quiz ?
              </h2>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-6">
                {questions.length} question{questions.length > 1 ? 's' : ''}.
                Vous devez obtenir au moins {passingThreshold}% pour réussir.
              </p>
              <Button onClick={beginQuiz}>
                {t('quiz.startQuiz')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {leaderboard.length > 0 && (
            <Card className="animate-fade-in-up">
              <CardHeader>
                <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Classement
                </h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {leaderboard.map((entry, idx) => (
                    <div
                      key={entry.user.id}
                      className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                    >
                      <span className="text-sm font-semibold w-6 text-center">
                        {idx < 3 ? MEDAL_ICONS[idx] : <span className="text-seal-gray-500 dark:text-slate-400">{idx + 1}</span>}
                      </span>
                      <span className="text-sm font-medium text-seal-navy dark:text-white flex-1">
                        {entry.user.firstName} {entry.user.lastName}
                      </span>
                      <Badge variant={entry.score / entry.total >= 0.7 ? 'success' : 'warning'}>
                        {Math.round((entry.score / entry.total) * 100)}%
                      </Badge>
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                        {entry.score}/{entry.total}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ---- IN PROGRESS ---- */}
      {quizState === 'in-progress' && questions[currentIndex] && (
        <>
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-seal-gray-500 dark:text-slate-400">
              <span>Question {currentIndex + 1} / {questions.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Category progress pills */}
          <div className="flex flex-wrap gap-2">
            {allCategories.map((cat) => (
              <span
                key={cat}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  questions[currentIndex]?.category === cat
                    ? 'bg-primary text-white'
                    : answeredCategories.has(cat)
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400'
                }`}
              >
                {answeredCategories.has(cat) && <CheckCircle2 className="h-3 w-3" />}
                {cat}
              </span>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="info">{questions[currentIndex]!.category}</Badge>
              </div>
              <h2 className="text-lg font-medium text-seal-navy dark:text-white">
                {questions[currentIndex]!.question}
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {questions[currentIndex]!.options.map((option, idx) => {
                  const isSelected = selectedAnswer === idx;
                  const isCorrect = idx === questions[currentIndex]!.correctIndex;
                  let optionClass = 'border-gray-200 dark:border-slate-600 hover:border-primary cursor-pointer';

                  if (showExplanation) {
                    if (isCorrect && isSelected) {
                      optionClass = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 scale-[1.02] shadow-md';
                    } else if (!isCorrect && isSelected) {
                      optionClass = 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300';
                    } else if (isCorrect) {
                      optionClass = 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10';
                    } else {
                      optionClass = 'border-gray-200 dark:border-slate-600 opacity-50';
                    }
                  } else if (isSelected) {
                    optionClass = 'border-primary bg-primary/5';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      disabled={showExplanation}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${optionClass}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-current text-xs font-semibold flex-shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-sm text-seal-navy dark:text-white">{option}</span>
                        {showExplanation && isCorrect && (
                          <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto flex-shrink-0" />
                        )}
                        {showExplanation && isSelected && !isCorrect && (
                          <XCircle className="h-5 w-5 text-red-500 ml-auto flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {showExplanation && (
                <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Explication</p>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    {questions[currentIndex]!.explanation}
                  </p>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                {!showExplanation ? (
                  <Button onClick={confirmAnswer} disabled={selectedAnswer === null}>
                    Valider
                  </Button>
                ) : (
                  <Button onClick={nextQuestion}>
                    {currentIndex < questions.length - 1 ? 'Question suivante' : 'Voir les résultats'}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ---- FINISHED ---- */}
      {quizState === 'finished' && result && (
        <>
          <Card className="animate-fade-in-up">
            <CardContent className="py-8 text-center">
              {result.passed ? (
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              ) : (
                <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              )}
              <h2 className="text-xl font-medium text-seal-navy dark:text-white mb-2">
                {result.percentage >= 80 ? 'Bravo !' : result.passed ? 'Quiz réussi' : 'Quiz terminé'}
              </h2>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-4">
                {result.passed
                  ? `Vous avez réussi le quiz « ${activeCampaign?.title} ».`
                  : `Vous n'avez pas atteint le score minimum de ${passingThreshold}%. N'hésitez pas à réessayer.`}
              </p>

              {/* Radial score visual */}
              <div className="flex items-center justify-center mb-6">
                <div className="relative h-36 w-36">
                  <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-200 dark:text-slate-700" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8"
                      className={result.passed ? 'text-emerald-500' : 'text-red-500'}
                      strokeDasharray={`${(result.percentage / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-semibold text-seal-navy dark:text-white">{result.percentage}%</span>
                    <span className="text-xs text-seal-gray-500 dark:text-slate-400">{result.score}/{result.total}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Badge variant={result.passed ? 'success' : 'warning'} className="text-sm px-4 py-1">
                  {result.passed ? 'Réussi' : 'Non réussi'}
                </Badge>
                {result.passed && (
                  <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-full px-3 py-1 text-xs font-medium">
                    <Award className="h-3.5 w-3.5" /> Badge obtenu
                  </div>
                )}
                {/* Gamification level */}
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${gamificationLevel.color}`}>
                  <GamificationIcon className="h-3.5 w-3.5" />
                  {gamificationLevel.label}
                </div>
              </div>

              {/* Score-based feedback */}
              <ScoreFeedback percentage={result.percentage} />

              {/* Category breakdown */}
              {Object.keys(categoryScores).length > 0 && (
                <div className="mt-6 text-left max-w-md mx-auto">
                  <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-3 text-center">Résultats par catégorie</p>
                  <div className="space-y-3">
                    {Object.entries(categoryScores).map(([cat, { correct, total }]) => {
                      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-seal-navy dark:text-white">{cat}</span>
                            <span className="text-xs text-seal-gray-500 dark:text-slate-400">{correct}/{total} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.max(pct, 3)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-question review */}
              {questions.length > 0 && (
                <div className="mt-6 text-left max-w-lg mx-auto">
                  <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-3 text-center">Revue des reponses</p>
                  <div className="space-y-3">
                    {questions.map((q, qi) => {
                      const userAnswer = answers[q.id];
                      const isCorrect = userAnswer === q.correctIndex;
                      return (
                        <div key={q.id} className={`rounded-xl border p-3 shadow-sm transition-all duration-200 ${isCorrect ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'}`}>
                          <div className="flex items-start gap-2">
                            {isCorrect ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-seal-navy dark:text-white">{qi + 1}. {q.question}</p>
                              {!isCorrect && (
                                <p className="text-[11px] mt-1">
                                  <span className="text-red-500 line-through">{q.options[userAnswer ?? 0]}</span>
                                  <span className="text-seal-gray-500 dark:text-slate-400 mx-1">→</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{q.options[q.correctIndex]}</span>
                                </p>
                              )}
                              {q.explanation && (
                                <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1 italic">{q.explanation}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
                <Button onClick={backToCampaigns} variant="outline">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Campagnes
                </Button>
                <Button onClick={beginQuiz} variant="secondary">
                  <RotateCcw className="h-4 w-4 mr-1" /> Recommencer
                </Button>
                {result.passed && result.auditLogId && (
                  <Button
                    onClick={() => {
                      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
                      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
                      window.open(`${apiUrl}/quiz/certificate/${result.auditLogId}?token=${encodeURIComponent(token || '')}`, '_blank');
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" /> Télécharger le certificat
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {leaderboard.length > 0 && (
            <Card className="animate-fade-in-up">
              <CardHeader>
                <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Classement
                </h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {leaderboard.map((entry, idx) => (
                    <div
                      key={entry.user.id}
                      className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                    >
                      <span className="text-sm font-semibold w-6 text-center">
                        {idx < 3 ? MEDAL_ICONS[idx] : <span className="text-seal-gray-500 dark:text-slate-400">{idx + 1}</span>}
                      </span>
                      <span className="text-sm font-medium text-seal-navy dark:text-white flex-1">
                        {entry.user.firstName} {entry.user.lastName}
                      </span>
                      <Badge variant={entry.score / entry.total >= 0.7 ? 'success' : 'warning'}>
                        {Math.round((entry.score / entry.total) * 100)}%
                      </Badge>
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                        {entry.score}/{entry.total}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
