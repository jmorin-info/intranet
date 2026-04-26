'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bell, BellOff, BellRing, Smartphone, Share2, PlusSquare, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@omnitech/ui';
import {
  detectPlatform,
  getWebPushReadiness,
  isStandalone,
  type DetectedPlatform,
  type WebPushReadiness,
} from '@/lib/platform-detection';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { api } from '@/lib/api';

interface CapabilitiesResponse {
  enabled: boolean;
  vapidPublicKey: string | null;
  supportsSafari: boolean;
  knownPlatforms: string[];
}

const DISMISS_KEY = 'omnitech.push.ios-install.dismissed';

/**
 * Composant dédié à l'activation des notifications push, avec gestion
 * spécifique du cas Safari iOS.
 *
 * Flow :
 *   1. Si la plateforme n'expose aucune API Web Push ET ce n'est pas iOS Safari,
 *      le composant ne s'affiche pas (rien de pertinent à proposer).
 *   2. Si c'est Safari iOS et que la PWA n'est pas installée à l'écran d'accueil,
 *      on affiche un bandeau pédagogique avec les étapes "Partager → Ajouter à
 *      l'écran d'accueil". Tant que l'utilisateur n'a pas installé, on ne tente
 *      pas `Notification.requestPermission()` (Safari iOS le bloquerait).
 *   3. Sinon (browser compatible OU iOS PWA installée), on affiche un bouton
 *      Activer / Désactiver classique qui orchestre le flow VAPID.
 *
 * Le composant est conçu pour être placé dans `/profile` (carte
 * `Préférences de notification`) — il complète l'existant `<PushNotificationManager />`
 * (bandeau global discret) avec un contrôle explicite et la pédagogie iOS.
 */
export function PushNotificationsPrompt() {
  const t = useTranslations();
  const [readiness, setReadiness] = useState<WebPushReadiness>('unsupported');
  const [platform, setPlatform] = useState<DetectedPlatform>('unknown');
  const [serverSupportsSafari, setServerSupportsSafari] = useState(false);
  const [iosInstallDismissed, setIosInstallDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // `usePushNotifications` ne lit l'état réel du SW que quand l'API est exposée.
  // On le monte toujours, il s'auto-protège via isPushSupported().
  const push = usePushNotifications();

  useEffect(() => {
    setHydrated(true);
    setReadiness(getWebPushReadiness());
    setPlatform(detectPlatform());
    try {
      const dismissed = sessionStorage.getItem(DISMISS_KEY);
      if (dismissed) setIosInstallDismissed(true);
    } catch {
      /* private mode — ignore */
    }

    // Récupère les capacités serveur (notamment supportsSafari) — non bloquant.
    api
      .get<CapabilitiesResponse>('/push/capabilities')
      .then(({ data }) => {
        setServerSupportsSafari(Boolean(data?.supportsSafari));
      })
      .catch(() => {
        // Endpoint potentiellement non déployé sur ancien backend — on
        // assume true par défaut (web-push >= 3.5.0 partout depuis avril 2026).
        setServerSupportsSafari(true);
      });
  }, []);

  // Pas de rendu côté serveur — toute la décision repose sur navigator/window.
  if (!hydrated) return null;

  // Ne rien afficher si la plateforme est nativement incompatible et que ce
  // n'est même pas iOS (où on peut au moins guider l'utilisateur à installer).
  if (readiness === 'unsupported' && platform !== 'ios') return null;

  const isIosNeedsInstall = readiness === 'ios-needs-install';

  function dismissIosInstall(): void {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setIosInstallDismissed(true);
  }

  async function handleEnable(): Promise<void> {
    const ok = await push.subscribe();
    if (ok) {
      toast.success(t('notifications.safari.enableSuccess'));
    } else if (push.error) {
      toast.error(push.error);
    } else {
      toast.error(t('notifications.safari.enableError'));
    }
  }

  async function handleDisable(): Promise<void> {
    const ok = await push.unsubscribe();
    if (ok) {
      toast.success(t('notifications.safari.disableSuccess'));
    } else if (push.error) {
      toast.error(push.error);
    }
  }

  // -- iOS install banner (PWA non installée) --
  if (isIosNeedsInstall && !iosInstallDismissed) {
    return (
      <Card data-testid="push-prompt-ios-install">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              {t('notifications.safari.iosInstallTitle')}
            </h2>
            <button
              type="button"
              onClick={dismissIosInstall}
              className="text-seal-gray-500 dark:text-slate-500 hover:text-seal-navy dark:hover:text-white p-1 -mr-1 -mt-1"
              aria-label={t('notifications.safari.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            {t('notifications.safari.iosInstallDescription')}
          </p>

          <ol className="mt-4 space-y-3 text-sm text-seal-navy dark:text-slate-200">
            <li className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                1
              </span>
              <span className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-primary" aria-hidden="true" />
                {t('notifications.safari.iosStep1')}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                2
              </span>
              <span className="flex items-center gap-2">
                <PlusSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                {t('notifications.safari.iosStep2')}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                3
              </span>
              <span className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
                {t('notifications.safari.iosStep3')}
              </span>
            </li>
          </ol>

          {/* Visuel placeholder — un GIF/screenshot pourra être ajouté ultérieurement.
              Sur iOS Safari, l'illustration n'est pas critique car l'icône Partager
              est universelle. */}
          <div
            aria-hidden="true"
            className="mt-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-seal-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 text-xs text-seal-gray-500 dark:text-slate-500"
          >
            {t('notifications.safari.iosScreenshotPlaceholder')}
          </div>

          <p className="mt-4 text-xs text-seal-gray-500 dark:text-slate-400">
            {t('notifications.safari.iosNote')}
          </p>
        </CardContent>
      </Card>
    );
  }

  // -- Cas standard : activation/désactivation directe --
  const subscribed = push.isSubscribed && push.permission === 'granted';
  const denied = push.permission === 'denied';
  const unsupported = readiness === 'unsupported';

  return (
    <Card data-testid="push-prompt-standard">
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          {t('notifications.safari.title')}
        </h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400">
          {t('notifications.safari.description')}
        </p>

        {platform === 'ios' && isStandalone() && (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 italic">
            {t('notifications.safari.iosInstalledHint')}
          </p>
        )}

        {!serverSupportsSafari && platform === 'ios' && (
          <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {t('notifications.safari.serverNotReady')}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!subscribed && !denied && !unsupported && (
            <button
              type="button"
              onClick={handleEnable}
              disabled={push.busy}
              className="inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              <Bell className="h-4 w-4" />
              {push.busy
                ? t('notifications.safari.enabling')
                : t('notifications.safari.enable')}
            </button>
          )}

          {subscribed && (
            <button
              type="button"
              onClick={handleDisable}
              disabled={push.busy}
              className="inline-flex items-center gap-2 rounded-btn border border-seal-gray-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              <BellOff className="h-4 w-4" />
              {push.busy
                ? t('notifications.safari.disabling')
                : t('notifications.safari.disable')}
            </button>
          )}

          {subscribed && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <BellRing className="h-3.5 w-3.5" />
              {t('notifications.safari.activeBadge')}
            </span>
          )}

          {denied && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('notifications.safari.denied')}
            </p>
          )}

          {unsupported && (
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">
              {t('notifications.safari.unsupported')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
