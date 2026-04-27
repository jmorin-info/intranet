'use client';

/**
 * Command Palette — façon macOS Spotlight / VS Code Cmd+P
 *
 * Remplace l'ancien QuickNav. Accessible partout via Cmd/Ctrl+K.
 * - Fuzzy search maison (sans dépendance npm)
 * - Groupes : Récent, Pages, Actions, Raccourcis, Admin, Aide
 * - Keyboard : ↑↓ navigation, ↵ exécuter, esc fermer, tab cycler groupes,
 *              cmd+1..9 saut catégorie, cmd+k toggle
 * - Filtrage par rôle via isRoleAtLeast
 * - Historique : 5 dernières commandes exécutées (localStorage)
 * - Dark mode, focus trap, role="dialog"
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  LayoutDashboard, FileText, Ticket, Newspaper, Rss, BookOpen, Search,
  Users, Calendar, Bell, Shield, Settings, ShieldCheck, ClipboardList, User,
  Moon, LogOut, Plus, UserCheck, Headset, ShieldAlert,
  Activity, Layers, Keyboard, HelpCircle, LifeBuoy, History, ChevronRight,
  Command as CommandIcon, Home, Briefcase, BookMarked, ClipboardEdit,
  Globe2, PenLine, GraduationCap, Building2, BarChart3, HardDrive, FileType, Award, Database,
  Clock as ClockIcon,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────── Types ───────────────────────────

type CategoryId = 'recent' | 'content' | 'pages' | 'actions' | 'shortcuts' | 'admin' | 'help';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  category: Exclude<CategoryId, 'recent'>;
  keywords?: string[];
  shortcut?: string;      // hint affiché à droite, ex: "⌘⇧N"
  href?: string;          // si défini → router.push
  action?: () => void;    // si défini → appelé
  minRole?: UserRole;
}

interface CategoryDef {
  id: CategoryId;
  label: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'recent',    label: 'Récent' },
  { id: 'content',   label: 'Contenu' },
  { id: 'pages',     label: 'Pages' },
  { id: 'actions',   label: 'Actions' },
  { id: 'shortcuts', label: 'Raccourcis clavier' },
  { id: 'admin',     label: 'Admin' },
  { id: 'help',      label: 'Aide' },
];

const RECENT_KEY = 'omnitech:palette-recent';
const RECENT_MAX = 5;
const RESULTS_MAX = 20;

// ─────────────────────────── Fuzzy search maison ───────────────────────────

/** Normalise : lowercase + retire les accents. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Score fuzzy simple :
 *  - 0 si aucun match
 *  - +100 si label commence par la requête
 *  - +60 si label contient la requête
 *  - +30 si keyword contient la requête
 *  - +10 par caractère matché dans l'ordre (subsequence) sur le label
 */
function fuzzyScore(item: CommandItem, rawQuery: string): number {
  const q = normalize(rawQuery.trim());
  if (!q) return 1; // tout matche à score 1 si pas de query
  const label = normalize(item.label);
  const desc = normalize(item.description || '');
  const kws = (item.keywords || []).map(normalize);
  const cat = normalize(item.category);

  let score = 0;
  if (label.startsWith(q)) score += 100;
  else if (label.includes(q)) score += 60;
  if (desc.includes(q)) score += 20;
  if (kws.some((k) => k.includes(q))) score += 30;
  if (cat.includes(q)) score += 10;

  // Subsequence bonus (toutes les lettres de q dans l'ordre dans label)
  let li = 0;
  let matched = 0;
  for (let i = 0; i < label.length && li < q.length; i++) {
    if (label[i] === q[li]) { li++; matched++; }
  }
  if (li === q.length) score += 10 + matched * 2;

  return score;
}

/** Highlight inline : met en <mark> les caractères de la query trouvés dans l'ordre. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = normalize(query.trim());
  if (!q) return <>{text}</>;
  const nText = normalize(text);
  const parts: React.ReactNode[] = [];
  let qi = 0;
  let buf = '';
  const flush = () => { if (buf) { parts.push(buf); buf = ''; } };
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && nText[i] === q[qi]) {
      flush();
      parts.push(
        <mark key={i} className="bg-primary/20 text-primary font-semibold rounded px-0.5">
          {text[i]}
        </mark>
      );
      qi++;
    } else {
      buf += text[i];
    }
  }
  flush();
  return <>{parts}</>;
}

/**
 * Highlight word-based : surligne chaque mot de la query (≥ 2 chars,
 * insensible aux accents/casse) là où il apparaît réellement dans le texte.
 * Plus adapté aux résultats Meilisearch que le highlight subsequence.
 */
function HighlightedWords({ text, query }: { text: string; query: string }) {
  const words = query
    .trim()
    .split(/\s+/)
    .map((w) => normalize(w))
    .filter((w) => w.length >= 2);
  if (words.length === 0) return <>{text}</>;

  const nText = normalize(text);
  // Collect all match ranges on the normalized string
  type Range = { start: number; end: number };
  const ranges: Range[] = [];
  for (const w of words) {
    let from = 0;
    while (from <= nText.length - w.length) {
      const idx = nText.indexOf(w, from);
      if (idx < 0) break;
      ranges.push({ start: idx, end: idx + w.length });
      from = idx + w.length;
    }
  }
  if (ranges.length === 0) return <>{text}</>;

  // Merge overlapping ranges
  ranges.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((r, i) => {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <mark
        key={`hl-${i}`}
        className="bg-primary/20 text-primary font-semibold rounded px-0.5"
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// ─────────────────────────── Component ───────────────────────────

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ContentHit {
  id: string;
  title: string;
  url: string;
  type: 'document' | 'ticket' | 'wiki' | 'news' | 'runbook';
  reference?: string | null;
  slug?: string | null;
}

const CONTENT_ICONS: Record<ContentHit['type'], React.ElementType> = {
  document: FileText,
  ticket: Ticket,
  wiki: BookOpen,
  news: Newspaper,
  runbook: BookOpen,
};

// Les ids Meili sont prefixes ("document-xxx") — on retire le prefixe pour les routes
function stripMeiliPrefix(id: string): string {
  return id.replace(/^(document|ticket|wiki|news|runbook)[-:]/, '');
}

function buildHitHref(hit: ContentHit): string {
  if (hit.url) return hit.url;
  const id = stripMeiliPrefix(hit.id);
  switch (hit.type) {
    case 'document': return `/documents/${id}`;
    case 'ticket': return `/tickets/${id}`;
    case 'wiki': return `/wiki/${hit.slug ?? id}`;
    case 'news': return `/news/${hit.slug ?? id}`;
    case 'runbook': return `/runbooks/${hit.slug ?? id}`;
  }
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const user = useAuthStore(s => s.user); const logout = useAuthStore(s => s.logout);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [contentHits, setContentHits] = useState<ContentHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounced backend search — utilise `/search/quick` (Meilisearch + RBAC)
  // qui est optimise pour la palette (pas de facets/highlight, hits flat).
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (q.length < 3) {
      setContentHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<{
          query: string;
          hits: ContentHit[];
          total: number;
          tookMs: number;
        }>('/search/quick', { params: { q, limit: 12 } });
        if (cancelled) return;
        setContentHits((data.hits || []).slice(0, 12));
      } catch {
        if (!cancelled) setContentHits([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  // Load recent from localStorage on open
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecentIds(JSON.parse(raw));
    } catch {}
    setQuery('');
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [isOpen]);

  // Push an id to the recent list
  const pushRecent = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Actions ──
  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch {}
  }, []);

  const handleLogout = useCallback(async () => {
    try { await logout?.(); } catch {}
    router.push('/login');
  }, [logout, router]);

  const openShortcutsDialog = useCallback(() => {
    // On simule la touche "?" pour que l'écouteur AuthProvider ouvre le modal.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
  }, []);

  // ── Command registry (construit à la volée en fonction du rôle) ──
  const allCommands: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      // ── Pages ──
      { id: 'page:dashboard',    label: 'Tableau de bord',       icon: LayoutDashboard, category: 'pages', href: '/dashboard',     keywords: ['accueil', 'home', 'dashboard'] },
      { id: 'page:hub-work',     label: 'Hub — Travail',         icon: Briefcase,      category: 'pages', href: '/hub/work',      keywords: ['travail', 'connaissance'] },
      { id: 'page:hub-security', label: 'Hub — Sécurité',        icon: ShieldCheck,    category: 'pages', href: '/hub/security',  keywords: ['sécurité', 'conformité'] },
      { id: 'page:documents',    label: 'Documents',             icon: FileText,       category: 'pages', href: '/documents',     keywords: ['ged', 'doc', 'iso'] },
      { id: 'page:procedures',   label: 'Procédures',            icon: ClipboardEdit,  category: 'pages', href: '/procedures',    keywords: ['runbook', 'mode operatoire'] },
      { id: 'page:chartes',      label: 'Chartes & politiques',  icon: BookMarked,     category: 'pages', href: '/chartes',       keywords: ['charte', 'policy'] },
      { id: 'page:tickets',      label: 'Espace tickets',         icon: Ticket,         category: 'pages', href: '/tickets',       keywords: ['support', 'demande', 'bug', 'rma', 'déploiement', 'projet'] },
      { id: 'page:incidents',    label: 'Incidents',             icon: ShieldAlert,    category: 'pages', href: '/incidents',     keywords: ['breach', 'malware', 'phishing'] },
      { id: 'page:news',         label: 'Actualités',            icon: Newspaper,      category: 'pages', href: '/news',          keywords: ['article', 'communication'] },
      { id: 'page:veille',       label: 'Veille cyber',          icon: Rss,            category: 'pages', href: '/veille',        keywords: ['cve', 'vulnerabilite', 'menace'] },
      { id: 'page:wiki',         label: 'Connaissances (Wiki)',  icon: BookOpen,       category: 'pages', href: '/wiki',          keywords: ['wiki', 'documentation'] },
      { id: 'page:directory',    label: 'Annuaire',              icon: Users,          category: 'pages', href: '/directory',     keywords: ['collaborateur', 'contact'] },
      { id: 'page:calendar',     label: 'Calendrier',            icon: Calendar,       category: 'pages', href: '/calendar',      keywords: ['evenement', 'planning'] },
      { id: 'page:notifications',label: 'Notifications',        icon: Bell,           category: 'pages', href: '/notifications', keywords: ['notif', 'alerte'] },
      { id: 'page:timeline',     label: 'Timeline unifiée',      icon: ClockIcon,      category: 'pages', href: '/timeline',      keywords: ['fil', 'activite', 'chronologie'] },
      { id: 'page:profile',      label: 'Mon profil',            icon: User,           category: 'pages', href: '/profile',       keywords: ['compte', 'paramètres', 'avatar'] },
      { id: 'page:search',       label: 'Recherche globale',     icon: Search,         category: 'pages', href: '/search',        keywords: ['trouver', 'chercher'] },
      { id: 'page:helpdesk',     label: 'Support IT',            icon: Headset,        category: 'pages', href: '/helpdesk',      keywords: ['chatbot', 'aide'] },
      { id: 'page:signatures',   label: 'Signatures',            icon: PenLine,        category: 'pages', href: '/signatures',    keywords: ['docuseal', 'signer'] },
      { id: 'page:certificates',  label: 'Mes certifications',    icon: Award,          category: 'pages', href: '/certificates',  keywords: ['certificat', 'formation', 'certification', 'iso', 'cissp'] },
      { id: 'page:quiz',         label: 'Quiz sécurité',         icon: GraduationCap,  category: 'pages', href: '/quiz',          keywords: ['formation', 'sensibilisation'] },
      { id: 'page:files',        label: 'Fichiers réseau',       icon: HardDrive,      category: 'pages', href: '/files',         keywords: ['smb', 'partage'] },
      { id: 'page:tools-pdf',    label: 'Outils PDF',            icon: FileType,       category: 'pages', href: '/tools/pdf',     keywords: ['merge', 'split', 'compresser'] },
      { id: 'page:alerts',       label: 'Alertes sécurité',      icon: Shield,         category: 'pages', href: '/alerts',        keywords: ['p1', 'critique'] },

      // ── Actions ──
      { id: 'action:new-ticket',    label: 'Créer une demande / ticket',    icon: Plus,     category: 'actions', href: '/tickets?create=true', shortcut: '⌘⇧T', keywords: ['nouveau', 'créer', 'ouvrir', 'rma', 'déploiement', 'support'] },
      { id: 'action:new-document',  label: 'Créer un document',             icon: FileText, category: 'actions', href: '/documents/new',       shortcut: '⌘⇧N', keywords: ['nouveau', 'créer', 'ged'] },
      { id: 'action:new-incident',  label: 'Signaler un incident',          icon: ShieldAlert, category: 'actions', href: '/incidents?create=true', keywords: ['declarer', 'signaler', 'nouveau'] },
      { id: 'action:new-news',      label: 'Rédiger une actualité',         icon: Newspaper, category: 'actions', href: '/news/compose', minRole: UserRole.ADMIN, keywords: ['article', 'publier'] },
      { id: 'action:profile',       label: 'Ouvrir mon profil',             icon: User,     category: 'actions', href: '/profile',             keywords: ['compte', 'moi'] },
      { id: 'action:ai-search',    label: 'Rechercher avec l\'IA',         icon: Sparkles, category: 'actions', action: () => { onClose(); window.dispatchEvent(new Event('open-ai-search')); }, shortcut: '⌘⇧K', keywords: ['ia', 'ai', 'rag', 'question', 'demander', 'intelligent'] },
      { id: 'action:theme',         label: 'Basculer mode sombre / clair',  icon: Moon,     category: 'actions', action: toggleTheme,          keywords: ['dark', 'light', 'theme'] },
      { id: 'action:logout',        label: 'Me déconnecter',                icon: LogOut,   category: 'actions', action: handleLogout,         keywords: ['logout', 'signout', 'quitter'] },

      // ── Raccourcis G+X (go-to) ──
      { id: 'sc:g-d', label: 'Aller au tableau de bord', icon: Home,       category: 'shortcuts', href: '/dashboard', shortcut: 'G D', keywords: ['goto', 'dashboard'] },
      { id: 'sc:g-t', label: 'Aller aux tickets',         icon: Ticket,    category: 'shortcuts', href: '/tickets',   shortcut: 'G T', keywords: ['goto'] },
      { id: 'sc:g-s', label: 'Aller à la recherche',      icon: Search,    category: 'shortcuts', href: '/search',    shortcut: 'G S', keywords: ['goto'] },
      { id: 'sc:g-w', label: 'Aller au wiki',             icon: BookOpen,  category: 'shortcuts', href: '/wiki',      shortcut: 'G W', keywords: ['goto'] },
      { id: 'sc:g-h', label: 'Aller au support IT',       icon: Headset,   category: 'shortcuts', href: '/helpdesk',  shortcut: 'G H', keywords: ['goto'] },
      { id: 'sc:g-n', label: 'Aller aux actualités',      icon: Newspaper, category: 'shortcuts', href: '/news',      shortcut: 'G N', keywords: ['goto'] },
      { id: 'sc:g-v', label: 'Aller à la veille cyber',   icon: Rss,       category: 'shortcuts', href: '/veille',    shortcut: 'G V', keywords: ['goto'] },
      { id: 'sc:g-a', label: 'Aller à l\'annuaire',       icon: Users,     category: 'shortcuts', href: '/directory', shortcut: 'G A', keywords: ['goto'] },
      { id: 'sc:g-p', label: 'Aller à mon profil',        icon: User,      category: 'shortcuts', href: '/profile',   shortcut: 'G P', keywords: ['goto'] },
      { id: 'sc:g-k', label: 'Aller au calendrier',       icon: Calendar,  category: 'shortcuts', href: '/calendar',  shortcut: 'G K', keywords: ['goto'] },
      { id: 'sc:g-i', label: 'Aller aux incidents',       icon: ShieldAlert, category: 'shortcuts', href: '/incidents', shortcut: 'G I', keywords: ['goto'] },
      { id: 'sc:g-y', label: 'Santé système',             icon: Activity,  category: 'shortcuts', href: '/admin/system-health', shortcut: 'G Y', minRole: UserRole.ADMIN, keywords: ['goto', 'health'] },
      { id: 'sc:g-l', label: 'Validation LDAP',           icon: UserCheck, category: 'shortcuts', href: '/admin/ldap-pending',  shortcut: 'G L', minRole: UserRole.ADMIN, keywords: ['goto'] },
      { id: 'sc:g-r', label: 'Dashboard RSSI',            icon: ShieldCheck, category: 'shortcuts', href: '/admin/rssi-dashboard', shortcut: 'G R', minRole: UserRole.SUPER_ADMIN, keywords: ['goto'] },
      { id: 'sc:g-c', label: 'Conformité',                icon: ClipboardCheckSafe, category: 'shortcuts', href: '/admin/compliance', shortcut: 'G C', minRole: UserRole.REVIEWER, keywords: ['goto', 'iso'] },

      // ── Admin ──
      { id: 'admin:system-health',  label: 'Santé système',           icon: Activity,     category: 'admin', href: '/admin/system-health',   minRole: UserRole.ADMIN, keywords: ['monitoring'] },
      { id: 'admin:ldap-pending',   label: 'Validation LDAP',         icon: UserCheck,    category: 'admin', href: '/admin/ldap-pending',    minRole: UserRole.ADMIN, keywords: ['ad', 'active directory'] },
      { id: 'admin:workflows',      label: 'Workflows d\'approbation', icon: Layers,      category: 'admin', href: '/admin/workflows',       minRole: UserRole.ADMIN, keywords: ['approbation', 'flow'] },
      { id: 'admin:audit',          label: 'Audit (journal + chronologie)', icon: ClipboardList, category: 'admin', href: '/admin/audit',     minRole: UserRole.ADMIN, keywords: ['journal', 'trace', 'frise', 'timeline'] },
      { id: 'admin:rssi',           label: 'Dashboard RSSI',          icon: ShieldCheck,  category: 'admin', href: '/admin/rssi-dashboard',  minRole: UserRole.SUPER_ADMIN, keywords: ['ciso', 'supervision'] },
      { id: 'admin:users',          label: 'Utilisateurs',            icon: Users,        category: 'admin', href: '/admin/users',           minRole: UserRole.ADMIN, keywords: ['comptes', 'ldap'] },
      { id: 'admin:config',         label: 'Configuration',           icon: Settings,     category: 'admin', href: '/admin/config',          minRole: UserRole.SUPER_ADMIN, keywords: ['paramètres', 'smtp'] },
      { id: 'admin:departments',    label: 'Départements',            icon: Building2,    category: 'admin', href: '/admin/departments',     minRole: UserRole.ADMIN, keywords: ['equipe', 'organisation'] },
      { id: 'admin:reports',        label: 'Rapports',                icon: BarChart3,    category: 'admin', href: '/admin/reports',         minRole: UserRole.ADMIN, keywords: ['csv', 'export'] },
      { id: 'admin:access-reviews', label: 'Revue des accès',         icon: UserCheck,    category: 'admin', href: '/admin/access-reviews',  minRole: UserRole.SUPER_ADMIN, keywords: ['iso', 'a518'] },
      { id: 'admin:extranet',       label: 'Extranet prestataires',   icon: Globe2,       category: 'admin', href: '/extranet',              minRole: UserRole.ADMIN, keywords: ['tiers', 'portail'] },
      { id: 'admin:certificates',   label: 'Certifications',          icon: Award,        category: 'admin', href: '/admin/certificates',    minRole: UserRole.ADMIN, keywords: ['certificat', 'formation', 'iso', 'cissp'] },
      { id: 'admin:backups',        label: 'Sauvegardes',             icon: Database,     category: 'admin', href: '/admin/backups',         minRole: UserRole.SUPER_ADMIN, keywords: ['backup', 'restore', 'sauvegarde', 'restauration'] },

      // ── Aide ──
      { id: 'help:shortcuts', label: 'Raccourcis clavier',       icon: Keyboard,  category: 'help', action: openShortcutsDialog, shortcut: '?', keywords: ['aide', 'help', 'kbd'] },
      { id: 'help:support',   label: 'Contacter le support',     icon: LifeBuoy,  category: 'help', href: '/helpdesk',           keywords: ['aide', 'contact', 'it'] },
      { id: 'help:docs',      label: 'Documentation',            icon: HelpCircle, category: 'help', href: '/wiki',              keywords: ['doc', 'manuel', 'guide'] },
      { id: 'help:getting-started', label: 'Guide de démarrage', icon: Home,       category: 'help', href: '/getting-started',    keywords: ['bienvenue', 'onboarding', 'debut', 'guide'] },
    ];
    return items.filter((it) => !it.minRole || (user && isRoleAtLeast(user.role, it.minRole)));
  }, [user, toggleTheme, handleLogout, openShortcutsDialog]);

  // ── Build filtered + ranked list ──
  const flatRanked = useMemo(() => {
    if (!query.trim()) return [] as CommandItem[];
    const scored = allCommands
      .map((it) => ({ it, s: fuzzyScore(it, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, RESULTS_MAX)
      .map((x) => x.it);
    return scored;
  }, [allCommands, query]);

  // ── Build grouped list for display ──
  // Quand il n'y a pas de query, on affiche : Récent + toutes les catégories (tronquées)
  // Quand il y a une query, on affiche les résultats rankés regroupés par catégorie
  interface Section {
    id: CategoryId;
    label: string;
    items: CommandItem[];
  }

  const contentItems: CommandItem[] = useMemo(() => {
    return contentHits.map((h) => ({
      id: `content:${h.type}:${h.id}`,
      label: h.title || h.reference || '(sans titre)',
      description: h.reference ?? undefined,
      icon: CONTENT_ICONS[h.type] ?? FileText,
      category: 'content' as const,
      href: buildHitHref(h),
    }));
  }, [contentHits]);

  const sections: Section[] = useMemo(() => {
    if (query.trim()) {
      // groupé par catégorie dans l'ordre CATEGORIES
      const byCat = new Map<CategoryId, CommandItem[]>();
      flatRanked.forEach((it) => {
        const arr = byCat.get(it.category) || [];
        arr.push(it);
        byCat.set(it.category, arr);
      });
      if (contentItems.length) {
        byCat.set('content', contentItems);
      }
      return CATEGORIES
        .map((c) => ({ id: c.id, label: c.label, items: byCat.get(c.id) || [] }))
        .filter((s) => s.items.length > 0);
    }
    // Pas de query : récent + catégories
    const out: Section[] = [];
    const recentItems = recentIds
      .map((id) => allCommands.find((c) => c.id === id))
      .filter((x): x is CommandItem => Boolean(x));
    if (recentItems.length) out.push({ id: 'recent', label: 'Récent', items: recentItems });
    CATEGORIES.filter((c) => c.id !== 'recent').forEach((c) => {
      const items = allCommands.filter((it) => it.category === c.id).slice(0, 8);
      if (items.length) out.push({ id: c.id, label: c.label, items });
    });
    return out;
  }, [query, flatRanked, recentIds, allCommands, contentItems]);

  // ── Flatten for keyboard nav ──
  const flat: { section: Section; item: CommandItem; index: number }[] = useMemo(() => {
    const out: { section: Section; item: CommandItem; index: number }[] = [];
    let i = 0;
    for (const s of sections) {
      for (const it of s.items) {
        out.push({ section: s, item: it, index: i++ });
      }
    }
    return out;
  }, [sections]);

  // Clamp selection when list changes
  useEffect(() => {
    setSelectedIndex((i) => Math.max(0, Math.min(i, Math.max(0, flat.length - 1))));
  }, [flat.length]);
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-idx="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Execute ──
  const execute = useCallback((item: CommandItem) => {
    pushRecent(item.id);
    onClose();
    if (item.href) router.push(item.href);
    else if (item.action) item.action();
  }, [onClose, router, pushRecent]);

  // ── Keyboard handler (modal scope) ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const entry = flat[selectedIndex];
      if (entry) execute(entry.item);
      return;
    }
    if (e.key === 'Tab') {
      // Cycle section : saute au premier item de la section suivante (ou précédente avec shift)
      e.preventDefault();
      if (!flat.length) return;
      const current = flat[selectedIndex];
      if (!current) return;
      const sectionIndex = sections.findIndex((s) => s.id === current.section.id);
      const nextIndex = e.shiftKey
        ? (sectionIndex - 1 + sections.length) % sections.length
        : (sectionIndex + 1) % sections.length;
      const nextSection = sections[nextIndex];
      if (!nextSection) return;
      const target = flat.find((f) => f.section.id === nextSection.id);
      if (target) setSelectedIndex(target.index);
      return;
    }
    // Cmd+1..9 : saut direct vers la Nième catégorie
    if (mod && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const n = parseInt(e.key, 10) - 1;
      const target = sections[n];
      if (target) {
        const first = flat.find((f) => f.section.id === target.id);
        if (first) setSelectedIndex(first.index);
      }
      return;
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-2xl mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <Search className="h-5 w-5 text-seal-gray-500 dark:text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher ou exécuter une action…"
            aria-label="Champ de recherche de la command palette"
            className="flex-1 bg-transparent text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 outline-none"
            onKeyDown={(e) => handleKeyDown(e as unknown as React.KeyboardEvent<HTMLDivElement>)}
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-seal-gray-500 dark:text-slate-500">
            esc
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                Aucun résultat pour <span className="font-semibold text-seal-navy dark:text-white">&quot;{query}&quot;</span>
              </p>
              {query.length >= 3 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new Event('open-ai-search'));
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary/10 text-primary px-3 py-2 text-sm font-medium hover:bg-primary/20 transition"
                >
                  <Sparkles className="h-4 w-4" />
                  Rechercher avec l&apos;IA
                </button>
              )}
            </div>
          ) : (
            sections.map((sec) => (
              <div key={sec.id} className="mb-1">
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 flex items-center gap-1.5">
                  {sec.id === 'recent' && <History className="h-3 w-3" />}
                  {sec.label}
                  <span className="text-[9px] text-seal-gray-500/70 dark:text-slate-600">({sec.items.length})</span>
                </p>
                {sec.items.map((it) => {
                  const entry = flat.find((f) => f.item.id === it.id && f.section.id === sec.id);
                  const idx = entry?.index ?? -1;
                  const isSelected = idx === selectedIndex;
                  const Icon = it.icon;
                  return (
                    <button
                      key={`${sec.id}-${it.id}`}
                      type="button"
                      data-cmd-idx={idx}
                      onClick={() => execute(it)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors border-l-2 ${
                        isSelected
                          ? 'bg-primary/10 dark:bg-primary/15 border-primary'
                          : 'border-transparent hover:bg-gray-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${
                        isSelected ? 'bg-primary/20 dark:bg-primary/25' : 'bg-gray-100 dark:bg-slate-800'
                      }`}>
                        <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-seal-gray-500 dark:text-slate-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-seal-navy dark:text-white'}`}>
                          {it.category === 'content' ? (
                            <HighlightedWords text={it.label} query={query} />
                          ) : (
                            <Highlighted text={it.label} query={query} />
                          )}
                        </p>
                        {it.href && (
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">{it.href}</p>
                        )}
                      </div>
                      {it.shortcut && (
                        <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-seal-gray-500 dark:text-slate-400 flex-shrink-0">
                          {it.shortcut}
                        </kbd>
                      )}
                      {it.minRole && (
                        <span className="text-[9px] rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 font-medium flex-shrink-0">
                          Admin
                        </span>
                      )}
                      {isSelected && <ChevronRight className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 flex items-center gap-3 text-[10px] text-seal-gray-500 dark:text-slate-500 bg-gray-50/50 dark:bg-slate-900/60">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded font-mono">↑↓</kbd>
            naviguer
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded font-mono">↵</kbd>
            exécuter
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded font-mono">tab</kbd>
            catégorie
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded font-mono">esc</kbd>
            fermer
          </span>
          <span className="ml-auto flex items-center gap-1">
            <CommandIcon className="h-3 w-3" /> K
          </span>
        </div>
      </div>
    </div>
  );
}

// lucide n'exporte pas ClipboardCheckSafe → on alias ClipboardList pour éviter un import cassé
const ClipboardCheckSafe = ClipboardList;
