"use client";

import React from "react";
import { Button } from "@omnitech/ui";
import { MessageSquare, Send } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { DocumentComment } from "./types";

interface DocumentCommentsPanelProps {
  comments: DocumentComment[];
  commentText: string;
  onCommentTextChange: (v: string) => void;
  onAddComment: () => void;
  submitting: boolean;
}

export function DocumentCommentsPanel({
  comments,
  commentText,
  onCommentTextChange,
  onAddComment,
  submitting,
}: DocumentCommentsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <textarea
            value={commentText}
            onChange={(e) => onCommentTextChange(e.target.value)}
            placeholder="Ajouter un commentaire..."
            className="w-full rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white placeholder:text-seal-gray-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 min-h-[60px] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                onAddComment();
              }
            }}
          />
          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">
            Ctrl+Entree pour envoyer
          </p>
        </div>
        <Button
          onClick={onAddComment}
          disabled={!commentText.trim() || submitting}
          loading={submitting}
          className="self-start"
        >
          <Send className="h-3.5 w-3.5" />
          Envoyer
        </Button>
      </div>

      {comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="h-8 w-8 text-seal-gray-500/30 mx-auto mb-2" />
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            Aucun commentaire pour le moment
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-gray-200 dark:border-slate-700 p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-seal-navy dark:text-white">
                  {c.authorName}
                </span>
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                  {formatDateTime(c.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">
                {c.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
