"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@omnitech/ui";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import {
  User,
  Shield,
  Sparkles,
  ArrowRight,
  Keyboard,
  Layers,
  FileSignature,
  Search,
  CheckCircle2,
  Circle,
  HelpCircle,
  Command,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Onboarding steps                                                   */
/* ------------------------------------------------------------------ */

interface OnboardingStep {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  gradient: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: "profile",
    icon: User,
    title: "Votre profil",
    description:
      "Completez votre profil et ajoutez une photo pour que vos collegues vous identifient facilement.",
    href: "/profile",
    actionLabel: "Modifier mon profil",
    gradient: "from-purple-500 to-purple-600",
  },
  {
    id: "mfa",
    icon: Shield,
    title: "Activer le MFA",
    description:
      "Renforcez la sécurité de votre compte en activant l'authentification multi-facteurs (2FA).",
    href: "/mfa",
    actionLabel: "Configurer le MFA",
    gradient: "from-emerald-500 to-emerald-600",
  },
  {
    id: "spaces",
    icon: Layers,
    title: "Explorer vos espaces",
    description:
      "Decouvrez les espaces de tickets : chaque equipe dispose de son propre espace avec des workflows adaptes.",
    href: "/tickets",
    actionLabel: "Voir les espaces",
    gradient: "from-blue-500 to-blue-600",
  },
  {
    id: "chartes",
    icon: FileSignature,
    title: "Signer les chartes",
    description:
      "Consultez et signez les chartes obligatoires (charte informatique, RGPD, sécurité).",
    href: "/chartes",
    actionLabel: "Voir les chartes",
    gradient: "from-seal-bordeaux to-red-700",
  },
  {
    id: "ai",
    icon: Sparkles,
    title: "Decouvrir l'assistant IA",
    description:
      "Utilisez la recherche intelligente pour trouver documents, tickets et procedures en un instant.",
    href: "/search",
    actionLabel: "Essayer la recherche",
    gradient: "from-[#F68D2E] to-[#e07d1f]",
  },
];

/* ------------------------------------------------------------------ */
/*  Raccourcis clavier                                                 */
/* ------------------------------------------------------------------ */

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘K", label: "Recherche rapide / palette de commandes" },
  { keys: "?", label: "Afficher tous les raccourcis clavier" },
  { keys: "Ctrl+Shift+D", label: "Nouveau document express" },
  { keys: "Alt", label: "Mode focus (masquer la sidebar)" },
  { keys: "Ctrl+Alt+1-4", label: "Naviguer entre les hubs" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function WelcomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [chartesSigned, setChartesSigned] = useState<boolean>(false);
  const [chartesLoaded, setChartesLoaded] = useState(false);

  // Fetch charter signature status. Le backend renvoie { allSigned: boolean }
  // — PAS un array. Avant ce fix, la réponse (non-array) retombait sur le else
  // → chartesSigned restait à false même si toutes les chartes étaient signées.
  useEffect(() => {
    api
      .get<{ allSigned: boolean }>("/chartes/status")
      .then((r) => setChartesSigned(r.data?.allSigned === true))
      .catch(() => setChartesSigned(false))
      .finally(() => setChartesLoaded(true));
  }, []);

  // Compute step completion. Le profil est considéré complet si au moins
  // l'avatar OU le téléphone est renseigné (on évite de pénaliser les users
  // qui ont complété certaines infos mais pas l'avatar, par exemple).
  const stepStatus: Record<string, boolean> = {
    profile: !!user?.avatarUrl || !!user?.phone,
    mfa: !!user?.mfaEnabled,
    spaces: false, // always todo — exploratory
    chartes: chartesSigned,
    ai: false, // always todo — exploratory
  };

  const completedCount = Object.values(stepStatus).filter(Boolean).length;
  const totalSteps = STEPS.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Bienvenue sur l'intranet OMNITECH Security"
        subtitle="Votre espace de travail sécurisé pour la gestion documentaire, le support IT et la conformité."
        icon={Sparkles}
        hub="monEspace"
      />

      {/* Message d'accueil */}
      <Card className="mb-8 border-l-4 border-l-[#F68D2E]">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#F68D2E]/10 dark:bg-[#F68D2E]/30">
              <Shield className="h-6 w-6 text-slate-900 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                La cybersécurité, notre valeur fondamentale
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-seal-gray-500 dark:text-slate-400">
                Chez OMNITECH Security, la protection de l&apos;information est
                au cœur de chaque action. Cet intranet est conçu selon les
                exigences ISO 27001:2022 et NIS2. Chaque collaborateur est un
                maillon essentiel de notre chaîne de sécurité.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
            Premiers pas
          </h3>
          <span className="text-sm font-semibold text-seal-navy dark:text-white">
            {completedCount}/{totalSteps} etapes completees
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-seal-blue to-[#F68D2E] transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Onboarding steps */}
      <div className="mb-10 space-y-3">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = stepStatus[step.id] ?? false;
          return (
            <Card
              key={step.id}
              className={`animate-fade-in-up transition-all duration-150 ${done ? "opacity-80" : ""}`}
              style={{
                animationDelay: `${idx * 60}ms`,
                animationFillMode: "both",
              }}
            >
              <CardContent className="flex items-center gap-4 py-4">
                {/* Step status icon */}
                <div className="flex-shrink-0">
                  {done ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300 dark:text-slate-600" />
                  )}
                </div>

                {/* Step icon */}
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${step.gradient} shadow-md`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>

                {/* Step content */}
                <div className="min-w-0 flex-1">
                  <h4
                    className={`text-sm font-semibold ${done ? "text-seal-gray-500 dark:text-slate-400 line-through" : "text-seal-navy dark:text-white"}`}
                  >
                    {step.title}
                  </h4>
                  <p className="mt-0.5 text-xs leading-relaxed text-seal-gray-500 dark:text-slate-400">
                    {step.description}
                  </p>
                </div>

                {/* Action button */}
                <Link
                  href={step.href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex-shrink-0 ${
                    done
                      ? "text-seal-gray-500 dark:text-slate-500 hover:text-seal-navy dark:hover:text-white"
                      : "bg-[#F68D2E]/5 text-slate-900 dark:bg-seal-orange/10 dark:text-seal-orange hover:bg-[#F68D2E]/10 dark:hover:bg-seal-orange/20"
                  }`}
                >
                  {done ? "Revoir" : step.actionLabel}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Raccourcis clavier */}
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
        Raccourcis clavier utiles
      </h3>
      <Card className="mb-10">
        <CardContent className="py-5">
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="h-5 w-5 text-slate-900" />
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              Gagnez du temps avec ces raccourcis
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SHORTCUTS.map((s) => (
              <div
                key={s.keys}
                className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800"
              >
                <kbd className="inline-flex min-w-[3.5rem] items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                  {s.keys}
                </kbd>
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#F68D2E]/5 px-3 py-2 dark:bg-[#F68D2E]/20">
            <HelpCircle className="h-4 w-4 flex-shrink-0 text-slate-900 dark:text-blue-400" />
            <p className="text-xs text-slate-900 dark:text-blue-300">
              Appuyez sur{" "}
              <kbd className="mx-0.5 rounded border bg-white px-1 py-0.5 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-700">
                ?
              </kbd>{" "}
              depuis n&apos;importe quelle page pour afficher la liste complete
              des raccourcis.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bottom links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/tips" className="group block">
          <Card hoverable className="h-full">
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F68D2E]/10">
                <Sparkles className="h-4 w-4 text-slate-900" />
              </div>
              <div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-[#F68D2E] transition-colors">
                  Toutes les astuces
                </p>
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                  Raccourcis, bonnes pratiques et conseils securite
                </p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-seal-gray-500/40 transition-transform group-hover:translate-x-1" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard" className="group block">
          <Card hoverable className="h-full">
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F68D2E]/10 dark:bg-[#F68D2E]/30">
                <Command className="h-4 w-4 text-slate-900 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-[#F68D2E] transition-colors">
                  Tableau de bord
                </p>
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                  Retrouvez vos widgets, notifications et indicateurs
                </p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-seal-gray-500/40 transition-transform group-hover:translate-x-1" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
