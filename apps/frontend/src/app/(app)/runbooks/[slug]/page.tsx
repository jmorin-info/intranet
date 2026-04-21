'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Skeleton,
  EmptyState,
} from '@omnitech/ui';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  ListChecks,
  Play,
  User,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

interface RunbookDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  version: string;
  isPublished: boolean;
  content: string;
  createdAt: string;
  updatedAt: string;
  author?: { firstName: string; lastName: string } | null;
}

interface Step {
  title?: string;
  description?: string;
  text?: string;
}

function parseSteps(content: string): Array<{ title: string; description?: string }> {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: string | Step, idx) => {
      if (typeof s === 'string') {
        return { title: s || `Étape ${idx + 1}` };
      }
      return {
        title: s.title || s.text || `Étape ${idx + 1}`,
        description: s.description,
      };
    });
  } catch {
    // fallback : contenu en texte brut, une étape par ligne non vide
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => ({ title: line }));
  }
}

const PROGRESS_KEY = (id: string) => `runbook_progress_${id}`;

function loadProgress(id: string): Set<number> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY(id));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveProgress(id: string, checked: Set<number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROGRESS_KEY(id), JSON.stringify([...checked]));
  } catch {
    /* quota dépassé — silencieux */
  }
}

export default function RunbookDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [runbook, setRunbook] = useState<RunbookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await api.get<RunbookDetail>(`/runbooks/${slug}`);
        setRunbook(data);
        setChecked(loadProgress(data.id));
      } catch {
        setRunbook(null);
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetch();
  }, [slug]);

  const steps = runbook ? parseSteps(runbook.content) : [];

  const toggleStep = (idx: number) => {
    if (!runbook) return;
    const next = new Set(checked);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setChecked(next);
    saveProgress(runbook.id, next);
  };

  const resetProgress = () => {
    if (!runbook) return;
    setChecked(new Set());
    saveProgress(runbook.id, new Set());
    toast.success('Progression réinitialisée');
  };

  const startExecution = async () => {
    if (!runbook) return;
    setStarting(true);
    try {
      await api.post(`/runbooks/${runbook.id}/execute`);
      toast.success('Exécution démarrée — tracée dans le journal');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || "Impossible de démarrer l'exécution");
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 mx-auto max-w-4xl">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!runbook) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 animate-fade-in-up">
        <Link
          href="/runbooks"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux runbooks
        </Link>
        <EmptyState
          type="documents"
          title="Runbook introuvable"
          description="Ce runbook n'existe plus, a été dépublié ou n'a jamais existé. Revenez à la liste pour trouver ce que vous cherchez."
          action={
            <Link
              href="/runbooks"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
            >
              Voir tous les runbooks
            </Link>
          }
        />
      </div>
    );
  }

  const completedPct = steps.length > 0 ? Math.round((checked.size / steps.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in-up">
      <Link
        href="/runbooks"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux runbooks
      </Link>

      <PageHeader
        title={runbook.title}
        subtitle={runbook.description ?? undefined}
        icon={BookOpen}
        hub="work"
        meta={
          <div className="flex items-center flex-wrap gap-3 text-xs text-seal-gray-500 dark:text-slate-400">
            {runbook.category && <Badge variant="info">{runbook.category}</Badge>}
            <Badge variant="navy">v{runbook.version}</Badge>
            {!runbook.isPublished && <Badge variant="draft">Brouillon</Badge>}
            {runbook.author && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {runbook.author.firstName} {runbook.author.lastName}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Mis à jour {formatRelativeTime(runbook.updatedAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3 w-3" />
              {steps.length} étape{steps.length > 1 ? 's' : ''}
            </span>
          </div>
        }
        actions={
          <Button onClick={startExecution} loading={starting} disabled={starting || steps.length === 0}>
            <Play className="h-4 w-4" /> Démarrer l&apos;exécution
          </Button>
        }
      />

      {/* Progression locale (localStorage) */}
      {steps.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-400">
                Progression locale
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-seal-navy dark:text-white">
                  {checked.size} / {steps.length}
                </span>
                {checked.size > 0 && (
                  <button
                    type="button"
                    onClick={resetProgress}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${completedPct}%` }}
                aria-valuenow={completedPct}
                aria-valuemin={0}
                aria-valuemax={100}
                role="progressbar"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-seal-navy dark:text-white">Étapes</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {steps.length === 0 ? (
            <EmptyState
              type="general"
              title="Runbook sans étapes"
              description="Ce runbook ne contient pas encore d'étapes. Revenez plus tard ou contactez un administrateur pour l'enrichir."
            />
          ) : (
            <ol className="space-y-2">
              {steps.map((step, idx) => {
                const done = checked.has(idx);
                return (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => toggleStep(idx)}
                      className={[
                        'group w-full flex items-start gap-3 rounded-lg border p-3 text-left transition',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9964A]',
                        done
                          ? 'bg-emerald-50/60 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                          : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-primary/40',
                      ].join(' ')}
                      aria-pressed={done}
                    >
                      <span
                        className={[
                          'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0 mt-0.5',
                          done
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 group-hover:bg-primary/20 group-hover:text-primary',
                        ].join(' ')}
                      >
                        {done ? '✓' : idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={[
                            'text-sm',
                            done
                              ? 'text-emerald-700 dark:text-emerald-300 line-through decoration-emerald-400/60'
                              : 'text-seal-navy dark:text-white',
                          ].join(' ')}
                        >
                          {step.title}
                        </p>
                        {step.description && (
                          <p className="mt-1 text-xs text-seal-gray-500 dark:text-slate-400 whitespace-pre-wrap">
                            {step.description}
                          </p>
                        )}
                      </div>
                      <ArrowRight
                        className={`h-3.5 w-3.5 flex-shrink-0 mt-1.5 transition-transform ${done ? 'text-emerald-500' : 'text-seal-gray-500/30 group-hover:text-primary group-hover:translate-x-0.5'}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
