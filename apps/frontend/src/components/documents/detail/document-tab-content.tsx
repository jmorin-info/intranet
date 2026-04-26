"use client";

import React from "react";
import { formatDate } from "@/lib/utils";
import type {
  DocumentDetail,
  DocumentVersion,
  SignatureData,
  AcknowledgmentData,
  DocuSealTemplate,
  DocumentComment,
  IsoAnalysisItem,
} from "./types";
import { DocumentDetailsPanel } from "./document-details-panel";
import { DocumentViewer } from "./document-viewer";
import { DocumentVersionsPanel } from "./document-versions-panel";
import { DocumentSignaturesPanel } from "./document-signatures-panel";
import { DocumentAckPanel } from "./document-ack-panel";
import { DocumentHistoryPanel } from "./document-history-panel";
import { DocumentCommentsPanel } from "./document-comments-panel";
import { DocumentIsoPanel } from "./document-iso-panel";
import { DocumentInlineEditPanel } from "./document-inline-edit-panel";
import { PermissionsPanel } from "@/app/(app)/documents/[id]/_components/PermissionsPanel";
import { SharesPanel } from "@/app/(app)/documents/[id]/_components/SharesPanel";

interface DocumentTabContentProps {
  activeTab: string;
  doc: DocumentDetail;
  currentVersion?: DocumentVersion;
  versions: DocumentVersion[];
  signatures: SignatureData[];
  acks: AcknowledgmentData[];
  docusealTemplates: DocuSealTemplate[];
  currentUserId?: string;
  canEdit: boolean;
  canEditInline: boolean;
  canOpenReadingMode: boolean;
  previewUrl: string;
  uploadingVersion: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  aiSummary: string | null;
  comments: DocumentComment[];
  commentText: string;
  commentSubmitting: boolean;
  history: {
    timeline?: Array<{
      type?: string;
      versionNumber?: string;
      action?: string;
      changeLog?: string;
      severity?: string;
      user?: { firstName: string; lastName: string };
      date: string;
      fileSize?: number;
    }>;
  } | null;
  historyLoading: boolean;
  isoAnalysis: IsoAnalysisItem[] | null;
  analyzing: boolean;
  inlineContent: string;
  inlineSaving: boolean;
  inlineDirty: boolean;
  onSetConfirmSignId: (id: string) => void;
  onUploadVersion: (file: File) => void;
  onOpenReadingMode: () => void;
  onCommentTextChange: (v: string) => void;
  onAddComment: () => void;
  onAutoAssignIso: () => void;
  onInlineChange: (html: string) => void;
  onInlineSave: () => void;
}

/**
 * Routeur de contenu pour les onglets de la page document.
 * Concentre le conditionnel activeTab === '…' pour alléger page.tsx.
 */
export function DocumentTabContent(props: DocumentTabContentProps) {
  const {
    activeTab,
    doc,
    currentVersion,
    versions,
    signatures,
    acks,
    docusealTemplates,
    currentUserId,
    canEdit,
    canEditInline,
    canOpenReadingMode,
    previewUrl,
    uploadingVersion,
    fileInputRef,
    aiSummary,
    comments,
    commentText,
    commentSubmitting,
    history,
    historyLoading,
    isoAnalysis,
    analyzing,
    inlineContent,
    inlineSaving,
    inlineDirty,
    onSetConfirmSignId,
    onUploadVersion,
    onOpenReadingMode,
    onCommentTextChange,
    onAddComment,
    onAutoAssignIso,
    onInlineChange,
    onInlineSave,
  } = props;

  if (activeTab === "details") {
    return (
      <DocumentDetailsPanel
        doc={doc}
        currentVersion={currentVersion}
        aiSummary={aiSummary}
        nextReviewLabel={
          doc.nextReviewDate ? formatDate(doc.nextReviewDate) : "Non défini"
        }
      />
    );
  }
  if (activeTab === "preview" && currentVersion) {
    return (
      <DocumentViewer
        fileType={currentVersion.fileType || ""}
        previewUrl={previewUrl}
        title={doc.title}
        canOpenReadingMode={canOpenReadingMode}
        onOpenReadingMode={onOpenReadingMode}
      />
    );
  }
  if (activeTab === "versions") {
    return (
      <DocumentVersionsPanel
        doc={doc}
        versions={versions}
        canEdit={canEdit}
        uploadingVersion={uploadingVersion}
        onUpload={onUploadVersion}
        fileInputRef={fileInputRef}
      />
    );
  }
  if (activeTab === "signatures") {
    return (
      <DocumentSignaturesPanel
        signatures={signatures}
        templates={docusealTemplates}
        currentUserId={currentUserId}
        onConfirmSign={onSetConfirmSignId}
      />
    );
  }
  if (activeTab === "acknowledgments") {
    return <DocumentAckPanel acknowledgments={acks} />;
  }
  if (activeTab === "history") {
    return <DocumentHistoryPanel history={history} loading={historyLoading} />;
  }
  if (activeTab === "comments") {
    return (
      <DocumentCommentsPanel
        comments={comments}
        commentText={commentText}
        onCommentTextChange={onCommentTextChange}
        onAddComment={onAddComment}
        submitting={commentSubmitting}
      />
    );
  }
  if (activeTab === "inline-edit" && doc.isNative) {
    return (
      <DocumentInlineEditPanel
        content={inlineContent}
        canEdit={canEditInline}
        saving={inlineSaving}
        dirty={inlineDirty}
        onChange={onInlineChange}
        onSave={onInlineSave}
      />
    );
  }
  if (activeTab === "iso-analysis" && isoAnalysis) {
    return (
      <DocumentIsoPanel
        items={isoAnalysis}
        analyzing={analyzing}
        onAutoAssign={onAutoAssignIso}
      />
    );
  }
  if (activeTab === "sharing") {
    // canEdit est un bon proxy pour "peut administrer" (owner ou ADMIN+)
    // pour cette MVP. Le backend revérifie strictement via canAdmin().
    const canAdmin = canEdit;
    return (
      <div className="space-y-4">
        <PermissionsPanel documentId={doc.id} canAdmin={canAdmin} />
        <SharesPanel documentId={doc.id} canAdmin={canAdmin} />
      </div>
    );
  }
  return null;
}
