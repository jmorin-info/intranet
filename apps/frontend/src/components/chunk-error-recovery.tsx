"use client";

/**
 * ChunkErrorRecovery
 * ==================
 *
 * Après un rebuild Next.js, les onglets déjà ouverts référencent d'anciens
 * artefacts qui n'existent plus côté serveur. Le navigateur lève alors :
 *
 *   - `ChunkLoadError: Loading chunk 5007 failed`
 *   - `Loading CSS chunk 123 failed`
 *   - `Failed to find Server Action "<hash>"` (App Router, après rebuild)
 *
 * Ce composant attrape ces erreurs et effectue **un** reload dur (avec un
 * query param `?_r=ts` pour casser le cache HTTP). Le reload est limité à
 * une fois par session via `sessionStorage` pour éviter les boucles.
 */

import { useEffect } from "react";

const RECOVERY_KEY = "omnitech:chunk-recovery-at";
const COOLDOWN_MS = 60_000;

function isChunkError(msg: unknown): boolean {
  if (typeof msg !== "string") return false;
  return (
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk [\w-]+ failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Failed to find Server Action/i.test(msg)
  );
}

function shouldRecover(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_KEY) || "0");
    return Date.now() - last > COOLDOWN_MS;
  } catch {
    return true;
  }
}

function recover() {
  try {
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  try {
    // Kill service worker caches so old chunks don't come back.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.update());
      });
    }
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

export function ChunkErrorRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkError(event.message) || isChunkError(event.error?.message)) {
        if (shouldRecover()) recover();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason?.message || reason?.toString?.() || "";
      if (isChunkError(msg)) {
        if (shouldRecover()) recover();
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

export default ChunkErrorRecovery;
