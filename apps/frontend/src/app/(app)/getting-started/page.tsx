"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@omnitech/ui";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { useCmsBlocks, getBlockData } from "@/lib/cms-client";
import {
  Shield,
  Sparkles,
  ArrowRight,
  Keyboard,
  CheckCircle2,
  Circle,
  HelpCircle,
  Command,
} from "lucide-react";
import {
  FALLBACK_STEPS,
  FALLBACK_SHORTCUTS,
  FALLBACK_WELCOME_MESSAGE,
  STEP_ICON_REGISTRY,
  normalizeStep,
  normalizeShortcut,
  normalizeWelcomeMessage,
  type OnboardingStep,
  type KeyboardShortcut,
  type StepStatusKey,
  type WelcomeMessage,
} from "./_cms";

export default function WelcomePage() {
  const user = useAuthStore((s) => s.user);
  const blocks = useCmsBlocks(
    ["onboarding.steps", "onboarding.shortcuts", "onboarding.welcome_message"],
    "fr",
  );
  const [chartesSigned, setChartesSigned] = useState<boolean>(false);

  useEffect(() => {
    api
      .get<{ allSigned: boolean }>("/chartes/status")
      .then((r) => setChartesSigned(r.data?.allSigned === true))
      .catch(() => setChartesSigned(false));
  }, []);

  const steps: OnboardingStep[] = useMemo(() => {
    const raw = getBlockData<unknown[]>(blocks, "onboarding.steps", []);
    const fromCms = Array.isArray(raw)
      ? raw.map(normalizeStep).filter((s): s is OnboardingStep => s !== null)
      : [];
    return fromCms.length > 0 ? fromCms : FALLBACK_STEPS;
  }, [blocks]);

  const shortcuts: KeyboardShortcut[] = useMemo(() => {
    const raw = getBlockData<unknown[]>(blocks, "onboarding.shortcuts", []);
    const fromCms = Array.isArray(raw)
      ? raw
          .map(normalizeShortcut)
          .filter((s): s is KeyboardShortcut => s !== null)
      : [];
    return fromCms.length > 0 ? fromCms : FALLBACK_SHORTCUTS;
  }, [blocks]);

  const welcomeMessage: WelcomeMessage = useMemo(() => {
    const raw = getBlockData<unknown>(
      blocks,
      "onboarding.welcome_message",
      null,
    );
    return normalizeWelcomeMessage(raw) ?? FALLBACK_WELCOME_MESSAGE;
  }, [blocks]);

  const stepStatus: Record<StepStatusKey, boolean> = {
    profile: !!user?.avatarUrl || !!user?.phone,
    mfa: !!user?.mfaEnabled,
    spaces: false,
    chartes: chartesSigned,
    ai: false,
  };

  const completedCount = Object.values(stepStatus).filter(Boolean).length;
  const totalSteps = steps.length;
  const progressPercent =
    totalSteps === 0 ? 0 : Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Bienvenue sur l'intranet OMNITECH Security"
        subtitle="Votre espace de travail sécurisé pour la gestion documentaire, le support IT et la conformité."
        icon={Sparkles}
        hub="monEspace"
      />

      <Card className="mb-8 border-l-4 border-l-[#F68D2E]">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#F68D2E]/10 dark:bg-[#F68D2E]/30">
              <Shield className="h-6 w-6 text-slate-900 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {welcomeMessage.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-seal-gray-500 dark:text-slate-400">
                {welcomeMessage.body}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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

      <div className="mb-10 space-y-3">
        {steps.map((step, idx) => {
          const Icon = STEP_ICON_REGISTRY[step.iconKey];
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
                <div className="flex-shrink-0">
                  {done ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300 dark:text-slate-600" />
                  )}
                </div>

                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${step.gradient} shadow-md`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>

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
            {shortcuts.map((s) => (
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
