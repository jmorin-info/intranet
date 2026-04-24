'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X, ExternalLink, Maximize2, Eye } from 'lucide-react';
import { useGlanceStore } from '@/stores/glance-store';

/**
 * GlanceOverlay — aperçu rapide Zen-Browser-style d'un lien interne.
 *
 * Comportement :
 *   - Alt+Clic sur un <a href="..."> interne → ouvre le panneau Glance
 *   - Escape ou clic extérieur ou bouton × → ferme
 *   - Bouton "ouvrir dans un onglet" → window.open
 *   - Bouton "étendre" → router.push (promeut le Glance en page courante)
 *   - Badge "Alt+Click Glance" affiché au hover d'un lien si Alt maintenu
 *
 * Technique : iframe same-origin (cookies de session passent, auth OK).
 * Le composant est mounté une seule fois dans le layout (app) et s'enregistre
 * en capture phase AVANT FocusMode pour intercepter les clics sur <a> avant
 * le focus-element de FocusMode.
 *
 * Conflit avec FocusMode :
 *   FocusMode intercepte aussi Alt+Click pour zoomer une carte. Quand la cible
 *   est un <a href> interne, on veut Glance. On preventDefault +
 *   stopImmediatePropagation dans notre handler capture pour couper FocusMode.
 *   FocusMode skippe déjà le clic via son propre guard lorsque preventDefault
 *   a été appelé avant son tour de capture.
 */

// --- helpers --------------------------------------------------------------

/** Un `<a href>` interne : même origine ou chemin relatif, ET pas de target=_blank /
 * download. Renvoie l'URL absolue si c'est un lien intranet, sinon null. */
function resolveInternalHref(a: HTMLAnchorElement): string | null {
  if (!a.href) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.hasAttribute('download')) return null;

  let url: URL;
  try {
    url = new URL(a.href, window.location.origin);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) return null;

  // Exclure certains patterns (téléchargements API, fichiers bruts…)
  if (url.pathname.startsWith('/api/')) return null;

  // Exclure hash-only sur la même page
  const sameDoc =
    url.pathname === window.location.pathname &&
    url.search === window.location.search;
  if (sameDoc && url.hash) return null;

  return url.pathname + url.search + url.hash;
}

// --- Hint badge (hover + Alt) --------------------------------------------

function useHoverHint(enabled: boolean) {
  const [hint, setHint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let altDown = false;
    let lastTarget: HTMLAnchorElement | null = null;
    let lastPos = { x: 0, y: 0 };

    const updateHint = () => {
      if (altDown && lastTarget) {
        setHint({ x: lastPos.x, y: lastPos.y });
      } else {
        setHint(null);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      lastPos = { x: e.clientX, y: e.clientY };
      const target = (e.target as HTMLElement | null)?.closest?.('a') as
        | HTMLAnchorElement
        | null;
      if (target && resolveInternalHref(target)) {
        lastTarget = target;
      } else {
        lastTarget = null;
      }
      updateHint();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altDown = true;
        updateHint();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altDown = false;
        setHint(null);
      }
    };
    const onBlur = () => {
      altDown = false;
      setHint(null);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);

  return hint;
}

// --- Main component -------------------------------------------------------

export function GlanceOverlay() {
  const router = useRouter();
  const enabled = useGlanceStore((s) => s.enabled);
  const url = useGlanceStore((s) => s.url);
  const origin = useGlanceStore((s) => s.origin);
  const open = useGlanceStore((s) => s.open);
  const close = useGlanceStore((s) => s.close);

  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Intercept Alt+Click sur les liens internes ---------------------------
  useEffect(() => {
    if (!enabled) return;

    const onClick = (e: MouseEvent) => {
      if (!e.altKey) return;
      // Ignorer les modificateurs supplémentaires (Ctrl/Meta/Shift) →
      // l'utilisateur veut probablement un nouvel onglet natif.
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.button !== 0) return;

      const target = (e.target as HTMLElement | null)?.closest?.('a') as
        | HTMLAnchorElement
        | null;
      if (!target) return;

      const href = resolveInternalHref(target);
      if (!href) return;

      // On prend la main avant FocusMode (capture phase, registered earlier).
      e.preventDefault();
      e.stopImmediatePropagation();
      open(href, { x: e.clientX, y: e.clientY });
    };

    window.addEventListener('click', onClick, { capture: true });
    return () =>
      window.removeEventListener('click', onClick, {
        capture: true,
      } as EventListenerOptions);
  }, [enabled, open]);

  // Escape ferme + focus trap minimaliste --------------------------------
  useEffect(() => {
    if (!url) return;

    previousFocus.current = document.activeElement as HTMLElement | null;
    // Focus le panneau (pour que Escape fonctionne même sans clic)
    requestAnimationFrame(() => {
      panelRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };

    // Bloque le scroll de la page pendant que Glance est ouvert
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, {
        capture: true,
      } as EventListenerOptions);
      document.body.style.overflow = prevOverflow;
      previousFocus.current?.focus?.();
    };
  }, [url, close]);

  const openInTab = useCallback(() => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  const expandToPage = useCallback(() => {
    if (!url) return;
    const target = url;
    close();
    router.push(target);
  }, [url, close, router]);

  const hint = useHoverHint(enabled && !url);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Hint badge: "Alt+Click" à côté du curseur sur un lien interne */}
      {hint && (
        <div
          role="presentation"
          aria-hidden="true"
          className="glance-hint pointer-events-none fixed z-[9997] flex items-center gap-1 rounded-md bg-seal-navy/95 px-2 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(hint.x + 14, window.innerWidth - 160),
            top: Math.min(hint.y + 18, window.innerHeight - 32),
          }}
        >
          <Eye className="h-3 w-3 text-seal-orange" aria-hidden="true" />
          <span>Glance · Alt+Clic</span>
        </div>
      )}

      {url && (
        <GlancePanel
          url={url}
          origin={origin}
          panelRef={panelRef}
          onClose={close}
          onOpenInTab={openInTab}
          onExpand={expandToPage}
        />
      )}
    </>,
    document.body,
  );
}

// --- Panel ----------------------------------------------------------------

interface GlancePanelProps {
  url: string;
  origin: { x: number; y: number } | null;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onOpenInTab: () => void;
  onExpand: () => void;
}

function GlancePanel({
  url,
  origin,
  panelRef,
  onClose,
  onOpenInTab,
  onExpand,
}: GlancePanelProps) {
  // Position de départ (pour effet "sort du curseur")
  const originStyle = origin
    ? ({
        ['--glance-origin-x' as string]: `${origin.x}px`,
        ['--glance-origin-y' as string]: `${origin.y}px`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-8"
      style={originStyle}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px] animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Aperçu Glance"
        tabIndex={-1}
        className="glance-panel relative w-[80vw] max-w-[1600px] h-[80vh] max-h-[1100px] rounded-2xl bg-white dark:bg-slate-900 shadow-[0_40px_80px_-12px_rgba(0,68,105,0.55)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {/* Toolbar — top-left */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-slate-700 shadow-lg backdrop-blur-sm px-1.5 py-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l'aperçu (Esc)"
            title="Fermer (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-full text-seal-gray-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onOpenInTab}
            aria-label="Ouvrir dans un nouvel onglet"
            title="Ouvrir dans un nouvel onglet"
            className="flex h-7 w-7 items-center justify-center rounded-full text-seal-gray-500 hover:bg-seal-blue/10 hover:text-seal-blue dark:text-slate-400 dark:hover:bg-seal-blue/20 dark:hover:text-seal-blue transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onExpand}
            aria-label="Étendre en page courante"
            title="Étendre (remplacer la page)"
            className="flex h-7 w-7 items-center justify-center rounded-full text-seal-gray-500 hover:bg-seal-orange/10 hover:text-seal-orange dark:text-slate-400 dark:hover:bg-seal-orange/20 dark:hover:text-seal-orange transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="ml-1 flex items-center gap-1 border-l border-gray-200 dark:border-slate-700 pl-2 pr-1.5">
            <Eye className="h-3 w-3 text-seal-orange" aria-hidden="true" />
            <span className="text-[11px] font-semibold text-seal-navy dark:text-white">
              Glance
            </span>
            <span
              className="ml-1 max-w-[260px] truncate text-[11px] text-seal-gray-500 dark:text-slate-400 font-mono"
              title={url}
            >
              {url}
            </span>
          </div>
        </div>

        {/* Iframe — same-origin, partage les cookies de session */}
        <iframe
          src={url}
          title="Aperçu Glance"
          className="h-full w-full border-0 bg-white dark:bg-slate-900"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          referrerPolicy="same-origin"
        />
      </div>
    </div>
  );
}
