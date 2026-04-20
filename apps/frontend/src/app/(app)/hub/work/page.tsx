'use client';

import { useState, useEffect } from 'react';
import {
  Briefcase,
  FileText,
  ClipboardEdit,
  Newspaper,
  BookMarked,
  Users,
  HardDrive,
  Search,
  FileType,
} from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/layout/hub-landing';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function WorkHubPage() {
  const { t } = useTranslation();
  const [badges, setBadges] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    // Fetch counters from existing endpoints (limit=1 to get meta.total)
    Promise.allSettled([
      api.get('/documents', { params: { limit: 1 } }),
      api.get('/runbooks'),
      api.get('/wiki'),
      api.get('/news', { params: { limit: 1 } }),
    ]).then(([docsR, procsR, wikiR, newsR]) => {
      const b: Record<string, number | undefined> = {};
      if (docsR.status === 'fulfilled') b.docs = docsR.value?.data?.meta?.total;
      if (procsR.status === 'fulfilled') {
        const d = procsR.value?.data;
        b.procs = Array.isArray(d) ? d.length : d?.meta?.total;
      }
      if (wikiR.status === 'fulfilled') {
        const d = wikiR.value?.data;
        b.wiki = Array.isArray(d) ? d.length : d?.meta?.total;
      }
      if (newsR.status === 'fulfilled') b.news = newsR.value?.data?.meta?.total;
      setBadges(b);
    });
  }, []);

  const CARDS: HubCard[] = [
    {
      title: 'Documents (GED)',
      description: 'Politiques, procédures, notes internes — recherche, validation et signature.',
      href: '/documents',
      icon: FileText,
      badge: badges.docs,
    },
    {
      title: 'Procédures opérationnelles',
      description: 'Bibliothèque des procédures métier et runbooks IT.',
      href: '/procedures',
      icon: ClipboardEdit,
      badge: badges.procs,
    },
    {
      title: 'Actualités',
      description: 'Communications internes, annonces et notes de direction.',
      href: '/news',
      icon: Newspaper,
      badge: badges.news,
    },
    {
      title: 'Wiki & Runbooks',
      description: 'Base de connaissances collaborative et runbooks IT.',
      href: '/wiki',
      icon: BookMarked,
      badge: badges.wiki,
    },
    {
      title: 'Annuaire',
      description: 'Collaborateurs, organigramme, départements et contacts.',
      href: '/directory',
      icon: Users,
    },
    {
      title: 'Fichiers réseau',
      description: 'Partages SMB et ressources réseau autorisées.',
      href: '/files',
      icon: HardDrive,
    },
    {
      title: 'Recherche globale',
      description: 'Rechercher dans documents, wiki, actualités et tickets.',
      href: '/search',
      icon: Search,
    },
    {
      title: 'Outils PDF',
      description: 'Fusion, découpe, OCR et utilitaires PDF.',
      href: '/tools/pdf',
      icon: FileType,
    },
  ];

  return (
    <div className="animate-fade-in-up">
      <HubLanding
        title="Travail & Connaissance"
        subtitle="Documents, procédures, wiki et ressources opérationnelles."
        accent="#296DC1"
        variant="blue"
        icon={Briefcase}
        cards={CARDS}
      />
    </div>
  );
}
