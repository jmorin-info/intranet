'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
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
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

// The embedded chatbot is the SAME component as the FAB — it shares the same
// zustand store (`useChatbotStore`), so the conversation history is unified.
const AIChatbot = dynamic(
  () => import('@/components/ai/ai-chatbot').then(m => ({ default: m.AIChatbot })),
  { ssr: false, loading: () => <div className="shimmer h-80 rounded-2xl" /> },
);

// Self-service is now a secondary tab (FAQ / templates).
const SelfServicePortal = dynamic(
  () => import('./SelfServicePortal').then(m => ({ default: m.SelfServicePortal })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);

type TabId = 'hub' | 'selfservice' | 'mytickets';

const tabs: Array<{ id: TabId; label: string; icon: typeof Sparkles }> = [
  { id: 'hub', label: 'Hub support (IA)', icon: Sparkles },
  { id: 'selfservice', label: 'Self-service', icon: Wrench },
  { id: 'mytickets', label: 'Mes tickets', icon: Ticket },
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
  OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  WAITING: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  RESOLVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CLOSED: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  WAITING: 'En attente',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-blue-500',
  LOW: 'bg-gray-400',
};

/**
 * Widget "Mes tickets récents" — 5 derniers tickets créés par l'utilisateur.
 * Utilise `GET /tickets?userId=me&limit=5`.
 */
function MyRecentTickets() {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const { data } = await api.get('/tickets', {
          params: { userId: 'me', limit: 5 },
        });
        if (cancelled) return;
        const list: MyTicket[] = Array.isArray(data?.tickets) ? data.tickets
          : Array.isArray(data?.items) ? data.items
          : Array.isArray(data) ? data : [];
        setTickets(list.slice(0, 5));
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message || 'Erreur de chargement');
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#004469]/10 dark:bg-[#004469]/30">
            <Inbox className="h-4 w-4 text-[#004469] dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
            Mes tickets récents
          </h3>
        </div>
        <Link
          href="/tickets?userId=me"
          className="text-xs font-medium text-[#004469] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
        >
          Voir tout
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {tickets === null && !error && (
          <div className="px-4 py-8 text-center">
            <div className="shimmer h-4 w-3/4 rounded mx-auto mb-2" />
            <div className="shimmer h-4 w-1/2 rounded mx-auto" />
          </div>
        )}
        {error && (
          <div className="px-4 py-5 text-center text-sm text-red-500 flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}
        {tickets !== null && tickets.length === 0 && !error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-3">
              Aucun ticket pour le moment.
            </p>
            <Link
              href="/tickets?create=true"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#004469] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#003352] transition"
            >
              <Ticket className="h-3.5 w-3.5" />
              Créer mon premier ticket
            </Link>
          </div>
        )}
        {tickets !== null && tickets.map((t) => (
          <Link
            key={t.id}
            href={`/tickets/${t.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition"
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-gray-300'}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold text-seal-gray-500 dark:text-slate-500 uppercase">
                  {t.reference}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[t.status] || t.status}
                </span>
              </div>
              <p className="text-sm text-seal-navy dark:text-white truncate mt-0.5">
                {t.title}
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-500 shrink-0">
              <Clock className="h-3 w-3" />
              {new Date(t.updatedAt || t.createdAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Suggestions fréquentes (FAQ self-service) — raccourcis vers les
 * templates de ticket ou les pages wiki associées.
 */
function QuickSuggestions({ onSetTab }: { onSetTab: (id: TabId) => void }) {
  const suggestions = [
    { icon: HelpCircle, label: 'Réinitialiser mon mot de passe', href: '/helpdesk?tab=selfservice', onClick: () => onSetTab('selfservice') },
    { icon: Wrench, label: 'Problème matériel / écran / imprimante', href: '/helpdesk?tab=selfservice', onClick: () => onSetTab('selfservice') },
    { icon: BookOpen, label: 'Demander un accès dossier / application', href: '/helpdesk?tab=selfservice', onClick: () => onSetTab('selfservice') },
    { icon: AlertTriangle, label: 'Signaler un incident de sécurité', href: '/incidents' },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 dark:border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[#004469] dark:text-blue-400" />
          Demandes fréquentes
        </h3>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {suggestions.map((s) => {
          const content = (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#004469]/10 dark:bg-[#004469]/30 text-[#004469] dark:text-blue-400 shrink-0">
                <s.icon className="h-4 w-4" />
              </div>
              <span className="text-sm text-seal-navy dark:text-slate-200 flex-1">{s.label}</span>
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
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    initialTab === 'selfservice' || initialTab === 'mytickets' ? initialTab : 'hub',
  );

  const handleSetTab = (id: TabId) => {
    setActiveTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const param = searchParams.get('tab') as TabId | null;
    if (param === 'hub' || param === 'selfservice' || param === 'mytickets') {
      setActiveTab(param);
    }
  }, [searchParams]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Centre d'assistance"
        subtitle="Posez votre question à l'IA, consultez les FAQ ou suivez vos tickets — le tout au même endroit."
        icon={LifeBuoy}
        hub="monEspace"
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleSetTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary font-semibold'
                : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'hub' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column: chatbot + suggestions */}
          <div className="lg:col-span-2 space-y-6">
            <AIChatbot
              mode="embedded"
              placeholder="Décrivez votre problème, je peux peut-être répondre directement."
            />

            {/* Always-visible CTA "Créer un ticket" — the escape hatch when
                the IA does not answer. */}
            <div className="rounded-2xl border border-[#F68D2E]/30 bg-gradient-to-br from-[#F68D2E]/5 to-transparent dark:from-[#F68D2E]/10 dark:border-[#F68D2E]/40 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F68D2E]/10 text-[#F68D2E] shrink-0">
                <Ticket className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-seal-navy dark:text-white">
                  L'assistant ne trouve pas ? Créez un ticket
                </h4>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                  Un agent du support prendra en charge votre demande.
                  Catégorie et priorité seront pré-suggérées par l'IA.
                </p>
              </div>
              <Link
                href="/tickets?create=true"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F68D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#E07D1E] transition shrink-0"
              >
                <Ticket className="h-4 w-4" />
                Créer un ticket
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
      {activeTab === 'selfservice' && <SelfServicePortal />}
      {activeTab === 'mytickets' && <MyRecentTickets />}
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
