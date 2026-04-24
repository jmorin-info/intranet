"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@omnitech/ui";
import { api } from "@/lib/api";
import type { DocuSealTemplate } from "./types";

interface SignerUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface DocumentSignatureRequestModalProps {
  open: boolean;
  onClose: () => void;
  currentVersionId: string;
  signers: SignerUser[];
  templates: DocuSealTemplate[];
  onSuccess: () => void;
}

export function DocumentSignatureRequestModal({
  open,
  onClose,
  currentVersionId,
  signers,
  templates,
  onSuccess,
}: DocumentSignatureRequestModalProps) {
  const [selectedSigner, setSelectedSigner] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setLoading(true);
    try {
      await api.post("/signatures/request", {
        documentVersionId: currentVersionId,
        signerId: selectedSigner,
        ...(selectedTemplate ? { templateId: selectedTemplate } : {}),
      });
      toast.success("Signature demandee");
      onSuccess();
      onClose();
    } catch {
      toast.error("Erreur signature");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-seal-navy dark:text-white mb-4">
          Demander une signature
        </h3>
        {templates.length > 0 && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">
              Modèle DocuSeal (optionnel)
            </label>
            <select
              className="w-full rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              value={selectedTemplate || ""}
              onChange={(e) =>
                setSelectedTemplate(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            >
              <option value="">Sans modèle</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">
            Signataire
          </label>
          <select
            className="w-full rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            value={selectedSigner}
            onChange={(e) => setSelectedSigner(e.target.value)}
          >
            <option value="">Sélectionner...</option>
            {signers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.role})
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1"
            loading={loading}
            disabled={!selectedSigner}
            onClick={submit}
          >
            Envoyer
          </Button>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
