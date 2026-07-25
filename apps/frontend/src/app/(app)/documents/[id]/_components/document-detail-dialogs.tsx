"use client";

import React from "react";
import { ConfirmDialog } from "@omnitech/ui";

/**
 * Regroupement des ConfirmDialog destructifs / d'action de la page Document
 * Detail : marquer obsolète, archiver, supprimer.
 *
 * La confirmation de « signature au clic » a été retirée (refonte signatures
 * 2026-07) : une signature engageante passe uniquement par DocuSeal.
 *
 * Centralisé ici pour alléger la page principale et grouper la logique de
 * confirmation utilisateur (toutes basées sur le même primitive ConfirmDialog).
 */
export interface DocumentDetailDialogsProps {
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
