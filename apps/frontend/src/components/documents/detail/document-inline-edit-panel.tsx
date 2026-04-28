"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Button } from "@omnitech/ui";
import { PenLine } from "lucide-react";

const InlineEditor = dynamic(
  () =>
    import("@/components/documents/inline-editor").then((m) => m.InlineEditor),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);

interface DocumentInlineEditPanelProps {
  content: string;
  canEdit: boolean;
  saving: boolean;
  dirty: boolean;
  onChange: (html: string) => void;
  onSave: () => void;
}

export function DocumentInlineEditPanel({
  content,
  canEdit,
  saving,
  dirty,
  onChange,
  onSave,
}: DocumentInlineEditPanelProps) {
  return (
    <div className="space-y-3">
      {!canEdit && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300">
          Le contenu est en lecture seule (statut verrouillé ou droits
          insuffisants).
        </div>
      )}
      <InlineEditor
        value={content}
        disabled={!canEdit}
        onChange={(html) => onChange(html)}
      />
      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-seal-gray-500 dark:text-slate-400">
            {dirty ? "Modifications non enregistrées" : "À jour"}
          </span>
          <Button onClick={onSave} loading={saving} disabled={!dirty}>
            <PenLine className="h-4 w-4" />
            Enregistrer
          </Button>
        </div>
      )}
    </div>
  );
}
