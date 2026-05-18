"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  LifeBuoy,
  Sparkles,
  Ticket,
  Inbox,
  Clock,
  ChevronRight,
  Wrench,
  BookOpen,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

// The embedded chatbot is the SAME component as the FAB — it shares the same
// zustand store (`useChatbotStore`), so the conversation history is unified.
const AIChatbot = dynamic(
  () =>
    import("@/components/ai/ai-chatbot").then((m) => ({
      default: m.AIChatbot,
    })),
  { ssr: false, loading: () => <div className="shimmer h-80 rounded-2xl" /> },
);

// Self-service is now a secondary tab (FAQ / templates).
const SelfServicePortal = dynamic(
  () =>
    import("./SelfServicePortal").then((m) => ({
      default: m.SelfServicePortal,
    })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);

type TabId = "hub" | "selfservice" | "mytickets";

const TAB_DEFS: Array<{ id: TabId; icon: typeof Sparkles }> = [
  { id: "hub", icon: Sparkles },
  { id: "selfservice", icon: Wrench },
  { id: "mytickets", icon: Ticket },
];

interface MyTicket {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  IN_PROGRESS:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  WAITING:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  RESOLVED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  CLOSED: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-amber-500",
  MEDIUM: "bg-blue-500",
  LOW: "bg-gray-400",
};

/**
 * Widget "Mes tickets récents" — 5 derniers tickets créés par l'utilisateur.
 * Utilise `GET /tickets?userId=me&limit=5`.
 */
function MyRecentTickets() {
  const t = useTranslations("helpdesk");
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const { data } = await api.get("/tickets", {
          params: { userId: "me", limit: 5 },
        });
        if (cancelled) return;
        const list: MyTicket[] = Array.isArray(data?.tickets)
          ? data.tickets
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data)
              ? data
              : [];
        setTickets(list.slice(0, 5));
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message || t("loadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, t]);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F68D2E]/10 dark:bg-[#F68D2E]/30">
            <Inbox className="h-4 w-4 text-slate-900 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
            {t("myRecentTickets")}
          </h3>
        </div>
        <Link
          href="/tickets?userId=me"
          className="text-xs font-medium text-slate-900 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
        >
          {t("viewAll")}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {tickets === null && !error && (
          <div aria-busy="true" aria-live="polite">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-2 w-2 rounded-full shimmer flex-shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-16 rounded shimmer" />
                    <div className="h-3 w-12 rounded-full shimmer" />
                  </div>
                  <div className="h-3.5 w-4/5 rounded shimmer" />
                </div>
                <div className="h-2.5 w-10 rounded shimmer flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="px-4 py-5 text-center text-sm text-red-500 flex items-center justify-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}
        {tickets !== null && tickets.length === 0 && !error && (
          <div className="px-4 py-8 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20 mb-2">
              <Ticket
                className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-3">
              {t("noTicketsHint")}
            </p>
            <Link
              href="/tickets?create=true"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F68D2E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#d97420] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy focus-visible:ring-offset-2"
            >
              <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
              {t("createFirstTicket")}
            </Link>
          </div>
        )}
        {tickets !== null &&
          tickets.map((ticket) => {
            const statusLabel =
              ticket.status === "OPEN"
                ? t("status.open")
                : ticket.status === "IN_PROGRESS"
                  ? t("status.inProgress")
                  : ticket.status === "WAITING"
                    ? t("status.waiting")
                    : ticket.status === "RESOLVED"
                      ? t("status.resolved")
                      : ticket.status === "CLOSED"
                        ? t("status.closed")
                        : ticket.status;
            return (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[ticket.priority] || "bg-gray-300"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-semibold text-seal-gray-500 dark:text-slate-500 uppercase">
                      {ticket.reference}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[ticket.status] || "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400"}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-sm text-seal-navy dark:text-white truncate mt-0.5">
                    {ticket.title}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-500 shrink-0">
                  <Clock className="h-3 w-3" />
                  {new Date(
                    ticket.updatedAt || ticket.createdAt,
                  ).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
}

/**
 * Suggestions fréquentes (FAQ self-service) — raccourcis vers les
 * templates de ticket ou les pages wiki associées.
 */
function QuickSuggestions({ onSetTab }: { onSetTab: (id: TabId) => void }) {
  const t = useTranslations("helpdesk");
  const suggestions = [
    {
      icon: HelpCircle,
      label: t("suggestions.resetPassword"),
      href: "/helpdesk?tab=selfservice",
      onClick: () => onSetTab("selfservice"),
    },
    {
      icon: Wrench,
      label: t("suggestions.hardwareIssue"),
      href: "/helpdesk?tab=selfservice",
      onClick: () => onSetTab("selfservice"),
    },
    {
      icon: BookOpen,
      label: t("suggestions.requestAccess"),
      href: "/helpdesk?tab=selfservice",
      onClick: () => onSetTab("selfservice"),
    },
    {
      icon: AlertTriangle,
      label: t("suggestions.reportIncident"),
      href: "/incidents",
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 dark:border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-900 dark:text-blue-400" />
          {t("frequentRequests")}
        </h3>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {suggestions.map((s) => {
          const content = (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F68D2E]/10 dark:bg-[#F68D2E]/30 text-slate-900 dark:text-blue-400 shrink-0">
                <s.icon className="h-4 w-4" />
              </div>
              <span className="text-sm text-seal-navy dark:text-slate-200 flex-1">
                {s.label}
              </span>
              <ChevronRight className="h-4 w-4 text-seal-gray-500 dark:text-slate-500 shrink-0" />
            </>
          );
          if (s.onClick) {
            return (
              <button
                key={s.label}
                onClick={s.onClick}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition"
              >
                {content}
              </button>
            );
          }
          return (
            <Link
              key={s.label}
              href={s.href}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SupportPageInner() {
  const t = useTranslations("helpdesk");
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    initialTab === "selfservice" || initialTab === "mytickets"
      ? initialTab
      : "hub",
  );

  const handleSetTab = (id: TabId) => {
    setActiveTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const param = searchParams.get("tab") as TabId | null;
    if (param === "hub" || param === "selfservice" || param === "mytickets") {
      setActiveTab(param);
    }
  }, [searchParams]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        icon={LifeBuoy}
        hub="monEspace"
      />

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700 overflow-x-auto"
        role="tablist"
        aria-label={t("tabsAriaLabel")}
      >
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSetTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tab-${tab.id}`}
            className={`flex items-center gap-2 px-3 sm:px-4 py-3 text-sm transition-colors whitespace-nowrap min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy focus-visible:ring-offset-2 rounded-t ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-primary font-semibold"
                : "text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white"
            }`}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            {t(`tabs.${tab.id}`)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "hub" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column: chatbot + suggestions */}
          <div className="lg:col-span-2 space-y-6">
            <AIChatbot mode="embedded" placeholder={t("chatPlaceholder")} />

            {/* Always-visible CTA "Créer un ticket" — the escape hatch when
                the IA does not answer. */}
            <div className="rounded-2xl border border-[#F68D2E]/30 bg-gradient-to-br from-[#F68D2E]/5 to-transparent dark:from-[#F68D2E]/10 dark:border-[#F68D2E]/40 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F68D2E]/10 text-slate-900 shrink-0">
                <Ticket className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-seal-navy dark:text-white">
                  {t("noAnswerCta.title")}
                </h4>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                  {t("noAnswerCta.description")}
                </p>
              </div>
              <Link
                href="/tickets?create=true"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F68D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#E07D1E] transition shrink-0"
              >
                <Ticket className="h-4 w-4" />
                {t("noAnswerCta.action")}
              </Link>
            </div>

            <QuickSuggestions onSetTab={handleSetTab} />
          </div>

          {/* Sidebar: recent tickets */}
          <div className="lg:col-span-1">
            <MyRecentTickets />
          </div>
        </div>
      )}
      {activeTab === "selfservice" && <SelfServicePortal />}
      {activeTab === "mytickets" && <MyRecentTickets />}
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense>
      <SupportPageInner />
    </Suspense>
  );
}
