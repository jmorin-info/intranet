'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@omnitech/ui';
import { ChevronRight, ChevronLeft, X, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { getOnboardingSteps, type OnboardingStepData } from './onboarding/onboarding-steps';
import { MiniMockup } from './onboarding/mini-mockup';

/* ------------------------------------------------------------------ */
/*  Storage key + events                                               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'onboarding_completed';
const RESTART_EVENT = 'omnitech:onboarding:restart';

/**
 * Relance la visite guidée de l'intranet. Peut être appelée depuis n'importe
 * quel composant (menu utilisateur, page d'aide, etc.).
 */
export function restartOnboardingTour() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new CustomEvent(RESTART_EVENT));
}

/* ------------------------------------------------------------------ */
/*  Highlight rectangle hook                                           */
/* ------------------------------------------------------------------ */

function useHighlightRect(selector: string | undefined): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    function compute() {
      if (!selector) {
        setRect(null);
        return;
      }
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    }
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    const t = setTimeout(compute, 120);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      clearTimeout(t);
    };
  }, [selector]);

  return rect;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OnboardingTour() {
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);

  // Steps personnalisés selon le rôle de l'utilisateur connecté.
  // Si user pas encore chargé, tours par défaut (COLLABORATEUR) — sera
  // recomputé automatiquement quand user arrive.
  const steps = useMemo<OnboardingStepData[]>(
    () => getOnboardingSteps(user?.role),
    [user?.role],
  );

  useEffect(() => {
    setMounted(true);
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (done !== 'true') {
        // Slight delay so the main layout paints first
        const t = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Re-open the tour when explicitly restarted (via restartOnboardingTour()).
  useEffect(() => {
    function onRestart() {
      setStep(0);
      setDirection('next');
      setOpen(true);
    }
    window.addEventListener(RESTART_EVENT, onRestart);
    return () => window.removeEventListener(RESTART_EVENT, onRestart);
  }, []);

  // Raccourcis clavier : ← Prev, → Next, Enter Next, Esc Close.
  // N'interfère pas avec les inputs (les CTA ouvrent nouvel onglet, le tour
  // n'a pas de champ de saisie).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setDirection('prev');
        setStep((s) => (s > 0 ? s - 1 : s));
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        setDirection('next');
        setStep((s) => {
          if (s >= steps.length - 1) {
            try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
            setOpen(false);
            return s;
          }
          return s + 1;
        });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, steps.length]);

  const current = steps[step];
  const highlight = useHighlightRect(open ? current?.highlight : undefined);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const goToStep = useCallback(
    (newStep: number, dir: 'next' | 'prev') => {
      if (isAnimating) return;
      setIsAnimating(true);
      setDirection(dir);
      setTimeout(() => {
        setStep(newStep);
        setIsAnimating(false);
      }, 200);
    },
    [isAnimating],
  );

  const handleNext = useCallback(() => {
    if (step >= steps.length - 1) {
      finish();
      return;
    }
    goToStep(step + 1, 'next');
  }, [step, steps.length, finish, goToStep]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      goToStep(step - 1, 'prev');
    }
  }, [step, goToStep]);

  if (!mounted || !open || !current) return null;

  const Icon = current.icon;
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  const overlay = (
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{ animation: 'otFadeIn 0.3s ease-out' }}
    >
      {/* Highlight ring around target element */}
      {highlight && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-[#F9964A] ring-offset-2 ring-offset-transparent transition-all duration-300"
          style={{
            top: highlight.top - 6,
            left: highlight.left - 6,
            width: highlight.width + 12,
            height: highlight.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
        />
      )}

      {/* Modal card — max-w-4xl + 90vh pour occuper une grande partie de la
          fenêtre sur desktop. Le contenu overflow-y-auto pour les écrans
          courts. Backdrop plus contrasté pour effet "visite guidée" premium. */}
      <div
        className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] dark:bg-slate-900 dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]"
        style={{ animation: 'otSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header — gradient + progress bar + phase indicator */}
        <div className="relative bg-gradient-to-r from-[#004469] via-[#004469] to-[#003352] dark:from-slate-800 dark:to-slate-900 px-6 py-3">
          {/* Progress bar intégrée au header */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-[#F9964A] to-[#FFB874] transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F9964A]/20 flex-shrink-0">
                <Sparkles className="h-4 w-4 text-[#F9964A]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                  Visite guidée
                  {user?.firstName && ` · ${user.firstName}`}
                </p>
                <p className="text-[11px] text-white/90 font-medium truncate">
                  {step < 5
                    ? 'Phase 1 · Prise en main'
                    : step < steps.length - 1
                    ? 'Phase 2 · Votre rôle'
                    : 'Phase 3 · Pour aller plus loin'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-white/60 font-semibold tabular-nums">
                {step + 1} / {steps.length}
              </span>
              <button
                onClick={finish}
                className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Fermer le tour"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Animated content area */}
          <div
            className={`transition-all duration-200 ease-out ${
              isAnimating
                ? direction === 'next'
                  ? 'translate-x-6 opacity-0'
                  : '-translate-x-6 opacity-0'
                : 'translate-x-0 opacity-100'
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'rgba(249,150,74,0.14)', color: '#F9964A' }}
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-500">
                  Étape {step + 1} / {steps.length}
                  {user?.role && step >= 5 && step < steps.length - 1 && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#004469]/10 dark:bg-[#F9964A]/10 text-[9px] font-medium text-[#004469] dark:text-[#F9964A] normal-case tracking-normal">
                      Personnalisé pour votre rôle
                    </span>
                  )}
                </p>
                <h2
                  id="onboarding-title"
                  className="mt-1 text-lg font-semibold text-seal-navy dark:text-white"
                >
                  {current.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-seal-gray-500 dark:text-slate-400">
                  {current.description}
                </p>
              </div>
            </div>

            {/* Mini-mockup visuel (optionnel) */}
            {current.mockupKey && (
              <div className="mt-4">
                <MiniMockup variant={current.mockupKey} />
              </div>
            )}

            {/* Bullets "ce que vous pouvez faire" */}
            {current.bullets && current.bullets.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {current.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-seal-gray-500 dark:text-slate-400">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* CTA "Essayer maintenant" — s'ouvre dans un NOUVEL ONGLET pour
                que la visite guidée reste active sur l'onglet d'origine.
                L'utilisateur peut tester la feature puis revenir au tour. */}
            {current.cta && (
              <a
                href={current.cta.href}
                target="_blank"
                rel="noopener"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#F9964A]/10 hover:bg-[#F9964A]/20 px-3 py-1.5 text-xs font-semibold text-[#F9964A] transition-colors"
              >
                {current.cta.label} <ArrowRight className="h-3.5 w-3.5" />
                <span className="ml-1 text-[9px] font-normal text-[#F9964A]/70">(nouvel onglet)</span>
              </a>
            )}
          </div>

          {/* Dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? 'w-6 bg-[#F9964A]'
                    : i < step
                    ? 'w-1.5 bg-[#004469] dark:bg-blue-400'
                    : 'w-1.5 bg-gray-300 dark:bg-slate-600'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="mt-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={finish}>
                Passer
              </Button>
              {!isFirst && (
                <Button variant="ghost" size="sm" onClick={handlePrev} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  Retour
                </Button>
              )}
            </div>
            <Button variant="primary" size="sm" onClick={handleNext} className="gap-1">
              {isLast ? 'Terminé' : 'Suivant'}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Footer — raccourcis clavier (aide discrète, écran ≥ md) */}
        <div className="hidden md:flex items-center justify-center gap-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 px-6 py-2">
          <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[9px] font-mono">←</kbd>
            <kbd className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[9px] font-mono">→</kbd>
            Naviguer
          </span>
          <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[9px] font-mono">Entrée</kbd>
            Suivant
          </span>
          <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[9px] font-mono">Esc</kbd>
            Fermer
          </span>
        </div>
      </div>

      {/* Inline keyframes — no styled-jsx needed */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes otFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes otSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}} />
    </div>
  );

  return createPortal(overlay, document.body);
}
