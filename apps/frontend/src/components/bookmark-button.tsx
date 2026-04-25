'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const STORAGE_KEY = 'omnitech_bookmarks';

export interface BookmarkItem {
  type: 'document' | 'wiki' | 'news';
  id: string;
  title: string;
  href: string;
}

export function getBookmarks(): BookmarkItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleBookmark(item: BookmarkItem): boolean {
  const bookmarks = getBookmarks();
  const idx = bookmarks.findIndex((b) => b.type === item.type && b.id === item.id);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    window.dispatchEvent(new Event('bookmarks-changed'));
    return false;
  } else {
    bookmarks.unshift(item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks.slice(0, 50)));
    window.dispatchEvent(new Event('bookmarks-changed'));
    return true;
  }
}

export function isBookmarked(type: string, id: string): boolean {
  return getBookmarks().some((b) => b.type === type && b.id === id);
}

interface BookmarkButtonProps {
  type: 'document' | 'wiki' | 'news';
  id: string;
  title: string;
  href: string;
  className?: string;
}

export function BookmarkButton({ type, id, title, href, className = '' }: BookmarkButtonProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);

  const sync = useCallback(() => {
    setActive(isBookmarked(type, id));
  }, [type, id]);

  useEffect(() => {
    sync();
    window.addEventListener('bookmarks-changed', sync);
    return () => window.removeEventListener('bookmarks-changed', sync);
  }, [sync]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nowActive = toggleBookmark({ type, id, title, href });
    setActive(nowActive);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-lg p-1.5 transition hover:bg-gray-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`}
      title={active ? t('component.bookmark.remove') : t('component.bookmark.add')}
      aria-label={active ? t('component.bookmark.remove') : t('component.bookmark.add')}
      aria-pressed={active}
    >
      <Star
        aria-hidden="true"
        className={`h-4 w-4 transition ${
          active
            ? 'fill-amber-400 text-amber-400'
            : 'text-seal-gray-500 dark:text-slate-400 hover:text-amber-400'
        }`}
      />
    </button>
  );
}
