'use client';

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  User as UserIcon,
  Calendar,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { withAuthToken } from '@/lib/media-url';

export interface LightboxItem {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  fileUrl: string;
  thumbnailUrl: string;
  title: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  uploadedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}

interface MediaLightboxProps {
  items: LightboxItem[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

/**
 * Lightbox plein écran pour la médiathèque — vrai focus mode.
 * - Tente le mode Fullscreen natif à l'ouverture (fallback propre sur iOS où
 *   l'API n'est pas dispo sur les éléments génériques)
 * - Image / vidéo remplit tout l'écran (100dvh qui s'ajuste quand la barre
 *   URL mobile se rétracte)
 * - Top bar + bottom bar en overlay sur l'image (plus en sandwich qui volait
 *   de la hauteur) — auto-hide après 3s d'inactivité souris
 * - Raccourcis : ← → Esc F (fullscreen toggle)
 */
export function MediaLightbox({ items, currentIndex, onClose, onNext, onPrev }: MediaLightboxProps) {
  const current = items[currentIndex];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  // --- Fullscreen natif ---
  const enterFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else {
        const webkitFn = (el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
        if (webkitFn) await webkitFn.call(el);
      }
    } catch {
      // iOS Safari sur éléments génériques : l'API est refusée — on vit avec,
      // le layout fullscreen-like (fixed inset-0 + 100dvh) reste propre.
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if ((document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement) {
        await (document as Document & { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen?.();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // --- Auto-hide controls après 3s d'inactivité ---
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // --- Clavier ---
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFullscreen) {
          exitFullscreen();
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); showControls(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); showControls(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
    },
    [onClose, onNext, onPrev, toggleFullscreen, isFullscreen, exitFullscreen, showControls],
  );

  // --- Effets d'initialisation ---
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    // Tente l'entrée en fullscreen dès l'ouverture (best-effort)
    enterFullscreen();

    // Listener pour synchroniser l'état avec le Fullscreen API
    const onFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;
      setIsFullscreen(Boolean(fsEl));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    scheduleHide();

    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.body.style.overflow = '';
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      // Sort du fullscreen quand la lightbox se démonte
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Re-schedule hide quand on change d'image (on montre les controls)
    showControls();
  }, [currentIndex, showControls]);

  if (!current) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const controlsClass = `transition-opacity duration-300 ${
    controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
  }`;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Visualisation média"
      style={{ height: '100dvh', width: '100dvw' }}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {/* Zone média : prend toute la surface */}
      <div className="absolute inset-0 flex items-center justify-center">
        {current.type === 'IMAGE' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={withAuthToken(current.fileUrl)}
            alt={current.title ?? ''}
            className="object-contain"
            style={{ maxHeight: '100dvh', maxWidth: '100dvw' }}
            draggable={false}
            onClick={toggleFullscreen}
          />
        ) : (
          <video
            key={current.id}
            src={withAuthToken(current.fileUrl)}
            poster={withAuthToken(current.thumbnailUrl)}
            controls
            autoPlay
            playsInline
            className="object-contain"
            style={{ maxHeight: '100dvh', maxWidth: '100dvw' }}
          />
        )}
      </div>

      {/* Top bar — overlay, auto-hide */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 sm:px-6 py-3 ${controlsClass}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] uppercase font-semibold tracking-widest text-white/60 whitespace-nowrap">
              {currentIndex + 1} / {items.length}
            </span>
            {current.title && (
              <h2 className="text-sm font-semibold text-white truncate">{current.title}</h2>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <a
              href={withAuthToken(current.fileUrl.replace('/file', '/download'))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 text-xs font-semibold transition-colors"
              title="Télécharger"
            >
              <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Télécharger</span>
            </a>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-lg p-2 text-white/70 hover:text-white hover:bg-white/10 transition"
              aria-label={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}
              title={isFullscreen ? 'Quitter plein écran (F)' : 'Plein écran (F)'}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-white/70 hover:text-white hover:bg-white/10 transition"
              aria-label="Fermer"
              title="Fermer (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className={`absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white h-12 w-12 flex items-center justify-center transition backdrop-blur-sm ${controlsClass}`}
          aria-label="Précédent"
          title="Précédent (←)"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className={`absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white h-12 w-12 flex items-center justify-center transition backdrop-blur-sm ${controlsClass}`}
          aria-label="Suivant"
          title="Suivant (→)"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Bottom bar metadata — overlay, auto-hide */}
      {(current.description || current.uploadedBy) && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 sm:px-6 py-3 ${controlsClass}`}
        >
          <div className="flex items-start justify-between gap-4 max-w-5xl mx-auto">
            <div className="flex-1 min-w-0">
              {current.description && (
                <p className="text-sm text-white/80 line-clamp-2">{current.description}</p>
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-white/50 flex-shrink-0">
              {current.uploadedBy && (
                <span className="flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  {current.uploadedBy.firstName} {current.uploadedBy.lastName}
                </span>
              )}
              {current.createdAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(current.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
