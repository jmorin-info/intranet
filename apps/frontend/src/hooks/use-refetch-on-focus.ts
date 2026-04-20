'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Refetches data when:
 * 1. Browser tab regains focus (visibilitychange / window.focus)
 * 2. Component re-mounts after soft navigation (pathname changed and returned)
 *
 * Throttled: won't refetch more than once per `minInterval` ms (default 5s).
 */

// Global timestamp per pathname — survives component unmounts during soft navigation.
const lastFetchByPath = new Map<string, number>();

export function useRefetchOnFocus(refetch: () => void, minInterval = 5_000) {
  const lastFetchRef = useRef(Date.now());
  const pathname = usePathname();

  // On mount: refetch if we've been away from this page long enough
  useEffect(() => {
    const lastVisit = lastFetchByPath.get(pathname) ?? 0;
    if (Date.now() - lastVisit > minInterval) {
      // Don't refetch on very first mount (initial data load handles that)
      if (lastVisit > 0) {
        lastFetchRef.current = Date.now();
        lastFetchByPath.set(pathname, Date.now());
        refetch();
      } else {
        lastFetchByPath.set(pathname, Date.now());
      }
    }
    return () => {
      // Record when we leave this page
      lastFetchByPath.set(pathname, Date.now());
    };
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab/window focus: refetch when returning from another tab
  useEffect(() => {
    const throttledRefetch = () => {
      if (Date.now() - lastFetchRef.current < minInterval) return;
      lastFetchRef.current = Date.now();
      lastFetchByPath.set(pathname, Date.now());
      refetch();
    };

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') throttledRefetch();
    };

    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('focus', throttledRefetch);
    return () => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.removeEventListener('focus', throttledRefetch);
    };
  }, [refetch, minInterval, pathname]);
}
