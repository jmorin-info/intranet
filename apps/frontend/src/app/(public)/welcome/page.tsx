'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OmnitechLogo } from '@/components/omnitech-logo';
import { WeatherWidget } from '@/components/widgets/weather-widget';
import { RSSFeedWidget } from '@/components/widgets/rss-feed-widget';
import { formatDate } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import {
  Shield, FileText, Newspaper, Users, ArrowRight, ArrowLeft, Lock, CheckCircle2,
  Rss, Ticket, Star, BookOpen, Eye, ExternalLink, BadgeCheck, ChevronRight, Pin,
  LogIn, Layout, Share2, Bell, BarChart3, UserCheck, AlertTriangle,
  X, Camera, Monitor, Cpu, Download,
} from 'lucide-react';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '/api/v1');

interface PublicInfo { appName: string; stats: { documents: number; approved: number; news: number; collaborators: number; veille?: number; ticketsResolved?: number; departments?: number; wiki?: number } }
interface PublicNews { id: string; title: string; slug: string; excerpt: string | null; publishedAt: string; category: string | null; isPinned?: boolean; author: { firstName: string; lastName: string } }
interface PublicDoc { id: string; title: string; reference: string; category: string; description: string | null; updatedAt: string; owner: { firstName: string; lastName: string }; versions?: Array<{ id: string; fileType: string }> }

function AnimatedCounter({ value, duration = 1500 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (value === 0) return;
    let start = 0;
    const step = Math.ceil(value / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setCount(value); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);
  return <span>{count}</span>;
}

/* ── Lightweight modal dialog ── */
function InfoDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-lg w-full max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-semibold text-[#004469] dark:text-white text-lg">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors" aria-label="Fermer">
            <X className="h-4 w-4 text-[#837274] dark:text-slate-400" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-[#004469] dark:text-slate-300 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

type DialogKey = 'iso' | 'seal' | 'sfpi' | 'access' | 'video' | 'hyper' | null;

export default function WelcomePage() {
  const router = useRouter();
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [news, setNews] = useState<PublicNews[]>([]);
  const [docs, setDocs] = useState<PublicDoc[]>([]);
  const [alerts, setAlerts] = useState<Array<{title: string; severity: string; sourceUrl?: string; cveId?: string | null; sourceName?: string}>>([]);
  const [loaded, setLoaded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [openDialog, setOpenDialog] = useState<DialogKey>(null);
  const { t } = useTranslation();

  // Check auth status (don't redirect — let connected users see welcome too)
  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('accessToken'));
  }, []);

  // Fetch public data. Wrapped in useCallback so we can also trigger it on
  // visibility change and window focus, pour refléter les nouveautés sans
  // demander à l'utilisateur de F5 (bug signalé 2026-04-20 : portail ne
  // montrait plus les news/docs récents).
  const refreshPortal = useCallback(() => {
    const opts: RequestInit = { cache: 'no-store' as const };
    Promise.all([
      fetch(`${API}/public/info`, opts).then(r => r.json()).catch(() => null),
      fetch(`${API}/public/news?limit=6`, opts).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${API}/public/documents?limit=9`, opts).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([infoData, newsData, docsData]) => {
      if (infoData) setInfo(infoData);
      setNews(newsData?.data || []);
      setDocs(docsData?.data || []);
      setLoaded(true);
    }).catch(console.error);
    fetch(`${API}/public/veille?limit=5`, opts)
      .then(r => r.json())
      .then(d => setAlerts(
        (d?.data || []).map((v: { title: string; severity: string; sourceUrl?: string; cveId?: string | null; sourceName?: string }) => ({
          title: v.title,
          severity: v.severity,
          sourceUrl: v.sourceUrl,
          cveId: v.cveId,
          sourceName: v.sourceName,
        })),
      ))
      .catch(console.error);
  }, []);

  useEffect(() => {
    refreshPortal();

    // Refetch quand l'onglet redevient visible (user revient après un moment)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshPortal();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshPortal);

    // Poll léger toutes les 5 min si l'onglet reste ouvert (news temps réel
    // pas critique, mais éviter un portail figé plusieurs heures)
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshPortal();
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshPortal);
      clearInterval(pollId);
    };
  }, [refreshPortal]);


  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-slate-950">
      <div className="fixed bottom-6 right-6 z-50" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {isLoggedIn ? (
          <Link href="/dashboard"
            className="flex items-center gap-2 bg-[#004469] hover:bg-[#003352] text-white rounded-full pl-4 pr-5 py-3 shadow-xl text-sm font-semibold transition-all hover:scale-105">
            <ArrowLeft className="h-4 w-4" />
            {t('portal.backToIntranet')}
          </Link>
        ) : (
          <Link href="/login"
            className="flex items-center gap-2 bg-[#004469] hover:bg-[#003352] text-white rounded-full pl-4 pr-5 py-3 shadow-xl text-sm font-semibold transition-all hover:scale-105">
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Link>
        )}
      </div>
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#004469]/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <OmnitechLogo size="sm" variant="full" className="text-white" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-4">
            <a href="#services" className="text-white/60 text-xs sm:text-sm hover:text-white transition hidden md:block px-2 py-1">Services</a>
            <a href="#vie-entreprise" className="text-white/60 text-xs sm:text-sm hover:text-white transition hidden md:block px-2 py-1">Vie en entreprise</a>
            <a href="#actualites" className="text-white/60 text-xs sm:text-sm hover:text-white transition hidden md:block px-2 py-1">Actualités</a>
            <a href="#documents-publics" className="text-white/60 text-xs sm:text-sm hover:text-white transition hidden md:block px-2 py-1">Documents</a>
            <Link href={isLoggedIn ? '/dashboard' : '/login'} className="ml-2 flex items-center gap-2 bg-[#F68D2E] hover:bg-[#d97420] rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors">
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isLoggedIn ? t('portal.accessMySpace') : t('auth.login')}</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO — uses inline style for reliable padding-top over the fixed header */}
      <section className="bg-[#004469] dark:bg-slate-900 relative overflow-hidden" style={{ paddingTop: '8rem', paddingBottom: '6rem' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-[500px] h-[500px] rounded-full bg-[#F68D2E]/5" />
          <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-white/[0.02]" />
          <div className="absolute top-0 left-0 w-full h-full opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="absolute top-1/2 right-0 w-[600px] h-[600px] rounded-full bg-[#F68D2E]/[0.03] blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-8">
                <Shield className="h-4 w-4 text-[#F68D2E]" />
                <span className="text-white/70 text-xs font-semibold tracking-wide">Sécurité certifiée</span>
              </div>
              <div className="mb-6">
                <OmnitechLogo size="lg" variant="full" className="text-white" />
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light text-white leading-[1.1]">
                Bienvenue sur<br />l&apos;intranet{' '}
                <span className="text-[#F68D2E] font-semibold">OMNITECH</span>
              </h1>
              <p className="text-white/60 mt-6 text-lg sm:text-xl max-w-lg leading-relaxed">
                Plateforme sécurisée de collaboration et de gouvernance — au service de la sûreté des sites à risques.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-10">
                <Link href={isLoggedIn ? '/dashboard' : '/login'} className="flex items-center gap-2.5 bg-gradient-to-r from-[#F68D2E] to-[#e67d1e] hover:from-[#e67d1e] hover:to-[#d06a10] rounded-xl px-8 py-4 text-base font-semibold text-white transition-all shadow-[0_0_24px_rgba(246,141,46,0.5)] hover:shadow-[0_0_36px_rgba(246,141,46,0.7)] hover:scale-[1.03] active:scale-[0.98]">
                  {isLoggedIn ? t('portal.backToDashboard') : t('portal.accessMySpace')} <ArrowRight className="h-5 w-5" />
                </Link>
                <a href="#documents-publics" className="flex items-center gap-2 border border-white/20 hover:border-white/40 rounded-xl px-6 py-4 text-sm text-white/70 hover:text-white transition-colors">
                  <Eye className="h-4 w-4" /> Voir les documents
                </a>
              </div>
            </div>
            {info && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Documents gérés', value: info.stats.documents, icon: FileText, color: 'bg-[#F68D2E]/20 text-[#F68D2E]' },
                  { label: 'Documents approuvés', value: info.stats.approved, icon: CheckCircle2, color: 'bg-emerald-500/20 text-emerald-400' },
                  { label: 'Actualités publiées', value: info.stats.news, icon: Newspaper, color: 'bg-blue-500/20 text-blue-400' },
                  { label: 'Collaborateurs actifs', value: info.stats.collaborators, icon: Users, color: 'bg-purple-500/20 text-purple-400' },
                  ...(info.stats.veille ? [{ label: 'Veilles cyber', value: info.stats.veille, icon: Rss, color: 'bg-red-500/20 text-red-400' }] : []),
                  ...(info.stats.ticketsResolved ? [{ label: 'Tickets résolus', value: info.stats.ticketsResolved, icon: Ticket, color: 'bg-cyan-500/20 text-cyan-400' }] : []),
                  ...(info.stats.departments ? [{ label: 'Départements', value: info.stats.departments, icon: BarChart3, color: 'bg-indigo-500/20 text-indigo-400' }] : []),
                  ...(info.stats.wiki ? [{ label: 'Pages wiki', value: info.stats.wiki, icon: BookOpen, color: 'bg-teal-500/20 text-teal-400' }] : []),
                ].map(s => (
                  <div key={s.label} className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:bg-white/[0.1] transition-colors">
                    <div className={`h-10 w-10 rounded-lg ${s.color} flex items-center justify-center mb-3`}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    <p className="text-2xl sm:text-3xl font-semibold text-white">
                      <AnimatedCounter value={s.value} />
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ISO 27001 Certification Badge — clickable */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-6 relative z-10">
        <button
          type="button"
          onClick={() => setOpenDialog('iso')}
          className="w-full text-left bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200/80 dark:border-slate-700 p-5 flex items-center justify-between cursor-pointer hover:shadow-xl hover:border-emerald-300 dark:hover:border-emerald-600 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <BadgeCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[#004469] dark:text-white text-sm">ISO 27001 : 2022 — SMSI certifié</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  ACTIF
                </span>
              </div>
              <p className="text-xs text-[#837274] dark:text-slate-400 mt-0.5">
                Système de management de la sécurité de l&apos;information conforme ISO 27001:2022 — conformité NIS2 et référentiels ANSSI
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-[#837274] dark:text-slate-500 uppercase tracking-wider font-semibold">Référentiels</p>
              <p className="text-xs text-[#004469] dark:text-white font-medium">ISO 27001 · NIS2 · ANSSI</p>
            </div>
            <div className="h-8 w-px bg-gray-200 dark:bg-slate-700" />
            <div className="text-right">
              <p className="text-[10px] text-[#837274] dark:text-slate-500 uppercase tracking-wider font-semibold">Gouvernance</p>
              <p className="text-xs text-[#004469] dark:text-white font-medium">RSSI · PSSI · EBIOS RM</p>
            </div>
          </div>
        </button>
      </section>

      {/* SEAL System + Groupe SFPI badges */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-3 mb-10 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setOpenDialog('seal')}
            className="text-left bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200/80 dark:border-slate-700 p-4 flex items-center gap-3 cursor-pointer hover:shadow-lg hover:border-[#F68D2E]/40 transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-[#F68D2E]/10 flex items-center justify-center flex-shrink-0">
              <Cpu className="h-5 w-5 text-[#F68D2E]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#004469] dark:text-white text-sm">SEAL System</h3>
              <p className="text-[10px] text-[#837274] dark:text-slate-400 mt-0.5">Hypervision propriétaire</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setOpenDialog('sfpi')}
            className="text-left bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200/80 dark:border-slate-700 p-4 flex items-center gap-3 cursor-pointer hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-[#004469] dark:text-white text-sm">Groupe SFPI</h3>
              <p className="text-[10px] text-[#837274] dark:text-slate-400 mt-0.5">Maison mère DOM-SECURITY</p>
            </div>
          </button>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setOpenDialog('access')} className="text-left bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200/80 dark:border-slate-700 p-3 flex flex-col items-center gap-1.5 cursor-pointer hover:shadow-lg hover:border-[#004469]/40 transition-all">
              <Lock className="h-5 w-5 text-[#004469] dark:text-blue-400" />
              <span className="text-[10px] font-semibold text-[#004469] dark:text-white text-center leading-tight">Contrôle d&apos;accès</span>
            </button>
            <button type="button" onClick={() => setOpenDialog('video')} className="text-left bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200/80 dark:border-slate-700 p-3 flex flex-col items-center gap-1.5 cursor-pointer hover:shadow-lg hover:border-[#004469]/40 transition-all">
              <Camera className="h-5 w-5 text-[#004469] dark:text-blue-400" />
              <span className="text-[10px] font-semibold text-[#004469] dark:text-white text-center leading-tight">Vidéo&shy;surveillance</span>
            </button>
            <button type="button" onClick={() => setOpenDialog('hyper')} className="text-left bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200/80 dark:border-slate-700 p-3 flex flex-col items-center gap-1.5 cursor-pointer hover:shadow-lg hover:border-[#004469]/40 transition-all">
              <Monitor className="h-5 w-5 text-[#004469] dark:text-blue-400" />
              <span className="text-[10px] font-semibold text-[#004469] dark:text-white text-center leading-tight">Hyper&shy;vision</span>
            </button>
          </div>
        </div>
      </section>

      {/* Cyber Alert Ticker */}
      {alerts.length > 0 && (
        <section className="bg-[#004469] dark:bg-slate-800 py-3 overflow-hidden mb-8">
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-3">
            <div className="flex-shrink-0 flex items-center gap-2 bg-red-500/20 rounded-full px-3 py-1">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-semibold text-red-400">ALERTES</span>
            </div>
            <div className="overflow-hidden flex-1">
              <div className="animate-marquee whitespace-nowrap">
                {[...alerts, ...alerts].map((a, i) => {
                  const href = a.cveId
                    ? `https://nvd.nist.gov/vuln/detail/${a.cveId}`
                    : a.sourceUrl || '/veille';
                  const isExternal = href.startsWith('http');
                  return (
                    <a
                      key={i}
                      href={href}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noopener noreferrer' : undefined}
                      className="inline-block mx-8 text-sm text-white/70 hover:text-white transition-colors hover:underline"
                      title={isExternal ? 'Ouvrir la source' : 'Voir la veille'}
                    >
                      <span className={`font-semibold ${a.severity === 'CRITICAL' || a.severity === 'HIGH' ? 'text-red-400' : a.severity === 'MEDIUM' ? 'text-amber-400' : 'text-blue-400'}`}>
                        [{a.severity || 'INFO'}]
                      </span>{' '}
                      {a.title}
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* COMMENT CA MARCHE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-semibold text-[#004469] dark:text-white">Comment ça marche</h2>
          <p className="text-sm text-[#837274] dark:text-slate-400 mt-2">Quatre étapes pour accéder à l&apos;ensemble de vos outils métier</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { step: 1, icon: LogIn, title: 'Connectez-vous', desc: 'Authentifiez-vous avec vos identifiants Active Directory — le même login que votre session Windows, renforcé par le MFA.' },
            { step: 2, icon: Layout, title: 'Explorez votre espace', desc: 'Retrouvez en un coup d\'oeil vos documents, tickets IT, actualités et indicateurs de conformité depuis votre tableau de bord personnalisé.' },
            { step: 3, icon: Share2, title: 'Collaborez', desc: 'Rédigez, révisez, signez et partagez vos livrables en toute sécurité grâce au workflow documentaire intégré.' },
            { step: 4, icon: Bell, title: 'Restez informé', desc: 'Recevez en temps réel les notifications, alertes cybersécurité CERT-FR et communications de la Direction.' },
          ].map(s => (
            <div key={s.step} className="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200/80 dark:border-slate-700 p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 h-7 w-7 rounded-full bg-[#F68D2E] text-white text-xs font-semibold flex items-center justify-center shadow-md">
                {s.step}
              </div>
              <div className="h-12 w-12 rounded-xl bg-[#004469]/10 dark:bg-slate-700 flex items-center justify-center mx-auto mt-3 mb-4">
                <s.icon className="h-6 w-6 text-[#004469] dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-[#004469] dark:text-white text-sm mb-2">{s.title}</h3>
              <p className="text-xs text-[#837274] dark:text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CHIFFRES CLES */}
      <section className="bg-[#004469] dark:bg-slate-900 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-white">Chiffres clés</h2>
            <p className="text-sm text-white/50 mt-2">L&apos;intranet OMNITECH en quelques chiffres</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Documents gérés', value: info?.stats.documents || 0, icon: FileText, color: 'text-[#F68D2E]' },
              { label: 'Documents approuvés', value: info?.stats.approved || 0, icon: CheckCircle2, color: 'text-emerald-400' },
              { label: 'Actualités publiées', value: info?.stats.news || 0, icon: Newspaper, color: 'text-sky-400' },
              { label: 'Collaborateurs', value: info?.stats.collaborators || 0, icon: UserCheck, color: 'text-purple-400' },
              { label: 'Veilles cyber', value: info?.stats.veille || 0, icon: AlertTriangle, color: 'text-amber-400' },
              { label: 'Tickets résolus', value: info?.stats.ticketsResolved || 0, icon: Ticket, color: 'text-blue-400' },
              { label: 'Départements', value: info?.stats.departments || 0, icon: BarChart3, color: 'text-indigo-400' },
              { label: 'Pages wiki', value: info?.stats.wiki || 0, icon: BookOpen, color: 'text-teal-400' },
            ].filter(c => c.value > 0).map(c => (
              <div key={c.label} className="text-center">
                <div className={`h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4 ${c.color}`}>
                  <c.icon className="h-7 w-7" />
                </div>
                <p className="text-3xl sm:text-4xl font-semibold text-white">
                  <AnimatedCounter value={c.value} />
                </p>
                <p className="text-xs text-white/50 mt-1">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-[#004469] dark:text-white">Nos services</h2>
          <p className="text-sm text-[#837274] dark:text-slate-400 mt-1">Les outils à disposition des collaborateurs</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: FileText, title: 'GED / Base documentaire', desc: 'Cycle de vie complet des documents ISO 27001 : r\u00e9daction, revue, approbation, publication et archivage.' },
            { icon: Shield, title: 'Conformit\u00e9 s\u00e9curit\u00e9', desc: 'Tableau de bord SMSI, suivi des contr\u00f4les ISO 27001 et NIS2, audits et revues p\u00e9riodiques.' },
            { icon: Rss, title: 'Veille cybers\u00e9curit\u00e9', desc: 'Flux CERT-FR, ANSSI et CVE agr\u00e9g\u00e9s, class\u00e9s par th\u00e8me et s\u00e9v\u00e9rit\u00e9, avec alertes en temps r\u00e9el.' },
            { icon: Ticket, title: 'Tickets IT / Helpdesk', desc: 'Incidents et demandes centralis\u00e9s avec SLA, priorit\u00e9s, chatbot d\u0027assistance et portail self-service.' },
            { icon: BookOpen, title: 'Wiki interne', desc: 'Base de connaissances collaborative : runbooks, proc\u00e9dures op\u00e9rationnelles et documentation \u00e9quipe.' },
            { icon: AlertTriangle, title: 'Gestion des incidents', desc: 'Signalement, qualification et suivi des incidents de s\u00e9curit\u00e9 avec workflow d\u0027escalade RSSI.' },
            { icon: Newspaper, title: 'Actualit\u00e9s internes', desc: 'Communications officielles, annonces RSSI, formations et \u00e9v\u00e9nements internes OMNITECH.' },
            { icon: Star, title: 'Quiz et sensibilisation', desc: 'Quiz cybers\u00e9curit\u00e9, enqu\u00eates de satisfaction et programme de formation continue des collaborateurs.' },
          ].map(f => (
            <div key={f.title} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200/80 dark:border-slate-700 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="h-11 w-11 rounded-xl bg-[#F68D2E]/10 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-[#F68D2E]" />
              </div>
              <h3 className="font-semibold text-[#004469] dark:text-white text-sm mb-2">{f.title}</h3>
              <p className="text-xs text-[#837274] dark:text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Values / Pillars */}
      <section className="py-16 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold text-[#004469] dark:text-white">Nos engagements sécurité</h2>
            <p className="text-sm text-[#837274] dark:text-slate-400 mt-2">Une approche rigoureuse de la sécurité de l&apos;information</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: 'Confidentialité', desc: 'Chaque donnée est protégée selon sa classification ISO 27001 A.5.12 (Public, Interne, Confidentiel, Secret). Le contrôle d\'accès repose sur Active Directory, l\'authentification RADIUS 802.1X et le chiffrement de bout en bout, garantissant que seules les personnes habilitées accèdent aux informations sensibles.', color: 'bg-blue-500/10 text-blue-600' },
              { icon: CheckCircle2, title: 'Intégrité', desc: 'La traçabilité de chaque modification est assurée par un contrôle de version rigoureux, des checksums SHA-256 et un audit trail exhaustif. La PSSI et l\'ensemble des politiques de sécurité sont maintenues selon la méthode EBIOS Risk Manager, sous la gouvernance du RSSI.', color: 'bg-emerald-500/10 text-emerald-600' },
              { icon: Eye, title: 'Disponibilité', desc: 'La continuité de service est garantie par des sauvegardes quotidiennes Veeam, des plans de reprise et de continuité d\'activité (PRA/PCA) éprouvés. La supervision Centreon, le SIEM Wazuh et la protection endpoint ESET assurent une détection proactive des incidents 24h/24.', color: 'bg-amber-500/10 text-amber-600' },
            ].map(v => (
              <div key={v.title} className="text-center group">
                <div className={`h-16 w-16 rounded-2xl ${v.color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                  <v.icon className="h-8 w-8" />
                </div>
                <h3 className="font-semibold text-[#004469] dark:text-white text-lg">{v.title}</h3>
                <p className="text-sm text-[#837274] dark:text-slate-400 mt-2 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VIE EN ENTREPRISE */}
      <section className="py-16 bg-white dark:bg-slate-900" id="vie-entreprise">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-[#004469] dark:text-white">Vie en entreprise</h2>
            <p className="text-sm text-[#837274] dark:text-slate-400 mt-2">OMNITECH Security — Votre environnement de travail</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, title: 'Équipes', desc: `${info?.stats.collaborators || '—'} collaborateurs répartis sur plusieurs sites`, color: 'bg-blue-500/10 text-blue-600' },
              { icon: Shield, title: 'Sécurité', desc: 'Infrastructure Fortinet (firewall FortiGate), protection ESET Endpoint, SIEM Wazuh et gouvernance RSSI — politique de sécurité (PSSI) validée par la Direction', color: 'bg-emerald-500/10 text-emerald-600' },
              { icon: BookOpen, title: 'Formation', desc: 'Programme de sensibilisation cybersécurité avec quiz et évaluation continue', color: 'bg-purple-500/10 text-purple-600' },
              { icon: Star, title: 'Satisfaction', desc: 'Enquêtes régulières pour améliorer votre expérience au quotidien', color: 'bg-amber-500/10 text-amber-600' },
            ].map(item => (
              <div key={item.title} className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className={`h-12 w-12 rounded-xl ${item.color} flex items-center justify-center mb-4`}>
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-[#004469] dark:text-white">{item.title}</h3>
                <p className="text-sm text-[#837274] dark:text-slate-400 mt-2">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ACTUALITES */}
      <section id="actualites" className="bg-white dark:bg-slate-900 border-y border-gray-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-semibold text-[#004469] dark:text-white">Flux d&apos;informations et mises à jour</h2>
              <p className="text-sm text-[#837274] dark:text-slate-400 mt-1">Communications internes, annonces sécurité et vie de l&apos;entreprise — {news.length > 0 ? `${news.length} article${news.length > 1 ? 's' : ''} publié${news.length > 1 ? 's' : ''}` : 'aucune publication pour le moment'}</p>
            </div>
          </div>
          {news.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...news].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0)).map(n => (
                <Link key={n.id} href={`/login?redirect=/news/${n.slug}`} className="block">
                  <article className={`rounded-xl p-5 hover:shadow-md transition-shadow border ${n.isPinned ? 'bg-[#F68D2E]/5 dark:bg-[#F68D2E]/10 border-[#F68D2E]/30 dark:border-[#F68D2E]/20 ring-1 ring-[#F68D2E]/20' : 'bg-[#F5F5F5] dark:bg-slate-800 border-gray-100 dark:border-slate-700'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {n.isPinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F68D2E]/20 px-2.5 py-0.5 text-[10px] font-semibold text-[#F68D2E]">
                          <Pin className="h-3 w-3" /> Important
                        </span>
                      )}
                      {n.category && <span className="rounded-full bg-[#F68D2E]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#F68D2E]">{n.category}</span>}
                      <span className="text-[10px] text-[#837274] dark:text-slate-500">{formatDate(n.publishedAt)}</span>
                    </div>
                    <h3 className={`font-semibold text-[#004469] dark:text-white line-clamp-2 ${n.isPinned ? 'text-base' : 'text-sm'}`}>{n.title}</h3>
                    {n.excerpt && <p className="text-xs text-[#837274] dark:text-slate-400 line-clamp-3 mt-2">{n.excerpt}</p>}
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-[10px] text-[#837274]/60 dark:text-slate-500">{n.author.firstName} {n.author.lastName}</p>
                      <span className="text-[10px] font-semibold text-[#F68D2E] flex items-center gap-1">Connectez-vous pour lire la suite <ArrowRight className="h-3 w-3" /></span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          ) : loaded ? (
            <div className="text-center py-12">
              <Newspaper className="h-10 w-10 text-[#837274]/30 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-[#837274] dark:text-slate-400">Aucune actualité publiée pour le moment.</p>
              <p className="text-xs text-[#837274]/60 dark:text-slate-500 mt-1">Les communications de la Direction et du RSSI apparaîtront ici dès leur publication.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-5">{[1,2,3].map(i => <div key={i} className="h-36 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)}</div>
          )}
        </div>
      </section>

      {/* DOCUMENTS PUBLICS */}
      <section id="documents-publics" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-[#004469] dark:text-white">Centre de ressources publiques</h2>
            <p className="text-sm text-[#837274] dark:text-slate-400 mt-1">
              Documents réglementaires, procédures et politiques approuvées conformes ISO 27001{docs.length > 0 ? ` — ${docs.length} ressource${docs.length > 1 ? 's' : ''} disponible${docs.length > 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>
        {docs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map(d => (
              <div key={d.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200/80 dark:border-slate-700 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all group">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-[#004469]/10 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 group-hover:bg-[#F68D2E]/10 transition-colors">
                    <FileText className="h-5 w-5 text-[#004469] dark:text-blue-400 group-hover:text-[#F68D2E] transition-colors" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#004469] dark:text-white text-sm line-clamp-2">{d.title}</p>
                    <p className="text-[10px] font-mono text-[#837274] dark:text-slate-500 mt-0.5">{d.reference}</p>
                  </div>
                </div>
                {d.description && <p className="text-xs text-[#837274] dark:text-slate-400 line-clamp-2">{d.description}</p>}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-700">
                  <span className="rounded-full bg-[#004469]/10 dark:bg-slate-700 px-2.5 py-0.5 text-[10px] font-semibold text-[#004469] dark:text-blue-300">{d.category}</span>
                  <div className="flex items-center gap-2 ml-auto">
                    {d.versions && d.versions[0] && (
                      d.versions[0].fileType === 'text/html' ? (
                        <a
                          href={`/login?redirect=/documents/${d.id}`}
                          className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                        >
                          <Eye className="h-3 w-3" /> Consulter
                        </a>
                      ) : (
                        <a
                          href={`${API}/public/documents/${d.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                        >
                          <Download className="h-3 w-3" /> Télécharger
                        </a>
                      )
                    )}
                    <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">{formatDate(d.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : loaded ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
            <BookOpen className="h-10 w-10 text-[#837274]/30 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-[#837274] dark:text-slate-400">Aucun document public disponible pour le moment.</p>
            <p className="text-xs text-[#837274]/60 dark:text-slate-500 mt-1 max-w-md mx-auto">Les documents marqués comme publics par l&apos;équipe OMNITECH Security apparaîtront ici.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)}</div>
        )}
      </section>

      {/* METEO + FLUX RSS */}
      <section className="bg-white dark:bg-slate-900 border-y border-gray-200/80 dark:border-slate-800 my-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Météo */}
            <div className="bg-[#F5F5F5] dark:bg-slate-800 rounded-xl p-6 border border-gray-100 dark:border-slate-700">
              <h3 className="font-semibold text-[#004469] dark:text-white text-sm mb-4">Météo</h3>
              <WeatherWidget />
            </div>
            {/* RSS Feed */}
            <div className="lg:col-span-2 bg-[#F5F5F5] dark:bg-slate-800 rounded-xl p-6 border border-gray-100 dark:border-slate-700">
              <RSSFeedWidget />
            </div>
          </div>
        </div>
      </section>

      {/* CONFORMITE */}
      <section className="py-16 bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-[#004469] dark:text-white">Conformité et référentiels</h2>
            <p className="text-sm text-[#837274] dark:text-slate-400 mt-2">L&apos;intranet OMNITECH s&apos;inscrit dans une démarche de conformité multi-référentiels</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200/80 dark:border-slate-700 p-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <BadgeCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-semibold text-[#004469] dark:text-white">ISO 27001:2022</h3>
              <p className="text-xs text-[#837274] dark:text-slate-400 mt-2 leading-relaxed">Système de management de la sécurité de l&apos;information (SMSI). Classification documentaire A.5.12, gestion des accès A.5.15, gestion des incidents A.5.24.</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200/80 dark:border-slate-700 p-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-[#004469] dark:text-white">Directive NIS2</h3>
              <p className="text-xs text-[#837274] dark:text-slate-400 mt-2 leading-relaxed">Conformité à la directive européenne sur la sécurité des réseaux et des systèmes d&apos;information. Notification des incidents, gouvernance et gestion des risques.</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200/80 dark:border-slate-700 p-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                <Lock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-semibold text-[#004469] dark:text-white">ANSSI / EBIOS RM</h3>
              <p className="text-xs text-[#837274] dark:text-slate-400 mt-2 leading-relaxed">Analyse de risques selon la méthode EBIOS Risk Manager de l&apos;ANSSI. Gouvernance RSSI, PSSI validée par la Direction et plan de continuité d&apos;activité.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-gray-50 dark:bg-slate-800/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-semibold text-[#004469] dark:text-white text-center mb-8">Questions fréquentes</h2>
          {[
            { q: 'Comment acc\u00e9der \u00e0 l\'intranet ?', a: 'Connectez-vous avec vos identifiants Active Directory — il s\'agit du m\u00eame login que votre session Windows. L\'authentification multi-facteurs (MFA) peut \u00eatre requise selon votre profil. En cas de difficult\u00e9, le support IT est joignable via le portail de tickets.' },
            { q: 'Comment configurer le MFA ?', a: 'Depuis votre tableau de bord, rendez-vous dans Mon profil > S\u00e9curit\u00e9 > MFA. Scannez le QR code affich\u00e9 avec Microsoft Authenticator ou Google Authenticator, puis saisissez le code \u00e0 6 chiffres g\u00e9n\u00e9r\u00e9 par l\'application. Le MFA sera activ\u00e9 imm\u00e9diatement et renforc\u00e9 \u00e0 chaque connexion.' },
            { q: 'J\'ai oubli\u00e9 mon mot de passe', a: 'Sur la page de connexion, cliquez sur "Mot de passe oubli\u00e9". Un lien de r\u00e9initialisation s\u00e9curis\u00e9 sera envoy\u00e9 \u00e0 votre adresse email professionnelle. Ce lien expire au bout de 30 minutes. Si vous ne recevez pas l\'email, v\u00e9rifiez vos courriers ind\u00e9sirables ou contactez le support IT.' },
            { q: 'Comment cr\u00e9er un ticket IT ?', a: 'Acc\u00e9dez \u00e0 Tickets IT > Nouveau ticket depuis la barre lat\u00e9rale. D\u00e9crivez pr\u00e9cis\u00e9ment votre probl\u00e8me, s\u00e9lectionnez la cat\u00e9gorie et la priorit\u00e9 appropri\u00e9es. Un technicien sera automatiquement assign\u00e9 en fonction du SLA applicable et vous recevrez des notifications \u00e0 chaque \u00e9tape du traitement.' },
            { q: 'O\u00f9 trouver les proc\u00e9dures IT ?', a: 'L\'ensemble des proc\u00e9dures op\u00e9rationnelles est centralis\u00e9 dans la section Documents de l\'intranet, organis\u00e9 par cat\u00e9gorie (s\u00e9curit\u00e9, r\u00e9seau, poste de travail, etc.). Chaque document est t\u00e9l\u00e9chargeable en PDF et soumis au workflow de validation ISO 27001.' },
            { q: 'Comment publier un document confidentiel ?', a: 'R\u00e9digez le document dans l\'\u00e9diteur int\u00e9gr\u00e9, attribuez-lui la classification "Confidentiel" (ISO 27001 A.5.12), puis soumettez-le en revue. Apr\u00e8s validation du r\u00e9viseur d\u00e9sign\u00e9, un approbateur habilit\u00e9 signe \u00e9lectroniquement le document pour publication restreinte aux seuls collaborateurs autoris\u00e9s.' },
            { q: 'Comment signaler un incident de s\u00e9curit\u00e9 ?', a: 'Utilisez le module Incidents accessible depuis la barre lat\u00e9rale, ou contactez directement le RSSI. D\u00e9crivez les faits constat\u00e9s, l\'impact estim\u00e9 et les syst\u00e8mes concern\u00e9s. Le workflow d\'\u00e9scalade int\u00e9gr\u00e9 notifie automatiquement les parties prenantes selon la s\u00e9v\u00e9rit\u00e9 d\u00e9clar\u00e9e.' },
            { q: 'Comment fonctionne la classification des documents ?', a: 'Le syst\u00e8me repose sur quatre niveaux conformes \u00e0 l\'ISO 27001 A.5.12 : Public (diffusable sans restriction), Interne (r\u00e9serv\u00e9 aux collaborateurs), Confidentiel (acc\u00e8s sur besoin d\'en conna\u00eetre uniquement) et Secret (cercle restreint, validation obligatoire du RSSI). Chaque niveau d\u00e9termine les droits d\'acc\u00e8s, de partage et de t\u00e9l\u00e9chargement.' },
          ].map((item, i) => (
            <details key={i} className="mb-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden group">
              <summary className="px-5 py-4 cursor-pointer font-semibold text-[#004469] dark:text-white text-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                {item.q}
                <ChevronRight className="h-4 w-4 text-[#837274] transition-transform group-open:rotate-90" />
              </summary>
              <div className="px-5 pb-4 text-sm text-[#837274] dark:text-slate-400 leading-relaxed">{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-[#004469] dark:bg-slate-800 rounded-2xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#F68D2E]/10" />
          </div>
          <div className="relative text-center">
            <OmnitechLogo size="lg" variant="icon" className="mx-auto mb-6" />
            <h2 className="text-xl sm:text-2xl font-semibold text-white">Accédez à votre espace de travail sécurisé</h2>
            <p className="text-white/50 mt-2 max-w-md mx-auto text-sm">Retrouvez l&apos;ensemble de vos outils métier : gestion documentaire, tickets IT, veille cybersécurité, wiki collaboratif et bien plus encore.</p>
            <Link href="/login" className="inline-flex items-center gap-2 bg-[#F68D2E] hover:bg-[#d97420] rounded-lg px-7 py-3.5 text-sm font-semibold text-white transition-colors mt-7 shadow-lg shadow-[#F68D2E]/20">
              <Lock className="h-4 w-4" /> {t('portal.cta.button')}
            </Link>
          </div>
        </div>

        {/* External access section */}
        <div className="mt-8 border-t border-gray-200 dark:border-slate-700 pt-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-[#004469] dark:text-white">Espace Prestataires</h3>
            <p className="text-sm text-[#837274] dark:text-slate-400 mt-1">
              Accès réservé aux partenaires et prestataires externes
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-lg border-2 border-[#F68D2E] bg-transparent px-6 py-2.5 text-sm font-semibold text-[#F68D2E] hover:bg-[#F68D2E] hover:text-white transition-colors">
                <ExternalLink className="h-4 w-4" />
                Portail Prestataire
              </Link>
            </div>
            <p className="text-xs text-[#837274] dark:text-slate-500 mt-3">
              MFA obligatoire — Session limitée — Accès restreint
            </p>
          </div>
        </div>
      </section>

      {/* ── Dialogs ── */}
      <InfoDialog open={openDialog === 'iso'} onClose={() => setOpenDialog(null)} title="ISO 27001:2022 — SMSI certifié">
        <p>
          Le Système de Management de la Sécurité de l&apos;Information (SMSI) d&apos;OMNITECH Security est conforme à la norme
          <strong> ISO 27001:2022</strong>. Cette certification garantit que les processus de gestion des risques, de protection des données
          et de continuité d&apos;activité respectent les plus hauts standards internationaux.
        </p>
        <div>
          <h4 className="font-semibold text-[#004469] dark:text-white mb-2">Référentiels</h4>
          <ul className="space-y-2 text-xs text-[#837274] dark:text-slate-400">
            <li><strong className="text-[#004469] dark:text-white">ISO 27001</strong> — Norme internationale de management de la sécurité de l&apos;information, structurée autour de 93 contrôles (Annexe A).</li>
            <li><strong className="text-[#004469] dark:text-white">NIS2</strong> — Directive européenne imposant des obligations de cybersécurité aux entités essentielles et importantes.</li>
            <li><strong className="text-[#004469] dark:text-white">ANSSI</strong> — Agence nationale de la sécurité des systèmes d&apos;information, autorité française de référence en cybersécurité.</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-[#004469] dark:text-white mb-2">Gouvernance</h4>
          <ul className="space-y-2 text-xs text-[#837274] dark:text-slate-400">
            <li><strong className="text-[#004469] dark:text-white">RSSI</strong> — Responsable de la Sécurité des Systèmes d&apos;Information, pilote la stratégie de sécurité et supervise les audits.</li>
            <li><strong className="text-[#004469] dark:text-white">PSSI</strong> — Politique de Sécurité du Système d&apos;Information, document cadre validé par la Direction générale.</li>
            <li><strong className="text-[#004469] dark:text-white">EBIOS RM</strong> — Méthode d&apos;analyse de risques de l&apos;ANSSI, utilisée pour identifier et traiter les scénarios de menaces.</li>
          </ul>
        </div>
        <Link href="/wiki?search=ISO+27001" className="inline-flex items-center gap-2 bg-[#004469] hover:bg-[#003352] text-white rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors mt-2">
          En savoir plus <ArrowRight className="h-4 w-4" />
        </Link>
      </InfoDialog>

      <InfoDialog open={openDialog === 'seal'} onClose={() => setOpenDialog(null)} title="SEAL System">
        <p>
          Le <strong>SEAL System</strong> est la plateforme d&apos;hypervision propriétaire d&apos;OMNITECH Security.
          Elle centralise le contrôle d&apos;accès, la vidéosurveillance et les alarmes sur une interface unique,
          offrant une vision à 360° de la sécurité des sites protégés.
        </p>
        <ul className="space-y-2 text-xs text-[#837274] dark:text-slate-400">
          <li><strong className="text-[#004469] dark:text-white">Centralisation</strong> — Agrège les flux de tous les sous-systèmes (contrôle d&apos;accès, vidéo, intrusion, incendie) en temps réel.</li>
          <li><strong className="text-[#004469] dark:text-white">Cartographie interactive</strong> — Plans 2D/3D des sites avec positionnement des équipements et états en direct.</li>
          <li><strong className="text-[#004469] dark:text-white">Scénarios automatisés</strong> — Réponses programmées aux événements (confinement, évacuation, levée de doute vidéo).</li>
        </ul>
      </InfoDialog>

      <InfoDialog open={openDialog === 'sfpi'} onClose={() => setOpenDialog(null)} title="Groupe SFPI">
        <p>
          <strong>OMNITECH Security</strong> est une filiale du groupe <strong>SFPI</strong> (anciennement DOM-SECURITY),
          spécialisé dans les systèmes de sécurité physique et électronique. Le groupe, coté en bourse, réunit
          plusieurs marques leaders dans les domaines de la fermeture, du contrôle d&apos;accès et de la protection des bâtiments.
        </p>
        <ul className="space-y-2 text-xs text-[#837274] dark:text-slate-400">
          <li><strong className="text-[#004469] dark:text-white">DOM-SECURITY</strong> — Branche historique spécialisée dans les serrures et cylindres haute sécurité.</li>
          <li><strong className="text-[#004469] dark:text-white">Présence internationale</strong> — Implantations en France, Allemagne, Italie, et plus de 20 pays couverts.</li>
          <li><strong className="text-[#004469] dark:text-white">Synergie groupe</strong> — OMNITECH bénéficie de l&apos;expertise mécanique et électronique du groupe pour ses solutions intégrées.</li>
        </ul>
      </InfoDialog>

      <InfoDialog open={openDialog === 'access'} onClose={() => setOpenDialog(null)} title="Contrôle d'accès">
        <p>
          OMNITECH Security conçoit et déploie des systèmes de <strong>contrôle d&apos;accès</strong> sur mesure pour les sites sensibles :
          badges, biométrie, lecteurs RFID, interphones IP et gestion centralisée des droits.
        </p>
        <ul className="space-y-2 text-xs text-[#837274] dark:text-slate-400">
          <li><strong className="text-[#004469] dark:text-white">Authentification multi-facteurs</strong> — Badge + code PIN, badge + biométrie, ou combinaison personnalisée selon le niveau de sûreté requis.</li>
          <li><strong className="text-[#004469] dark:text-white">Gestion centralisée</strong> — Administration des droits, plages horaires, zones et anti-passback depuis le SEAL System.</li>
          <li><strong className="text-[#004469] dark:text-white">Intégration AD / LDAP</strong> — Synchronisation avec l&apos;annuaire Active Directory pour une gestion unifiée des identités.</li>
          <li><strong className="text-[#004469] dark:text-white">Traçabilité complète</strong> — Journal horodaté de tous les passages, exportable pour audits ISO 27001 (A.7 — Sécurité physique).</li>
        </ul>
      </InfoDialog>

      <InfoDialog open={openDialog === 'video'} onClose={() => setOpenDialog(null)} title="Vidéosurveillance">
        <p>
          Les solutions de <strong>vidéosurveillance avancée</strong> d&apos;OMNITECH Security couvrent l&apos;ensemble du spectre :
          caméras IP haute définition, analyse vidéo intelligente, stockage sécurisé et supervision à distance.
        </p>
        <ul className="space-y-2 text-xs text-[#837274] dark:text-slate-400">
          <li><strong className="text-[#004469] dark:text-white">Analyse vidéo IA</strong> — Détection de comportements anormaux, comptage de personnes, reconnaissance de plaques d&apos;immatriculation (LPR).</li>
          <li><strong className="text-[#004469] dark:text-white">Stockage sécurisé</strong> — Enregistrement chiffré conforme RGPD avec rétention paramétrable (30 jours par défaut).</li>
          <li><strong className="text-[#004469] dark:text-white">Levée de doute vidéo</strong> — Vérification visuelle en temps réel lors du déclenchement d&apos;alarmes, réduisant les interventions inutiles.</li>
          <li><strong className="text-[#004469] dark:text-white">Multi-sites</strong> — Supervision de dizaines de sites depuis un poste centralisé via le SEAL System.</li>
        </ul>
      </InfoDialog>

      <InfoDialog open={openDialog === 'hyper'} onClose={() => setOpenDialog(null)} title="Hypervision">
        <p>
          L&apos;<strong>hypervision</strong> est le coeur de métier d&apos;OMNITECH Security. Via le SEAL System,
          elle fédère l&apos;ensemble des sous-systèmes de sécurité (accès, vidéo, intrusion, incendie, GTB)
          dans une plateforme unique de pilotage en temps réel.
        </p>
        <ul className="space-y-2 text-xs text-[#837274] dark:text-slate-400">
          <li><strong className="text-[#004469] dark:text-white">Vue unifiée</strong> — Tableau de bord unique corrélant les événements de tous les systèmes, avec niveaux de priorité et workflows d&apos;escalade.</li>
          <li><strong className="text-[#004469] dark:text-white">Scénarios de crise</strong> — Plans de réponse automatisés (confinement, évacuation, alerte RSSI) déclenchés sur événement ou manuellement.</li>
          <li><strong className="text-[#004469] dark:text-white">Reporting et conformité</strong> — Rapports d&apos;activité, statistiques de temps de réponse et indicateurs ISO 27001 exportables.</li>
          <li><strong className="text-[#004469] dark:text-white">API ouverte</strong> — Intégration avec SIEM (Wazuh), supervision IT (Centreon) et outils métiers via API REST sécurisée.</li>
        </ul>
      </InfoDialog>

      {/* FOOTER */}
      <footer className="bg-[#004469] dark:bg-slate-900 text-white/60 py-12 pb-20 sm:pb-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <OmnitechLogo size="sm" variant="full" className="text-white mb-3" />
              <p className="text-xs leading-relaxed">Affiliée au groupe SFPI, fondée en 2005 par Alexandre VIGIER. Spécialisée dans le contrôle d&apos;accès, la vidéosurveillance avancée et l&apos;hypervision SEAL System pour les sites à risques.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Liens rapides</h4>
              <div className="space-y-2 text-xs">
                <Link href="/login" className="block hover:text-[#F68D2E] transition">Connexion</Link>
                <a href="#documents-publics" className="block hover:text-[#F68D2E] transition">Documents publics</a>
                <a href="#actualites" className="block hover:text-[#F68D2E] transition">Actualités</a>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Conformité</h4>
              <div className="space-y-2 text-xs">
                <p>ISO 27001:2022</p>
                <p>Directive NIS2</p>
                <p>Référentiels ANSSI</p>
                <p>RGPD</p>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Contact</h4>
              <div className="space-y-2 text-xs">
                <p>Support IT : tickets via l&apos;intranet</p>
                <p>RSSI : jmorin@omnitech-security.fr</p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-6 text-center text-xs space-y-1">
            <p>&copy; {new Date().getFullYear()} OMNITECH Security — Tous droits réservés</p>
            <p>Affiliée au groupe SFPI</p>
            <Link href="/login" className="inline-block mt-2 text-[#F68D2E] hover:text-[#F68D2E]/80 transition-colors">
              Connexion collaborateur
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
