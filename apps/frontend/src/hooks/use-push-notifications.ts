'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { detectPlatform } from '@/lib/platform-detection';

/**
 * Permission state of the browser Notifications API.
 * "unsupported" means the browser doesn't expose the API at all
 * (e.g. iOS Safari < 16, or in a non-secure context).
 */
export type PushPermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

export interface UsePushNotificationsResult {
  /** Current browser permission. */
  permission: PushPermissionState;
  /** Whether a subscription is currently registered server-side. */
  isSubscribed: boolean;
  /** True while a subscribe/unsubscribe operation is in flight. */
  busy: boolean;
  /** Last error message, if any (subscribe / unsubscribe / VAPID fetch). */
  error: string | null;
  /** Request permission + create + persist a subscription. Returns true on success. */
  subscribe: () => Promise<boolean>;
  /** Remove the current subscription locally + server-side. Returns true on success. */
  unsubscribe: () => Promise<boolean>;
}

const SUBSCRIBED_KEY = 'omnitech.push.subscribed';

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  // Allocate a fresh ArrayBuffer (NOT SharedArrayBuffer) so the resulting
  // Uint8Array is acceptable as `applicationServerKey` (which only accepts
  // ArrayBuffer-backed views, not the lib-dom ArrayBufferLike union).
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return view;
}

/**
 * Browser push notifications hook.
 *
 * Manages the full subscribe/unsubscribe lifecycle:
 *   1. Asks Notification.requestPermission()
 *   2. Fetches the VAPID public key from /push/vapid-public-key
 *   3. Calls registration.pushManager.subscribe(...)
 *   4. POST /push/subscribe with endpoint + keys (p256dh, auth)
 *
 * On unsubscribe: PushSubscription.unsubscribe() + POST /push/unsubscribe.
 *
 * Reads the actual server-side state from PushManager on mount, so re-mounting
 * the hook reflects the real browser state (no zombie "subscribed" flag).
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const [permission, setPermission] = useState<PushPermissionState>(() => {
    if (!isPushSupported()) return 'unsupported';
    return Notification.permission as PushPermissionState;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the real subscription state from the SW on mount.
  useEffect(() => {
    if (!isPushSupported()) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(!!sub);
      } catch {
        if (!cancelled) setIsSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isPushSupported()) {
      setError('Notifications push non supportées par ce navigateur.');
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);
      if (perm !== 'granted') {
        setError(
          perm === 'denied'
            ? 'Permission refusée. Réactivez les notifications dans les paramètres du navigateur.'
            : 'Permission non accordée.',
        );
        return false;
      }

      const { data } = await api.get<{ enabled: boolean; publicKey: string | null }>(
        '/push/vapid-public-key',
      );
      if (!data?.enabled || !data?.publicKey) {
        setError('Notifications push non configurées côté serveur (VAPID manquant).');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      // If a subscription already exists on this device, reuse it.
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey),
        });
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Invalid subscription payload');
      }

      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
        // Hint plateforme — fournit au backend une détection plus fiable
        // (matchMedia + UA quirks d'iPadOS) que le simple parsing UA.
        platform: detectPlatform(),
      });

      try {
        localStorage.setItem(SUBSCRIBED_KEY, '1');
      } catch {
        /* ignore quota / private mode */
      }
      setIsSubscribed(true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Échec de l'activation des notifications : ${msg}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isPushSupported()) return false;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setIsSubscribed(false);
        return true;
      }
      const endpoint = sub.endpoint;
      try {
        await sub.unsubscribe();
      } catch {
        /* even if browser-side unsub fails, drop the server record */
      }
      try {
        await api.post('/push/unsubscribe', { endpoint });
      } catch {
        /* swallow — best effort */
      }
      try {
        localStorage.removeItem(SUBSCRIBED_KEY);
      } catch {
        /* ignore */
      }
      setIsSubscribed(false);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Échec de la désactivation : ${msg}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { permission, isSubscribed, busy, error, subscribe, unsubscribe };
}
