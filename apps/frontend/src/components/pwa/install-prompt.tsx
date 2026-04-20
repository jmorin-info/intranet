'use client';

import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const STORAGE_KEY = 'omnitech.pwa.install.dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Discreet banner proposing PWA installation.
 * Listens for the browser's `beforeinstallprompt` event.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Listen for SW updates and reload on controller change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const onControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  // Detect waiting SW and show update toast
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        showUpdateToast(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(newWorker);
          }
        });
      });
    });
  }, []);

  function showUpdateToast(worker: ServiceWorker) {
    // Create a simple toast for SW update
    const existing = document.getElementById('omnitech-sw-update-toast');
    if (existing) return;

    const toast = document.createElement('div');
    toast.id = 'omnitech-sw-update-toast';
    toast.style.cssText =
      'position:fixed;top:1rem;right:1rem;z-index:9999;background:#004469;color:#fff;padding:0.75rem 1rem;border-radius:0.5rem;font-size:0.875rem;font-family:inherit;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    toast.textContent = 'Mise à jour disponible — cliquez pour actualiser';
    toast.addEventListener('click', () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
      toast.remove();
    });
    // Append outside React's managed tree to avoid "insertBefore" reconciliation errors
    (document.getElementById('__app')?.parentElement || document.body).appendChild(toast);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    sessionStorage.setItem(STORAGE_KEY, '1');
    setDeferredPrompt(null);
    setVisible(false);
  }

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-full max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20 flex-shrink-0">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-seal-navy dark:text-white">Installer OMNITECH</p>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
            Installez l&apos;application pour un acces rapide depuis votre ecran d&apos;accueil.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={install}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              Installer
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-medium px-3 py-1.5 rounded-md text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-seal-gray-500 dark:text-slate-500 hover:text-seal-navy dark:hover:text-white p-1 -mr-1 -mt-1"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
