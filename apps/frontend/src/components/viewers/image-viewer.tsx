'use client';

import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';

interface ImageViewerProps {
  url: string;
  alt?: string;
  className?: string;
}

/**
 * Viewer image inline : affiche PNG/JPEG/WEBP/GIF avec zoom et réinitialisation.
 * Plus léger qu'un lightbox : l'image reste dans le flux, mais on peut zoomer
 * jusqu'à 300 % pour voir les détails.
 */
export function ImageViewer({ url, alt = 'Image', className = '' }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-seal-gray-500">
        Impossible de charger l&apos;image
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Toolbar zoom */}
      <div className="flex items-center justify-end gap-1 rounded-t-lg border border-gray-200 bg-gray-50 dark:bg-slate-800 dark:border-slate-700 px-3 py-2">
        <button
          type="button"
          onClick={() => setScale(Math.max(0.5, scale - 0.25))}
          disabled={scale <= 0.5}
          className="h-8 w-8 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center disabled:opacity-40"
          aria-label="Zoom arrière"
          title="Zoom arrière"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-seal-gray-500 dark:text-slate-400 w-12 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setScale(Math.min(3, scale + 0.25))}
          disabled={scale >= 3}
          className="h-8 w-8 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center disabled:opacity-40"
          aria-label="Zoom avant"
          title="Zoom avant"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {scale !== 1 && (
          <button
            type="button"
            onClick={() => setScale(1)}
            className="h-8 w-8 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center"
            aria-label="Réinitialiser le zoom"
            title="Réinitialiser"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center"
          aria-label="Ouvrir l'image en plein écran"
          title="Plein écran"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </a>
      </div>
      {/* Image */}
      <div className="overflow-auto border border-t-0 border-gray-200 dark:border-slate-700 rounded-b-lg bg-gray-100 dark:bg-slate-900 flex items-center justify-center p-4 max-h-[70vh]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="object-contain transition-transform shadow-md"
          style={{ transform: `scale(${scale})`, maxWidth: '100%' }}
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}
