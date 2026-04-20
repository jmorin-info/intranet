'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/stores/auth-store';
import { useSocket } from '@/hooks/use-socket';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/stores/notification-store';
import { useDocumentStore } from '@/stores/document-store';
import { useHealthStore } from '@/stores/health-store';
import { useAdminCountsStore } from '@/stores/admin-counts-store';
import { Clock, Search, MessageSquare, Keyboard, X, FileText, Ticket, Home, BookOpen, Shield, Users, User, Calendar, Focus } from 'lucide-react';
import { TipBanner } from '@/components/tips/tip-banner';
import { useTrackPageVisit } from '@/hooks/use-recent-pages';
import { AiSearchTrigger } from './ai-search-trigger';
import { CommandPaletteProvider } from './command-palette-provider';

const publicPaths = ['/login', '/logout', '/chartes', '/welcome', '/forgot-password', '/reset-password'];

/** Derive a tip context string from the current pathname. */
function pathToTipContext(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/documents')) return 'documents';
  if (pathname.startsWith('/tickets')) return 'tickets';
  if (pathname.startsWith('/admin') || pathname.startsWith('/configuration')) return 'admin';
  if (pathname.startsWith('/security') || pathname.startsWith('/veille') || pathname.startsWith('/scanner')) return 'security';
  return 'general';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, fetchMe, user } = useAuthStore();
  const { setNotifications, setUnreadCount, startPolling } = useNotificationStore();
  const { setPendingCount } = useDocumentStore();
  const startHealthPolling = useHealthStore(s => s.startPolling);
  const startAdminPolling = useAdminCountsStore(s => s.startPolling);
  const [chartesChecked, setChartesChecked] = useState(false);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useSocket();
  useTrackPageVisit();

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Global keyboard shortcuts
  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      // Ctrl+K → handled by CommandPaletteProvider (global command palette).
      // On laisse passer sans intercepter ici.
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.shiftKey) {
        return;
      }
      // Ctrl+/ → Help
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        router.push('/helpdesk');
        return;
      }
      // Ctrl+Shift+N → New document
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        router.push('/documents/new');
        return;
      }
      // Ctrl+Shift+T → New ticket
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        router.push('/tickets?create=true');
        return;
      }

      if (isInput) return;

      // ? → Show shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }
      // Escape → close shortcuts modal
      if (e.key === 'Escape' && showShortcuts) {
        setShowShortcuts(false);
        return;
      }
      // G then D/T/S/W/H → Go to page (vim-style)
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        if (gPressed) return;
        gPressed = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 800);
        return;
      }
      if (gPressed) {
        gPressed = false;
        if (gTimer) clearTimeout(gTimer);
        switch (e.key) {
          case 'd': e.preventDefault(); router.push('/dashboard'); break;
          case 't': e.preventDefault(); router.push('/tickets'); break;
          case 's': e.preventDefault(); router.push('/search'); break;
          case 'w': e.preventDefault(); router.push('/wiki'); break;
          case 'h': e.preventDefault(); router.push('/helpdesk'); break;
          case 'n': e.preventDefault(); router.push('/news'); break;
          case 'v': e.preventDefault(); router.push('/veille'); break;
          case 'c': e.preventDefault(); router.push('/admin/compliance'); break;
          case 'p': e.preventDefault(); router.push('/profile'); break;
          case 'a': e.preventDefault(); router.push('/directory'); break;
          case 'k': e.preventDefault(); router.push('/calendar'); break;
          case 'i': e.preventDefault(); router.push('/incidents'); break;
          case 'y': e.preventDefault(); router.push('/admin/system-health'); break;
          case 'l': e.preventDefault(); router.push('/admin/ldap-pending'); break;
          case 'r': e.preventDefault(); router.push('/admin/rssi-dashboard'); break;
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); if (gTimer) clearTimeout(gTimer); };
  }, [router, showShortcuts]);

  const loadAppData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [notifRes, pendingRes, chartesRes] = await Promise.allSettled([
        api.get('/notifications', { params: { limit: 50 } }),
        api.get('/documents', { params: { status: 'IN_REVIEW', limit: 1 } }),
        api.get('/chartes/status'),
      ]);

      if (notifRes.status === 'fulfilled') {
        const notifs = notifRes.value.data?.data || [];
        setNotifications(notifs);
        setUnreadCount(notifs.filter((n: { isRead: boolean }) => !n.isRead).length);
      }
      if (pendingRes.status === 'fulfilled') {
        setPendingCount(pendingRes.value.data?.meta?.total || 0);
      }
      // Check if chartes need to be signed (only redirect if API explicitly says not all signed)
      if (chartesRes.status === 'fulfilled' && chartesRes.value.data && chartesRes.value.data.allSigned === false) {
        if (!pathname.startsWith('/chartes')) {
          sessionStorage.setItem('postChartesRedirect', pathname);
          router.push('/chartes');
          return;
        }
      }
      setChartesChecked(true);
    } catch {
      setChartesChecked(true);
    }
  }, [isAuthenticated, setNotifications, setUnreadCount, setPendingCount, pathname, router]);

  useEffect(() => { loadAppData(); }, [loadAppData]);

  // Poll unread notification count every 60 seconds while authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const stopPolling = startPolling();
    return stopPolling;
  }, [isAuthenticated, startPolling]);

  // Start centralized health polling (30s) + admin counts polling (60s)
  useEffect(() => {
    if (!isAuthenticated) return;
    const stopHealth = startHealthPolling(30_000);
    const stopAdmin = startAdminPolling(60_000);
    return () => { stopHealth(); stopAdmin(); };
  }, [isAuthenticated, startHealthPolling, startAdminPolling]);

  // Session timeout warning (ISO 27001 — auto-logout + warning).
  // Stratégie améliorée :
  //  - Tant qu'il reste > 5 min : silence total.
  //  - Entre 5 min et 90 s : TENTATIVE DE REFRESH SILENCIEUX en arrière-plan (si
  //    refresh token valide, aucun popup n'apparaît, l'utilisateur ne voit rien).
  //  - Si le refresh échoue ET qu'il reste < 90 s : on affiche le popup pour laisser
  //    à l'utilisateur le choix final.
  //  - Check toutes les 60 s au lieu de 30 s (moins de bruit CPU).
  useEffect(() => {
    if (!isAuthenticated) return;

    let silentRefreshInFlight = false;

    const trySilentRefresh = async () => {
      if (silentRefreshInFlight) return;
      silentRefreshInFlight = true;
      try {
        // Refresh token is sent via httpOnly cookie (withCredentials: true on api instance).
        // No need to read from localStorage — the cookie is attached automatically.
        const { data } = await api.post('/auth/refresh', {});
        if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken);
      } catch {
        // Silent failure — on laisse le prochain check afficher le popup si besoin.
      } finally {
        silentRefreshInFlight = false;
      }
    };

    const checkExpiry = () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return;
        const payload = JSON.parse(atob(parts[1]!));
        const expiresAt = payload.exp * 1000;
        const remaining = expiresAt - Date.now();

        if (remaining <= 0) {
          localStorage.removeItem('accessToken');
          // Redirect to login with session_expired reason for user feedback
          window.location.href = '/login?reason=session_expired';
          return;
        }
        if (remaining <= 90_000) {
          // Moins de 1 min 30 s : popup en dernier recours
          setShowTimeoutWarning(true);
          return;
        }
        if (remaining <= 5 * 60_000) {
          // Moins de 5 min : refresh silencieux, pas de popup
          void trySilentRefresh();
        }
      } catch {}
    };

    // Run once immediately puis toutes les 60 s
    checkExpiry();
    const interval = setInterval(checkExpiry, 60_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleExtendSession = async () => {
    try {
      // Refresh token is sent via httpOnly cookie automatically (withCredentials: true).
      const { data } = await api.post('/auth/refresh', {});
      if (data?.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      setShowTimeoutWarning(false);
    } catch {
      localStorage.removeItem('accessToken');
      window.location.href = '/login?reason=session_expired';
    }
  };

  useEffect(() => {
    if (isLoading) return;
    const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
    if (!isAuthenticated && !isPublicPath) {
      router.push('/login');
    } else if (isAuthenticated && pathname === '/login') {
      router.push('/dashboard');
    }
    // Force prestataire to /mfa if MFA setup required
    if (isAuthenticated && localStorage.getItem('mfaSetupRequired') === 'true' && !pathname.startsWith('/mfa')) {
      router.push('/mfa');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface dark:bg-slate-950">
        <div className="flex flex-col items-center gap-6">
          <Image src="/logo-icon.png" alt="OMNITECH" width={80} height={80} className="animate-pulse" />
          <p className="text-sm font-semibold text-navy dark:text-white">OMNITECH Security</p>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
            <div className="h-full w-2/3 rounded-full bg-primary animate-[loading_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
        <style jsx>{`@keyframes loading { 0% { transform: translateX(-100%); } 50% { transform: translateX(50%); } 100% { transform: translateX(-100%); } }`}</style>
      </div>
    );
  }

  return (
    <CommandPaletteProvider>
      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-[fadeIn_0.15s_ease-out]" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-[slideUp_0.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-primary/5 to-transparent dark:from-primary/10">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Keyboard className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-navy dark:text-white">Raccourcis clavier</h3>
                  <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">Naviguez plus vite dans l&apos;intranet</p>
                </div>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition">
                <X className="h-4 w-4 text-seal-gray-500" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Global */}
              <div>
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Recherche et aide</p>
                <div className="space-y-2">
                  <ShortcutRow keys={['Ctrl', 'K']} description="Recherche globale" icon={<Search className="h-3.5 w-3.5 text-primary" />} />
                  <ShortcutRow keys={['Ctrl', '/']} description="Ouvrir le helpdesk" icon={<MessageSquare className="h-3.5 w-3.5 text-emerald-500" />} />
                </div>
              </div>
              {/* Creation */}
              <div>
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Création rapide</p>
                <div className="space-y-2">
                  <ShortcutRow keys={['Ctrl', 'Shift', 'N']} description="Nouveau document" icon={<FileText className="h-3.5 w-3.5 text-blue-500" />} />
                  <ShortcutRow keys={['Ctrl', 'Shift', 'T']} description="Nouveau ticket" icon={<Ticket className="h-3.5 w-3.5 text-amber-500" />} />
                </div>
              </div>
              {/* Go-to navigation */}
              <div>
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Aller vers (G puis...)</p>
                <div className="space-y-2">
                  <ShortcutRow keys={['G', 'D']} description="Tableau de bord" icon={<Home className="h-3.5 w-3.5 text-navy dark:text-white" />} />
                  <ShortcutRow keys={['G', 'T']} description="Tickets" icon={<Ticket className="h-3.5 w-3.5 text-amber-500" />} />
                  <ShortcutRow keys={['G', 'S']} description="Recherche" icon={<Search className="h-3.5 w-3.5 text-primary" />} />
                  <ShortcutRow keys={['G', 'W']} description="Connaissances" icon={<BookOpen className="h-3.5 w-3.5 text-emerald-500" />} />
                  <ShortcutRow keys={['G', 'H']} description="Support IT" icon={<MessageSquare className="h-3.5 w-3.5 text-emerald-500" />} />
                  <ShortcutRow keys={['G', 'N']} description="Actualités" icon={<FileText className="h-3.5 w-3.5 text-blue-500" />} />
                  <ShortcutRow keys={['G', 'V']} description="Veille cyber" icon={<Shield className="h-3.5 w-3.5 text-red-500" />} />
                  <ShortcutRow keys={['G', 'A']} description="Annuaire" icon={<Users className="h-3.5 w-3.5 text-indigo-500" />} />
                  <ShortcutRow keys={['G', 'P']} description="Mon profil" icon={<User className="h-3.5 w-3.5 text-seal-gray-500" />} />
                  <ShortcutRow keys={['G', 'K']} description="Calendrier" icon={<Calendar className="h-3.5 w-3.5 text-cyan-500" />} />
                  <ShortcutRow keys={['G', 'I']} description="Incidents" icon={<Shield className="h-3.5 w-3.5 text-red-500" />} />
                  <ShortcutRow keys={['G', 'Y']} description="Santé système" icon={<Shield className="h-3.5 w-3.5 text-emerald-500" />} />
                  <ShortcutRow keys={['G', 'L']} description="Validation LDAP" icon={<Users className="h-3.5 w-3.5 text-amber-500" />} />
                  <ShortcutRow keys={['G', 'R']} description="Dashboard RSSI" icon={<Shield className="h-3.5 w-3.5 text-primary" />} />
                </div>
              </div>
              {/* General */}
              <div>
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Général</p>
                <div className="space-y-2">
                  <ShortcutRow keys={['Alt', 'Clic']} description="Mode Focus — lecture sans distraction" icon={<Focus className="h-3.5 w-3.5 text-primary" />} />
                  <ShortcutRow keys={['?']} description="Afficher les raccourcis" icon={<Keyboard className="h-3.5 w-3.5 text-amber-500" />} />
                  <ShortcutRow keys={['Esc']} description="Fermer la fenêtre active" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 text-center">
                Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-[10px] font-mono font-semibold text-navy dark:text-white">Esc</kbd> pour fermer
              </p>
            </div>
          </div>
        </div>
      )}
      {showTimeoutWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <div className="text-center">
              <Clock className="h-10 w-10 text-amber-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-navy dark:text-white">Session bientôt expirée</h3>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-2">
                Votre session expire dans moins de 2 minutes. Souhaitez-vous la prolonger ?
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleExtendSession}
                  className="flex-1 bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:bg-primary/90"
                >
                  Prolonger
                </button>
                <button
                  onClick={() => { window.location.href = '/login'; }}
                  className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg py-2 text-sm text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {children}
      {isAuthenticated && user && chartesChecked && (
        <TipBanner context={pathToTipContext(pathname)} role={user.role} />
      )}
      {isAuthenticated && <AiSearchTrigger />}
    </CommandPaletteProvider>
  );
}

/* ─────── Shortcut Row ─────── */

function ShortcutRow({ keys, description, icon }: { keys: string[]; description: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon && icon}
        <span className="text-sm text-navy dark:text-white">{description}</span>
      </div>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">+</span>}
            <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-[11px] font-mono font-semibold text-navy dark:text-white">
              {key}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
