'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface RecentPage {
  path: string;
  title: string;
  visitedAt: number;
}

const STORAGE_KEY = 'omnitech:recent-pages';
const MAX_ENTRIES = 10;

const BLOCKED_PREFIXES = [
  '/login',
  '/logout',
  '/mfa',
  '/reset-password',
  '/forgot-password',
  '/offline',
  '/maintenance',
  '/chartes',
  '/auth',
  '/error',
  '/404',
  '/500',
  '/not-found',
  '/en-construction',
];

const BLOCKED_EXACT = new Set<string>(['/', '/dashboard']);

export function isTrackablePath(path: string): boolean {
  if (!path) return false;
  if (BLOCKED_EXACT.has(path)) return false;
  return !BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

function readStorage(): RecentPage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: RecentPage[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(entries) }),
    );
  } catch {
    // quota dépassé ou mode privé — silencieux
  }
}

export function useTrackPageVisit(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isTrackablePath(pathname)) return;

    const niceTitle =
      typeof document !== 'undefined' && document.title
        ? document.title.replace(/\s*[—|-]\s*OMNITECH.*$/i, '').trim()
        : pathname.replace(/^\//, '').replace(/\//g, ' › ');

    const entry: RecentPage = {
      path: pathname,
      title: niceTitle || pathname,
      visitedAt: Date.now(),
    };

    const existing = readStorage();
    const deduped = existing.filter((e) => e.path !== entry.path);
    const next = [entry, ...deduped].slice(0, MAX_ENTRIES);
    writeStorage(next);
  }, [pathname]);
}

export function useRecentPages(): RecentPage[] {
  const [pages, setPages] = useState<RecentPage[]>([]);

  useEffect(() => {
    setPages(readStorage());
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPages(readStorage());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return pages;
}

export function clearRecentPages(): void {
  writeStorage([]);
}
