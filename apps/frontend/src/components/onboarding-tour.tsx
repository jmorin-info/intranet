'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@omnitech/ui';
import {
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  Search,
  Bell,
  Lightbulb,
  User,
  Command,
  StickyNote,
  BookOpen,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Storage key                                                        */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'onboarding_completed';

/* ------------------------------------------------------------------ */
/*  Steps                                                              */
/* ------------------------------------------------------------------ */

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Selector of an element to visually highlight with an overlay ring. */
  highlight?: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: 'Bienvenue sur l\'intranet OMNITECH',
    description:
      'Votre espace de travail centralisé : documents, tickets, conformité, veille et sécurité. Ce petit tour dure environ une minute.',
  },
  {
    icon: Search,
    title: 'Barre latérale et navigation',
    description:
      'La sidebar regroupe tous les modules : Documents, Tickets, Wiki, Veille, Incidents, etc. Cliquez sur un hub pour accéder au domaine correspondant.',
    highlight: 'aside, nav[role="navigation"]',
  },
  {
    icon: Command,
    title: 'Palette de commandes (\u2318K)',
    description:
      'Appuyez sur Ctrl+K (ou \u2318K sur Mac) à tout moment pour ouvrir la palette de commandes. Recherchez une page, un document ou un collègue instantanément sans quitter le clavier.',
    highlight: 'header [aria-label*="recherche" i], header [data-quick-search]',
  },
  {
    icon: User,
    title: 'Votre profil',
    description:
      'Complétez votre profil (photo, téléphone, compétences) pour faciliter la collaboration. Activez la 2FA depuis Mon espace > MFA pour renforcer la sécurité de votre compte.',
    highlight: 'header [data-user-menu], header [aria-label*="profil" i]',
  },
  {
    icon: BookOpen,
    title: 'Wiki et base de connaissances',
    description:
      'Le Wiki centralise les procédures, runbooks et la documentation interne. Créez et éditez des articles en Markdown avec un historique complet des révisions.',
    highlight: 'aside a[href*="wiki"], nav a[href*="wiki"]',
  },
  {
    icon: Bell,
    title: 'Vos notifications',
    description:
      'Les notifications importantes — documents à signer, tickets assignés, alertes sécurité — s\'affichent ici. Un badge orange signale les éléments non lus.',
    highlight: 'header [aria-label*="notification" i]',
  },
  {
    icon: StickyNote,
    title: 'Annotations et commentaires',
    description:
      'Ajoutez des annotations sur les documents et laissez des commentaires sur les tickets. Les mentions (@collègue) envoient une notification directe au destinataire.',
    highlight: '[data-annotations], [data-comments-section]',
  },
  {
    icon: Lightbulb,
    title: 'Besoin d\'aide ?',
    description:
      'Consultez le Guide de démarrage dans le menu Aide, l\'astuce du jour sur votre tableau de bord, ou appuyez sur ? pour voir tous les raccourcis clavier. Bonne exploration !',
    highlight: '#tip-of-the-day',
  },
];

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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);

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

  const current = STEPS[step];
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
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    goToStep(step + 1, 'next');
  }, [step, finish, goToStep]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      goToStep(step - 1, 'prev');
    }
  }, [step, goToStep]);

  if (!mounted || !open || !current) return null;

  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
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

      {/* Modal card */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        style={{ animation: 'otSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Progress bar */}
        <div className="h-1 overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#F9964A] to-[#004469] transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-6">
          <button
            onClick={finish}
            className="absolute right-3 top-4 rounded-lg p-1.5 text-seal-gray-500 transition hover:bg-gray-100 dark:hover:bg-slate-800"
            aria-label="Fermer le tour"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>

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
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-500">
                  Étape {step + 1} / {STEPS.length}
                </p>
                <h2
                  id="onboarding-title"
                  className="mt-1 text-lg font-semibold text-navy dark:text-white"
                >
                  {current.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-seal-gray-500 dark:text-slate-400">
                  {current.description}
                </p>
              </div>
            </div>
          </div>

          {/* Dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
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
