'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@omnitech/ui';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  BookOpen,
  Search,
  RotateCcw,
} from 'lucide-react';

const Document = dynamic(
  () => import('react-pdf').then((mod) => {
    mod.pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return mod.Document;
  }),
  { ssr: false },
);
const Page = dynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false },
);

interface PdfViewerProps {
  url: string;
  className?: string;
  onOpenReadingMode?: () => void;
}

export function PdfViewer({ url, className, onOpenReadingMode }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageInput, setPageInput] = useState('');

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-taupe">
        Impossible de charger l&apos;apercu PDF
      </div>
    );
  }

  const goToPage = (target: number) => {
    const clamped = Math.min(Math.max(1, target), numPages || 1);
    setPageNumber(clamped);
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) goToPage(parsed);
    setPageInput('');
  };

  // Progress percentage for indicator
  const progressPct = numPages > 0 ? Math.round((pageNumber / numPages) * 100) : 0;

  return (
    <div className={className}>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border border-gray-200 bg-gray-50 dark:bg-slate-800 dark:border-slate-700 px-4 py-2">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            title="Page précédente"
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <form
            onSubmit={handlePageInputSubmit}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              inputMode="numeric"
              value={pageInput !== '' ? pageInput : pageNumber}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
              onBlur={handlePageInputSubmit}
              className="w-12 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-0.5 text-center text-sm text-navy dark:text-white"
              aria-label="Numéro de page"
            />
            <span className="text-sm text-navy dark:text-white">
              / {numPages || '—'}
            </span>
          </form>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= numPages}
            title="Page suivante"
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {numPages > 0 && (
            <span
              className="hidden sm:inline text-[10px] text-taupe dark:text-slate-400 ml-1"
              aria-live="polite"
            >
              {progressPct}%
            </span>
          )}
        </div>

        {/* Search (visual only, react-pdf text layer disabled) */}
        <div className="hidden md:flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-taupe dark:text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher…"
              className="pl-7 pr-2 py-1 w-40 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-navy dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Rechercher dans le document"
            />
          </div>
        </div>

        {/* Zoom + actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setScale(Math.max(0.5, scale - 0.25))}
            disabled={scale <= 0.5}
            title="Zoom arrière"
            aria-label="Zoom arrière"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            onClick={() => setScale(1)}
            className="text-xs text-taupe dark:text-slate-400 w-12 text-center hover:text-primary transition-colors"
            title="Réinitialiser le zoom"
            aria-label="Réinitialiser le zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setScale(Math.min(2, scale + 0.25))}
            disabled={scale >= 2}
            title="Zoom avant"
            aria-label="Zoom avant"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          {scale !== 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale(1)}
              title="Réinitialiser le zoom"
              aria-label="Réinitialiser le zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {onOpenReadingMode && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 h-8 gap-1.5"
              onClick={onOpenReadingMode}
              title="Mode lecture plein écran"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mode lecture</span>
            </Button>
          )}
        </div>
      </div>

      {/* PDF content */}
      <div className="overflow-auto border border-t-0 border-gray-200 dark:border-slate-700 rounded-b-lg bg-gray-100 dark:bg-slate-900 max-h-[600px]">
        <div className="flex justify-center p-4">
          <Document
            file={url}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setError(true)}
            loading={
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-lg"
            />
          </Document>
        </div>
      </div>

      {/* Progress bar at bottom */}
      {numPages > 0 && (
        <div
          className="h-1 bg-gray-200 dark:bg-slate-800 overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression de lecture"
        >
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
