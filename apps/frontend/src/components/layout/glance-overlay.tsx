"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Maximize2, Eye, Columns2 } from "lucide-react";
import { useGlanceStore } from "@/stores/glance-store";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useGlanceTrigger } from "@/hooks/use-glance-trigger";

/**
 * GlanceOverlay — aperçu rapide Zen-Browser-style d'un lien interne.
 *
 * Comportement :
 *   - Alt+Clic sur un <a href="..."> interne → ouvre Glance en mode normal
 *   - Sur page épinglée, click standard sur lien externe au hub → auto Glance
 *   - Bouton "Split" → mode 50/50 (page d'origine + cible) avec drag-handle
 *   - Escape, clic backdrop, ou bouton × → ferme
 *   - Bouton "ouvrir dans un onglet" → window.open
 *   - Bouton "étendre" → router.push
 *   - Badge "Alt+Click Glance" affiché au hover d'un lien si Alt maintenu
 *
 * Technique : iframes same-origin (cookies de session passent, auth OK).
 * Mounted une seule fois dans le layout (app). Les listeners de déclenchement
 * sont externalisés dans `useGlanceTrigger` (capture phase, AVANT FocusMode).
 *
 * Accessibilité : focus trap WCAG-AA via `useFocusTrap`, aria-modal,
 * aria-labelledby, focus restoration au close.
 */

// --- helpers --------------------------------------------------------------

/** Pour le hint badge : valide qu'un <a> est un lien interne navigable. */
function isInternalLink(a: HTMLAnchorElement): boolean {
  if (!a.href) return false;
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;

  let url: URL;
  try {
    url = new URL(a.href, window.location.origin);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return true;
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
      const target = (e.target as HTMLElement | null)?.closest?.(
        "a",
      ) as HTMLAnchorElement | null;
      if (target && isInternalLink(target)) {
        lastTarget = target;
      } else {
        lastTarget = null;
      }
      updateHint();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        altDown = true;
        updateHint();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        altDown = false;
        setHint(null);
      }
    };
    const onBlur = () => {
      altDown = false;
      setHint(null);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);

  return hint;
}

// --- Main component -------------------------------------------------------

export function GlanceOverlay() {
  const router = useRouter();
  const enabled = useGlanceStore((s) => s.enabled);
  const url = useGlanceStore((s) => s.url);
  const baseUrl = useGlanceStore((s) => s.baseUrl);
  const mode = useGlanceStore((s) => s.mode);
  const origin = useGlanceStore((s) => s.origin);
  const splitRatio = useGlanceStore((s) => s.splitRatio);
  const setSplitRatio = useGlanceStore((s) => s.setSplitRatio);
  const openSplit = useGlanceStore((s) => s.openSplit);
  const toNormal = useGlanceStore((s) => s.toNormal);
  const close = useGlanceStore((s) => s.close);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Brancher le hook de déclenchement (Alt+Clic + auto sur pages épinglées)
  useGlanceTrigger();

  // Bloque le scroll de la page pendant que Glance est ouvert
  useEffect(() => {
    if (!url) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [url]);

  const openInTab = useCallback(() => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const expandToPage = useCallback(() => {
    if (!url) return;
    const target = url;
    close();
    router.push(target);
  }, [url, close, router]);

  const enterSplit = useCallback(() => {
    if (!url) return;
    const currentBase =
      window.location.pathname + window.location.search + window.location.hash;
    openSplit(url, currentBase, origin);
  }, [url, origin, openSplit]);

  const closeFromSplit = useCallback(() => {
    // En mode split, le bouton Close revient au mode normal Glance
    toNormal();
  }, [toNormal]);

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

      {url && mode === "normal" && (
        <GlancePanelNormal
          url={url}
          origin={origin}
          onClose={close}
          onOpenInTab={openInTab}
          onExpand={expandToPage}
          onSplit={enterSplit}
        />
      )}

      {url && mode === "split" && baseUrl && (
        <GlanceSplitView
          baseUrl={baseUrl}
          targetUrl={url}
          origin={origin}
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          onClose={closeFromSplit}
          onOpenInTab={openInTab}
          onExpand={expandToPage}
          onFullClose={close}
        />
      )}
    </>,
    document.body,
  );
}

// --- Toolbar (factorisée) -------------------------------------------------

interface ToolbarProps {
  url: string;
  labelId: string;
  onClose: () => void;
  onOpenInTab: () => void;
  onExpand: () => void;
  onSplit?: () => void;
  splitActive?: boolean;
  closeLabel?: string;
}

function GlanceToolbar({
  url,
  labelId,
  onClose,
  onOpenInTab,
  onExpand,
  onSplit,
  splitActive = false,
  closeLabel,
}: ToolbarProps) {
  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-slate-700 shadow-lg backdrop-blur-sm px-1.5 py-1">
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel ?? "Fermer l'aperçu (Esc)"}
        title={closeLabel ?? "Fermer (Esc)"}
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
      {onSplit && (
        <button
          type="button"
          onClick={onSplit}
          aria-label="Vue partagée 50/50"
          aria-pressed={splitActive}
          title="Vue partagée (Split)"
          className={[
            "flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            splitActive
              ? "bg-seal-orange/15 text-seal-orange"
              : "text-seal-gray-500 hover:bg-seal-orange/10 hover:text-seal-orange dark:text-slate-400 dark:hover:bg-seal-orange/20 dark:hover:text-seal-orange",
          ].join(" ")}
        >
          <Columns2 className="h-4 w-4" />
        </button>
      )}
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
        <span
          id={labelId}
          className="text-[11px] font-semibold text-seal-navy dark:text-white"
        >
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
  );
}

// --- GlancePanelNormal ----------------------------------------------------

interface GlancePanelNormalProps {
  url: string;
  origin: { x: number; y: number } | null;
  onClose: () => void;
  onOpenInTab: () => void;
  onExpand: () => void;
  onSplit: () => void;
}

function GlancePanelNormal({
  url,
  origin,
  onClose,
  onOpenInTab,
  onExpand,
  onSplit,
}: GlancePanelNormalProps) {
  const labelId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(true, { onEscape: onClose });

  // Position de départ (pour effet "sort du curseur")
  const originStyle = origin
    ? ({
        ["--glance-origin-x" as string]: `${origin.x}px`,
        ["--glance-origin-y" as string]: `${origin.y}px`,
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
        aria-labelledby={labelId}
        tabIndex={-1}
        className="glance-panel relative w-[80vw] max-w-[1600px] h-[80vh] max-h-[1100px] rounded-2xl bg-white dark:bg-slate-900 shadow-[0_40px_80px_-12px_rgba(0,68,105,0.55)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <GlanceToolbar
          url={url}
          labelId={labelId}
          onClose={onClose}
          onOpenInTab={onOpenInTab}
          onExpand={onExpand}
          onSplit={onSplit}
        />

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

// --- GlanceSplitView ------------------------------------------------------

interface GlanceSplitViewProps {
  baseUrl: string;
  targetUrl: string;
  origin: { x: number; y: number } | null;
  ratio: number;
  onRatioChange: (r: number) => void;
  /** Bouton « X » du panneau cible : revient au mode normal Glance. */
  onClose: () => void;
  onOpenInTab: () => void;
  /** Bouton « expand » : pousse la cible en pleine page (router.push). */
  onExpand: () => void;
  /** Esc / clic backdrop : ferme totalement Glance (pas juste le mode split). */
  onFullClose: () => void;
}

function GlanceSplitView({
  baseUrl,
  targetUrl,
  origin,
  ratio,
  onRatioChange,
  onClose,
  onOpenInTab,
  onExpand,
  onFullClose,
}: GlanceSplitViewProps) {
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(true, {
    onEscape: onFullClose,
  });
  const [dragging, setDragging] = useState(false);

  // Position de départ pour l'animation (depuis le curseur)
  const originStyle = origin
    ? ({
        ["--glance-origin-x" as string]: `${origin.x}px`,
        ["--glance-origin-y" as string]: `${origin.y}px`,
      } as React.CSSProperties)
    : undefined;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging) return;
      const c = containerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      if (rect.width === 0) return;
      const r = (e.clientX - rect.left) / rect.width;
      onRatioChange(r);
    },
    [dragging, onRatioChange],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDragging(false);
    },
    [],
  );

  // Permettre l'ajustement clavier sur le handle (a11y)
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onRatioChange(ratio - step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onRatioChange(ratio + step);
      } else if (e.key === "Home") {
        e.preventDefault();
        onRatioChange(0.2);
      } else if (e.key === "End") {
        e.preventDefault();
        onRatioChange(0.8);
      } else if (
        e.key === "0" ||
        e.key === "Enter" ||
        (e.key === " " && !e.repeat)
      ) {
        e.preventDefault();
        onRatioChange(0.5);
      }
    },
    [ratio, onRatioChange],
  );

  const leftPct = Math.round(ratio * 1000) / 10;
  const rightPct = 100 - leftPct;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-6"
      style={originStyle}
    >
      {/* Backdrop : Esc/click ferme tout */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px] animate-[fadeIn_0.2s_ease-out]"
        onClick={onFullClose}
        aria-hidden="true"
      />

      {/* Container split (animation glanceIn héritée de .glance-panel) */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className="glance-panel glance-split relative w-[94vw] max-w-[1800px] h-[88vh] max-h-[1200px] rounded-2xl bg-white dark:bg-slate-900 shadow-[0_40px_80px_-12px_rgba(0,68,105,0.55)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {/* Toolbar (cible). Bouton X = revenir au mode normal. */}
        <GlanceToolbar
          url={targetUrl}
          labelId={labelId}
          onClose={onClose}
          onOpenInTab={onOpenInTab}
          onExpand={onExpand}
          onSplit={onClose}
          splitActive
          closeLabel="Quitter le mode split"
        />

        <div
          ref={containerRef}
          className={[
            "flex h-full w-full",
            dragging ? "select-none cursor-col-resize" : "",
          ].join(" ")}
        >
          {/* Pane gauche : page d'origine */}
          <div
            className="relative h-full overflow-hidden bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800"
            style={{ width: `${leftPct}%` }}
            aria-label="Page d'origine"
          >
            <iframe
              src={baseUrl}
              title="Page d'origine (Glance Split)"
              className="h-full w-full border-0 bg-white dark:bg-slate-900"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              referrerPolicy="same-origin"
              // Désactive les events pendant le drag pour que le pointer ne soit
              // pas capturé par l'iframe et perdre le tracking de la souris.
              style={dragging ? { pointerEvents: "none" } : undefined}
            />
          </div>

          {/* Drag-handle */}
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner la vue partagée"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={leftPct}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onHandleKeyDown}
            className={[
              "group relative flex h-full w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-seal-orange/30 dark:bg-slate-800 dark:hover:bg-seal-orange/40 transition-colors focus-visible:outline-none focus-visible:bg-seal-orange/40",
              dragging ? "bg-seal-orange/60 dark:bg-seal-orange/60" : "",
            ].join(" ")}
            // Désactive le focus ring inutile en idle
            tabIndex={0}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inline-block h-10 w-1 rounded-full bg-seal-gray-300 group-hover:bg-seal-orange transition-colors"
            />
          </button>

          {/* Pane droit : URL cible */}
          <div
            className="relative h-full overflow-hidden bg-white dark:bg-slate-900"
            style={{ width: `${rightPct}%` }}
            aria-label="Page cible"
          >
            <iframe
              src={targetUrl}
              title="Aperçu Glance (cible)"
              className="h-full w-full border-0 bg-white dark:bg-slate-900"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              referrerPolicy="same-origin"
              style={dragging ? { pointerEvents: "none" } : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
