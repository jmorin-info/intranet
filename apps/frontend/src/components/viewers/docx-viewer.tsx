'use client';

import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

interface DocxViewerProps {
  url: string;
  className?: string;
}

export function DocxViewer({ url, className }: DocxViewerProps) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadDocx() {
      try {
        const mammoth = await import('mammoth');
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setHtml(DOMPurify.sanitize(result.value));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    loadDocx();
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-seal-gray-500">
        Impossible de charger l&apos;apercu DOCX
      </div>
    );
  }

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 max-h-[600px] overflow-y-auto ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
