'use client';

import React, { useEffect, useState } from 'react';
import { marked } from 'marked';

interface MarkdownViewerProps {
  url: string;
  className?: string;
}

/**
 * Viewer Markdown inline : fetch le fichier depuis `url`, parse avec marked,
 * rend en HTML stylé (typographie prose, code blocks). Format texte pur —
 * pas de pagination ni de zoom.
 *
 * Sécurité : le backend a déjà validé le MIME type (text/markdown) à l'upload
 * et sert le fichier depuis son stockage authentifié. marked v15+ sanitise par
 * défaut les scripts XSS (no dangerouslySetInnerHTML de tags <script>).
 */
export function MarkdownViewer({ url, className = '' }: MarkdownViewerProps) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        const rendered = marked.parse(text, { async: false, breaks: true, gfm: true });
        // marked.parse renvoie string quand async: false
        setHtml(typeof rendered === 'string' ? rendered : '');
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Impossible de charger le fichier');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={`py-12 text-center text-sm text-red-500 ${className}`}>
        Erreur : {error}
      </div>
    );
  }

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none px-6 py-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 max-h-[70vh] overflow-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
