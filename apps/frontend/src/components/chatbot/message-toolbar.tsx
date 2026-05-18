"use client";

/**
 * MessageToolbar — barre d'actions sous chaque message du chatbot.
 *
 * Features couvertes :
 *   2. Copy réponse
 *   3. Regenerate (assistant uniquement, dernier message)
 *   4. Edit (utilisateur uniquement)
 *   8. Feedback +/− avec raison sur 👎
 */

import React, { useState } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  Pencil,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";
import { FeedbackPanel } from "./feedback-panel";
import { api } from "@/lib/api";

interface MessageToolbarProps {
  role: "user" | "assistant";
  content: string;
  /** True si c'est le dernier message assistant (régénération possible). */
  isLastAssistant?: boolean;
  /** ID RagQueryLog pour le feedback (assistant only). */
  queryId?: string;
  onRegenerate?: () => void;
  onEdit?: () => void;
}

export function MessageToolbar({
  role,
  content,
  isLastAssistant,
  queryId,
  onRegenerate,
  onEdit,
}: MessageToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<-1 | 0 | 1 | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const ta = document.createElement("textarea");
        ta.value = content;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success("Copié dans le presse-papier");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const handleThumbsUp = async () => {
    if (!queryId || feedbackGiven !== null) return;
    setFeedbackGiven(1);
    try {
      await api.post(`/rag/${queryId}/feedback`, { rating: 1 });
      toast.success("Merci pour votre retour");
    } catch {
      /* silent */
    }
  };

  const handleThumbsDown = () => {
    if (!queryId || feedbackGiven !== null) return;
    setShowPanel(true);
  };

  const submitNegativeFeedback = async (feedbackJson: string) => {
    if (!queryId) return;
    await api.post(`/rag/${queryId}/feedback`, {
      rating: -1,
      feedback: feedbackJson,
    });
    setFeedbackGiven(-1);
  };

  const btn =
    "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-[#F68D2E] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400 transition";

  return (
    <>
      <div
        className="mt-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition"
        role="toolbar"
        aria-label="Actions sur le message"
      >
        <button
          type="button"
          onClick={handleCopy}
          className={btn}
          title="Copier"
          aria-label="Copier le contenu du message"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>

        {role === "user" && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className={btn}
            title="Éditer et renvoyer"
            aria-label="Éditer ce message et le renvoyer"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}

        {role === "assistant" && isLastAssistant && onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className={btn}
            title="Régénérer la réponse"
            aria-label="Régénérer la réponse"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}

        {role === "assistant" && queryId && (
          <>
            <button
              type="button"
              onClick={handleThumbsUp}
              disabled={feedbackGiven !== null}
              className={`${btn} ${feedbackGiven === 1 ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 opacity-100" : ""}`}
              title="Réponse utile"
              aria-label="Marquer la réponse comme utile"
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleThumbsDown}
              disabled={feedbackGiven !== null}
              className={`${btn} ${feedbackGiven === -1 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 opacity-100" : ""}`}
              title="Préciser un problème"
              aria-label="Réponse non utile — préciser la raison"
            >
              <ThumbsDown className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {showPanel && queryId && feedbackGiven === null && (
        <FeedbackPanel
          onSubmit={submitNegativeFeedback}
          onCancel={() => setShowPanel(false)}
        />
      )}
    </>
  );
}
