'use client';

import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Rss,
  BookOpen,
  Headset,
  GraduationCap,
  Star,
  Siren,
} from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/layout/hub-landing';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function SecurityHubPage() {
  const { t } = useTranslation();
  const [badges, setBadges] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    Promise.allSettled([
      api.get('/incidents', { params: { limit: 1 } }),
      api.get('/alerts'),
      api.get('/veille/bulletins', { params: { limit: 1 } }),
      api.get('/chartes'),
      api.get('/tickets', { params: { limit: 1 } }),
    ]).then(([incR, alertsR, veilleR, chartesR, ticketsR]) => {
      const b: Record<string, number | undefined> = {};
      if (incR.status === 'fulfilled') b.incidents = incR.value?.data?.meta?.total;
      if (alertsR.status === 'fulfilled') {
        const d = alertsR.value?.data;
        b.alerts = Array.isArray(d) ? d.length : (d?.meta?.total ?? d?.meta?.unreadCount);
      }
      if (veilleR.status === 'fulfilled') b.veille = veilleR.value?.data?.meta?.total;
      if (chartesR.status === 'fulfilled') {
        const d = chartesR.value?.data;
        b.chartes = Array.isArray(d) ? d.length : d?.meta?.total;
      }
      if (ticketsR.status === 'fulfilled') b.tickets = ticketsR.value?.data?.meta?.total;
      setBadges(b);
    });
  }, []);

  const CARDS: HubCard[] = [
    {
      title: 'Incidents',
      description: 'Cycle de vie des incidents de sécurité et plans de remédiation.',
      href: '/incidents',
      icon: Siren,
      badge: badges.incidents,
    },
    {
      title: 'Alertes',
      description: 'Alertes de sécurité et accusés de lecture.',
      href: '/alerts',
      icon: ShieldAlert,
      badge: badges.alerts,
    },
    {
      title: 'Veille cyber',
      description: 'Bulletins CERT-FR / ANSSI agrégés pour le kit OMNITECH.',
      href: '/veille',
      icon: Rss,
      badge: badges.veille,
    },
    {
      title: 'Chartes & politiques',
      description: 'Chartes signées, politiques de sécurité et attestations.',
      href: '/chartes',
      icon: BookOpen,
      badge: badges.chartes,
    },
    {
      title: 'Helpdesk & Self-service',
      description: 'FAQ, base de connaissances et création de tickets assistée.',
      href: '/helpdesk',
      icon: Headset,
      badge: badges.tickets,
    },
    {
      title: 'Quiz sécurité',
      description: 'Campagnes de sensibilisation et quiz de formation.',
      href: '/quiz',
      icon: GraduationCap,
    },
    {
      title: 'Satisfaction',
      description: 'Enquêtes de satisfaction et collecte de retours.',
      href: '/satisfaction',
      icon: Star,
    },
  ];

  return (
    <div className="animate-fade-in-up">
      <HubLanding
        title="Sécurité & Conformité"
        subtitle="Incidents, alertes, veille cyber et supports aux utilisateurs."
        accent="#892034"
        variant="bordeaux"
        icon={ShieldCheck}
        cards={CARDS}
      />
    </div>
  );
}
