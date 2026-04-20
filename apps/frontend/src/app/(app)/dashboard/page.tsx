'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useEventSubscription } from '@/lib/events';
import { useAISuggestions } from '@/lib/ai-ux';
import { AISuggestionBar } from '@/components/ai/ai-suggestion-bar';
import { useAIOrchestrator } from '@/lib/ai-orchestrator';
import { useUIVisibility } from '@/lib/ui-os/execution';
import { AIControlToggle } from '@/components/ai/ai-control-toggle';
import { AIExplainabilityHints } from '@/components/ai/ai-explainability-hints';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { Card, CardContent, CardHeader, StatusBadge, Skeleton, Badge, Button } from '@omnitech/ui';
import { SkeletonGrid } from '@/components/ui/skeleton-grid';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { ClockWidget } from '@/components/widgets/clock-widget';
import { LuccaWidget } from '@/components/widgets/lucca-widget';
import { WeatherWidget } from '@/components/widgets/weather-widget';
import { QuickLinks } from '@/components/widgets/quick-links';
// QuoteWidget + MorningBriefingWidget removed — zero decision value, data unified in Mes tâches
import {
  DashboardFaceSelector,
  loadDashboardFace,
  saveDashboardFace,
  type DashboardFaceId,
  type DashboardFaceDef,
} from '@/components/widgets/dashboard-face-selector';
import { RSSFeedWidget } from '@/components/widgets/rss-feed-widget';
import { RecentPagesWidget } from '@/components/widgets/recent-pages-widget';
import { MyNotificationsWidget } from '@/components/widgets/my-notifications-widget';
import dynamic from 'next/dynamic';

// Admin/manager-only widgets — lazy-loaded to reduce initial dashboard chunk
const SystemHealthCompact = dynamic(() => import('@/components/widgets/system-health-compact').then(m => m.SystemHealthCompact), { ssr: false });
const LdapPendingWidget = dynamic(() => import('@/components/widgets/ldap-pending-widget').then(m => m.LdapPendingWidget), { ssr: false });
const UXCommandCenter = dynamic(() => import('@/components/ux/ux-command-center').then(m => m.UXCommandCenter), { ssr: false });
const DocsDueReviewWidget = dynamic(() => import('@/components/widgets/docs-due-review-widget').then(m => m.DocsDueReviewWidget), { ssr: false });
// SmsiIndicatorsWidget removed — data duplicated by Vue d'ensemble cards
// GedDashboardWidget removed — data was redundant with stat cards and Mes tâches
const RssiDashboardSummary = dynamic(() => import('@/components/widgets/rssi-dashboard-summary').then(m => m.RssiDashboardSummary), { ssr: false });
// TipOfTheDay import removed — daily tip already in top bar
import {
  FileText, CheckCircle2, AlertTriangle, Eye, UserCheck, ArrowRight,
  PenLine, ShieldCheck, Ticket, Rss, Clock, Settings, Activity, ClipboardList,
  UserCircle, FolderSearch, ShieldAlert, Newspaper, X, Sparkles, BookOpen, Bell,
  Star, Brain, MessageSquare, ScrollText, Lightbulb, Trophy, RefreshCw,
  Workflow, UserPlus, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { getBookmarks, type BookmarkItem } from '@/components/bookmark-button';
import { features } from '@/lib/features';

/* ─────── Daily security tips (extracted to avoid re-creation on render) ─────── */
const DAILY_TIPS = [
  'Vérifiez l\'expéditeur réel d\'un e-mail en survolant son nom : un domaine inconnu est suspect.',
  'Un e-mail urgent exigeant une action immédiate est souvent un signe de tentative de phishing.',
  'Ne cliquez jamais sur un lien raccourci reçu par e-mail sans l\'avoir prévisualisé au préalable.',
  'Les pièces jointes inattendues (.zip, .xls, .html) doivent être signalées au support IT avant ouverture.',
  'Une demande de virement par e-mail hors process habituel impose une vérification téléphonique directe.',
  'Un mot de passe fort comporte au moins 14 caractères mêlant majuscules, chiffres et symboles.',
  'Activez l\'authentification à deux facteurs sur tous vos comptes professionnels et personnels.',
  'Ne réutilisez jamais le même mot de passe sur plusieurs services. Utilisez un gestionnaire.',
  'Changez immédiatement un mot de passe si vous suspectez qu\'il a été compromis.',
  'Préférez les phrases secrètes longues aux mots de passe complexes difficiles à mémoriser.',
  'Ne stockez aucune donnée personnelle sensible sur des clés USB non chiffrées.',
  'Les données RH et client sont classées Confidentiel : ne les diffusez pas hors des canaux autorisés.',
  'Pensez à verrouiller votre session (Windows + L) dès que vous quittez votre poste.',
  'Vérifiez les permissions des applications mobiles avant de leur accorder l\'accès à vos contacts ou photos.',
  'Connectez-vous toujours au VPN OMNITECH avant d\'accéder aux ressources internes en télétravail.',
  'Évitez les Wi-Fi publics non chiffrés pour toute activité professionnelle, même avec VPN.',
  'Gardez votre système d\'exploitation et votre navigateur à jour en télétravail comme au bureau.',
  'Chiffrez votre smartphone et activez son verrouillage biométrique ou par code à 6 chiffres minimum.',
  'Ne connectez jamais un appareil personnel non approuvé au réseau interne OMNITECH.',
  'En déplacement, utilisez un filtre de confidentialité pour éviter la lecture d\'écran dans les transports.',
  'Suivez la règle 3-2-1 : 3 copies, 2 supports différents, 1 copie hors site.',
  'Testez régulièrement la restauration de vos sauvegardes : une sauvegarde non testée n\'en est pas une.',
  'Les documents critiques doivent être stockés sur les serveurs OMNITECH, pas sur le disque local.',
  'Ne publiez jamais de photo de votre badge ou de votre poste de travail sur les réseaux sociaux.',
  'Évitez de divulguer publiquement votre position exacte ou vos déplacements professionnels.',
  'Vérifiez les paramètres de confidentialité de vos comptes LinkedIn et Facebook au moins une fois par an.',
  'Toute donnée personnelle collectée doit avoir une finalité claire et une durée de conservation définie.',
  'La documentation ISO 27001 est accessible dans la base documentaire de l\'intranet.',
  'Signalez toute violation de données personnelles au DPO dans les meilleurs délais (72h max RGPD).',
  'En cas d\'incident de sécurité, contactez immédiatement le RSSI Julien MORIN via un ticket prioritaire.',
  'Ne tentez jamais de résoudre seul un incident cyber : la remontée immédiate limite la propagation.',
  'Signalez tout comportement anormal de votre poste (lenteur, pop-ups, fichiers inconnus) au support IT.',
  'Rangez votre bureau en fin de journée : aucun document sensible ne doit rester visible (clean desk).',
  'Vérifiez l\'identité de tout visiteur inconnu dans les locaux et accompagnez-le jusqu\'à son interlocuteur.',
  'Supprimez les documents imprimés oubliés sur l\'imprimante partagée et utilisez l\'impression sécurisée.',
  'Avant de transférer un fichier par e-mail, vérifiez sa classification : Confidentiel exige un canal chiffré.',
  'Mettez à jour vos logiciels dès qu\'une notification apparaît : les correctifs corrigent des failles connues.',
  'Ne branchez jamais une clé USB trouvée dans les locaux : signalez-la au support IT sans l\'ouvrir.',
  'Méfiez-vous des QR codes non sollicités collés sur du matériel ou reçus par e-mail (quishing).',
  'Après un incident, participez au retour d\'expérience (REX) pour améliorer les procédures collectives.',
  'En télétravail, verrouillez votre poste même chez vous si d\'autres personnes partagent votre espace.',
] as const;

interface ActionDetail { id: string; title: string; href: string }
interface ActionItem {
  label: string; count: number; href: string; color: string; bgColor: string; icon: React.ElementType; urgent?: boolean;
  details?: ActionDetail[];
}

interface DashboardStats {
  totalDocuments: number; approvedDocuments: number; pendingReview: number;
  pendingApproval: number; overdueRevision: number; pendingSignatures: number;
}
interface ComplianceSummary { total: number; covered: number; coveragePercent: number }
interface RecentDocument { id: string; title: string; reference: string; status: string; updatedAt: string; owner: { firstName: string; lastName: string } }
interface PinnedNews { id: string; title: string; slug: string; excerpt: string; publishedAt: string; author: { firstName: string; lastName: string } }
interface TicketStats { open: number; inProgress: number }
interface VeilleStats { total: number; unprocessed: number }
interface UxInsight { type: 'tip' | 'warning' | 'suggestion' | 'achievement'; title: string; description: string; action?: string; priority: number }
interface UxInsightsData { insights: UxInsight[]; score: number; greeting?: string }

function useActionsRequises() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Promise.allSettled([
      api.get('/documents/pending').then(r => r.data),
      api.get('/tickets', { params: { assigneeId: 'me', status: 'OPEN,IN_PROGRESS' } }).then(r => r.data),
      api.get('/alerts', { params: { unread: true, severity: 'P1' } }).then(r => r.data),
      api.get('/chartes/unsigned').then(r => r.data),
    ]).then(([docsR, ticketsR, alertsR, chartesR]) => {
      const items: ActionItem[] = [];
      if (docsR.status === 'fulfilled') {
        const docs = Array.isArray(docsR.value) ? docsR.value : (docsR.value?.data || []);
        const toApprove = docs.filter((d: any) => d.status === 'REVIEW_APPROVED' || d.status === 'PENDING_APPROVAL');
        const toReview = docs.filter((d: any) => d.status === 'IN_REVIEW');
        if (toApprove.length > 0) items.push({
          label: 'documents à approuver', count: toApprove.length, href: '/documents?status=PENDING_APPROVAL', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30', icon: UserCheck, urgent: true,
          details: toApprove.slice(0, 3).map((d: any) => ({ id: d.id, title: d.title || d.reference || 'Document', href: `/documents/${d.id}` })),
        });
        if (toReview.length > 0) items.push({
          label: 'documents à revoir', count: toReview.length, href: '/documents/pending', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30', icon: Eye,
          details: toReview.slice(0, 3).map((d: any) => ({ id: d.id, title: d.title || d.reference || 'Document', href: `/documents/${d.id}` })),
        });
      }
      if (ticketsR.status === 'fulfilled') {
        const tickets = Array.isArray(ticketsR.value) ? ticketsR.value : (ticketsR.value?.data || []);
        if (tickets.length > 0) items.push({
          label: 'tickets assignés', count: tickets.length, href: '/tickets?assigneeId=me', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30', icon: Ticket,
          details: tickets.slice(0, 3).map((t: any) => ({ id: t.id, title: `${t.reference || ''} ${t.title || ''}`.trim(), href: `/tickets/${t.id}` })),
        });
      }
      if (alertsR.status === 'fulfilled') {
        const alerts = Array.isArray(alertsR.value) ? alertsR.value : (alertsR.value?.data || []);
        if (alerts.length > 0) items.push({ label: 'alertes P1', count: alerts.length, href: '/alerts?severity=P1', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30', icon: ShieldAlert, urgent: true });
      }
      if (chartesR.status === 'fulfilled') {
        const chartes = Array.isArray(chartesR.value) ? chartesR.value : (chartesR.value?.data || []);
        if (chartes.length > 0) items.push({
          label: 'chartes à signer', count: chartes.length, href: '/admin/chartes', color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30', icon: ScrollText,
          details: chartes.slice(0, 3).map((c: any) => ({ id: c.id, title: c.title || c.name || 'Charte', href: '/admin/chartes' })),
        });
      }
      setActions(items);
      setLoaded(true);
    });
  }, []);
  return { actions, loaded };
}

// ActionsRequises pills removed — all action items are now unified in "Mes tâches" block

function PrestataireDashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/external-access/dashboard')
      .then(({ data }) => setData(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 bg-gray-100 dark:bg-slate-800 rounded-card" />;
  if (error || !data) return (
    <div className="p-6">
      <Card><CardContent className="py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-taupe dark:text-slate-400">{t('dashboard.contractorLoadError')}</p>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-navy dark:text-white">Espace Prestataire — Tableau de bord</h1>
        {data?.access && (
          <p className="text-sm text-taupe dark:text-slate-400 mt-1">
            {data.access.companyName} — Contrat {data.access.contractRef}
          </p>
        )}
      </div>

      {data?.access?.accessExpiresAt && (
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-navy dark:text-white">Accès limité</p>
              <p className="text-xs text-taupe dark:text-slate-400">Expire le {formatDate(data.access.accessExpiresAt)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="py-3 flex items-center gap-3">
          <Ticket className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-taupe dark:text-slate-400">Mes tickets</p>
            <p className="text-2xl font-medium text-navy dark:text-white">{data?.tickets?.length || 0}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="py-3 flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-taupe dark:text-slate-400">Documents contractuels</p>
            <p className="text-2xl font-medium text-navy dark:text-white">{data?.documents?.length || 0}</p>
          </div>
        </CardContent></Card>
      </div>

      {/* Tickets */}
      <div>
        <h2 className="text-sm font-semibold text-navy dark:text-white mb-3">Mes tickets</h2>
        {data?.tickets?.length > 0 ? (
          <div className="space-y-2">
            {data.tickets.map((ticket: any) => (
              <Card key={ticket.id}>
                <CardContent className="py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-navy dark:text-white">{ticket.reference} — {ticket.title}</span>
                    <div className="flex gap-2 mt-1">
                      <Badge variant={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'approved' : 'warning'}>{ticket.status}</Badge>
                      <Badge variant="navy">{ticket.priority}</Badge>
                    </div>
                  </div>
                  <span className="text-[10px] text-taupe dark:text-slate-500">{formatDate(ticket.createdAt)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card><CardContent className="py-6 text-center">
            <Ticket className="h-8 w-8 text-taupe/30 mx-auto mb-2" />
            <p className="text-sm text-taupe dark:text-slate-400">Aucun ticket pour le moment</p>
            <p className="text-xs text-taupe/70 dark:text-slate-500 mt-1">Vos demandes de support apparaîtront ici</p>
          </CardContent></Card>
        )}
      </div>

      {/* Documents */}
      <div>
        <h2 className="text-sm font-semibold text-navy dark:text-white mb-3">Documents contractuels</h2>
        {data?.documents?.length > 0 ? (
          <div className="space-y-2">
            {data.documents.map((doc: any) => (
              <Card key={doc.id}>
                <CardContent className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-navy dark:text-white">{doc.title}</span>
                    <Badge variant="navy">{doc.reference}</Badge>
                  </div>
                  <Badge variant={doc.status === 'APPROVED' ? 'approved' : 'warning'}>{doc.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card><CardContent className="py-6 text-center">
            <FileText className="h-8 w-8 text-taupe/30 mx-auto mb-2" />
            <p className="text-sm text-taupe dark:text-slate-400">Aucun document contractuel</p>
            <p className="text-xs text-taupe/70 dark:text-slate-500 mt-1">Les documents liés à votre contrat apparaîtront ici</p>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

interface WidgetPrefs {
  showStats: boolean;
  showNews: boolean;
  showClock: boolean;
  showWeather: boolean;
  showQuickLinks: boolean;
  showQuote: boolean;
  showRss: boolean;
  showActivity: boolean;
  showHealthIT: boolean;
}

const defaultPrefs: WidgetPrefs = {
  showStats: true, showNews: true, showClock: true, showWeather: true,
  showQuickLinks: true, showQuote: true, showRss: true, showActivity: true,
  showHealthIT: true,
};

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const { t } = useTranslation();
  const aiSuggestions = useAISuggestions('dashboard');
  const orchestration = useAIOrchestrator('DASHBOARD');
  const uiVisibility = useUIVisibility();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [pinnedNews, setPinnedNews] = useState<PinnedNews[]>([]);
  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null);
  const [veilleStats, setVeilleStats] = useState<VeilleStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<Array<{id: string; action: string; resourceType: string; createdAt: string}>>([]);
  // healthData state removed — SystemHealthCompact manages its own poll
  // docStats and ticketAnalytics removed — redundant with statCards + Vue d'ensemble
  const [activeSurvey, setActiveSurvey] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [userActivity, setUserActivity] = useState<Array<{id: string; action: string; resourceType: string; resourceId?: string; createdAt: string}>>([]);
  const [myTasks, setMyTasks] = useState<{ pendingSignatures: number; docsToReview: number; unreadNotifications: number; unsignedChartes: number } | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [uxInsights, setUxInsights] = useState<UxInsightsData | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<{ documents: any[]; wiki: any[]; actions: string[] } | null>(null);
  // previousStats removed — backend getDashboardStats() does not support period param yet
  const [weeklyActivityCounts, setWeeklyActivityCounts] = useState<number[]>([]);
  const { actions: requiredActions, loaded: actionsLoaded } = useActionsRequises();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('welcome_dismissed');
  });

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('dashboard_onboarding_dismissed');
  });

  const [prefs, setPrefs] = useState<WidgetPrefs>(() => {
    if (typeof window === 'undefined') return defaultPrefs;
    try {
      const saved = localStorage.getItem('dashboard_prefs');
      return saved ? { ...defaultPrefs, ...JSON.parse(saved) } : defaultPrefs;
    } catch { return defaultPrefs; }
  });
  const [showSettings, setShowSettings] = useState(false);

  const [faceId, setFaceId] = useState<DashboardFaceId>(() => loadDashboardFace());
  const applyFace = useCallback((face: DashboardFaceDef) => {
    setFaceId(face.id);
    saveDashboardFace(face.id);
    setPrefs(face.prefs);
    localStorage.setItem('dashboard_prefs', JSON.stringify(face.prefs));
  }, []);

  const toggleWidget = useCallback((key: keyof WidgetPrefs) => {
    setPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem('dashboard_prefs', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isManager = user && isRoleAtLeast(user.role, UserRole.REVIEWER);
  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  // Système de tabs : "me" (Mon espace) ou "rssi" (Vue RSSI)
  // Les tabs ne s'affichent que pour ADMIN / SUPER_ADMIN. Les autres rôles
  // ne voient qu'un onglet implicite "Mon espace".
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawView = searchParams?.get('view');
  const activeView: 'me' | 'rssi' = useMemo(() => {
    if (isAdmin && rawView === 'rssi') return 'rssi';
    return 'me';
  }, [isAdmin, rawView]);

  const switchView = useCallback(
    (view: 'me' | 'rssi') => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (view === 'me') params.delete('view');
      else params.set('view', view);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const loadDashboard = useCallback(async (silent = false) => {
    // Prestataires have their own dashboard component — skip main data loading
    if (user?.role === UserRole.PRESTATAIRE) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      // Fast-path: aggregated dashboard endpoint populates main state in one call
      let aggregatedOk = false;
      try {
        const initR = await api.get('/dashboard');
        if (initR.data) {
          aggregatedOk = true;
          if (initR.data.stats) setStats(initR.data.stats as DashboardStats);
          if (initR.data.recentDocuments) setRecentDocs(initR.data.recentDocuments as RecentDocument[]);
          if (initR.data.pinnedNews) setPinnedNews(initR.data.pinnedNews as PinnedNews[]);
          if (initR.data.ticketStats) setTicketStats(initR.data.ticketStats);
        }
      } catch {
        // Aggregated endpoint unavailable — fall back to individual calls below
      }

      if (!aggregatedOk) {
        const [statsR, docsR, newsR] = await Promise.all([
          api.get('/reports/dashboard-stats').catch(() => ({ data: null })),
          api.get('/documents', { params: { limit: 5, sortBy: 'updatedAt', sortOrder: 'desc' } }).catch(() => ({ data: { data: [] } })),
          api.get('/news', { params: { limit: 4 } }).catch(() => ({ data: { data: [] } })),
        ] as const);
        if (statsR.data) setStats(statsR.data as DashboardStats);
        setRecentDocs(((docsR.data as { data?: RecentDocument[] })?.data) || []);
        setPinnedNews(((newsR.data as { data?: PinnedNews[] })?.data) || []);
      }

      // Previous period stats removed — backend getDashboardStats() does not support
      // the period param (returns same data), so trend indicators are not meaningful.
      // TODO: implement backend period support to enable real trend comparison.

      // Additional data for managers
      if (isManager) {
        api.get('/iso-analyzer/compliance-summary').then(r => setCompliance(r.data)).catch(err => console.error('Failed to load compliance summary:', err));
      }
      if (isAdmin) {
        if (!aggregatedOk) api.get('/tickets/stats').then(r => setTicketStats(r.data)).catch(() => {});
        api.get('/veille/stats').then(r => setVeilleStats(r.data)).catch(() => {});
        // /health fetch removed — SystemHealthCompact widget polls independently every 30s
        // docStats and ticketAnalytics removed — data already covered by statCards + Compliance/Tickets/Veille row
      }
      // Fetch active satisfaction surveys for all users
      api.get('/satisfaction/surveys').then(({ data }) => {
        const surveys = Array.isArray(data) ? data : (data?.data || []);
        const active = surveys.find((s: any) => s.isActive || (s.expiresAt && new Date(s.expiresAt) > new Date()));
        if (active) setActiveSurvey({ id: active.id, title: active.title, description: active.description });
      }).catch(console.error);

      // Activity feed — own activity for all users, full audit for admins
      api.get('/audit/my-activity', { params: { limit: 50 } })
        .then(r => {
          const items = r.data?.data || [];
          setUserActivity(items);
          // Compute weekly activity bar chart (last 7 days)
          const now = Date.now();
          const counts = Array.from({ length: 7 }, (_, dayIdx) => {
            const dayStart = now - (6 - dayIdx) * 86400000;
            const dayEnd = dayStart + 86400000;
            return items.filter((a: { createdAt: string }) => {
              const t = new Date(a.createdAt).getTime();
              return t >= dayStart && t < dayEnd;
            }).length;
          });
          setWeeklyActivityCounts(counts);
        })
        .catch(() => {});
      if (isAdmin) {
        api.get('/audit', { params: { limit: 5 } })
          .then(r => setRecentActivity(r.data?.data || []))
          .catch(() => {});
      }

      // Mes taches + AI suggestions: single fetch from ai/recommendations
      if (features.ai) api.get('/ai/recommendations').then(({ data }) => {
        setAiRecommendations(data ?? null);
        setMyTasks({
          pendingSignatures: data?.pendingSignatures ?? 0,
          docsToReview: data?.docsToReview ?? 0,
          unreadNotifications: data?.unreadNotifications ?? 0,
          unsignedChartes: data?.unsignedChartes ?? 0,
        });
      }).catch(() => {});

      // Load bookmarks from localStorage
      setBookmarks(getBookmarks());

      // Smart UX insights (guarded)
      if (features.ai) {
        api.get('/ai/ux-insights')
          .then(({ data }) => setUxInsights(data))
          .catch(() => {});
      }
    } catch (err) { console.error('Dashboard load error:', err); setError(true); }
    finally { setLoading(false); setLastLoadedAt(new Date()); }
  }, [isManager, isAdmin, user?.role]);

  // Initial data load
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto-refresh every 5 minutes with a subtle toast notification
  useEffect(() => {
    if (user?.role === UserRole.PRESTATAIRE) return;
    const interval = setInterval(async () => {
      setIsRefreshing(true);
      const toastId = toast.loading('Actualisation...');
      try {
        await loadDashboard(true);
        toast.dismiss(toastId);
      } finally {
        setIsRefreshing(false);
      }
    }, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [loadDashboard, user?.role]);

  // Lightweight task counts poll every 60s (separate from full dashboard refresh)
  useEffect(() => {
    if (!features.ai || user?.role === UserRole.PRESTATAIRE) return;
    const taskPoll = setInterval(() => {
      api.get('/ai/recommendations').then(({ data }) => {
        setAiRecommendations(data ?? null);
        setMyTasks({
          pendingSignatures: data?.pendingSignatures ?? 0,
          docsToReview: data?.docsToReview ?? 0,
          unreadNotifications: data?.unreadNotifications ?? 0,
          unsignedChartes: data?.unsignedChartes ?? 0,
        });
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(taskPoll);
  }, [user?.role]);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const toastId = toast.loading('Actualisation...');
    try {
      await loadDashboard(true);
      toast.dismiss(toastId);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadDashboard, isRefreshing]);

  // Event bus: refresh dashboard KPIs when mutations happen in any module
  useEventSubscription('*', (event) => {
    if (event.metadata?.optimistic) return; // skip optimistic, wait for confirmed
    if (['CREATED', 'STATUS_CHANGED', 'APPROVED', 'REJECTED', 'DELETED'].includes(event.type)) {
      // Targeted refresh: only reload stats + actions, not the full dashboard
      api.get('/reports/dashboard-stats').then(r => { if (r.data) setStats(r.data as DashboardStats); }).catch(() => {});
    }
  });

  // Listen for bookmark changes
  useEffect(() => {
    const syncBookmarks = () => setBookmarks(getBookmarks());
    window.addEventListener('bookmarks-changed', syncBookmarks);
    return () => window.removeEventListener('bookmarks-changed', syncBookmarks);
  }, []);

  // PRESTATAIRE: restricted dashboard (ISO 27001 A.5.19)
  if (user?.role === UserRole.PRESTATAIRE) {
    return <PrestataireDashboard />;
  }

  if (error && !loading) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-taupe dark:text-slate-400">{t('dashboard.loadError')}</p>
          <Button className="mt-4" onClick={() => { setError(false); window.location.reload(); }}>{t('action.retry')}</Button>
        </CardContent></Card>
      </div>
    );
  }

  const computeTrend = useCallback((current: number | undefined, previous: number | undefined): { direction: 'up' | 'down' | 'flat'; delta: number } => {
    if (current === undefined || previous === undefined || previous === 0) return { direction: 'flat', delta: 0 };
    const delta = current - previous;
    if (delta > 0) return { direction: 'up', delta };
    if (delta < 0) return { direction: 'down', delta: Math.abs(delta) };
    return { direction: 'flat', delta: 0 };
  }, []);

  const statCards = useMemo(() => [
    {
      label: t('dashboard.stats.documents'), value: stats?.totalDocuments ?? '-', icon: FileText,
      color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent', href: '/documents',
      trend: computeTrend(stats?.totalDocuments, undefined),
      subtext: stats ? `${stats.approvedDocuments} approuvé${stats.approvedDocuments !== 1 ? 's' : ''} · ${stats.pendingReview} en revue` : undefined,
    },
    {
      label: t('dashboard.stats.approved'), value: stats?.approvedDocuments ?? '-', icon: CheckCircle2,
      color: 'text-emerald-600', bg: 'bg-emerald-50', gradient: 'from-emerald-50 to-transparent', href: '/documents?status=APPROVED',
      trend: computeTrend(stats?.approvedDocuments, undefined),
      subtext: stats?.totalDocuments ? `${Math.round(((stats.approvedDocuments ?? 0) / stats.totalDocuments) * 100)}% du total` : undefined,
    },
    {
      label: t('dashboard.stats.inReview'), value: stats?.pendingReview ?? '-', icon: Eye,
      color: 'text-blue-600', bg: 'bg-blue-50', gradient: 'from-blue-50 to-transparent', href: '/documents?status=IN_REVIEW', show: isManager,
      trend: computeTrend(stats?.pendingReview, undefined),
      subtext: stats?.pendingApproval ? `${stats.pendingApproval} en attente d'approbation` : undefined,
    },
    {
      label: t('dashboard.stats.pending'), value: stats?.pendingApproval ?? '-', icon: UserCheck,
      color: 'text-amber-600', bg: 'bg-amber-50', gradient: 'from-amber-50 to-transparent', href: '/documents?status=PENDING_APPROVAL', show: isManager,
      trend: computeTrend(stats?.pendingApproval, undefined),
      subtext: stats?.overdueRevision ? `${stats.overdueRevision} revue${stats.overdueRevision !== 1 ? 's' : ''} en retard` : undefined,
    },
    {
      label: t('dashboard.stats.overdue'), value: stats?.overdueRevision ?? '-', icon: AlertTriangle,
      color: 'text-red-600', bg: 'bg-red-50', gradient: 'from-red-50 to-transparent', href: '/documents?status=EXPIRED', show: isManager,
      trend: computeTrend(stats?.overdueRevision, undefined),
      subtext: (stats?.overdueRevision ?? 0) > 0 ? 'Action requise' : 'Aucun retard',
    },
    {
      label: 'Signatures', value: stats?.pendingSignatures ?? '-', icon: PenLine,
      color: 'text-primary', bg: 'bg-primary/10', gradient: 'from-primary/5 to-transparent', href: '/documents?tab=signatures',
      trend: computeTrend(stats?.pendingSignatures, undefined),
      subtext: (stats?.pendingSignatures ?? 0) > 0 ? `${stats?.pendingSignatures} en attente` : 'Tout est signé',
    },
  ].filter(c => c.show !== false), [stats, t, isManager, computeTrend]);

  // Action-oriented cards for non-admin users: replace raw counters with clickable CTAs
  const actionCards = useMemo(() => {
    if (isAdmin) return []; // admins keep the classic stat view
    const cards: { label: string; cta: string; value: number | string; icon: React.ElementType; color: string; bg: string; gradient: string; href: string }[] = [];
    const reviewCount = stats?.pendingReview ?? 0;
    if (reviewCount > 0) cards.push({
      label: 'Documents à revoir', cta: `Revoir ${reviewCount} document${reviewCount > 1 ? 's' : ''}`,
      value: reviewCount, icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50', gradient: 'from-blue-50 to-transparent',
      href: '/documents?status=IN_REVIEW',
    });
    const approvalCount = stats?.pendingApproval ?? 0;
    if (approvalCount > 0) cards.push({
      label: 'En attente d\'approbation', cta: `Approuver ${approvalCount} document${approvalCount > 1 ? 's' : ''}`,
      value: approvalCount, icon: UserCheck, color: 'text-amber-600', bg: 'bg-amber-50', gradient: 'from-amber-50 to-transparent',
      href: '/documents?status=PENDING_APPROVAL',
    });
    const sigCount = stats?.pendingSignatures ?? 0;
    if (sigCount > 0) cards.push({
      label: 'Signatures en attente', cta: `Signer ${sigCount} document${sigCount > 1 ? 's' : ''}`,
      value: sigCount, icon: PenLine, color: 'text-primary', bg: 'bg-primary/10', gradient: 'from-primary/5 to-transparent',
      href: '/documents?tab=signatures',
    });
    const overdueCount = stats?.overdueRevision ?? 0;
    if (overdueCount > 0) cards.push({
      label: 'Revues en retard', cta: `${overdueCount} revue${overdueCount > 1 ? 's' : ''} en retard`,
      value: overdueCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', gradient: 'from-red-50 to-transparent',
      href: '/documents?overdue=true',
    });
    // Always show total docs as a non-urgent entry
    cards.push({
      label: 'Mes documents', cta: 'Voir tous les documents',
      value: stats?.totalDocuments ?? '-', icon: FileText, color: 'text-navy', bg: 'bg-navy/10', gradient: 'from-navy/5 to-transparent',
      href: '/documents',
    });
    return cards;
  }, [isAdmin, stats]);

  return (
    <div className="space-y-6">
      {/* Onglets adaptatifs selon le rôle — ADMIN/SUPER_ADMIN uniquement.
          Les non-admin ne voient rien ici : comportement inchangé. */}
      {isAdmin && (
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => switchView('me')}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-t-lg ${
              activeView === 'me'
                ? 'text-primary'
                : 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'
            }`}
            aria-current={activeView === 'me' ? 'page' : undefined}
          >
            Mon espace
            {activeView === 'me' && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
          <button
            type="button"
            onClick={() => switchView('rssi')}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-t-lg ${
              activeView === 'rssi'
                ? 'text-primary'
                : 'text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white'
            }`}
            aria-current={activeView === 'rssi' ? 'page' : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Vue RSSI
            </span>
            {activeView === 'rssi' && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        </div>
      )}

      {/* Tab "Vue RSSI" — rendu uniquement pour ADMIN/SUPER_ADMIN */}
      {isAdmin && activeView === 'rssi' && <RssiDashboardSummary />}

      {/* Tab "Mon espace" — contenu historique, inchangé pour tous les rôles.
          Masqué uniquement quand un admin a sélectionné la "Vue RSSI". */}
      {!(isAdmin && activeView === 'rssi') && (
      <>
      {/* Health bar removed — SystemHealthCompact widget provides the same data with its own 30s poll */}

      {/* Top bar: welcome + clock + weather */}
      {(() => {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? t('dashboard.greeting.morning') : hour < 18 ? t('dashboard.greeting.afternoon') : t('dashboard.greeting.evening');
        const timeEmoji = hour < 12 ? '\u2600\uFE0F' : hour < 18 ? '\uD83C\uDF24\uFE0F' : '\uD83C\uDF19';
        const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const tipIndex = Math.floor(Date.now() / 86400000) % DAILY_TIPS.length;
        return (
          <div className="py-3 px-1">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[26px] font-medium text-navy dark:text-white tracking-tight leading-tight">
                  <span className="text-taupe dark:text-slate-400 font-light">{greeting},</span> {user?.firstName}
                </h1>
                <AIControlToggle />
                <button onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title="Personnaliser le tableau de bord"
                  aria-label="Personnaliser le tableau de bord">
                  <Settings className="h-5 w-5 text-taupe dark:text-slate-400" />
                </button>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Actualiser le tableau de bord"
                  aria-label="Actualiser le tableau de bord"
                >
                  <RefreshCw className={`h-5 w-5 text-taupe dark:text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                {uxInsights && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    uxInsights.score > 80
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : uxInsights.score > 50
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`} title="Score de complétion du profil">
                    <ShieldCheck className="h-3 w-3" />
                    Profil {uxInsights.score}%
                  </span>
                )}
              </div>
              <p className="text-sm text-taupe dark:text-slate-400 mt-0.5 capitalize">
                {dateStr} <span className="text-taupe/60 dark:text-slate-500">— voici votre espace {timeEmoji}</span>
              </p>
              <p className="text-xs text-taupe/70 dark:text-slate-500 mt-1.5 italic max-w-md">{DAILY_TIPS[tipIndex]}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/documents/new" title="Créer un nouveau document dans la base documentaire">
                <Button variant="secondary" size="sm"><FileText className="h-4 w-4" /> {t('dashboard.newDocument')}</Button>
              </Link>
              <Link href="/tickets" title="Ouvrir un nouveau ticket au support IT">
                <Button variant="outline" size="sm"><Ticket className="h-4 w-4" /> {t('dashboard.newTicket')}</Button>
              </Link>
              <div className="hidden xl:flex items-center gap-6">
                {prefs.showClock && (
                  <>
                    <div className="h-8 w-px bg-gray-200 dark:bg-slate-700" />
                    <ClockWidget />
                  </>
                )}
                {prefs.showWeather && (
                  <>
                    <div className="h-8 w-px bg-gray-200 dark:bg-slate-700" />
                    <WeatherWidget />
                  </>
                )}
              </div>
            </div>
          </div>
          </div>
        );
      })()}

      {showSettings && (
        <div className="mb-4 space-y-3">
          <DashboardFaceSelector value={faceId} onChange={applyFace} />
        <Card>
          <CardContent className="py-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">{t('dashboard.widgetsVisible')}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries({
                showStats: t('dashboard.widget.stats'),
                showNews: t('dashboard.widget.news'),
                showClock: t('dashboard.widget.clock'),
                showWeather: t('dashboard.widget.weather'),
                showQuickLinks: t('dashboard.widget.quickLinks'),
                showQuote: t('dashboard.widget.quote'),
                showRss: t('dashboard.widget.rss'),
                showActivity: t('dashboard.widget.activity'),
                showHealthIT: t('dashboard.widget.healthIT'),
              }).map(([key, label]) => (
                <button key={key}
                  onClick={() => toggleWidget(key as keyof WidgetPrefs)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    prefs[key as keyof WidgetPrefs] ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-taupe dark:text-slate-400'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Welcome card for first-time users */}
      {(() => {
        // Show for users created in the last 48 hours
        const isNewUser = user?.createdAt
          ? (Date.now() - new Date(user.createdAt).getTime()) < 86400000 * 2
          : false;
        if (welcomeDismissed || !isNewUser || loading) return null;
        const quickActions = [
          { icon: UserCircle, label: 'Compléter mon profil', desc: 'Ajoutez votre photo et vos informations', href: '/profile', color: 'bg-primary/10 text-primary' },
          { icon: FolderSearch, label: 'Explorer les documents', desc: 'Découvrez la base documentaire', href: '/documents', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' },
          { icon: ShieldAlert, label: 'Faire le quiz sécurité', desc: 'Testez vos connaissances', href: '/quiz', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' },
          { icon: Newspaper, label: 'Voir les actualités', desc: 'Restez informé', href: '/news', color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30' },
        ];
        return (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-navy to-primary/60 p-5">
            <button
              onClick={() => { localStorage.setItem('welcome_dismissed', '1'); setWelcomeDismissed(true); }}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Fermer le bandeau de bienvenue"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-normal text-white mb-1">Bienvenue sur l&apos;intranet OMNITECH, {user?.firstName}&nbsp;!</h2>
            <p className="text-sm text-white/80 mb-4">Retrouvez ici vos documents, tickets IT, conformité ISO 27001 et outils de collaboration au quotidien.</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {quickActions.map(({ icon: Icon, label, desc, href, color }) => (
                <Link key={href} href={href}>
                  <div className="p-3 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition-all group cursor-pointer">
                    <div className={`h-9 w-9 rounded-lg ${color} flex items-center justify-center mb-2`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <p className="text-sm font-semibold text-white group-hover:text-white/90 transition-colors">{label}</p>
                    <p className="text-[11px] text-white/70 mt-0.5">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* MorningBriefing removed — same data shown by ActionsRequises pills below */}

      {/* Premiers pas — CTA guidé quand la base est vide (ADMIN+ uniquement) */}
      {isAdmin && !loading && stats?.totalDocuments === 0 && !onboardingDismissed && (
        <div className="animate-fade-in-up rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-navy dark:text-white">Premiers pas</h2>
              <p className="text-xs text-taupe dark:text-slate-400 mt-0.5">Lancez-vous : quelques actions suffisent pour mettre en place votre espace documentaire et sécurité.</p>
            </div>
            <button
              onClick={() => { localStorage.setItem('dashboard_onboarding_dismissed', '1'); setOnboardingDismissed(true); }}
              className="p-1.5 rounded-lg text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Masquer la section Premiers pas"
              title="Masquer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              { icon: FileText, label: 'Créer votre premier document', href: '/documents/new', bg: 'bg-primary/10' },
              { icon: Workflow, label: 'Configurer les workflows', href: '/admin/workflows', bg: 'bg-emerald-500/10' },
              { icon: BookOpen, label: 'Alimenter la base de connaissances', href: '/wiki', bg: 'bg-violet-500/10' },
              { icon: UserPlus, label: 'Importer les utilisateurs AD', href: '/admin/ldap-pending', bg: 'bg-amber-500/10' },
            ] as const).map(({ icon: Icon, label, href, bg }) => (
              <Link key={href} href={href}>
                <div className="p-3 rounded-xl border border-gray-100 dark:border-slate-700 hover:border-primary/30 hover:shadow-sm transition-all group cursor-pointer">
                  <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                    <Icon className="h-4.5 w-4.5 text-navy dark:text-white" />
                  </div>
                  <p className="text-xs font-medium text-navy dark:text-white group-hover:text-primary transition-colors">{label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* AI Suggestion Bar — contextual, non-intrusive */}
      <AISuggestionBar suggestions={aiSuggestions} />

      {/* AI Explainability Hints — floating bottom-right, auto-dismiss */}
      <AIExplainabilityHints />

      {/* Mes tâches — HERO POSITION: unified decision block (actions-first layout) */}
      {(() => {
        const hasMyTasks = myTasks && (myTasks.pendingSignatures > 0 || myTasks.docsToReview > 0 || myTasks.unreadNotifications > 0 || myTasks.unsignedChartes > 0);
        const ticketAction = requiredActions.find(a => a.label.includes('ticket'));
        const alertAction = requiredActions.find(a => a.label.includes('alerte'));
        const approveAction = requiredActions.find(a => a.label.includes('approuver'));
        const hasActions = hasMyTasks || ticketAction || alertAction || approveAction;

        if (!hasActions && !actionsLoaded && !myTasks) return null;

        if (!hasActions && (actionsLoaded || myTasks)) return (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-300">Tout est à jour — aucune action en attente</p>
          </div>
        );

        return (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">Mes tâches</p>
          <Card className="border-l-4 border-l-amber-400">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-navy dark:text-white">Actions requises</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Urgent: P1 alerts */}
                {alertAction && (
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 ring-1 ring-red-300 dark:ring-red-700 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                        <span className="font-medium text-navy dark:text-white">Alertes P1</span>
                        <Badge variant="error">{alertAction.count}</Badge>
                        <span className="text-[9px] font-bold text-red-600 uppercase tracking-wide animate-pulse">Urgent</span>
                      </span>
                      <Link href={alertAction.href} className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white px-2 py-1 text-[10px] font-semibold hover:bg-red-700 transition">
                        Traiter <ShieldAlert className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )}
                {/* Urgent: docs to approve */}
                {approveAction && (
                  <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <UserCheck className="h-3.5 w-3.5 text-red-600" />
                        <span className="font-medium text-navy dark:text-white">Documents à approuver</span>
                        <Badge variant="error">{approveAction.count}</Badge>
                      </span>
                      <Link href={approveAction.href} className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white px-2 py-1 text-[10px] font-semibold hover:bg-red-700 transition">
                        Approuver <UserCheck className="h-3 w-3" />
                      </Link>
                    </div>
                    {approveAction.details && approveAction.details.length > 0 && (
                      <div className="mt-1.5 pl-5 space-y-0.5">
                        {approveAction.details.map(d => (
                          <Link key={d.id} href={d.href} className="block text-[11px] text-navy/80 dark:text-slate-300 hover:text-primary truncate">
                            → {d.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Chartes to sign */}
                {myTasks && myTasks.unsignedChartes > 0 && (() => {
                  const charteAction = requiredActions.find(a => a.label.includes('charte'));
                  return (
                  <div className={`p-2 rounded-lg text-xs ${myTasks.unsignedChartes > 2 ? 'bg-red-100 dark:bg-red-900/30 ring-1 ring-red-300 dark:ring-red-700' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ScrollText className="h-3.5 w-3.5 text-red-600" />
                        <span className="font-medium text-navy dark:text-white">Chartes à signer</span>
                        <Badge variant="error">{myTasks.unsignedChartes}</Badge>
                        {myTasks.unsignedChartes > 2 && (
                          <span className="text-[9px] font-bold text-red-600 uppercase tracking-wide animate-pulse">Urgent</span>
                        )}
                      </span>
                      <Link href="/admin/chartes" className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white px-2 py-1 text-[10px] font-semibold hover:bg-red-700 transition">
                        Signer <ScrollText className="h-3 w-3" />
                      </Link>
                    </div>
                    {charteAction?.details && charteAction.details.length > 0 && (
                      <div className="mt-1.5 pl-5 space-y-0.5">
                        {charteAction.details.map(d => (
                          <span key={d.id} className="block text-[11px] text-navy/80 dark:text-slate-300 truncate">
                            → {d.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })()}
                {/* Signatures pending */}
                {myTasks && myTasks.pendingSignatures > 0 && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <PenLine className="h-3.5 w-3.5 text-amber-600" />
                        <span className="font-medium text-navy dark:text-white">Signatures en attente</span>
                        <Badge variant="warning">{myTasks.pendingSignatures}</Badge>
                      </span>
                      <Link href="/documents?tab=signatures" className="inline-flex items-center gap-1 rounded-md bg-amber-600 text-white px-2 py-1 text-[10px] font-semibold hover:bg-amber-700 transition">
                        Signer <PenLine className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )}
                {/* Tickets assigned */}
                {ticketAction && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Ticket className="h-3.5 w-3.5 text-amber-600" />
                        <span className="font-medium text-navy dark:text-white">Tickets assignés</span>
                        <Badge variant="warning">{ticketAction.count}</Badge>
                      </span>
                      <Link href={ticketAction.href} className="inline-flex items-center gap-1 rounded-md bg-amber-600 text-white px-2 py-1 text-[10px] font-semibold hover:bg-amber-700 transition">
                        Voir <Ticket className="h-3 w-3" />
                      </Link>
                    </div>
                    {ticketAction.details && ticketAction.details.length > 0 && (
                      <div className="mt-1.5 pl-5 space-y-0.5">
                        {ticketAction.details.map(d => (
                          <Link key={d.id} href={d.href} className="block text-[11px] text-navy/80 dark:text-slate-300 hover:text-primary truncate">
                            → {d.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Docs to review */}
                {myTasks && myTasks.docsToReview > 0 && (() => {
                  const reviewAction = requiredActions.find(a => a.label.includes('revoir'));
                  return (
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Eye className="h-3.5 w-3.5 text-blue-600" />
                          <span className="font-medium text-navy dark:text-white">Documents à revoir</span>
                          <Badge variant="info">{myTasks.docsToReview}</Badge>
                        </span>
                        <Link href="/documents/pending" className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2 py-1 text-[10px] font-semibold hover:bg-blue-700 transition">
                          Revoir <Eye className="h-3 w-3" />
                        </Link>
                      </div>
                      {reviewAction?.details && reviewAction.details.length > 0 && (
                        <div className="mt-1.5 pl-5 space-y-0.5">
                          {reviewAction.details.map(d => (
                            <Link key={d.id} href={d.href} className="block text-[11px] text-navy/80 dark:text-slate-300 hover:text-primary truncate">
                              → {d.title}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Unread notifications */}
                {myTasks && myTasks.unreadNotifications > 0 && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-xs">
                    <span className="flex items-center gap-2">
                      <Bell className="h-3.5 w-3.5 text-violet-600" />
                      <span className="font-medium text-navy dark:text-white">Notifications non lues</span>
                      <Badge variant="navy">{myTasks.unreadNotifications}</Badge>
                    </span>
                    <Link href="/notifications" className="inline-flex items-center gap-1 rounded-md bg-violet-600 text-white px-2 py-1 text-[10px] font-semibold hover:bg-violet-700 transition">
                      Voir <Bell className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        );
      })()}

      {/* Secondary widgets — Quick links + Productivity + Admin (demoted below actions) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {prefs.showQuickLinks && (
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 lg:col-span-2">
            <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">Accès rapide</p>
            <QuickLinks />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RecentPagesWidget />
        <MyNotificationsWidget />
        {isManager && <DocsDueReviewWidget />}
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SystemHealthCompact />
          <LdapPendingWidget />
        </div>
      )}

      {/* UX Intelligence — admin-only, event-driven friction detection */}
      {isAdmin && (
        <Card>
          <CardContent className="p-4">
            <UXCommandCenter />
          </CardContent>
        </Card>
      )}

      {/* Stats — admin: classic metric cards | non-admin: action-oriented cards */}
      {prefs.showStats && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">{isAdmin ? 'Indicateurs' : 'Actions rapides'}</p>
          <div className={`grid gap-3 ${isAdmin ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
            {loading ? (
              Array.from({ length: isAdmin ? 6 : 4 }).map((_, i) => <Card key={i}><CardContent className="py-3"><Skeleton className="h-12 w-full" /></CardContent></Card>)
            ) : isAdmin ? (
              statCards.map(c => {
                const Icon = c.icon;
                const TrendIcon = c.trend?.direction === 'up' ? TrendingUp : c.trend?.direction === 'down' ? TrendingDown : Minus;
                const trendColor = c.trend?.direction === 'up' ? 'text-emerald-500' : c.trend?.direction === 'down' ? 'text-red-500' : 'text-taupe/50';
                const cardInner = (
                  <Card hoverable={!!c.href} className={`h-full bg-gradient-to-br ${c.gradient} dark:from-transparent shadow-sm rounded-xl ${c.href ? 'cursor-pointer hover:shadow-md hover:ring-1 hover:ring-primary/20 transition-shadow' : 'cursor-default'}`}>
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`h-8 w-8 rounded-lg ${c.bg} dark:bg-opacity-20 flex items-center justify-center`}>
                          <Icon className={`h-4 w-4 ${c.color}`} />
                        </div>
                        <p className="text-[11px] text-taupe dark:text-slate-400 truncate flex-1">{c.label}</p>
                        {c.trend && c.trend.direction !== 'flat' && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${trendColor}`} title={`${c.trend.direction === 'up' ? '+' : '-'}${c.trend.delta} vs periode precedente`}>
                            <TrendIcon className="h-3 w-3" />
                            {c.trend.delta}
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{c.value}</p>
                      {c.subtext && <p className="text-[10px] text-taupe dark:text-slate-500 mt-0.5 truncate">{c.subtext}</p>}
                      {!c.subtext && c.value === 0 && <p className="text-[10px] text-taupe">Rien à signaler</p>}
                    </CardContent>
                  </Card>
                );
                return c.href ? (
                  <Link key={c.label} href={c.href} className="stagger-item">
                    {cardInner}
                  </Link>
                ) : (
                  <div key={c.label} className="stagger-item">
                    {cardInner}
                  </div>
                );
              })
            ) : (
              /* Non-admin: action-oriented cards with CTA */
              actionCards.map(c => {
                const Icon = c.icon;
                return (
                  <Link key={c.label} href={c.href} className="stagger-item group">
                    <Card hoverable className={`h-full bg-gradient-to-br ${c.gradient} dark:from-transparent shadow-sm rounded-xl cursor-pointer hover:shadow-md hover:ring-1 hover:ring-primary/20 transition-all`}>
                      <CardContent className="py-4 px-5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`h-8 w-8 rounded-lg ${c.bg} dark:bg-opacity-20 flex items-center justify-center`}>
                            <Icon className={`h-4 w-4 ${c.color}`} />
                          </div>
                          <p className="text-[11px] text-taupe dark:text-slate-400 truncate flex-1">{c.label}</p>
                        </div>
                        <p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{c.value}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <p className={`text-xs font-semibold ${c.color}`}>{c.cta}</p>
                          <ArrowRight className={`h-3.5 w-3.5 ${c.color} transition-transform group-hover:translate-x-0.5`} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Smart Insights widget */}
      {uxInsights && uxInsights.insights && uxInsights.insights.length > 0 && (
        <SmartInsightsWidget data={uxInsights} />
      )}

      {/* Last refresh + raccourcis rapides — compact row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 -mt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { href: '/tickets?create=true', icon: Ticket, label: 'Ticket', title: 'Créer un ticket rapidement', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300' },
            { href: '/signatures', icon: PenLine, label: 'Signatures', title: 'Voir les signatures en attente', color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300' },
            { href: '/helpdesk', icon: MessageSquare, label: 'Support', title: 'Contacter le support IT', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300' },
          ].map(({ href, icon: Icon, label, title, color }) => (
            <Link key={href} href={href} title={title}>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-[10px] font-semibold ${color} hover:opacity-80 transition cursor-pointer`}>
                <Icon className="h-3 w-3" />{label}
              </span>
            </Link>
          ))}
        </div>
        {lastLoadedAt && !loading && (
          <p className="text-[10px] text-taupe/70 dark:text-slate-500">
            {(() => {
              const diffMin = Math.floor((Date.now() - lastLoadedAt.getTime()) / 60000);
              return diffMin < 1 ? 'À l\'instant' : `Il y a ${diffMin} min`;
            })()}
          </p>
        )}
      </div>

      {/* Compliance + Tickets + Veille row — ADMIN FULL MODE (REVIEWER+ for compliance, ADMIN+ for tickets/veille) */}
      {isManager && (compliance || ticketStats || veilleStats) && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">Vue d&apos;ensemble</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {compliance && (
            <Link href="/admin/compliance" className="flex stagger-item">
              <Card hoverable accent className="h-full w-full">
                <CardContent className="flex items-center gap-4 h-full">
                  <div className="h-12 w-12 rounded-xl bg-navy/10 dark:bg-slate-700 flex items-center justify-center">
                    <ShieldCheck className="h-6 w-6 text-navy dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-taupe dark:text-slate-400">Conformité ISO</p>
                    <p className="text-xl font-medium text-navy dark:text-white">{compliance.coveragePercent}%</p>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-1 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${compliance.coveragePercent}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {ticketStats && (
            <Link href="/tickets" className="flex stagger-item">
              <Card hoverable className="h-full w-full">
                <CardContent className="flex items-center gap-4 h-full">
                  <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Ticket className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-taupe dark:text-slate-400">Tickets IT</p>
                    <p className="text-xl font-medium text-navy dark:text-white">{ticketStats.open + ticketStats.inProgress}</p>
                    <p className="text-[10px] text-taupe dark:text-slate-500">{ticketStats.open} ouverts, {ticketStats.inProgress} en cours</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {veilleStats && (
            <Link href="/veille" className="flex stagger-item">
              <Card hoverable className="h-full w-full">
                <CardContent className="flex items-center gap-4 h-full">
                  <div className="h-12 w-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <Rss className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-taupe dark:text-slate-400">Veille cyber</p>
                    <p className="text-xl font-medium text-navy dark:text-white">{veilleStats.unprocessed}</p>
                    <p className="text-[10px] text-taupe dark:text-slate-500">alertes à traiter sur {veilleStats.total}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          </div>
        </div>
      )}

      {/* Main grid: docs + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-navy dark:text-white">{t('dashboard.recentDocs')}</h2>
                <Link href="/documents" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  {t('common.viewAll')} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4">
                  <SkeletonGrid count={4} columns={1} />
                </div>
              ) : recentDocs.length === 0 ? (
                <div className="py-12 text-center">
                  <FileText className="h-10 w-10 text-taupe/30 mx-auto mb-2" />
                  <p className="text-sm text-taupe dark:text-slate-400">{t('common.noResults')}</p>
                  <Link href="/documents/new" className="text-xs text-primary hover:underline mt-1 inline-block">Créer un document</Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {recentDocs.map(doc => (
                    <Link key={doc.id} href={`/documents/${doc.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                      <div className="h-8 w-8 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                        <FileText className="h-4 w-4 text-taupe dark:text-slate-400 group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy dark:text-white truncate">{doc.title}</p>
                        <p className="text-[11px] text-taupe dark:text-slate-400 mt-0.5">{doc.reference} — {doc.owner.firstName} {doc.owner.lastName}</p>
                      </div>
                      <StatusBadge status={doc.status as 'DRAFT' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'OBSOLETE' | 'ARCHIVED'} />
                      <span className="text-[11px] text-taupe dark:text-slate-500 hidden sm:block whitespace-nowrap">{formatRelativeTime(doc.updatedAt)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {/* News — now in left column (3 items max) */}
          {prefs.showNews && pinnedNews.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-navy dark:text-white">{t('dashboard.news')}</h2>
                  <Link href="/news" className="text-sm text-primary hover:underline">{t('common.viewAll')}</Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {pinnedNews.slice(0, 3).map(n => (
                    <Link key={n.id} href={`/news/${n.slug}`} className="block px-6 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                      <p className="text-sm font-medium text-navy dark:text-white line-clamp-1">{n.title}</p>
                      {n.excerpt && <p className="text-xs text-taupe dark:text-slate-400 line-clamp-2 mt-0.5">{n.excerpt}</p>}
                      <p className="text-[10px] text-taupe/60 dark:text-slate-500 mt-1">{n.author.firstName} {n.author.lastName} — {formatDate(n.publishedAt)}</p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column (1/3): GED + SMSI + Clock */}
        <div className="space-y-6">
          {/* SmsiIndicatorsWidget removed — ISO %, MFA %, ticket counts already in Vue d'ensemble */}

          {/* Quick survey widget */}
          {activeSurvey && (
            <Card className="border-l-4 border-l-primary">
              <CardContent className="py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy dark:text-white">Enquête de satisfaction</p>
                    <p className="text-xs text-taupe dark:text-slate-400 truncate">{activeSurvey.title}</p>
                  </div>
                  <Link href="/satisfaction" className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0">
                    Voir tout <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {activeSurvey.description && (
                  <p className="text-xs text-taupe dark:text-slate-400 mb-3 line-clamp-2">{activeSurvey.description}</p>
                )}
                <Link href="/satisfaction">
                  <Button size="sm" className="w-full">
                    Répondre <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Activité récente (all users) */}
          {userActivity.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-navy dark:text-white">Mon activité</h3>
                    {weeklyActivityCounts.length > 0 && (
                      <span className="text-[10px] text-taupe dark:text-slate-500 bg-gray-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
                        {weeklyActivityCounts.reduce((a, b) => a + b, 0)} actions cette semaine
                      </span>
                    )}
                  </div>
                  <Link href="/notifications" className="text-xs text-primary hover:underline flex items-center gap-1">
                    Voir tout <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {/* Mini bar chart — last 7 days */}
                {weeklyActivityCounts.length > 0 && (
                  <div className="flex items-end gap-1 mt-3 h-8">
                    {(() => {
                      const max = Math.max(...weeklyActivityCounts, 1);
                      const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
                      const today = new Date().getDay(); // 0=Sun
                      return weeklyActivityCounts.map((count, idx) => {
                        const dayIndex = (today - 6 + idx + 7) % 7;
                        const label = dayLabels[dayIndex === 0 ? 6 : dayIndex - 1] ?? '';
                        const heightPct = Math.max((count / max) * 100, 4);
                        return (
                          <div key={idx} className="flex flex-col items-center gap-0.5 flex-1" title={`${label}: ${count} action${count !== 1 ? 's' : ''}`}>
                            <div
                              className={`w-full max-w-[18px] rounded-sm transition-all ${count > 0 ? 'bg-primary/70 dark:bg-primary/50' : 'bg-gray-200 dark:bg-slate-700'}`}
                              style={{ height: `${heightPct}%`, minHeight: '2px' }}
                            />
                            <span className="text-[8px] text-taupe dark:text-slate-500 leading-none">{label}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-0 p-0">
                {userActivity
                  .filter((a) => {
                    const act = (a.action || '').toLowerCase();
                    const rt = (a.resourceType || '').toLowerCase();
                    // Only significant actions: document/ticket/incident/quiz/wiki/charte changes
                    const significantResources = ['document', 'documentversion', 'ticket', 'incident', 'wiki', 'wikipage', 'quiz', 'charte'];
                    const significantActions = ['created', 'updated', 'uploaded', 'approved', 'published', 'resolved', 'completed', 'signed', 'declared'];
                    const isSignificantByResource = significantResources.includes(rt);
                    const isSignificantByAction = significantActions.some(s => act.includes(s));
                    const isPostMutation = act.startsWith('post /api/') && !act.includes('get') && !act.includes('notifications') && !act.includes('read');
                    const isPutPatch = (act.startsWith('put /api/') || act.startsWith('patch /api/')) && !act.includes('notifications');
                    return (isSignificantByResource && isSignificantByAction) || isPostMutation || isPutPatch;
                  })
                  .slice(0, 8).map((a) => {
                  const iconMap: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
                    DOCUMENT: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
                    DOCUMENTVERSION: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
                    TICKET: { icon: Ticket, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' },
                    NEWS: { icon: Newspaper, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/30' },
                    NEWSPOST: { icon: Newspaper, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/30' },
                    WIKI: { icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
                    WIKIPAGE: { icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
                    QUIZ: { icon: Brain, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-900/30' },
                    RAG: { icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10' },
                    COMMENT: { icon: MessageSquare, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-900/30' },
                    USER: { icon: UserCircle, color: 'text-gray-600 dark:text-slate-400', bg: 'bg-gray-50 dark:bg-gray-900/30' },
                  };
                  const labelMap: Record<string, string> = {
                    'document created': 'Document créé',
                    'document updated': 'Document mis à jour',
                    'document version uploaded': 'Nouvelle version uploadée',
                    'document approved': 'Document approuvé',
                    'document published': 'Document publié',
                    'ticket created': 'Ticket créé',
                    'ticket updated': 'Ticket mis à jour',
                    'ticket resolved': 'Ticket résolu',
                    'incident created': 'Incident déclaré',
                    'incident updated': 'Incident mis à jour',
                    'news created': 'Actualité publiée',
                    'wiki created': 'Page wiki créée',
                    'wiki updated': 'Page wiki modifiée',
                    'quiz completed': 'Quiz terminé',
                    'charte signed': 'Charte signée',
                    'post /api/documents': 'Document créé',
                    'post /api/documents/:id/versions': 'Nouvelle version',
                    'post /api/tickets': 'Ticket créé',
                    'post /api/incidents': 'Incident déclaré',
                    'post /api/news': 'Actualité publiée',
                    'post /api/wiki': 'Page wiki créée',
                    'post /api/rag/reindex': 'Index IA mis à jour',
                    'post /api/quiz/submit': 'Quiz complété',
                  };
                  const resType = (a.resourceType || '').toUpperCase();
                  const entry = (iconMap[resType] || iconMap['DOCUMENT'])!;
                  const Icon = entry.icon;
                  const rawAction = (a.action || '').replace(/_/g, ' ').toLowerCase();
                  const fallbackLabel = rawAction.replace(/^(post|put|patch|delete) \/api\//, '').replace(/\/:?\w+/g, '').replace(/\//g, ' ').trim();
                  const actionLabel = labelMap[rawAction] ?? (fallbackLabel || 'Action');
                  const typeLabel: Record<string, string> = {
                    document: 'Document', documentversion: 'Document', ticket: 'Ticket',
                    news: 'Actualité', newspost: 'Actualité', wiki: 'Wiki', wikipage: 'Wiki',
                    quiz: 'Quiz', rag: 'Recherche IA', comment: 'Commentaire', user: 'Profil',
                    notifications: 'Notification', incidents: 'Incident', documents: 'Document',
                  };
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-slate-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition">
                      <div className={`h-7 w-7 rounded-lg ${entry.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`h-3.5 w-3.5 ${entry.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-navy dark:text-white truncate">{actionLabel}</p>
                        <p className="text-[10px] text-taupe dark:text-slate-500 truncate">{typeLabel[resType.toLowerCase()] ?? resType.toLowerCase()}</p>
                      </div>
                      <span className="text-[10px] text-taupe dark:text-slate-500 flex-shrink-0 whitespace-nowrap">{formatRelativeTime(a.createdAt)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Mes favoris (bookmarks) */}
          {bookmarks.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center">
                <Star className="h-6 w-6 text-taupe/30 mx-auto mb-2" />
                <p className="text-xs text-taupe dark:text-slate-400">Ajoutez des favoris via &#9733; sur n&apos;importe quelle page</p>
              </CardContent>
            </Card>
          )}
          {bookmarks.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                  <h3 className="text-sm font-semibold text-navy dark:text-white">Mes favoris</h3>
                  <span className="text-[10px] text-taupe dark:text-slate-500 bg-gray-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{bookmarks.length}</span>
                  <Link href="/documents" className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">
                    Voir tout <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-0 p-0">
                {bookmarks.slice(0, 8).map((b) => {
                  const typeIcons: Record<string, { icon: React.ElementType; color: string }> = {
                    document: { icon: FileText, color: 'text-blue-500' },
                    wiki: { icon: BookOpen, color: 'text-emerald-500' },
                    news: { icon: Newspaper, color: 'text-violet-500' },
                  };
                  const ti = (typeIcons[b.type] || typeIcons['document'])!;
                  const TIcon = ti.icon;
                  return (
                    <Link key={`${b.type}-${b.id}`} href={b.href} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-slate-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition group">
                      <TIcon className={`h-3.5 w-3.5 ${ti.color} flex-shrink-0`} />
                      <span className="text-xs font-medium text-navy dark:text-white truncate group-hover:text-primary transition">{b.title}</span>
                      <span className="text-[10px] text-taupe dark:text-slate-500 ml-auto capitalize flex-shrink-0">{b.type}</span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* AI Suggestions (hidden until AI module is wired) */}
          {features.ai && <AiSuggestionsCard data={aiRecommendations} />}

          {/* Activity widgets — 2-col grid (Lucca always visible) */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">Widgets</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                {/* Lucca RH — always shown */}
                <Card className="h-full">
                  <CardContent className="h-full">
                    <LuccaWidget />
                  </CardContent>
                </Card>

                {/* RSS Cybersecurity Feed — visible for REVIEWER+ (security-relevant) */}
                {isManager && prefs.showRss && (
                  <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                    <Card>
                      <CardContent>
                        <RSSFeedWidget />
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Recent activity — ADMIN FULL MODE only */}
                {isAdmin && prefs.showActivity && recentActivity.length > 0 && (
                  <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-navy dark:text-white">{t('dashboard.recentActivity')}</h3>
                          <Link href="/admin/audit-log" className="text-xs text-primary hover:underline flex items-center gap-1">
                            Voir tout <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {recentActivity
                          .filter((a) => {
                            const act = (a.action || '').toLowerCase();
                            const rt = (a.resourceType || '').toLowerCase();
                            const significantResources = ['document', 'documentversion', 'ticket', 'incident', 'wiki', 'wikipage', 'quiz', 'charte'];
                            const significantActions = ['created', 'updated', 'uploaded', 'approved', 'published', 'resolved', 'completed', 'signed', 'declared'];
                            const isSignificantByResource = significantResources.includes(rt);
                            const isSignificantByAction = significantActions.some(s => act.includes(s));
                            const isPostMutation = act.startsWith('post /api/') && !act.includes('notifications') && !act.includes('read');
                            const isPutPatch = (act.startsWith('put /api/') || act.startsWith('patch /api/')) && !act.includes('notifications');
                            return (isSignificantByResource && isSignificantByAction) || isPostMutation || isPutPatch;
                          })
                          .slice(0, 8).map(a => {
                          const raw = (a.action || '').replace(/_/g, ' ').toLowerCase();
                          const adminLabelMap: Record<string, string> = {
                            'document created': 'Document créé',
                            'document updated': 'Document modifié',
                            'document version uploaded': 'Nouvelle version',
                            'ticket created': 'Ticket créé',
                            'incident created': 'Incident déclaré',
                            'quiz completed': 'Quiz terminé',
                            'post /api/documents': 'Document créé',
                            'post /api/tickets': 'Ticket créé',
                            'post /api/incidents': 'Incident déclaré',
                            'post /api/rag/reindex': 'Index IA mis à jour',
                          };
                          const label = adminLabelMap[raw] ?? raw.replace(/^(post|put|patch|delete) \/api\//, '').replace(/\/:?\w+/g, '').replace(/\//g, ' ').trim();
                          const typeLabel: Record<string, string> = {
                            document: 'Document', documentversion: 'Document', ticket: 'Ticket',
                            notifications: 'Notification', rag: 'IA', documents: 'Document',
                          };
                          const rt = (a.resourceType || '').toLowerCase();
                          return (
                          <div key={a.id} className="flex items-center gap-2 text-xs">
                            <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                            <span className="text-navy dark:text-white font-medium truncate">{label}</span>
                            <span className="text-taupe dark:text-slate-400">{typeLabel[rt] ?? rt}</span>
                            <span className="text-taupe dark:text-slate-500 ml-auto whitespace-nowrap">{formatRelativeTime(a.createdAt)}</span>
                          </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
      )}
    </div>
  );
}

/* ─────── AI Suggestions Card ─────── */

function AiSuggestionsCard({ data }: { data: { documents: any[]; wiki: any[]; actions: string[] } | null }) {
  // No data yet or API failed → render nothing (avoid permanent shimmer)
  if (!data) return null;

  if ((data.actions?.length ?? 0) === 0 && (data.documents?.length ?? 0) === 0 && (data.wiki?.length ?? 0) === 0) return null;

  const totalItems = data.actions.length + data.documents.length + data.wiki.length;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-navy dark:text-white">Suggestions pour vous</h3>
          <span className="ml-auto text-[10px] text-taupe dark:text-slate-500 bg-gray-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{totalItems}</span>
        </div>

        {/* Role-based contextual suggestions */}
        <div className="space-y-1.5 mb-3">
          {data.wiki.length > 0 && (
            <Link href="/wiki"
              className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition text-xs">
              <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium text-navy dark:text-white">Vous avez {data.wiki.length} article{data.wiki.length > 1 ? 's' : ''} wiki non lu{data.wiki.length > 1 ? 's' : ''} cette semaine</span>
              <ArrowRight className="h-3 w-3 text-taupe ml-auto" />
            </Link>
          )}
          {data.actions.filter((a): a is string => typeof a === 'string').map((action, i) => {
            const isSig = action.includes('signature');
            const isNotif = action.includes('notification');
            const isQuiz = action.toLowerCase().includes('quiz');
            const href = isSig ? '/documents?tab=signatures' : isNotif ? '/notifications' : isQuiz ? '/quiz' : '#';
            return (
              <Link key={i} href={href}
                className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition text-xs">
                {isSig ? <PenLine className="h-3.5 w-3.5 text-amber-600" /> :
                 isNotif ? <Bell className="h-3.5 w-3.5 text-blue-600" /> :
                 isQuiz ? <Brain className="h-3.5 w-3.5 text-pink-600" /> :
                 <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                <span className="font-medium text-navy dark:text-white">{action}</span>
                <ArrowRight className="h-3 w-3 text-taupe ml-auto" />
              </Link>
            );
          })}
        </div>

        {data.documents.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">Documents recommandes</p>
            <div className="space-y-1">
              {data.documents.slice(0, 3).map((doc: any) => (
                <Link key={doc.id} href={`/documents/${doc.id}`}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 transition text-xs group">
                  <FileText className="h-3.5 w-3.5 text-taupe group-hover:text-primary transition" />
                  <span className="text-navy dark:text-white truncate group-hover:text-primary transition">{doc.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {data.wiki.length > 0 && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">Wiki recent</p>
            <div className="space-y-1">
              {data.wiki.map((page: any) => (
                <Link key={page.id} href={`/wiki/${page.slug || page.id}`}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 transition text-xs group">
                  <BookOpen className="h-3.5 w-3.5 text-taupe group-hover:text-primary transition" />
                  <span className="text-navy dark:text-white truncate group-hover:text-primary transition">{page.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────── Smart Insights Widget ─────── */

function SmartInsightsWidget({ data }: { data: UxInsightsData }) {
  const insightConfig: Record<
    UxInsight['type'],
    { icon: React.ElementType; color: string; bg: string; border: string; badge: string }
  > = {
    tip: {
      icon: Lightbulb,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
    suggestion: {
      icon: Sparkles,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-200 dark:border-emerald-800',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    achievement: {
      icon: Trophy,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-900/20',
      border: 'border-violet-200 dark:border-violet-800',
      badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    },
  };

  const typeLabel: Record<UxInsight['type'], string> = {
    tip: 'Conseil',
    warning: 'Attention',
    suggestion: 'Suggestion',
    achievement: 'Succès',
  };

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const scoreOffset = circumference - (data.score / 100) * circumference;
  const scoreColor = data.score > 80 ? '#10b981' : data.score > 50 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500 mb-2">
        Smart Insights
      </p>
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-4 mb-4">
          {/* SVG ring chart — profile score */}
          <div className="flex-shrink-0 relative w-[52px] h-[52px]">
            <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90 absolute inset-0">
              <circle
                cx="26" cy="26" r={radius} fill="none" strokeWidth="5"
                stroke="currentColor" className="text-gray-100 dark:text-slate-800"
              />
              <circle
                cx="26" cy="26" r={radius} fill="none" strokeWidth="5"
                stroke={scoreColor} strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={scoreOffset}
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-semibold tabular-nums" style={{ color: scoreColor }}>
                {data.score}%
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Analyse intelligente
            </h3>
            <p className="text-[11px] text-taupe dark:text-slate-400 mt-0.5">
              {(data.insights?.length ?? 0)} recommandation{(data.insights?.length ?? 0) > 1 ? 's' : ''}{' '}
              personnalisée{(data.insights?.length ?? 0) > 1 ? 's' : ''} pour vous
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.insights.map((insight, i) => {
            const cfg = insightConfig[insight.type];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border} flex flex-col gap-2`}>
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[9px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${cfg.badge}`}>
                      {typeLabel[insight.type]}
                    </span>
                    <p className="text-xs font-semibold text-navy dark:text-white leading-snug mt-1">{insight.title}</p>
                    <p className="text-[11px] text-taupe dark:text-slate-400 mt-0.5 line-clamp-2">{insight.description}</p>
                  </div>
                </div>
                {insight.action && (
                  <Link
                    href={insight.action}
                    className={`self-start inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color} hover:underline`}
                  >
                    Agir <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
