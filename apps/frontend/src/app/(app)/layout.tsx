'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { BannerBar } from '@/components/layout/banner-bar';
import { AuthProvider } from '@/components/layout/auth-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { SkipLinks } from '@/components/a11y/skip-links';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { useKeyboardShortcuts, type KeyboardShortcutEntry } from '@/hooks/use-keyboard-shortcuts';

const FocusMode = dynamic(() => import('@/components/layout/focus-mode').then(m => ({ default: m.FocusMode })), { ssr: false });
const GlanceOverlay = dynamic(() => import('@/components/layout/glance-overlay').then(m => ({ default: m.GlanceOverlay })), { ssr: false });
const PushNotificationManager = dynamic(() => import('@/components/notifications/push-notification-manager').then(m => ({ default: m.PushNotificationManager })), { ssr: false });
const InstallPrompt = dynamic(() => import('@/components/pwa/install-prompt').then(m => ({ default: m.InstallPrompt })), { ssr: false });
const OfflineIndicator = dynamic(() => import('@/components/pwa/offline-indicator').then(m => ({ default: m.OfflineIndicator })), { ssr: false });
const KeyboardShortcutsDialog = dynamic(() => import('@/components/ui/keyboard-shortcuts-dialog').then(m => ({ default: m.KeyboardShortcutsDialog })), { ssr: false });
const OnboardingTour = dynamic(() => import('@/components/onboarding-tour').then(m => ({ default: m.OnboardingTour })), { ssr: false });
const WelcomeTour = dynamic(() => import('@/components/onboarding/welcome-tour').then(m => ({ default: m.WelcomeTour })), { ssr: false });
const ScrollTop = dynamic(() => import('@/components/ui/scroll-top').then(m => ({ default: m.ScrollTop })), { ssr: false });
const AIChatbot = dynamic(() => import('@/components/ai/ai-chatbot').then(m => ({ default: m.AIChatbot })), { ssr: false });
const UpdateNotification = dynamic(() => import('@/components/pwa/update-notification').then(m => ({ default: m.UpdateNotification })), { ssr: false });
const MaintenanceGuard = dynamic(() => import('@/components/pwa/update-notification').then(m => ({ default: m.MaintenanceGuard })), { ssr: false });

const KEYBOARD_SHORTCUTS: Record<string, string> = {
  // Legacy shortcuts — directs vers une page
  D: '/documents',
  T: '/tickets',
  I: '/incidents',
  N: '/news',
  W: '/wiki',
  P: '/tools/pdf',
};

/** Raccourcis Ctrl+Alt+<digit> → landings de hub. */
const HUB_SHORTCUTS: Record<string, string> = {
  '1': '/dashboard',       // Mon espace
  '2': '/hub/work',        // Travail & Connaissance
  '3': '/hub/security',    // Sécurité & Conformité
  '4': '/admin',           // Administration
  '5': '/admin/rssi-dashboard', // Supervision RSSI
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Raccourcis séquentiels vim-like : `g d`, `g t`, etc.
  // Le hook désactive automatiquement les shortcuts sur les champs de saisie
  // et gère le timeout de 1500ms entre `g` et la seconde touche.
  const sequentialShortcuts: KeyboardShortcutEntry[] = React.useMemo(() => [
    { key: 'd', label: 'Tableau de bord', href: '/dashboard' },
    { key: 't', label: 'Tickets', href: '/tickets' },
    { key: 'w', label: 'Wiki', href: '/wiki' },
    { key: 'm', label: 'Médiathèque', href: '/media' },
    { key: 'n', label: 'Actualités', href: '/news' },
    { key: 'i', label: 'Incidents', href: '/incidents' },
    { key: 'r', label: 'Runbooks', href: '/runbooks' },
    { key: 'c', label: 'Changelog', href: '/changelog' },
    { key: 's', label: 'Signatures', href: '/signatures' },
    {
      key: 'a',
      label: 'Administration',
      href: '/admin',
      enabled: () => !!user && isRoleAtLeast(user.role, UserRole.ADMIN),
    },
  ], [user]);

  useKeyboardShortcuts({
    shortcuts: sequentialShortcuts,
    onHelp: () => setShortcutsOpen(true),
  });

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+Shift+<key> shortcuts (page directs)
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const route = KEYBOARD_SHORTCUTS[e.key.toUpperCase()];
        if (route) {
          e.preventDefault();
          router.push(route);
          return;
        }
      }

      // Ctrl+Alt+<digit> → hub landings
      if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) {
        const hubRoute = HUB_SHORTCUTS[e.key];
        if (hubRoute) {
          e.preventDefault();
          router.push(hubRoute);
          return;
        }
      }

      // "?" when not in an input / textarea / contenteditable
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (e.target as HTMLElement)?.isContentEditable;
        if (!isEditable) {
          e.preventDefault();
          setShortcutsOpen((o) => !o);
        }
      }
    },
    [router],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  return (
    <AuthProvider>
      <SkipLinks />
      <div className="min-h-dvh bg-surface">
        {/* Sidebar isolée : si elle crash, le reste de la page continue à s'afficher */}
        <ErrorBoundary fallback={
          <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-14 bg-[#002a40] items-center justify-center text-white/60 text-[10px] z-50">
            nav hs
          </aside>
        }>
          <Sidebar />
        </ErrorBoundary>
        {/*
          Nouvelle sidebar Rail+Panel (lg+) :
            rail = 56 px (w-14), panel = 240 px → total 296 px.
          En mode "panel masqué" (double-clic sur rail icône), sidebarOpen devient
          false et on rétrécit à 56 px. Sur mobile/tablet (< lg), la sidebar
          est un drawer overlay, le content prend 100 % de la largeur.
        */}
        <div
          className={cn(
            'transition-[margin] duration-200 ease-out ml-0',
            sidebarOpen ? 'lg:ml-[296px]' : 'lg:ml-14',
          )}
        >
          <BannerBar />
          <ErrorBoundary fallback={<div className="h-14 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700" />}>
            <Header />
          </ErrorBoundary>
          <OfflineIndicator />
          {/* Breadcrumbs globaux — masqués sur /dashboard (racine) */}
          {pathname && pathname !== '/dashboard' && (
            <div className="px-4 lg:px-6 pt-3">
              <Breadcrumbs />
            </div>
          )}
          <main id="main-content" className="p-4 lg:p-6 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-6 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] lg:pl-[calc(1.5rem+env(safe-area-inset-left))] lg:pr-[calc(1.5rem+env(safe-area-inset-right))] animate-[fadeIn_0.25s_ease-out]">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
        <MobileBottomNav />
        {/* GlanceOverlay doit être monté AVANT FocusMode afin que son
            listener click (capture phase) s'enregistre en premier et
            intercepte Alt+Click sur les liens internes. */}
        <GlanceOverlay />
        <FocusMode />
        <PushNotificationManager />
        <InstallPrompt />
        <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <ScrollTop />
        <AIChatbot />
        <OnboardingTour />
        <WelcomeTour />
        <UpdateNotification />
        <MaintenanceGuard />
      </div>
    </AuthProvider>
  );
}
