import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectPlatform,
  isStandalone,
  isIosSafari,
  isWebPushSupported,
  getWebPushReadiness,
} from '../platform-detection';

/**
 * Vitest tourne ici en `environment: 'node'` (cf. vitest.config.ts) — les
 * globaux `window` / `navigator` ne sont pas pré-définis. On les stubbe à la
 * main pour chaque cas afin de tester la logique pure sans JSDOM.
 */

type Stubs = {
  window?: Partial<Window>;
  navigator?: Partial<Navigator> & { maxTouchPoints?: number; standalone?: boolean };
};

function stub({ window: w, navigator: n }: Stubs): void {
  if (w) {
    (globalThis as unknown as { window: unknown }).window = w;
  }
  if (n) {
    (globalThis as unknown as { navigator: unknown }).navigator = n;
  }
}

function reset(): void {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).navigator;
}

describe('platform-detection', () => {
  afterEach(() => reset());

  describe('detectPlatform()', () => {
    it('returns "ios" for iPhone UA', () => {
      expect(
        detectPlatform(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15',
        ),
      ).toBe('ios');
    });

    it('returns "ios" for iPad UA', () => {
      expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios');
    });

    it('returns "macos" for desktop Safari', () => {
      expect(
        detectPlatform(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
        ),
      ).toBe('macos');
    });

    it('returns "android" for Android Chrome', () => {
      expect(
        detectPlatform('Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/124.0.0.0'),
      ).toBe('android');
    });

    it('returns "desktop" for Windows Chrome', () => {
      expect(
        detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0'),
      ).toBe('desktop');
    });

    it('returns "unknown" for unrecognized UA', () => {
      expect(detectPlatform('Strange/1.0')).toBe('unknown');
    });

    it('falls back to navigator.userAgent when no UA arg is provided', () => {
      stub({
        window: {} as Window,
        navigator: { userAgent: 'Mozilla/5.0 (iPhone)' } as Navigator,
      });
      expect(detectPlatform()).toBe('ios');
    });
  });

  describe('isStandalone()', () => {
    it('returns false in SSR (no window)', () => {
      reset();
      expect(isStandalone()).toBe(false);
    });

    it('returns true when navigator.standalone is true (iOS)', () => {
      stub({
        window: {} as Window,
        navigator: { userAgent: '', standalone: true } as unknown as Navigator,
      });
      expect(isStandalone()).toBe(true);
    });

    it('returns true when matchMedia(display-mode: standalone) matches', () => {
      const matchMedia = (q: string) => ({ matches: q.includes('standalone'), media: q });
      stub({
        window: { matchMedia } as unknown as Window,
        navigator: { userAgent: '' } as Navigator,
      });
      expect(isStandalone()).toBe(true);
    });

    it('returns false when in browser tab on a non-iOS device', () => {
      stub({
        window: { matchMedia: () => ({ matches: false, media: '' }) } as unknown as Window,
        navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' } as Navigator,
      });
      expect(isStandalone()).toBe(false);
    });
  });

  describe('isIosSafari()', () => {
    it('is true on iPhone', () => {
      stub({
        window: {} as Window,
        navigator: { userAgent: 'Mozilla/5.0 (iPhone)' } as Navigator,
      });
      expect(isIosSafari()).toBe(true);
    });

    it('is false on macOS Safari', () => {
      stub({
        window: {} as Window,
        navigator: { userAgent: 'Mozilla/5.0 (Macintosh)' } as Navigator,
      });
      expect(isIosSafari()).toBe(false);
    });
  });

  describe('isWebPushSupported()', () => {
    it('returns false in SSR', () => {
      reset();
      expect(isWebPushSupported()).toBe(false);
    });

    it('returns true when SW + PushManager + Notification are present', () => {
      stub({
        window: { PushManager: function () {}, Notification: function () {} } as unknown as Window,
        navigator: { userAgent: '', serviceWorker: {} } as unknown as Navigator,
      });
      expect(isWebPushSupported()).toBe(true);
    });

    it('returns false when PushManager is missing (e.g. iOS < 16.4 in tab mode)', () => {
      stub({
        window: { Notification: function () {} } as unknown as Window,
        navigator: { userAgent: '', serviceWorker: {} } as unknown as Navigator,
      });
      expect(isWebPushSupported()).toBe(false);
    });
  });

  describe('getWebPushReadiness()', () => {
    it('returns "ready" on a desktop Chrome with full API', () => {
      stub({
        window: {
          PushManager: function () {},
          Notification: function () {},
          matchMedia: () => ({ matches: false, media: '' }),
        } as unknown as Window,
        navigator: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/124',
          serviceWorker: {},
        } as unknown as Navigator,
      });
      expect(getWebPushReadiness()).toBe('ready');
    });

    it('returns "ios-needs-install" on iOS Safari in browser tab (not standalone)', () => {
      stub({
        window: {
          // iOS 16.4+ exposes the API in tab mode too, but `requestPermission`
          // gates on standalone — we still surface the install hint.
          PushManager: function () {},
          Notification: function () {},
          matchMedia: () => ({ matches: false, media: '' }),
        } as unknown as Window,
        navigator: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari',
          serviceWorker: {},
        } as unknown as Navigator,
      });
      expect(getWebPushReadiness()).toBe('ios-needs-install');
    });

    it('returns "ready" on iOS Safari once the PWA is installed', () => {
      stub({
        window: {
          PushManager: function () {},
          Notification: function () {},
          matchMedia: (q: string) => ({ matches: q.includes('standalone'), media: q }),
        } as unknown as Window,
        navigator: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari',
          serviceWorker: {},
          standalone: true,
        } as unknown as Navigator,
      });
      expect(getWebPushReadiness()).toBe('ready');
    });

    it('returns "unsupported" on a non-iOS browser without the API', () => {
      stub({
        window: { matchMedia: () => ({ matches: false, media: '' }) } as unknown as Window,
        navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Firefox/45' } as Navigator,
      });
      expect(getWebPushReadiness()).toBe('unsupported');
    });
  });
});
