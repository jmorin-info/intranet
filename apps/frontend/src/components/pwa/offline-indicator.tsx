'use client';

import React from 'react';
import { WifiOff, Wifi, Database } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { isServingFromCache, onCacheStatusChange } from '@/lib/offline-cache';

/**
 * Thin, non-blocking banner that slides in at the top of the viewport
 * when the browser goes offline. When connectivity is restored, shows
 * a transient "back online" confirmation for 3s.
 *
 * Also shows a "cached data" badge when IndexedDB data is being served.
 */
export function OfflineIndicator() {
  const { online, wasOffline } = useNetworkStatus();
  const [showBackOnline, setShowBackOnline] = React.useState(false);
  const [fromCache, setFromCache] = React.useState(isServingFromCache);

  React.useEffect(() => {
    return onCacheStatusChange(setFromCache);
  }, []);

  React.useEffect(() => {
    if (online && wasOffline) {
      setShowBackOnline(true);
      const t = setTimeout(() => setShowBackOnline(false), 3000);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline]);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-white bg-[color:var(--seal-bordeaux,#892034)] shadow-md animate-in slide-in-from-top-2 duration-200"
      >
        <WifiOff className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>
          {fromCache
            ? 'Mode hors ligne \u2014 donn\u00e9es en cache'
            : 'Mode hors ligne \u2014 certaines actions sont mises en file d\u2019attente'}
        </span>
        {fromCache && (
          <Database className="h-3.5 w-3.5 flex-shrink-0 opacity-70" aria-hidden="true" />
        )}
      </div>
    );
  }

  if (fromCache) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-white bg-[color:var(--seal-taupe,#8b7d6b)] shadow-md animate-in slide-in-from-top-2 duration-200"
      >
        <Database className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>Données hors ligne</span>
      </div>
    );
  }

  if (showBackOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-white bg-[color:var(--seal-green,#006233)] shadow-md animate-in slide-in-from-top-2 duration-200"
      >
        <Wifi className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>Connexion retablie</span>
      </div>
    );
  }

  return null;
}
