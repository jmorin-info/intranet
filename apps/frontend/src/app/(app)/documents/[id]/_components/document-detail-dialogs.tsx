"use client";

import React from "react";
import { ConfirmDialog } from "@omnitech/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * Regroupement des ConfirmDialog destructifs / d'action de la page Document
 * Detail : signature, marquer obsolète, archiver, supprimer.
 *
 * Centralisé ici pour alléger la page principale et grouper la logique de
 * confirmation utilisateur (toutes basées sur le même primitive ConfirmDialog).
 */
export interface DocumentDetailDialogsProps {
  // Signature
  confirmSignId: string | null;
  setConfirmSignId: (v: string | null) => void;
  refreshDocument: () => Promise<void> | void;

  // Marquer obsolète
  showObsoleteDialog: boolean;
  setShowObsoleteDialog: (v: boolean) => void;

  // Archiver
  showArchiveDialog: boolean;
  setShowArchiveDialog: (v: boolean) => void;

  // Supprimer
  showDeleteDoc: boolean;
  setShowDeleteDoc: (v: boolean) => void;
  handleDeleteDoc: () => void | Promise<void>;
  deletingDoc: boolean;

  // Communs
  actionLoading: boolean;
  handleAction: (action: string) => void | Promise<void>;
  docTitle: string;
}

export const DocumentDetailDialogs = React.memo(function DocumentDetailDialogs({
  confirmSignId,
  setConfirmSignId,
  refreshDocument,
  showObsoleteDialog,
  setShowObsoleteDialog,
  showArchiveDialog,
  setShowArchiveDialog,
  showDeleteDoc,
  setShowDeleteDoc,
  handleDeleteDoc,
  deletingDoc,
  actionLoading,
  handleAction,
  docTitle,
}: DocumentDetailDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={!!confirmSignId}
        onClose={() => setConfirmSignId(null)}
        onConfirm={async () => {
          const sigId = confirmSignId;
          setConfirmSignId(null);
          try {
            await api.patch(`/signatures/${sigId}/sign`);
            toast.success("Document signé");
            await refreshDocument();
          } catch {
            toast.error("Erreur signature");
          }
        }}
        title="Confirmer la signature"
        description="Confirmez-vous la signature de ce document ?"
        confirmLabel="Signer"
        variant="primary"
      />
      <ConfirmDialog
        open={showObsoleteDialog}
        onClose={() => setShowObsoleteDialog(false)}
        onConfirm={() => handleAction("mark-obsolete")}
        title="Marquer comme obsolète"
        description="Ce document sera marqué comme obsolète et ne sera plus visible par les collaborateurs. Cette action est réversible."
        confirmLabel="Confirmer"
        variant="danger"
        loading={actionLoading}
      />
      <ConfirmDialog
        open={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        onConfirm={() => handleAction("archive")}
        title="Archiver le document"
        description="Le document sera archivé. Seuls les administrateurs pourront le remettre en brouillon."
        confirmLabel="Archiver"
        variant="danger"
        loading={actionLoading}
      />
      <ConfirmDialog
        open={showDeleteDoc}
        onClose={() => setShowDeleteDoc(false)}
        onConfirm={handleDeleteDoc}
        title="Supprimer le document"
        description={`Supprimer définitivement "${docTitle}" ? Cette action est irréversible et supprimera toutes les versions et signatures associées.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deletingDoc}
      />
    </>
  );
});
