'use client';

/**
 * Modale de recherche AI (RAG) — Ctrl+Shift+K.
 *
 * Ouverture : prop `open`. Raccourci clavier géré par <AiSearchTrigger/>.
 * Flow :
 *   1. L'utilisateur tape une question (ou choisit une suggestion)
 *   2. POST /rag/ask-stream (SSE) avec fallback non-streaming /rag/ask
 *   3. On révèle les tokens au fil de l'eau, les sources apparaissent dès dispo
 *   4. Actions : Stop / Copy / Regenerate / Feedback +/- (avec raison si -)
 *
 * Les sous-composants dédiés vivent dans `src/components/chatbot/`.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Search,
  Sparkles,
  X,
  Loader2,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Square,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { CitationsList } from '@/components/chatbot/citations-list';
import { MessageActions } from '@/components/chatbot/message-actions';
import { FeedbackPanel } from '@/components/chatbot/feedback-panel';
import { EmptyState } from '@/components/chatbot/empty-state';
import { ErrorState } from '@/components/chatbot/error-state';
import { buildCopyMarkdown } from '@/components/chatbot/citation-parser';
import {
  buildLowConfidenceError,
  classifyError,
  LOW_CONFIDENCE_THRESHOLD,
} from '@/components/chatbot/error-classifier';
import type { ChatbotError, RagCitation } from '@/components/chatbot/types';

/** RAG-specific timeout — Ollama can take 10-30s, we allow up to 120s. */
const RAG_TIMEOUT = 120_000;

/**
 * Minimal markdown-to-HTML converter.
 * Handles bold, italic, inline code, code blocks, headings, lists, links and line breaks.
 */
function markdownToHtml(md: string): string {
  const html = md
    // Code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, (m) => {
      const code = m.slice(3, -3).replace(/^\n/, '');
      return `<pre class="bg-gray-100 dark:bg-slate-800 rounded p-2 text-xs overflow-x-auto my-2"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-slate-800 rounded px-1 py-0.5 text-xs">$1</code>')
    // Headings (### h3, ## h2, # h1)
    .replace(/^### (.+)$/gm, '<strong class="block mt-3 mb-1">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong class="block mt-3 mb-1 text-base">$1</strong>')
    .replace(/^# (.+)$/gm, '<strong class="block mt-3 mb-1 text-lg">$1</strong>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-seal-blue underline" target="_blank" rel="noopener noreferrer">$1</a>')
    // Line breaks (double newline = paragraph break)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  return html;
}

/** Derive a 0–100 confidence score from the best source score. */
function deriveConfidence(sources: RagCitation[]): number | null {
  if (sources.length === 0) return null;
  const maxScore = Math.max(...sources.map((s) => s.score));
  return Math.min(100, Math.round(Math.max(0, maxScore) * 100));
}

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: 'Confiance élevée', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
  if (score >= 40) return { text: 'Confiance moyenne', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  return { text: 'Confiance faible', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
}

interface AiAskResponse {
  answer: string;
  sources: RagCitation[];
  durationMs: number;
  retrievalConfidence: number;
  source: 'llm' | 'extractive' | 'none';
  queryId?: string;
  pipelineInfo: {
    retrievalMethod: 'vector' | 'lexical_fallback';
    llmModel: string | null;
    ollamaEnabled: boolean;
    chunksEvaluated: number;
    confidenceThreshold: number;
    belowThreshold: boolean;
  };
}

interface AiSearchModalProps {
  open: boolean;
  onClose: () => void;
}

const HISTORY_KEY = 'omnitech.rag.history';
const HISTORY_MAX = 5;

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    /* quota — ignore */
  }
}

export function AiSearchModal({ open, onClose }: AiSearchModalProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [displayed, setDisplayed] = useState('');
  const [sources, setSources] = useState<RagCitation[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [responseSource, setResponseSource] = useState<'llm' | 'extractive' | 'none'>('none');
  const [retrievalConfidence, setRetrievalConfidence] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [chatbotError, setChatbotError] = useState<ChatbotError | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null); // -1 or 1 once submitted
  const [feedbackToast, setFeedbackToast] = useState(false);
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [regenerateCount, setRegenerateCount] = useState(0);
  const [abortedByUser, setAbortedByUser] = useState(false);

  /** Dernière question soumise (utilisée par regenerate + retry). */
  const lastQuestionRef = useRef<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Charge l'historique au montage
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Focus l'input à l'ouverture
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Reset partiel à la fermeture
      if (streamTimer.current) clearInterval(streamTimer.current);
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
      setIsStreaming(false);
    }
  }, [open]);

  // Nettoyage du timer à l'unmount
  useEffect(() => {
    return () => {
      if (streamTimer.current) clearInterval(streamTimer.current);
    };
  }, []);

  /**
   * Stop génération (Feature 1) — abort le controller courant et affiche
   * un message "Génération interrompue". Accessible via :
   *   - Le bouton Square pendant le streaming
   *   - La touche Escape (comportement conservé : abort si streaming, sinon close)
   */
  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (streamTimer.current) {
      clearInterval(streamTimer.current);
      streamTimer.current = null;
    }
    setIsStreaming(false);
    setLoading(false);
    setAbortedByUser(true);
  }, []);

  // Escape : ferme si pas de streaming, sinon abort (Feature 1 + existant)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isStreaming || loading) {
          stopGeneration();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, isStreaming, loading, stopGeneration]);

  // Simulated streaming fallback (used when SSE endpoint is unavailable)
  const streamAnswerFallback = (full: string) => {
    setDisplayed('');
    if (streamTimer.current) clearInterval(streamTimer.current);
    setIsStreaming(true);
    let i = 0;
    streamTimer.current = setInterval(() => {
      i += 3;
      setDisplayed(full.slice(0, i));
      if (i >= full.length && streamTimer.current) {
        clearInterval(streamTimer.current);
        streamTimer.current = null;
        setIsStreaming(false);
      }
    }, 16);
  };

  const runQuery = useCallback(async (q: string, opts: { isRegenerate?: boolean } = {}) => {
    if (q.length < 2 || loading) return;

    lastQuestionRef.current = q;

    setLoading(true);
    setChatbotError(null);
    setAbortedByUser(false);
    setAnswer('');
    setDisplayed('');
    setSources([]);
    setDurationMs(null);
    setQueryId(null);
    setFeedbackGiven(null);
    setFeedbackToast(false);
    setShowFeedbackPanel(false);
    setIsStreaming(false);

    // Update history (only for fresh queries, not regenerates)
    if (!opts.isRegenerate) {
      setRegenerateCount(0);
      const next = [q, ...history.filter((h) => h !== q)].slice(0, HISTORY_MAX);
      setHistory(next);
      saveHistory(next);
    }

    // Local flag to track whether SSE streaming started (avoids stale closure on React state)
    let streamStarted = false;

    try {
      // Try SSE streaming first
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const controller = new AbortController();
      abortRef.current = controller;

      const sseRes = await fetch(`${baseUrl}/api/rag/ask-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      });

      if (!sseRes.ok || !sseRes.body) {
        throw new Error('SSE not available');
      }

      // Read the SSE stream
      streamStarted = true;
      setLoading(false);
      setIsStreaming(true);
      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullAnswer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === 'token') {
                fullAnswer += payload.token;
                setDisplayed(fullAnswer);
              } else if (payload.type === 'meta') {
                setSources(payload.sources ?? []);
                setRetrievalConfidence(payload.retrievalConfidence ?? null);
                setQueryId(payload.queryId ?? null);
                if (payload.durationMs > 0) setDurationMs(payload.durationMs);
              } else if (payload.type === 'done') {
                // Stream complete
              } else if (payload.type === 'error') {
                setChatbotError(classifyError(new Error(payload.message)));
              }
            } catch {
              // Partial JSON, skip
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }

      setAnswer(fullAnswer);
      setResponseSource(fullAnswer ? 'llm' : 'none');
      setIsStreaming(false);

    } catch (err: unknown) {
      // User-initiated abort (stop button / Esc)
      if ((err as Error).name === 'AbortError') {
        setLoading(false);
        setIsStreaming(false);
        setAbortedByUser(true);
        return;
      }

      // Fallback: non-streaming endpoint
      try {
        const res = await api.post<AiAskResponse>('/rag/ask', { question: q }, { timeout: RAG_TIMEOUT });
        setAnswer(res.data.answer);
        setSources(res.data.sources ?? []);
        setDurationMs(res.data.durationMs ?? null);
        setResponseSource(res.data.source ?? 'none');
        setRetrievalConfidence(res.data.retrievalConfidence ?? null);
        setQueryId(res.data.queryId ?? null);
        streamAnswerFallback(res.data.answer);
      } catch (fallbackErr: unknown) {
        setChatbotError(classifyError(fallbackErr));
      }
    } finally {
      if (!streamStarted) setLoading(false);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [history, loading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = question.trim();
    await runQuery(q);
  };

  /** Feature 3 — régénère la réponse pour la dernière question. */
  const handleRegenerate = useCallback(async () => {
    const q = lastQuestionRef.current;
    if (!q) return;
    setRegenerateCount((c) => c + 1);
    await runQuery(q, { isRegenerate: true });
  }, [runQuery]);

  /** Feature 4 — thumbs up sans panneau, thumbs down ouvre le panneau raison. */
  const handleThumbsUp = useCallback(async () => {
    if (!queryId || feedbackGiven !== null) return;
    setFeedbackGiven(1);
    try {
      await api.post(`/rag/${queryId}/feedback`, { rating: 1 });
      setFeedbackToast(true);
      setTimeout(() => setFeedbackToast(false), 3000);
    } catch {
      // Silent
    }
  }, [queryId, feedbackGiven]);

  const handleThumbsDown = useCallback(() => {
    if (!queryId || feedbackGiven !== null) return;
    setShowFeedbackPanel(true);
  }, [queryId, feedbackGiven]);

  const submitNegativeFeedback = useCallback(async (feedbackJson: string) => {
    if (!queryId) return;
    await api.post(`/rag/${queryId}/feedback`, { rating: -1, feedback: feedbackJson });
    setFeedbackGiven(-1);
  }, [queryId]);

  const handleHistoryPick = (q: string) => {
    setQuestion(q);
    setTimeout(() => void runQuery(q), 0);
  };

  const handleSuggestionPick = (q: string) => {
    setQuestion(q);
    setTimeout(() => void runQuery(q), 0);
  };

  /** Feature 6 — actions CTA des erreurs. */
  const handleErrorAction = useCallback(
    (action: 'retry' | 'rephrase' | 'ticket' | 'contact_it' | 'contact_rssi' | 'dismiss') => {
      switch (action) {
        case 'retry':
          if (lastQuestionRef.current) void runQuery(lastQuestionRef.current);
          break;
        case 'rephrase':
          setChatbotError(null);
          setAnswer('');
          setDisplayed('');
          inputRef.current?.focus();
          inputRef.current?.select();
          break;
        case 'ticket':
          onClose();
          router.push('/tickets?create=true');
          break;
        case 'contact_it':
          onClose();
          router.push('/helpdesk');
          break;
        case 'contact_rssi':
          onClose();
          router.push('/helpdesk?category=SECURITY');
          break;
        case 'dismiss':
          setChatbotError(null);
          break;
      }
    },
    [runQuery, onClose, router],
  );

  // Prefer backend-provided retrievalConfidence; fall back to client-side derivation
  const confidence = useMemo(() => {
    if (retrievalConfidence !== null) return Math.min(100, Math.round(retrievalConfidence * 100));
    return deriveConfidence(sources);
  }, [retrievalConfidence, sources]);

  // Detect low-confidence and surface as inline warning (not blocking)
  const lowConfidenceWarning = useMemo<ChatbotError | null>(() => {
    if (answer && !isStreaming && confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD) {
      return buildLowConfidenceError(confidence);
    }
    return null;
  }, [answer, isStreaming, confidence]);

  const sourceLabel = useMemo(() => {
    if (responseSource === 'llm') return 'LLM';
    if (responseSource === 'extractive') return 'Extractif';
    return null;
  }, [responseSource]);
  const displayedHtml = useMemo(() => markdownToHtml(displayed), [displayed]);

  const copyMarkdown = useMemo(
    () =>
      buildCopyMarkdown({
        question: lastQuestionRef.current || question,
        answer,
        sources,
        confidencePercent: confidence,
      }),
    [answer, sources, confidence, question],
  );

  if (!open) return null;

  const hasAnyContent = !!answer || loading || isStreaming || !!chatbotError || abortedByUser;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-seal-navy/60 backdrop-blur-sm p-4 pt-[10vh] animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Recherche AI"
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700 animate-in zoom-in-95 slide-in-from-top-4 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barre d'entrée */}
        <form onSubmit={handleSubmit} className="relative border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 px-5 py-4">
            <Sparkles className="h-5 w-5 text-seal-blue flex-shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Posez une question sur vos documents…"
              className="flex-1 bg-transparent outline-none text-base text-seal-navy dark:text-white placeholder:text-gray-400"
              disabled={loading || isStreaming}
              aria-label="Votre question"
              autoFocus
            />
            {loading && !isStreaming && (
              <Loader2 className="h-4 w-4 animate-spin text-seal-blue" aria-label="Chargement" />
            )}
            {/* Feature 1 — bouton Stop pendant la génération */}
            {(isStreaming || loading) && (
              <button
                type="button"
                onClick={stopGeneration}
                className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
                aria-label="Arrêter la génération (Échap)"
                title="Arrêter la génération (Échap)"
              >
                <Square className="h-3 w-3 fill-current" aria-hidden="true" />
                <span>Stop</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Fermer la recherche AI"
            >
              <X className="h-4 w-4 text-gray-500 dark:text-slate-400" aria-hidden="true" />
            </button>
          </div>
        </form>

        {/* Corps — réponse, sources, historique, état vide, erreurs */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Feature 6 — erreur actionnable en priorité */}
          {chatbotError && (
            <ErrorState error={chatbotError} onAction={handleErrorAction} />
          )}

          {/* Feature 1 — message système si abort user sans erreur technique */}
          {abortedByUser && !chatbotError && !answer && (
            <div
              role="status"
              aria-live="polite"
              className="mx-5 my-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <Square className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                Génération interrompue.
              </span>
              {lastQuestionRef.current && (
                <button
                  type="button"
                  onClick={() => void runQuery(lastQuestionRef.current)}
                  className="rounded-md bg-seal-blue px-2.5 py-1 text-xs font-semibold text-white hover:bg-seal-blue/90 transition-colors focus:outline-none focus:ring-2 focus:ring-seal-blue/40"
                >
                  Réessayer
                </button>
              )}
            </div>
          )}

          {/* Réponse en cours de stream */}
          {(answer || loading || isStreaming) && (
            <div className="px-5 py-5 border-b border-gray-200 dark:border-slate-700">
              <div className="text-xs uppercase font-semibold text-seal-gray-500 mb-2">Réponse</div>
              {displayed ? (
                <div className="text-sm leading-relaxed text-seal-navy dark:text-slate-100">
                  <span dangerouslySetInnerHTML={{ __html: displayedHtml }} />
                  {isStreaming && <span className="inline-block w-1.5 h-4 bg-seal-blue animate-pulse ml-0.5" aria-hidden="true" />}
                </div>
              ) : (
                <div className="text-sm leading-relaxed text-seal-navy dark:text-slate-100 whitespace-pre-wrap">
                  {loading ? 'Recherche en cours…' : ''}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                {confidence !== null && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${confidenceLabel(confidence).color}`}>
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {confidenceLabel(confidence).text} ({confidence}%)
                  </span>
                )}
                {sourceLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400">
                    Source : {sourceLabel}
                  </span>
                )}
                {durationMs !== null && (
                  <span className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" /> {durationMs} ms
                  </span>
                )}
                {regenerateCount > 0 && (
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">
                    Régénérée {regenerateCount}×
                  </span>
                )}
              </div>

              {/* Low-confidence warning (inline, non-blocking) */}
              {lowConfidenceWarning && (
                <ErrorState error={lowConfidenceWarning} onAction={handleErrorAction} />
              )}

              {/* Features 2 + 3 — actions sur la réponse (copy + regenerate) */}
              {answer && !isStreaming && !loading && (
                <MessageActions
                  markdownToCopy={copyMarkdown}
                  onRegenerate={handleRegenerate}
                  regenerateCount={regenerateCount}
                  disabled={isStreaming || loading}
                />
              )}

              {/* Feedback row */}
              {answer && !loading && !isStreaming && queryId && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-slate-400">Cette réponse vous a-t-elle aidé ?</span>
                  <button
                    type="button"
                    onClick={handleThumbsUp}
                    disabled={feedbackGiven !== null}
                    className={`p-1.5 rounded-md transition-colors ${
                      feedbackGiven === 1
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : feedbackGiven !== null
                          ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
                          : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400'
                    }`}
                    aria-label="Réponse utile"
                  >
                    <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={handleThumbsDown}
                    disabled={feedbackGiven !== null}
                    className={`p-1.5 rounded-md transition-colors ${
                      feedbackGiven === -1
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : feedbackGiven !== null
                          ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
                          : 'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                    }`}
                    aria-label="Réponse non utile — préciser la raison"
                  >
                    <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {feedbackToast && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 animate-in fade-in duration-200">
                      Merci pour votre retour
                    </span>
                  )}
                </div>
              )}

              {/* Feature 4 — panneau raison feedback négatif */}
              {showFeedbackPanel && queryId && feedbackGiven === null && (
                <FeedbackPanel
                  onSubmit={submitNegativeFeedback}
                  onCancel={() => setShowFeedbackPanel(false)}
                />
              )}
            </div>
          )}

          {/* Feature 5 — citations avec preview */}
          <CitationsList citations={sources} />

          {/* Historique */}
          {!hasAnyContent && history.length > 0 && (
            <div className="px-5 py-4 border-t border-gray-200 dark:border-slate-700">
              <div className="text-xs uppercase font-semibold text-seal-gray-500 mb-2">
                Questions récentes
              </div>
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h}>
                    <button
                      type="button"
                      onClick={() => handleHistoryPick(h)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-seal-navy dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                      aria-label={`Rejouer la question : ${h}`}
                    >
                      <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">{h}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feature 6 — état vide initial (suggestions + tutoriel) */}
          {!hasAnyContent && history.length === 0 && (
            <EmptyState
              departmentName={user?.departmentName}
              firstName={user?.firstName}
              onPick={handleSuggestionPick}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400 flex items-center justify-between">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 font-mono text-[10px]">Entrée</kbd> pour envoyer
            {'  '}
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 font-mono text-[10px]">Échap</kbd>{' '}
            pour {isStreaming || loading ? 'arrêter' : 'fermer'}
          </span>
          <span className="italic">Propulsé par OMNITECH AI</span>
        </div>
      </div>
    </div>
  );
}
