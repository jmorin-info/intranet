"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Badge, Button } from "@omnitech/ui";
import {
  Building2,
  Bell,
  Sparkles,
  PenLine,
  FileText,
  Trophy,
  Keyboard,
  Plug,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { SubmitTestimonialDialog } from "@/components/testimonials/submit-dialog";
import type { CharteStatus, QuizHistoryData } from "./types";

// ---------- Department card ----------
export function ProfileDepartmentCard({
  departmentName,
}: {
  departmentName?: string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          {t("profile.departments")}
        </h2>
      </CardHeader>
      <CardContent>
        {departmentName ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {departmentName}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  {t("profile.mainDepartment")}
                </p>
              </div>
              <Badge variant="primary" className="ml-auto">
                Actif
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-3">
            Aucun département assigné
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Notifications summary card ----------
export function ProfileNotificationsSummary({
  unreadCount,
}: {
  unreadCount: number;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Notifications
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {unreadCount > 0
                  ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`
                  : "Toutes les notifications sont lues"}
              </p>
            </div>
          </div>
          <Link href="/notifications">
            <Button variant="outline" size="sm">
              Voir tout
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Testimonial CTA card ----------
export function ProfileTestimonialCta() {
  const [testimonialDialogOpen, setTestimonialDialogOpen] = useState(false);
  return (
    <>
      <Card className="border-dashed border-[#F9964A]/30 bg-gradient-to-br from-[#F9964A]/5 to-transparent">
        <CardContent className="py-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9964A]/15 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-[#F9964A]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
              Partagez votre expérience
            </h3>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
              L&apos;intranet vous aide au quotidien ? Dites-le en une phrase —
              après modération, votre témoignage apparaîtra sur le portail
              public.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTestimonialDialogOpen(true)}
            className="text-xs font-semibold text-[#F9964A] hover:text-[#e67d1e] whitespace-nowrap"
          >
            Partager →
          </button>
        </CardContent>
      </Card>
      <SubmitTestimonialDialog
        open={testimonialDialogOpen}
        onClose={() => setTestimonialDialogOpen(false)}
      />
    </>
  );
}

// ---------- Integrations link card (WebDAV Obsidian + Calendar Google/Outlook) ----------
export function ProfileIntegrationsCard() {
  return (
    <Link
      href="/profile/integrations"
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
    >
      <Card className="border-dashed border-[#296DC1]/30 bg-gradient-to-br from-[#296DC1]/5 to-transparent hover:border-[#296DC1]/60 transition-colors cursor-pointer">
        <CardContent className="py-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#296DC1]/15 flex-shrink-0">
            <Plug className="h-5 w-5 text-[#296DC1]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
              Mes intégrations
            </h3>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
              Calendrier Google/Outlook, vault Obsidian via WebDAV,
              notifications push…
            </p>
          </div>
          <span className="text-xs font-semibold text-[#296DC1] whitespace-nowrap">
            Configurer →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------- Chartes card ----------
export function ProfileChartesCard({ chartes }: { chartes: CharteStatus[] }) {
  if (chartes.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          Chartes obligatoires
        </h2>
      </CardHeader>
      <CardContent className="space-y-2">
        {chartes.map((charte) => (
          <div
            key={charte.id}
            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
          >
            <FileText
              className={`h-5 w-5 ${charte.signedAt ? "text-emerald-500" : "text-amber-500"}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                {charte.title}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {charte.signedAt
                  ? `Signée le ${formatDate(charte.signedAt)}`
                  : "En attente de signature"}
              </p>
            </div>
            <Badge variant={charte.signedAt ? "success" : "warning"}>
              {charte.signedAt ? "Signée" : "À signer"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Quiz history card ----------
export function ProfileQuizCard({
  quizHistory,
}: {
  quizHistory: QuizHistoryData | null;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> Quiz sécurité
        </h2>
      </CardHeader>
      <CardContent>
        {quizHistory ? (
          <div className="space-y-3">
            <div className="p-4 bg-gradient-to-r from-primary/5 to-emerald-500/5 rounded-xl border border-primary/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Meilleur score
                </span>
                <span className="text-2xl font-bold text-primary">
                  {quizHistory.bestScore}/{quizHistory.bestTotal}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-700"
                  style={{
                    width: `${Math.round((quizHistory.bestScore / quizHistory.bestTotal) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-right text-xs font-bold text-primary mt-1">
                {Math.round(
                  (quizHistory.bestScore / quizHistory.bestTotal) * 100,
                )}
                %
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="text-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  #{quizHistory.rank}
                </p>
                <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                  sur {quizHistory.totalParticipants} participants
                </p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <p className="text-sm font-medium text-seal-navy dark:text-white">
                  {formatDate(quizHistory.lastDate)}
                </p>
                <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                  Derniere tentative
                </p>
              </div>
            </div>
            <div className="text-center">
              <Link href="/quiz">
                <Button variant="outline" size="sm">
                  Rejouer le quiz
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Trophy className="h-8 w-8 text-seal-gray-500/30 mx-auto mb-2" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">
              Aucune participation au quiz
            </p>
            <Link
              href="/quiz"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              Tenter le quiz sécurité
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Keyboard shortcuts card ----------
export function ProfileKeyboardCard() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" /> Raccourcis clavier
        </h2>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[
            { keys: "Ctrl+K", desc: "Recherche" },
            { keys: "Ctrl+/", desc: "Aide" },
          ].map(({ keys, desc }) => (
            <div
              key={keys}
              className="flex items-center justify-between py-1.5 border-b border-gray-200 dark:border-slate-700 last:border-0"
            >
              <span className="text-sm text-seal-navy dark:text-white">
                {desc}
              </span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-300 rounded border border-gray-200 dark:border-slate-700">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
