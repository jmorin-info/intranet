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
  MessageSquare,
  FileCheck,
  Ticket,
  ClipboardList,
  Shield,
  LayoutDashboard,
  Star,
} from 'lucide-react';

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
      'Votre espace de travail centralisé : documents, tickets, wiki, runbooks, veille cyber, conformité ISO 27001 et chatbot IA. Ce tour guidé dure environ 2 minutes — vous pouvez le quitter à tout moment.',
  },
  {
    icon: Search,
    title: 'Barre latérale et navigation',
    description:
      'La sidebar regroupe tous les modules de l\'intranet : Documents, Tickets, Wiki, Runbooks, Veille, Incidents, Administration. Cliquez sur un élément pour accéder au module correspondant. La sidebar s\'adapte à votre rôle — vous ne voyez que les modules auxquels vous avez accès.',
    highlight: 'aside, nav[role="navigation"]',
  },
  {
    icon: Command,
    title: 'Palette de commandes (Ctrl+K)',
    description:
      'Appuyez sur Ctrl+K (ou \u2318K sur Mac) à tout moment pour ouvrir la palette. Recherchez une page, un document, un collègue ou une procédure instantanément sans quitter le clavier. Idéal pour naviguer vite.',
    highlight: 'header [aria-label*="recherche" i], header [data-quick-search]',
  },
  {
    icon: MessageSquare,
    title: 'Chatbot IA — Assistant intelligent',
    description:
      'Appuyez sur Ctrl+Shift+K pour ouvrir l\'assistant IA, ou cliquez sur la pastille flottante en bas à droite. Il répond aux questions sur les documents, le wiki et les procédures OMNITECH en s\'appuyant sur notre base de connaissances interne (RAG).',
  },
  {
    icon: LayoutDashboard,
    title: 'Tableau de bord personnalisable',
    description:
      'Votre dashboard est votre cockpit quotidien : tâches, actions requises, indicateurs, veille. Vous pouvez réorganiser les widgets via Paramètres du dashboard, et choisir un "profil" adapté à votre métier (Direction, RSSI, IT, Collaborateur).',
  },
  {
    icon: FileCheck,
    title: 'Documents et workflow d\'approbation',
    description:
      'Les documents suivent un workflow contrôlé : Brouillon → En revue → Approuvé → Publié. Le relecteur et l\'approbateur sont choisis par type de document. Les documents permanents n\'ont pas de date de revue — utile pour les chartes et règlements.',
    highlight: 'aside a[href*="documents"], nav a[href*="documents"]',
  },
  {
    icon: Ticket,
    title: 'Tickets et espaces de travail',
    description:
      'Les tickets sont organisés par espaces (IT, Sécurité, Services Généraux, Général). Chaque espace a ses propres catégories, son SLA et ses membres. Depuis le hub Tickets, choisissez l\'espace, puis créez votre demande. Les managers d\'espace peuvent gérer les membres et la configuration.',
    highlight: 'aside a[href*="tickets"], nav a[href*="tickets"]',
  },
  {
    icon: BookOpen,
    title: 'Wiki et base de connaissances',
    description:
      'Le Wiki centralise les articles, procédures et la documentation interne. Éditeur riche (Markdown + mise en forme visuelle), historique complet, catégories par domaine. Le chatbot IA s\'appuie sur le wiki pour répondre à vos questions.',
    highlight: 'aside a[href*="wiki"], nav a[href*="wiki"]',
  },
  {
    icon: ClipboardList,
    title: 'Runbooks — procédures pas-à-pas',
    description:
      'Les runbooks sont des procédures opérationnelles exécutables : création compte AD, déploiement poste, gestion incident sécurité, restauration Veeam, etc. Cochez chaque étape au fur et à mesure, l\'historique d\'exécution est conservé pour audit.',
    highlight: 'aside a[href*="runbooks"], nav a[href*="runbooks"]',
  },
  {
    icon: Shield,
    title: 'Veille cybersécurité',
    description:
      'Flux en temps réel des alertes CERT-FR, ANSSI, CISA, CVE et presse spécialisée, filtré sur le parc OMNITECH (Fortinet, VMware, Microsoft, Veeam…). Acquittez les alertes avec une action : Patché, Non applicable, Risque accepté. Cohérent avec ISO 27001 A.5.7 (threat intelligence).',
    highlight: 'aside a[href*="veille"], nav a[href*="veille"]',
  },
  {
    icon: Bell,
    title: 'Notifications',
    description:
      'Documents à signer, tickets assignés, alertes sécurité, mentions dans les commentaires : tout arrive ici. Un badge orange indique les éléments non lus. Vous pouvez aussi recevoir les notifications par email selon vos préférences.',
    highlight: 'header [aria-label*="notification" i]',
  },
  {
    icon: User,
    title: 'Votre profil et la sécurité (MFA)',
    description:
      'Complétez votre profil (photo, téléphone, compétences) pour faciliter la collaboration. Activez l\'authentification à deux facteurs (MFA) depuis Mon espace > MFA. Obligatoire pour les rôles sensibles (DIRECTION, ADMIN, RSSI).',
    highlight: 'header [data-user-menu], header [aria-label*="profil" i]',
  },
  {
    icon: StickyNote,
    title: 'Annotations et collaboration',
    description:
      'Ajoutez des annotations sur les documents, commentez les tickets, mentionnez un collègue avec @prenom pour lui envoyer une notification directe. Toutes les interactions sont horodatées et restent accessibles pour audit.',
    highlight: '[data-annotations], [data-comments-section]',
  },
  {
    icon: Star,
    title: 'Enquêtes de satisfaction',
    description:
      'De temps en temps, l\'intranet vous proposera de répondre à une courte enquête pour améliorer vos outils de travail. Participez ! Vos retours pilotent directement les prochaines évolutions.',
  },
  {
    icon: Lightbulb,
    title: 'Besoin d\'aide ?',
    description:
      'Astuce du jour sur votre dashboard (navigation Précédente/Suivante), Guide de démarrage dans le menu Aide, raccourcis clavier avec la touche "?" et bien sûr le chatbot IA qui connait toute la doc OMNITECH. Bonne exploration !',
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
                  className="mt-1 text-lg font-semibold text-seal-navy dark:text-white"
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
