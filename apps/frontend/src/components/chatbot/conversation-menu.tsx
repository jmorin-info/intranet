"use client";

/**
 * ConversationMenu — Features 5 + 10.
 *
 * Menu déroulant accessible dans le header du chatbot avec :
 *   - Export Markdown (.md téléchargé)
 *   - Export PDF (signé via backend)
 *   - Partage par lien (POST /rag/conversations/share, valide 7 jours)
 */

import React, { useEffect, useRef, useState } from "react";
import { Download, FileText, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/stores/chatbot-store";
import {
  buildConversationMarkdown,
  downloadMarkdown,
  exportConversationPdf,
} from "./export-conversation";

interface ConversationMenuProps {
  messages: ChatMessage[];
  user?: { firstName?: string; lastName?: string; email?: string };
  module?: string;
}

export function ConversationMenu({
  messages,
  user,
  module,
}: ConversationMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"md" | "pdf" | "share" | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleMarkdown = () => {
    setBusy("md");
    try {
      const md = buildConversationMarkdown(messages, { user, module });
      const filename = `conversation-omnitech-${new Date().toISOString().slice(0, 10)}.md`;
      downloadMarkdown(filename, md);
      toast.success("Conversation exportée en Markdown");
      setOpen(false);
    } catch {
      toast.error("Échec de l'export Markdown");
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    setBusy("pdf");
    try {
      await exportConversationPdf(messages, { user, module });
      toast.success("PDF généré et téléchargé");
      setOpen(false);
    } catch {
      toast.error("Échec de l'export PDF");
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    setBusy("share");
    try {
      const payload = messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        sources: m.sources,
      }));
      const res = await api.post<{
        token: string;
        url: string;
        expiresAt: string;
      }>("/rag/conversations/share", { messages: payload });
      const url =
        res.data.url ||
        `${window.location.origin}/share/conversation/${res.data.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié — valide 7 jours");
      } catch {
        toast.success(`Lien généré : ${url}`);
      }
      setOpen(false);
    } catch (err: unknown) {
      // Fallback : copie un lien local "preview" (non persistant)
      try {
        const md = buildConversationMarkdown(messages, { user, module });
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        await navigator.clipboard.writeText(url);
        toast.warning("Partage en ligne indisponible — lien local copié");
      } catch {
        toast.error("Impossible de partager la conversation");
      }
    } finally {
      setBusy(null);
    }
  };

  if (messages.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Exporter ou partager"
        aria-label="Exporter ou partager la conversation"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 w-11 lg:h-8 lg:w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 transition active:scale-95"
      >
        <Share2 className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-30 py-1 animate-in fade-in zoom-in-95 duration-150"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleMarkdown}
            disabled={busy !== null}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-slate-900 dark:text-blue-400" />
            <span className="flex-1 text-left">Exporter en Markdown</span>
            {busy === "md" && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                …
              </span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handlePdf}
            disabled={busy !== null}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <FileText className="h-4 w-4 text-slate-900" />
            <span className="flex-1 text-left">Exporter en PDF</span>
            {busy === "pdf" && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                …
              </span>
            )}
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
          <button
            type="button"
            role="menuitem"
            onClick={handleShare}
            disabled={busy !== null}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Link2 className="h-4 w-4 text-emerald-600" />
            <span className="flex-1 text-left">Partager (lien 7 jours)</span>
            {busy === "share" && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                …
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
