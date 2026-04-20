'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  ChevronRight,
  Sparkles,
  Shield,
  FileSignature,
  Search,
  Settings,
  Upload,
  History,
  Clock,
  Tag,
  AlertTriangle,
  Key,
  Lock,
  Usb,
  BarChart,
  RefreshCw,
  Rss,
  Smartphone,
  Lightbulb,
  FileCheck,
  MessageSquare,
  BookOpen,
  Keyboard,
  Moon,
  UserCheck,
  ShieldCheck,
  Calendar,
  CalendarCheck,
  HardDrive,
  MessageCircle,
  Bell,
} from 'lucide-react';
import { api } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Tip {
  id: string;
  title: string;
  body: string;
  icon: string;
  targetRoles: string[];
  context: string;
  priority: number;
}

interface TipBannerProps {
  /** Current page context: 'welcome' | 'dashboard' | 'documents' | 'tickets' | 'security' | 'admin' | 'general' */
  context: string;
  /** Current authenticated user role */
  role: string;
}

/* ------------------------------------------------------------------ */
/*  Icon map                                                           */
/* ------------------------------------------------------------------ */

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Shield,
  FileSignature,
  Search,
  Settings,
  Upload,
  History,
  Clock,
  Tag,
  AlertTriangle,
  Key,
  Lock,
  Usb,
  BarChart,
  RefreshCw,
  Rss,
  Smartphone,
  Lightbulb,
  FileCheck,
  MessageSquare,
  BookOpen,
  Keyboard,
  Moon,
  UserCheck,
  ShieldCheck,
  Calendar,
  CalendarCheck,
  HardDrive,
  MessageCircle,
  Bell,
};

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'dismissed_tips';
const FIRST_LOGIN_KEY = 'tips_first_login_done';
const LAST_SHOWN_KEY = 'tips_last_shown';
const MIN_INTERVAL_MS = 30 * 60 * 1000; // Show tips at most once every 30 minutes

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function persistDismissedId(id: string) {
  const ids = getDismissedIds();
  ids.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

/* ------------------------------------------------------------------ */
/*  Auto-rotation interval (ms)                                        */
/* ------------------------------------------------------------------ */

const ROTATION_INTERVAL = 30_000;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TipBanner({ context, role }: TipBannerProps) {
  const [tips, setTips] = useState<Tip[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- Fetch tips from backend ---- */
  const fetchTips = useCallback(async () => {
    try {
      const isFirstLogin = !localStorage.getItem(FIRST_LOGIN_KEY);

      // Throttle: after first login, only show tips once every 30 min
      if (!isFirstLogin) {
        const lastShown = localStorage.getItem(LAST_SHOWN_KEY);
        if (lastShown && Date.now() - parseInt(lastShown) < MIN_INTERVAL_MS) {
          return; // Too soon, skip
        }
      }

      // Determine which contexts to load
      const contexts = isFirstLogin ? ['welcome', context] : [context];
      const uniqueContexts = [...new Set(contexts)];

      const allTips: Tip[] = [];
      for (const ctx of uniqueContexts) {
        const { data } = await api.get<Tip[]>('/tips', {
          params: { context: ctx, role },
        });
        allTips.push(...data);
      }

      // De-duplicate by id and filter out dismissed
      const dismissed = getDismissedIds();
      const seen = new Set<string>();
      const filtered = allTips
        .filter((t) => {
          if (dismissed.has(t.id) || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        })
        .sort((a, b) => b.priority - a.priority);

      if (filtered.length > 0) {
        setTips(filtered);
        setCurrentIndex(0);
        setVisible(true);
        // Small delay so the CSS transition fires
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setSlideIn(true));
        });
      }

      // Mark when tips were last shown
      localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));

      // Mark first login as done after showing welcome tips
      if (isFirstLogin) {
        localStorage.setItem(FIRST_LOGIN_KEY, 'true');
      }
    } catch {
      // Silently fail — tips are not critical
    }
  }, [context, role]);

  useEffect(() => {
    fetchTips();
  }, [fetchTips]);

  /* ---- Auto-rotation timer ---- */
  useEffect(() => {
    if (tips.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tips.length);
    }, ROTATION_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tips.length]);

  /* ---- Handlers ---- */
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (tips.length > 1) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % tips.length);
      }, ROTATION_INTERVAL);
    }
  }, [tips.length]);

  const handleDismiss = useCallback(
    (permanent: boolean) => {
      const tip = tips[currentIndex];
      if (!tip) return;

      if (permanent) {
        persistDismissedId(tip.id);
        // Fire-and-forget server-side dismiss
        api.post(`/tips/${tip.id}/dismiss`).catch(() => {});
      }

      const remaining = tips.filter((_, i) => i !== currentIndex);
      if (remaining.length === 0) {
        setSlideIn(false);
        setTimeout(() => setVisible(false), 300);
        return;
      }
      setTips(remaining);
      setCurrentIndex((prev) => (prev >= remaining.length ? 0 : prev));
      resetTimer();
    },
    [tips, currentIndex, resetTimer],
  );

  const handleNext = useCallback(() => {
    if (tips.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % tips.length);
    resetTimer();
  }, [tips.length, resetTimer]);

  /* ---- Render ---- */
  if (!visible || tips.length === 0) return null;

  const tip = tips[currentIndex];
  if (!tip) return null;

  const IconComp = ICON_MAP[tip.icon] || Lightbulb;

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)]
        transition-all duration-300 ease-out
        ${slideIn ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
      `}
    >
      <div className="rounded-xl border border-seal-navy/10 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header bar */}
        <div className="flex items-center justify-between rounded-t-xl bg-seal-navy px-4 py-2.5 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <IconComp className="h-4 w-4 text-orange-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-white/80">
              Astuce {currentIndex + 1}/{tips.length}
            </span>
          </div>
          <button
            onClick={() => handleDismiss(false)}
            className="rounded p-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/20">
              <IconComp className="h-5 w-5 text-orange-500" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-seal-navy dark:text-white">{tip.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-slate-400">
                {tip.body}
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 dark:border-slate-700">
          <button
            onClick={() => handleDismiss(true)}
            className="text-xs text-gray-400 transition-colors hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            Ne plus afficher
          </button>
          {tips.length > 1 && (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 rounded-md bg-seal-navy/5 px-3 py-1.5 text-xs font-semibold text-seal-navy transition-colors hover:bg-seal-navy/10 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            >
              Suivant
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
