'use client';

/**
 * Modale de recherche AI (RAG).
 *
 * Ouverture : prop `open`. Raccourci clavier géré par <AiSearchTrigger/>.
 * Flow :
 *   1. L'utilisateur tape une question
 *   2. POST /rag/ask via axios (api client)
 *   3. On simule un streaming en révélant la réponse caractère par caractère
 *   4. On affiche les sources cliquables
 *
 * TODO : passer à un vrai stream SSE côté backend (EventSource) quand le LLM
 * sera branché. Côté front : remplacer la simulation par un lecteur SSE.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Search, Sparkles, X, Loader2, ArrowUpRight, Clock, ThumbsUp, ThumbsDown } from 'lucide-react';
import { api } from '@/lib/api';

/** RAG-specific timeout — Ollama can take 10-30s, we allow up to 120s. */
const RAG_TIMEOUT = 120_000;

/**
 * Minimal markdown-to-HTML converter.
 * Handles bold, italic, inline code, code blocks, headings, lists, links and line breaks.
 */
function markdownToHtml(md: string): string {
  let html = md
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
function deriveConfidence(sources: AiSearchSource[]): number | null {
  if (sources.length === 0) return null;
  const maxScore = Math.max(...sources.map((s) => s.score));
  return Math.min(100, Math.round(Math.max(0, maxScore) * 100));
}

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: 'Confiance élevée', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
  if (score >= 40) return { text: 'Confiance moyenne', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  return { text: 'Confiance faible', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
}

interface AiSearchSource {
  sourceType: 'DOCUMENT' | 'WIKI' | 'PROCEDURE' | 'RUNBOOK' | 'FAQ';
  sourceId: string;
  chunkIndex: number;
  snippet: string;
  score: number;
}

interface AiAskResponse {
  answer: string;
  sources: AiSearchSource[];
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

const SOURCE_LABEL: Record<AiSearchSource['sourceType'], string> = {
  DOCUMENT: 'Document',
  WIKI: 'Wiki',
  PROCEDURE: 'Procédure',
  RUNBOOK: 'Runbook',
  FAQ: 'FAQ',
};

const SOURCE_ROUTE: Record<AiSearchSource['sourceType'], (id: string) => string> = {
  DOCUMENT: (id) => `/documents/${id}`,
  WIKI: (id) => `/wiki/${id}`,
  PROCEDURE: (id) => `/procedures/${id}`,
  RUNBOOK: (id) => `/runbooks/${id}`,
  FAQ: (id) => `/helpdesk/faq/${id}`,
};

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
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [displayed, setDisplayed] = useState('');
  const [sources, setSources] = useState<AiSearchSource[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [responseSource, setResponseSource] = useState<'llm' | 'extractive' | 'none'>('none');
  const [retrievalConfidence, setRetrievalConfidence] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null); // -1 or 1 once submitted
  const [feedbackToast, setFeedbackToast] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
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

  // Escape pour fermer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Nettoyage du timer à l'unmount
  useEffect(() => {
    return () => {
      if (streamTimer.current) clearInterval(streamTimer.current);
    };
  }, []);

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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = question.trim();
    if (q.length < 2 || loading) return;

    setLoading(true);
    setError(null);
    setAnswer('');
    setDisplayed('');
    setSources([]);
    setDurationMs(null);
    setQueryId(null);
    setFeedbackGiven(null);
    setFeedbackToast(false);
    setIsStreaming(false);

    // Update history immediately
    const next = [q, ...history.filter((h) => h !== q)].slice(0, HISTORY_MAX);
    setHistory(next);
    saveHistory(next);

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
                setError(payload.message);
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
      // Fallback: non-streaming endpoint
      if ((err as Error).name === 'AbortError') {
        setLoading(false);
        setIsStreaming(false);
        return;
      }

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
        const msg =
          (fallbackErr as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'La recherche intelligente est temporairement indisponible. Réessayez dans quelques instants.';
        setError(msg);
      }
    } finally {
      if (!streamStarted) setLoading(false);
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleFeedback = useCallback(async (rating: -1 | 1) => {
    if (!queryId || feedbackGiven !== null) return;
    setFeedbackGiven(rating);
    try {
      await api.post(`/rag/${queryId}/feedback`, { rating });
      setFeedbackToast(true);
      setTimeout(() => setFeedbackToast(false), 3000);
    } catch {
      // Silently fail — feedback is non-critical
    }
  }, [queryId, feedbackGiven]);

  const handleHistoryPick = (q: string) => {
    setQuestion(q);
    setTimeout(() => handleSubmit(), 0);
  };

  // Prefer backend-provided retrievalConfidence; fall back to client-side derivation
  const confidence = useMemo(() => {
    if (retrievalConfidence !== null) return Math.min(100, Math.round(retrievalConfidence * 100));
    return deriveConfidence(sources);
  }, [retrievalConfidence, sources]);

  const sourceLabel = useMemo(() => {
    if (responseSource === 'llm') return 'LLM';
    if (responseSource === 'extractive') return 'Extractif';
    return null;
  }, [responseSource]);
  const displayedHtml = useMemo(() => markdownToHtml(displayed), [displayed]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-navy/60 backdrop-blur-sm p-4 pt-[10vh] animate-in fade-in duration-150"
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
            <Sparkles className="h-5 w-5 text-seal-blue flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Posez une question sur vos documents…"
              className="flex-1 bg-transparent outline-none text-base text-navy dark:text-white placeholder:text-gray-400"
              disabled={loading}
              autoFocus
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-seal-blue" />}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Fermer"
            >
              <X className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            </button>
          </div>
        </form>

        {/* Corps — réponse, sources, historique */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Erreur */}
          {error && (
            <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
              {error}
            </div>
          )}

          {/* Réponse en cours de stream */}
          {(answer || loading) && (
            <div className="px-5 py-5 border-b border-gray-200 dark:border-slate-700">
              <div className="text-xs uppercase font-semibold text-seal-gray-500 mb-2">Réponse</div>
              {displayed ? (
                <div className="text-sm leading-relaxed text-navy dark:text-slate-100">
                  <span dangerouslySetInnerHTML={{ __html: displayedHtml }} />
                  {isStreaming && <span className="inline-block w-1.5 h-4 bg-seal-blue animate-pulse ml-0.5" />}
                </div>
              ) : (
                <div className="text-sm leading-relaxed text-navy dark:text-slate-100 whitespace-pre-wrap">
                  {loading ? 'Recherche en cours…' : ''}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                {confidence !== null && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${confidenceLabel(confidence).color}`}>
                    <Sparkles className="h-3 w-3" />
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
                    <Clock className="h-3 w-3" /> {durationMs} ms
                  </span>
                )}
              </div>

              {/* Feedback row */}
              {answer && !loading && queryId && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-slate-400">Cette réponse vous a-t-elle aidé ?</span>
                  <button
                    type="button"
                    onClick={() => handleFeedback(1)}
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
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFeedback(-1)}
                    disabled={feedbackGiven !== null}
                    className={`p-1.5 rounded-md transition-colors ${
                      feedbackGiven === -1
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : feedbackGiven !== null
                          ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
                          : 'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                    }`}
                    aria-label="Réponse non utile"
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </button>
                  {feedbackToast && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 animate-in fade-in duration-200">
                      Merci pour votre retour
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sources */}
          {sources.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <div className="text-xs uppercase font-semibold text-seal-gray-500 mb-2">
                Sources ({sources.length})
              </div>
              <ul className="space-y-2">
                {sources.map((s, i) => (
                  <li key={`${s.sourceId}-${s.chunkIndex}`}>
                    <a
                      href={SOURCE_ROUTE[s.sourceType](s.sourceId)}
                      className="group flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-seal-blue/10 text-seal-blue text-xs font-bold flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-seal-blue">
                          {SOURCE_LABEL[s.sourceType]}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-slate-400 truncate">
                          {s.snippet}
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-seal-blue flex-shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Historique */}
          {!answer && !loading && history.length > 0 && (
            <div className="px-5 py-4">
              <div className="text-xs uppercase font-semibold text-seal-gray-500 mb-2">
                Questions récentes
              </div>
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h}>
                    <button
                      type="button"
                      onClick={() => handleHistoryPick(h)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-navy dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{h}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* État vide initial */}
          {!answer && !loading && history.length === 0 && !error && (
            <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-slate-400">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-seal-blue/40" />
              Posez une question en langage naturel. L&apos;assistant cherchera dans
              vos documents, procédures, wikis, runbooks et FAQ.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400 flex items-center justify-between">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 font-mono text-[10px]">Entrée</kbd> pour envoyer
            {'  '}
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 font-mono text-[10px]">Échap</kbd> pour fermer
          </span>
          <span className="italic">Propulsé par OMNITECH AI (scaffold)</span>
        </div>
      </div>
    </div>
  );
}
