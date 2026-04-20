'use client';

/**
 * MessageActions — Features 2 & 3 du polish RAG.
 *
 * Barre d'actions sous une réponse assistant :
 *   - Copy (markdown brut, inclut citations)
 *   - Regenerate (remplace la réponse, incrémente regenerateCount)
 *
 * Les boutons sont désactivés pendant le streaming pour éviter les
 * races conditions. Feedback visuel 2s après copy (icône Check).
 */

import React, { useCallback, useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';

interface MessageActionsProps {
  /** Markdown à copier (inclut citations et méta). */
  markdownToCopy: string;
  /** Handler de régénération — peut être async. */
  onRegenerate?: () => void | Promise<void>;
  /** Compteur de régénérations déjà effectuées (affichage). */
  regenerateCount?: number;
  /** Désactive les boutons pendant streaming. */
  disabled?: boolean;
}

const COPY_FEEDBACK_MS = 2000;

export function MessageActions({
  markdownToCopy,
  onRegenerate,
  regenerateCount = 0,
  disabled = false,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdownToCopy);
      } else {
        // Fallback legacy (iframe-less contexts)
        const ta = document.createElement('textarea');
        ta.value = markdownToCopy;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Silent — user can retry
    }
  }, [markdownToCopy, disabled]);

  const baseBtn =
    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-seal-blue/40';
  const idle =
    'text-gray-500 hover:bg-gray-100 hover:text-seal-blue dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-seal-blue';
  const disabledCls =
    'text-gray-300 dark:text-slate-600 cursor-not-allowed';

  return (
    <div className="mt-3 flex items-center gap-1" role="toolbar" aria-label="Actions sur la réponse">
      <button
        type="button"
        onClick={handleCopy}
        disabled={disabled}
        className={`${baseBtn} ${disabled ? disabledCls : idle}`}
        aria-label={copied ? 'Réponse copiée' : 'Copier la réponse en markdown'}
        title="Copier la réponse (markdown)"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            <span className="text-emerald-600 dark:text-emerald-400">Copié</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Copier</span>
          </>
        )}
      </button>

      {onRegenerate && (
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            void onRegenerate();
          }}
          disabled={disabled}
          className={`${baseBtn} ${disabled ? disabledCls : idle}`}
          aria-label={
            regenerateCount > 0
              ? `Régénérer la réponse (déjà ${regenerateCount} régénération${regenerateCount > 1 ? 's' : ''})`
              : 'Régénérer la réponse'
          }
          title="Régénérer une nouvelle réponse"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            Régénérer
            {regenerateCount > 0 && (
              <span className="ml-1 text-[10px] text-gray-400 dark:text-slate-500">
                ×{regenerateCount}
              </span>
            )}
          </span>
        </button>
      )}
    </div>
  );
}
