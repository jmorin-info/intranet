'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Bell, X } from 'lucide-react';

const STORAGE_KEY = 'omnitech.push.prompt.dismissed';
const SUBSCRIBED_KEY = 'omnitech.push.subscribed';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Discreet banner that prompts the user once per session to enable browser push.
 * Auto-resubscribes silently on every mount if already subscribed (in case sub expired).
 */
export function PushNotificationManager() {
  const user = useAuthStore(s => s.user);
  const [showPrompt, setShowPrompt] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (!('PushManager' in window)) return;
    if (!('Notification' in window)) return;

    // Already subscribed: try silent re-sync (in case sub was rotated)
    if (Notification.permission === 'granted') {
      void resyncSubscription();
      return;
    }

    // Already denied: never bother again
    if (Notification.permission === 'denied') return;

    // Default: prompt the user once per session
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    // Wait a bit so we don't blast the user the moment they log in
    const t = setTimeout(() => setShowPrompt(true), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function resyncSubscription() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (!existing) {
        // Permission granted but no sub — try to resubscribe quietly
        void localStorage.removeItem(SUBSCRIBED_KEY);
        return;
      }
      // Refresh the server-side record
      const json = existing.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      });
      localStorage.setItem(SUBSCRIBED_KEY, '1');
    } catch {
      /* silent */
    }
  }

  async function enable() {
    setEnabling(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        sessionStorage.setItem(STORAGE_KEY, '1');
        setShowPrompt(false);
        return;
      }

      const { data } = await api.get('/push/vapid-public-key');
      if (!data?.enabled || !data?.publicKey) {
        sessionStorage.setItem(STORAGE_KEY, '1');
        setShowPrompt(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Invalid subscription');
      }

      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      });

      localStorage.setItem(SUBSCRIBED_KEY, '1');
      sessionStorage.setItem(STORAGE_KEY, '1');
      setShowPrompt(false);
    } catch {
      sessionStorage.setItem(STORAGE_KEY, '1');
      setShowPrompt(false);
    } finally {
      setEnabling(false);
    }
  }

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, '1');
    setShowPrompt(false);
  }

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20 flex-shrink-0">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy dark:text-white">Activer les notifications</p>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
            Recevez les alertes critiques et nouveaux tickets directement dans votre navigateur.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={enable}
              disabled={enabling}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {enabling ? 'Activation...' : 'Activer'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-medium px-3 py-1.5 rounded-md text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-seal-gray-500 dark:text-slate-500 hover:text-navy dark:hover:text-white p-1 -mr-1 -mt-1"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
