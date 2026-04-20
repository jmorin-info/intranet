'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Minus,
  Plus,
  Sun,
  Moon,
  Type,
  AlignLeft,
  BookOpen,
} from 'lucide-react';

interface ReadingModeProps {
  open: boolean;
  onClose: () => void;
  documentTitle: string;
  documentId: string;
  pdfUrl?: string;
  htmlContent?: string; // Pour les docs HTML/markdown rendered
  onProgress?: (percent: number) => void;
}

type Theme = 'light' | 'sepia' | 'dark';
type ContentWidth = 'narrow' | 'medium' | 'wide';

export function ReadingMode({
  open,
  onClose,
  documentTitle,
  pdfUrl,
  htmlContent,
  onProgress,
}: ReadingModeProps) {
  const [fontSize, setFontSize] = useState(16);
  const [contentWidth, setContentWidth] = useState<ContentWidth>('medium');
  const [theme, setTheme] = useState<Theme>('light');
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist preferences
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('reading-mode-prefs') || '{}',
      );
      if (typeof saved.fontSize === 'number') setFontSize(saved.fontSize);
      if (saved.contentWidth) setContentWidth(saved.contentWidth as ContentWidth);
      if (saved.theme) setTheme(saved.theme as Theme);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'reading-mode-prefs',
        JSON.stringify({ fontSize, contentWidth, theme }),
      );
    } catch {
      /* noop */
    }
  }, [fontSize, contentWidth, theme]);

  // Track scroll progress
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const max = scrollHeight - clientHeight;
    const percent =
      max <= 0 ? 100 : Math.min(100, Math.round((scrollTop / max) * 100));
    setProgress(percent);
    onProgress?.(percent);
  }, [onProgress]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        setFontSize((s) => Math.min(s + 2, 24));
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        setFontSize((s) => Math.max(s - 2, 12));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const themeStyles: Record<
    Theme,
    { bg: string; text: string; muted: string; border: string; accentBg: string }
  > = {
    light: {
      bg: '#ffffff',
      text: '#1a1a1a',
      muted: '#6b7280',
      border: 'rgba(107, 114, 128, 0.2)',
      accentBg: 'rgba(0, 0, 0, 0.05)',
    },
    sepia: {
      bg: '#f4ecd8',
      text: '#3a2f1a',
      muted: '#8a7252',
      border: 'rgba(138, 114, 82, 0.25)',
      accentBg: 'rgba(58, 47, 26, 0.08)',
    },
    dark: {
      bg: '#0f172a',
      text: '#e2e8f0',
      muted: '#94a3b8',
      border: 'rgba(148, 163, 184, 0.2)',
      accentBg: 'rgba(255, 255, 255, 0.06)',
    },
  };
  const ts = themeStyles[theme];

  const widthClass: Record<ContentWidth, string> = {
    narrow: 'max-w-2xl',
    medium: 'max-w-3xl',
    wide: 'max-w-5xl',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: ts.bg, color: ts.text }}
      data-reading-mode
    >
      {/* Header */}
      <header
        className="flex items-center justify-between border-b px-6 py-3 backdrop-blur-sm"
        style={{ borderColor: ts.border }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <BookOpen className="h-5 w-5 flex-shrink-0" style={{ color: ts.muted }} />
          <div className="min-w-0">
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: ts.muted }}
            >
              Mode lecture
            </p>
            <h1
              className="text-base font-medium truncate"
              style={{ color: ts.text }}
            >
              {documentTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Font size */}
          <button
            onClick={() => setFontSize((s) => Math.max(s - 2, 12))}
            className="p-2 rounded transition-colors"
            style={{ background: 'transparent' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = ts.accentBg)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'transparent')
            }
            title="Diminuer la taille (Ctrl+-)"
            aria-label="Diminuer la taille du texte"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span
            className="text-xs font-mono min-w-[36px] text-center"
            style={{ color: ts.muted }}
          >
            {fontSize}px
          </span>
          <button
            onClick={() => setFontSize((s) => Math.min(s + 2, 24))}
            className="p-2 rounded transition-colors"
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = ts.accentBg)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'transparent')
            }
            title="Augmenter la taille (Ctrl++)"
            aria-label="Augmenter la taille du texte"
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* Width */}
          <div
            className="mx-2 flex items-center gap-1 border-l pl-2"
            style={{ borderColor: ts.border }}
          >
            {(['narrow', 'medium', 'wide'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setContentWidth(w)}
                className="p-1.5 rounded transition-colors"
                style={{
                  background: contentWidth === w ? ts.accentBg : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (contentWidth !== w)
                    e.currentTarget.style.background = ts.accentBg;
                }}
                onMouseLeave={(e) => {
                  if (contentWidth !== w)
                    e.currentTarget.style.background = 'transparent';
                }}
                title={
                  w === 'narrow'
                    ? 'Largeur étroite'
                    : w === 'medium'
                      ? 'Largeur moyenne'
                      : 'Largeur large'
                }
                aria-label={`Largeur ${w}`}
              >
                <AlignLeft
                  className="h-3.5 w-3.5"
                  style={{
                    width: w === 'narrow' ? 10 : w === 'medium' ? 14 : 18,
                  }}
                />
              </button>
            ))}
          </div>

          {/* Theme */}
          <div
            className="mx-2 flex items-center gap-1 border-l pl-2"
            style={{ borderColor: ts.border }}
          >
            <button
              onClick={() => setTheme('light')}
              className="p-1.5 rounded transition-colors"
              style={{
                background: theme === 'light' ? ts.accentBg : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (theme !== 'light')
                  e.currentTarget.style.background = ts.accentBg;
              }}
              onMouseLeave={(e) => {
                if (theme !== 'light')
                  e.currentTarget.style.background = 'transparent';
              }}
              title="Thème clair"
              aria-label="Thème clair"
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme('sepia')}
              className="p-1.5 rounded transition-colors"
              style={{
                background: theme === 'sepia' ? ts.accentBg : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (theme !== 'sepia')
                  e.currentTarget.style.background = ts.accentBg;
              }}
              onMouseLeave={(e) => {
                if (theme !== 'sepia')
                  e.currentTarget.style.background = 'transparent';
              }}
              title="Thème sépia"
              aria-label="Thème sépia"
            >
              <Type className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className="p-1.5 rounded transition-colors"
              style={{
                background: theme === 'dark' ? ts.accentBg : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (theme !== 'dark')
                  e.currentTarget.style.background = ts.accentBg;
              }}
              onMouseLeave={(e) => {
                if (theme !== 'dark')
                  e.currentTarget.style.background = 'transparent';
              }}
              title="Thème sombre"
              aria-label="Thème sombre"
            >
              <Moon className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="ml-2 p-2 rounded transition-colors"
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = ts.accentBg)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'transparent')
            }
            title="Fermer (Esc)"
            aria-label="Fermer le mode lecture"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div
        className="h-0.5"
        style={{ background: ts.accentBg }}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${progress}%`, background: '#F9964A' }}
        />
      </div>

      {/* Content scroll area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div
          className={`mx-auto px-6 py-12 ${widthClass[contentWidth]}`}
          style={{ fontSize: `${fontSize}px`, lineHeight: '1.75' }}
        >
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full"
              style={{
                minHeight: '85vh',
                border: 0,
                borderRadius: 8,
                background: 'white',
              }}
              title={documentTitle}
            />
          ) : htmlContent ? (
            <div
              className="prose-reading"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : (
            <p style={{ color: ts.muted }}>Aucun contenu disponible.</p>
          )}
        </div>
      </div>

      {/* Footer with progress text */}
      <footer
        className="flex items-center justify-between border-t px-6 py-2 text-xs"
        style={{ borderColor: ts.border, color: ts.muted }}
      >
        <span>Progression : {progress}%</span>
        <span className="hidden sm:inline">
          Esc pour fermer · Ctrl+/- pour ajuster la taille
        </span>
      </footer>
    </div>
  );
}
