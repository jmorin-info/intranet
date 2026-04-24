'use client';

/**
 * CodeBlock — Feature 7 (syntax highlighting).
 *
 * Composant léger qui détecte les blocs ```lang dans une chaîne markdown
 * et les colore via highlight.js (dynamic import — réduit le bundle initial).
 *
 * Couleurs alignées sur la charte SEAL (mode clair/sombre) via classes
 * `seal-syntax-*` injectées dans `globals.css` (cf. classes Tailwind utilisées
 * en fallback si la feuille n'est pas chargée).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

/** Lazy-loaded highlight.js core + auto-detection. */
let hljsPromise: Promise<typeof import('highlight.js/lib/common').default> | null = null;
function loadHljs() {
  if (!hljsPromise) {
    hljsPromise = import('highlight.js/lib/common').then((m) => m.default);
  }
  return hljsPromise;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadHljs()
      .then((hljs) => {
        if (cancelled) return;
        try {
          if (language && hljs.getLanguage(language)) {
            const html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
            setHighlighted(html);
          } else {
            const html = hljs.highlightAuto(code).value;
            setHighlighted(html);
          }
        } catch {
          setHighlighted(null);
        }
      })
      .catch(() => setHighlighted(null));
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative my-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-[#0b1929] dark:bg-slate-900 overflow-hidden group">
      <div className="flex items-center justify-between px-3 py-1 bg-slate-800/60 dark:bg-slate-800 border-b border-slate-700/50">
        <span className="text-[10px] font-mono uppercase text-slate-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copier le bloc de code"
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copié</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copier</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 text-xs overflow-x-auto leading-relaxed">
        {highlighted ? (
          <code
            ref={codeRef}
            className={`hljs language-${language || 'plain'}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code className="text-slate-100">{code}</code>
        )}
      </pre>
    </div>
  );
}
