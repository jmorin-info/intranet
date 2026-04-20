'use client';

import { useEffect, useState } from 'react';

export interface NetworkStatus {
  /** True if the browser currently reports an online connection. */
  online: boolean;
  /** Timestamp of the last status change (ms since epoch). */
  since: number;
  /** True if we observed an offline state at least once during this session. */
  wasOffline: boolean;
}

/**
 * React hook exposing the browser's online/offline state.
 *
 * Uses `navigator.onLine` + `online`/`offline` window events. SSR-safe:
 * assumes online on the server, then reconciles on mount.
 */
export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<NetworkStatus>(() => ({
    online: true,
    since: typeof Date !== 'undefined' ? Date.now() : 0,
    wasOffline: false,
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialOnline =
      typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true;

    setState((prev) => ({
      online: initialOnline,
      since: Date.now(),
      wasOffline: prev.wasOffline || !initialOnline,
    }));

    const handleOnline = () => {
      setState((prev) => ({
        online: true,
        since: Date.now(),
        wasOffline: prev.wasOffline,
      }));
    };

    const handleOffline = () => {
      setState(() => ({
        online: false,
        since: Date.now(),
        wasOffline: true,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return state;
}
