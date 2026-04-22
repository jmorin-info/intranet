'use client';

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 5,
  medium: 10,
  heavy: 20,
  success: [10, 30, 10],
  warning: [15, 40, 15],
  error: [30, 60, 30],
  selection: 3,
};

export function haptic(pattern: HapticPattern = 'light') {
  if (typeof window === 'undefined') return;
  if (!('vibrate' in navigator)) return;
  try {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* noop */
  }
}
