'use client';

import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, User as UserIcon, Calendar } from 'lucide-react';
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
 * Lightbox plein écran pour la médiathèque.
 * - Navigation clavier ← → Esc
 * - Download direct via endpoint /items/:id/download
 * - Vidéos HTML5 natives avec controls
 * - Overlay infos (titre, description, auteur, date)
 */
export function MediaLightbox({ items, currentIndex, onClose, onNext, onPrev }: MediaLightboxProps) {
  const current = items[currentIndex];

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
  }, [onClose, onNext, onPrev]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  if (!current) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Visualisation média"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] uppercase font-semibold tracking-widest text-white/50">
            {currentIndex + 1} / {items.length}
          </span>
          {current.title && (
            <h2 className="text-sm font-semibold text-white truncate">{current.title}</h2>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={withAuthToken(current.fileUrl.replace('/file', '/download'))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 text-xs font-semibold transition-colors"
            title="Télécharger"
          >
            <Download className="h-3.5 w-3.5" /> Télécharger
          </a>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/70 hover:text-white hover:bg-white/10 transition"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main display */}
      <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8 select-none">
        {/* Prev arrow */}
        {hasPrev && (
          <button
            onClick={onPrev}
            className="absolute left-2 sm:left-6 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white h-12 w-12 flex items-center justify-center transition"
            aria-label="Précédent"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={onNext}
            className="absolute right-2 sm:right-6 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white h-12 w-12 flex items-center justify-center transition"
            aria-label="Suivant"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {current.type === 'IMAGE' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={withAuthToken(current.fileUrl)}
            alt={current.title ?? ''}
            className="max-h-full max-w-full object-contain shadow-2xl"
            draggable={false}
          />
        ) : (
          <video
            key={current.id}
            src={withAuthToken(current.fileUrl)}
            poster={withAuthToken(current.thumbnailUrl)}
            controls
            autoPlay
            className="max-h-full max-w-full shadow-2xl"
          />
        )}
      </div>

      {/* Bottom bar : metadata */}
      {(current.description || current.uploadedBy) && (
        <div className="px-4 sm:px-6 py-3 border-t border-white/10 bg-black/40">
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
                  {new Date(current.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
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
