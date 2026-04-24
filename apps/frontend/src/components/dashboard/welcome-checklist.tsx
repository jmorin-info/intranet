'use client';

/**
 * WelcomeChecklist — widget "Démarrage rapide" affiché sur le dashboard
 * pendant les 14 premiers jours d'un compte utilisateur.
 *
 * - Récupère l'état des 5 items via `GET /users/me/onboarding-checklist`.
 * - Disparaît automatiquement si `done === total`, si `accountAgeDays > 14`,
 *   ou si l'utilisateur a cliqué "Masquer" (`welcomeChecklistDismissedAt`).
 * - Dismissal côté serveur (`POST /users/me/welcome-checklist/dismiss`) pour
 *   que le widget ne réapparaisse pas sur un autre navigateur.
 *
 * N'est rendu QUE pour les collaborateurs "standards" (pas les prestataires,
 * qui ont un DashboardProviderView dédié) — le dashboard principal orchestre
 * cela côté parent.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  UserCircle2,
  Shield,
  FileSignature,
  FolderOpen,
  GraduationCap,
  ChevronRight,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n';

interface ChecklistItem {
  key: 'profile' | 'mfa' | 'charte' | 'docs' | 'quiz';
  done: boolean;
  href: string;
}

interface ChecklistResponse {
  items: ChecklistItem[];
  done: number;
  total: number;
  dismissed: boolean;
  accountAgeDays: number;
  createdAt: string;
}

const MAX_ACCOUNT_AGE_DAYS = 14;

const ITEM_META: Record<
  ChecklistItem['key'],
  { icon: React.ComponentType<{ className?: string }>; labelKey: string; accent: string }
> = {
  profile: {
    icon: UserCircle2,
    labelKey: 'welcomeChecklist.item.profile',
    accent: 'text-[#296DC1]',
  },
  mfa: {
    icon: Shield,
    labelKey: 'welcomeChecklist.item.mfa',
    accent: 'text-[#892034]',
  },
  charte: {
    icon: FileSignature,
    labelKey: 'welcomeChecklist.item.charte',
    accent: 'text-primary',
  },
  docs: {
    icon: FolderOpen,
    labelKey: 'welcomeChecklist.item.docs',
    accent: 'text-[#006233]',
  },
  quiz: {
    icon: GraduationCap,
    labelKey: 'welcomeChecklist.item.quiz',
    accent: 'text-primary',
  },
};

export function WelcomeChecklist() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { t } = useTranslation();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hiddenLocally, setHiddenLocally] = useState(false);

  // Guard rapide côté client — évite l'appel réseau pour les comptes anciens
  // ou déjà dismissés (qui n'afficheront rien de toute façon).
  const accountTooOld = React.useMemo(() => {
    if (!user?.createdAt) return false;
    const created = new Date(user.createdAt).getTime();
    if (Number.isNaN(created)) return false;
    const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
    return ageDays > MAX_ACCOUNT_AGE_DAYS;
  }, [user?.createdAt]);

  const alreadyDismissed = !!user?.welcomeChecklistDismissedAt;

  useEffect(() => {
    if (accountTooOld || alreadyDismissed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<ChecklistResponse>('/users/me/onboarding-checklist')
      .then(({ data: payload }) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountTooOld, alreadyDismissed]);

  const handleDismiss = useCallback(async () => {
    setHiddenLocally(true);
    try {
      const { data: res } = await api.post('/users/me/welcome-checklist/dismiss', {});
      if (user && res?.welcomeChecklistDismissedAt) {
        setUser({
          ...user,
          welcomeChecklistDismissedAt: res.welcomeChecklistDismissedAt,
        });
      }
    } catch {
      // Si le POST échoue on garde quand même le widget masqué localement
      // pour ne pas harceler l'utilisateur.
    }
  }, [user, setUser]);

  // Early returns pour tous les cas de non-affichage.
  if (loading) return null;
  if (hiddenLocally) return null;
  if (accountTooOld || alreadyDismissed) return null;
  if (!data) return null;
  if (data.dismissed) return null;
  if (data.accountAgeDays > MAX_ACCOUNT_AGE_DAYS) return null;
  if (data.done === data.total) return null;

  const progressPercent = Math.round((data.done / data.total) * 100);

  return (
    <section
      aria-labelledby="welcome-checklist-title"
      className="animate-fade-in-up rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent dark:from-primary/[0.08] p-5"
    >
      <header className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <h2
            id="welcome-checklist-title"
            className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2"
          >
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            {t('welcomeChecklist.title')} — {data.done}/{data.total}{' '}
            <span className="font-normal text-seal-gray-500 dark:text-slate-400">
              {data.total === 1
                ? t('welcomeChecklist.progress')
                : t('welcomeChecklist.progressPlural')}{' '}
              {data.total}
            </span>
          </h2>
          <div
            className="mt-2 h-1.5 w-full max-w-[240px] rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={data.done}
            aria-valuemin={0}
            aria-valuemax={data.total}
          >
            <div
              className="h-full bg-gradient-to-r from-[#F9964A] to-[#296DC1] transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('welcomeChecklist.hideAria')}
          title={t('welcomeChecklist.hide')}
          className="p-1.5 rounded-lg text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <ul className="space-y-1.5">
        {data.items.map((item) => {
          const meta = ITEM_META[item.key];
          const Icon = meta.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  item.done
                    ? 'bg-transparent hover:bg-gray-50 dark:hover:bg-slate-800/50 opacity-70'
                    : 'bg-white dark:bg-slate-900/50 border border-gray-100 dark:border-slate-700 hover:border-primary/40 hover:shadow-sm'
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                    item.done
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : `bg-gray-50 dark:bg-slate-800 ${meta.accent}`
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <span
                  className={`flex-1 text-sm ${
                    item.done
                      ? 'text-seal-gray-500 dark:text-slate-400 line-through decoration-emerald-500/40'
                      : 'text-seal-navy dark:text-white font-medium'
                  }`}
                >
                  {t(meta.labelKey)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs shrink-0 ${
                    item.done
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-primary opacity-0 group-hover:opacity-100 transition-opacity'
                  }`}
                  aria-hidden
                >
                  {item.done ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      {t('welcomeChecklist.action.done')}
                    </>
                  ) : (
                    <>
                      {t('welcomeChecklist.action.go')}
                      <ChevronRight className="h-3 w-3" />
                    </>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default WelcomeChecklist;
