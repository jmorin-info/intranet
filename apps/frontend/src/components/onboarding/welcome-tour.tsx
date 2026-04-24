'use client';

/**
 * WelcomeTour — modale 6 étapes de première connexion.
 *
 * Déclenchement :
 *   - Au mount du layout `(app)/layout.tsx`.
 *   - Ouvre la modale si `user.onboardingCompletedAt` est null ET que le compte
 *     a moins de 7 jours (évite de surprendre les comptes existants lors du
 *     déploiement de la migration — les NULL legacy ne déclenchent rien).
 *   - Également ouvert via `replayWelcomeTour()` (depuis Préférences profil).
 *
 * Skippable à tout moment (X, Escape, bouton "Passer") — considéré comme
 * complétion normale côté serveur (`POST /users/me/onboarding-complete`).
 *
 * "Rappeler plus tard" (dernière étape) : ne persiste PAS de completion ; pose
 * un flag localStorage 7 jours pour ne pas re-harceler l'utilisateur à chaque
 * rafraîchissement de page.
 *
 * Aucune dépendance framer-motion — animations via classes CSS (animate-* et
 * transitions inline sur la slide active).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, Button } from '@omnitech/ui';
import {
  Shield,
  LayoutDashboard,
  FileText,
  PenSquare,
  MessageCircle,
  Lock,
  Rocket,
  ChevronLeft,
  ChevronRight,
  SkipForward,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

/* ------------------------------------------------------------------ */
/*  Constantes + event de replay                                      */
/* ------------------------------------------------------------------ */

const POSTPONE_LS_KEY = 'welcome_tour_postponed_until';
const REPLAY_EVENT = 'omnitech:welcome-tour:replay';
const MAX_ACCOUNT_AGE_DAYS = 7;

/**
 * Ouverture programmatique du tour depuis n'importe quel composant
 * (ex : bouton "Revoir le tour" des préférences profil).
 */
export function replayWelcomeTour(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(POSTPONE_LS_KEY);
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT));
}

/* ------------------------------------------------------------------ */
/*  Step definitions                                                   */
/* ------------------------------------------------------------------ */

type StepRender = (ctx: { firstName: string; t: (k: string) => string }) => React.ReactNode;

interface Step {
  key: string;
  titleKey: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // tailwind bg class for icon halo
  render: StepRender;
}

const STEPS: Step[] = [
  {
    key: 'welcome',
    titleKey: 'welcomeTour.step1.title',
    icon: Shield,
    accent: 'bg-primary/15 text-primary',
    render: ({ firstName, t }) => (
      <div className="text-center space-y-3">
        <p className="text-base font-medium text-seal-navy dark:text-white">
          {t('welcomeTour.step1.title')}, {firstName}
        </p>
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('welcomeTour.step1.tagline')}
        </p>
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('welcomeTour.step1.body')}
        </p>
      </div>
    ),
  },
  {
    key: 'dashboard',
    titleKey: 'welcomeTour.step2.title',
    icon: LayoutDashboard,
    accent: 'bg-[#296DC1]/15 text-[#296DC1]',
    render: ({ t }) => (
      <div className="space-y-3 text-center">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('welcomeTour.step2.body')}
        </p>
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-[#296DC1]/10 px-3 py-1 text-xs font-medium text-[#296DC1]">
          <LayoutDashboard className="h-3.5 w-3.5" />
          {t('welcomeTour.step2.hint')}
        </div>
      </div>
    ),
  },
  {
    key: 'documents',
    titleKey: 'welcomeTour.step3.title',
    icon: FileText,
    accent: 'bg-[#006233]/15 text-[#006233]',
    render: ({ t }) => (
      <div className="space-y-4 text-center">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('welcomeTour.step3.body')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#006233]/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-[#006233]" />
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <PenSquare className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'chatbot',
    titleKey: 'welcomeTour.step4.title',
    icon: MessageCircle,
    accent: 'bg-primary/15 text-primary',
    render: ({ t }) => (
      <div className="space-y-3 text-center">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('welcomeTour.step4.body')}
        </p>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400">
          {t('welcomeTour.step4.shortcut')}{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-[11px] font-mono font-semibold">
            Ctrl
          </kbd>{' '}
          +{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-[11px] font-mono font-semibold">
            Shift
          </kbd>{' '}
          +{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-[11px] font-mono font-semibold">
            K
          </kbd>
        </p>
      </div>
    ),
  },
  {
    key: 'security',
    titleKey: 'welcomeTour.step5.title',
    icon: Lock,
    accent: 'bg-[#892034]/15 text-[#892034]',
    render: ({ t }) => (
      <div className="space-y-4 text-center">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('welcomeTour.step5.body')}
        </p>
      </div>
    ),
  },
  {
    key: 'ready',
    titleKey: 'welcomeTour.step6.title',
    icon: Rocket,
    accent: 'bg-primary/15 text-primary',
    render: ({ t }) => (
      <div className="space-y-4 text-center">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('welcomeTour.step6.body')}
        </p>
        <ul className="text-left text-sm text-seal-navy dark:text-white space-y-2 inline-block">
          <li className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-[11px] font-mono font-semibold">
              Cmd
            </kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-[11px] font-mono font-semibold">
              K
            </kbd>
            <span className="text-seal-gray-500 dark:text-slate-400 text-xs">
              {t('welcomeTour.step6.shortcutSearch')}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-[11px] font-mono font-semibold">
              ?
            </kbd>
            <span className="text-seal-gray-500 dark:text-slate-400 text-xs">
              {t('welcomeTour.step6.shortcutHelp')}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-[11px] font-mono font-semibold">
              Alt
            </kbd>
            <span>+ clic</span>
            <span className="text-seal-gray-500 dark:text-slate-400 text-xs">
              {t('welcomeTour.step6.shortcutGlance')}
            </span>
          </li>
        </ul>
      </div>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Trigger logic                                                      */
/* ------------------------------------------------------------------ */

function shouldShowForUser(user: {
  onboardingCompletedAt?: string | null;
  createdAt?: string;
}): boolean {
  // Déjà complété → on n'affiche rien.
  if (user.onboardingCompletedAt) return false;
  // Besoin du createdAt pour ne pas harceler les comptes anciens lors du
  // déploiement de la feature (tous auront `onboardingCompletedAt === null`).
  if (!user.createdAt) return false;
  const created = new Date(user.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  if (ageDays > MAX_ACCOUNT_AGE_DAYS) return false;
  // "Rappeler plus tard" → flag LS posé à +7j.
  try {
    const postponed = localStorage.getItem(POSTPONE_LS_KEY);
    if (postponed) {
      const until = parseInt(postponed, 10);
      if (!Number.isNaN(until) && Date.now() < until) return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WelcomeTour() {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Open automatiquement une fois par session de layout si les conditions sont réunies.
  useEffect(() => {
    if (!user) return;
    if (shouldShowForUser(user)) {
      setStepIndex(0);
      setOpen(true);
    }
  }, [user]);

  // Replay externe via CustomEvent.
  useEffect(() => {
    const handler = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, handler);
    return () => window.removeEventListener(REPLAY_EVENT, handler);
  }, []);

  const currentStep = STEPS[stepIndex]!;
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

  const completeOnServer = useCallback(async () => {
    try {
      const { data } = await api.post('/users/me/onboarding-complete', {});
      if (user && data?.onboardingCompletedAt) {
        setUser({ ...user, onboardingCompletedAt: data.onboardingCompletedAt });
      }
    } catch {
      // Silencieux — on ne bloque pas la fermeture du tour sur un échec réseau.
    }
  }, [user, setUser]);

  const close = useCallback(
    async (opts: { markCompleted: boolean }) => {
      setOpen(false);
      if (opts.markCompleted) {
        await completeOnServer();
      }
    },
    [completeOnServer],
  );

  const handleSkip = useCallback(() => {
    void close({ markCompleted: true });
  }, [close]);

  const handleFinish = useCallback(() => {
    void close({ markCompleted: true });
  }, [close]);

  const handlePostpone = useCallback(() => {
    try {
      const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(POSTPONE_LS_KEY, String(until));
    } catch {
      /* ignore quota */
    }
    setOpen(false);
  }, []);

  const goNext = useCallback(() => {
    if (isLast) {
      handleFinish();
    } else {
      setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
    }
  }, [isLast, handleFinish]);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToMfa = useCallback(() => {
    void close({ markCompleted: true }).then(() => {
      router.push('/profile#security');
    });
  }, [close, router]);

  // Contenu de la slide active — memoisé pour éviter les re-render inutiles
  const slide = useMemo(() => currentStep.render({
    firstName: user?.firstName ?? '',
    t,
  }), [currentStep, user?.firstName, t]);

  if (!open) return null;

  const Icon = currentStep.icon;
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <Dialog
      open={open}
      onClose={handleSkip}
      title={t(currentStep.titleKey)}
      description={`${t('welcomeTour.stepLabel')} ${stepIndex + 1} ${t('welcomeTour.of')} ${STEPS.length}`}
      className="sm:max-w-xl"
    >
      <div className="flex flex-col gap-5">
        {/* Progress bar */}
        <div
          className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
        >
          <div
            className="h-full bg-gradient-to-r from-[#F9964A] via-[#F9964A] to-[#296DC1] transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Icon halo */}
        <div className="flex justify-center">
          <div
            className={`h-16 w-16 rounded-2xl flex items-center justify-center ${currentStep.accent}`}
            aria-hidden
          >
            <Icon className="h-8 w-8" />
          </div>
        </div>

        {/* Slide content — key forces re-mount for CSS animation */}
        <div
          key={currentStep.key}
          className="animate-fade-in-up min-h-[140px] flex items-center justify-center px-2"
        >
          <div className="w-full">{slide}</div>
        </div>

        {/* Step 5 direct CTA */}
        {currentStep.key === 'security' && (
          <div className="flex justify-center">
            <Button onClick={goToMfa} variant="primary" size="sm">
              <Lock className="h-3.5 w-3.5" />
              {t('welcomeTour.step5.cta')}
            </Button>
          </div>
        )}

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStepIndex(i)}
              aria-label={`${t('welcomeTour.stepLabel')} ${i + 1}`}
              aria-current={i === stepIndex}
              className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                i === stepIndex
                  ? 'w-6 bg-primary'
                  : i < stepIndex
                    ? 'w-1.5 bg-primary/50'
                    : 'w-1.5 bg-gray-300 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Footer nav */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={goPrev}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {t('welcomeTour.previous')}
              </Button>
            )}
            {!isLast && (
              <button
                type="button"
                onClick={handleSkip}
                className="inline-flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SkipForward className="h-3 w-3" />
                {t('welcomeTour.skip')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {isLast && (
              <button
                type="button"
                onClick={handlePostpone}
                className="text-xs text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t('welcomeTour.rememberLater')}
              </button>
            )}
            <Button onClick={goNext} size="sm">
              {isLast ? t('welcomeTour.finish') : t('welcomeTour.next')}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default WelcomeTour;

// Re-export du trigger pour les imports type "replayWelcomeTour" depuis
// n'importe quelle autre page / composant (ex : ProfilePreferencesSection).
export { POSTPONE_LS_KEY, REPLAY_EVENT };
