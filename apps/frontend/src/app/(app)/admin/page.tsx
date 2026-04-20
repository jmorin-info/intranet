'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Cog,
  Users,
  Building2,
  ShieldCheck,
  UserCheck2,
  ClipboardList,
  BarChart3,
  Settings,
  Layers,
  Shield,
  ShieldAlert,
  ClipboardCheck,
  Globe2,
  FileText,
  Ticket,
  HeartPulse,
} from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/layout/hub-landing';
import { features } from '@/lib/features';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

interface QuickStats {
  totalUsers: number | null;
  totalDocuments: number | null;
  totalTickets: number | null;
  systemHealth: 'ok' | 'degraded' | 'unknown';
}

const CARDS: HubCard[] = [
  {
    title: 'Utilisateurs',
    description: 'Gestion des comptes, rôles et import CSV.',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'Départements',
    description: 'Structure organisationnelle et affectations.',
    href: '/admin/departments',
    icon: Building2,
  },
  {
    title: 'Conformité',
    description: 'Référentiels ISO, contrôles et tâches de conformité.',
    href: '/admin/compliance',
    icon: ShieldCheck,
  },
  {
    title: 'Revue des accès',
    description: 'Campagnes périodiques (ISO 27001 A.5.18).',
    href: '/admin/access-reviews',
    icon: UserCheck2,
  },
  {
    title: "Journal d'audit",
    description: 'Trace système et événements de sécurité.',
    href: '/admin/audit-log',
    icon: ClipboardList,
  },
  {
    title: 'Rapports',
    description: 'Exports analytiques et indicateurs.',
    href: '/admin/reports',
    icon: BarChart3,
  },
  {
    title: 'Configuration',
    description: 'Paramètres globaux, SMTP et matrice d\u2019accès.',
    href: '/admin/config',
    icon: Settings,
  },
  {
    title: 'Espaces & modules',
    description: 'Activation des modules par espace et par rôle.',
    href: '/admin/spaces',
    icon: Layers,
  },
  {
    title: 'Chartes',
    description: 'Versionning des chartes et campagnes de signature.',
    href: '/admin/chartes',
    icon: Shield,
  },
  {
    title: 'Accès externes',
    description: 'Prestataires, visiteurs et comptes temporaires.',
    href: '/admin/external-access',
    icon: Users,
  },
  {
    title: 'Audit AD',
    description: 'Analyse Active Directory et détection de dérives.',
    href: '/admin/ad-audit',
    icon: ShieldAlert,
  },
  {
    title: 'Exports IT',
    description: 'Exports Veeam et autres sources d\u2019infrastructure.',
    href: '/admin/it-exports',
    icon: ClipboardCheck,
  },
  {
    title: 'Extranet',
    description: 'Portail prestataires et accès tiers.',
    href: '/extranet',
    icon: Globe2,
  },
  {
    title: 'Onboarding',
    description: 'Parcours d\u2019intégration et étapes associées.',
    href: '/admin/onboarding',
    icon: Users,
    hidden: !features.onboardingAdmin,
  },
];

const STAT_ITEMS: Array<{
  key: keyof Omit<QuickStats, 'systemHealth'>;
  label: string;
  icon: typeof Users;
  gradient: string;
  iconBg: string;
}> = [
  { key: 'totalUsers', label: 'Utilisateurs', icon: Users, gradient: 'from-blue-500/10 to-transparent', iconBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  { key: 'totalDocuments', label: 'Documents', icon: FileText, gradient: 'from-emerald-500/10 to-transparent', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  { key: 'totalTickets', label: 'Tickets', icon: Ticket, gradient: 'from-amber-500/10 to-transparent', iconBg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
];

const DESCRIPTION_KEYS: Record<string, string> = {
  '/admin/users': 'admin.usersDesc',
  '/admin/departments': 'admin.departmentsDesc',
  '/admin/compliance': 'admin.complianceDesc',
};

export default function AdminLandingPage() {
  const { t } = useTranslation();
  const translatedCards = useMemo(() => CARDS.map((card) => {
    const key = DESCRIPTION_KEYS[card.href];
    return key ? { ...card, description: t(key) } : card;
  }), [t]);
  const [stats, setStats] = useState<QuickStats>({
    totalUsers: null,
    totalDocuments: null,
    totalTickets: null,
    systemHealth: 'unknown',
  });

  useEffect(() => {
    Promise.allSettled([
      api.get('/users', { params: { limit: 1 } }),
      api.get('/reports/dashboard-stats'),
      api.get('/tickets', { params: { limit: 1 } }),
    ]).then(([usersR, dashR, ticketsR]) => {
      const s: QuickStats = { totalUsers: null, totalDocuments: null, totalTickets: null, systemHealth: 'ok' };
      if (usersR.status === 'fulfilled') {
        const d = usersR.value?.data;
        s.totalUsers = d?.meta?.total ?? (Array.isArray(d?.data) ? d.data.length : null);
      }
      if (dashR.status === 'fulfilled') {
        s.totalDocuments = dashR.value?.data?.totalDocuments ?? null;
        s.systemHealth = 'ok';
      } else {
        s.systemHealth = 'degraded';
      }
      if (ticketsR.status === 'fulfilled') {
        s.totalTickets = ticketsR.value?.data?.meta?.total ?? null;
      }
      setStats(s);
    });
  }, []);

  const healthColor = stats.systemHealth === 'ok'
    ? 'text-emerald-600 dark:text-emerald-400'
    : stats.systemHealth === 'degraded'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-400';
  const healthBg = stats.systemHealth === 'ok'
    ? 'bg-emerald-100 dark:bg-emerald-900/30'
    : stats.systemHealth === 'degraded'
      ? 'bg-amber-100 dark:bg-amber-900/30'
      : 'bg-gray-100 dark:bg-gray-800';
  const healthLabel = stats.systemHealth === 'ok' ? 'OK' : stats.systemHealth === 'degraded' ? 'Dégradé' : '...';

  return (
    <div className="animate-fade-in-up">
      {/* Quick stats bar */}
      <div className="mx-auto max-w-6xl px-4 pt-8 md:pt-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {STAT_ITEMS.map(({ key, label, icon: Icon, gradient, iconBg }) => (
            <div
              key={key}
              className={`stagger-item flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br ${gradient} border border-gray-100 dark:border-slate-800`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-semibold text-seal-navy dark:text-white">
                  {stats[key] !== null ? stats[key] : <span className="inline-block w-8 h-5 rounded shimmer" />}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">{label}</p>
              </div>
            </div>
          ))}
          {/* System health */}
          <div className="stagger-item flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-gray-500/5 to-transparent border border-gray-100 dark:border-slate-800">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${healthBg}`}>
              <HeartPulse className={`h-5 w-5 ${healthColor}`} />
            </div>
            <div>
              <p className={`text-xl font-semibold ${healthColor}`}>{healthLabel}</p>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">Santé système</p>
            </div>
          </div>
        </div>
      </div>

      <HubLanding
        title="Administration"
        subtitle="Gestion des utilisateurs, conformité et configuration système."
        accent="#F9964A"
        variant="orange"
        icon={Cog}
        cards={translatedCards}
      />
    </div>
  );
}
