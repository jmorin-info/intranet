"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { isRoleAtLeast, UserRole, getStatusTransitions } from "@omnitech/shared";
import { Button } from "@omnitech/ui";
import { PenLine } from "lucide-react";
import { EntityBreadcrumb } from "@/components/ui/entity-breadcrumb";

import { getReviewDeadlineInfo } from "@/components/documents/detail/helpers";
import { buildWorkflowSteps } from "@/components/documents/detail/build-workflow-steps";
import { DocumentHeader } from "@/components/documents/detail/document-header";
import { DocumentSidebar } from "@/components/documents/detail/document-sidebar";
import { DocumentWorkflowTimeline } from "@/components/documents/detail/document-workflow-timeline";
import { DocumentTabs, buildDocumentTabs } from "@/components/documents/detail/document-tabs";
import { DocumentTabContent } from "@/components/documents/detail/document-tab-content";
import { DocumentSignatureRequestModal } from "@/components/documents/detail/document-signature-request-modal";
import { DocumentRejectionDialog } from "@/components/documents/detail/document-rejection-dialog";
import {
  MissingApproverBanner,
  DraftEmptyBanner,
  ReopenBanner,
  AcknowledgmentBanner,
} from "@/components/documents/detail/document-banners";
import { useDocumentDetail } from "@/components/documents/detail/use-document-detail";
import { DocumentDetailLoading } from "./_components/document-detail-loading";
import { DocumentDetailNotFound } from "./_components/document-detail-not-found";
import { DocumentDetailDialogs } from "./_components/document-detail-dialogs";

const ReadingMode = dynamic(
  () => import("@/components/documents/reading-mode").then((m) => m.ReadingMode),
  { ssr: false },
);

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ctx = useDocumentDetail(id);

  if (ctx.loading) {
    return <DocumentDetailLoading />;
  }

  const { doc, user } = ctx;
  if (!doc || !user) return <DocumentDetailNotFound />;

  const versions = doc.versions || [];
  const sigs = doc.signatureRequests || [];
  const acks = doc.acknowledgments || [];
  const currentVersion = versions[0];
  const canEdit = isRoleAtLeast(user.role, UserRole.ADMIN) || doc.owner.id === user.id;
  const transitions = getStatusTransitions(
    doc.status as never,
    user.role,
  ) as unknown as readonly string[];
  const showAckBanner = doc.status === "APPROVED" && !ctx.hasAcknowledged;
  // Analyse ISO ouverte à tous les rôles authentifiés (fix 2026-07) : le
  // contrôle d'accès par classification est appliqué côté backend
  // (IsoAnalyzerService, ISO 27001 A.5.15).
  const canAnalyze = true;
  const reviewInfo = getReviewDeadlineInfo(doc.nextReviewDate);
  const workflowSteps = buildWorkflowSteps(doc);

  const canPreview =
    !!currentVersion &&
    /\.(pdf|docx?|md|txt|png|jpe?g|webp|gif)$/i.test(currentVersion.fileType || "");
  const apiV1Base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/?$/, "/api/v1");
  const previewUrl = currentVersion?.fileUrl
    ? currentVersion.fileUrl.startsWith("http")
      ? currentVersion.fileUrl
      : `${apiV1Base}${currentVersion.fileUrl.startsWith("/") ? "" : "/"}${currentVersion.fileUrl}`
    : "";
  const isPdf = currentVersion && /\.pdf$/i.test(currentVersion.fileType || "");
  const readingModePdfUrl = isPdf
    ? `${apiV1Base}/documents/${doc.id}/download?inline=true`
    : undefined;
  const canOpenReadingMode = Boolean(isPdf);

  const canEditInline =
    !!doc.isNative &&
    (canEdit || doc.reviewer?.id === user.id) &&
    (doc.status === "DRAFT" || doc.status === "IN_REVIEW");

  // L'onglet "Partage et permissions" est visible pour le propriétaire et
  // les ADMIN+ (le backend revérifie strictement via canAdmin()).
  const showSharing = canEdit;
  const tabs = buildDocumentTabs({
    canPreview,
    isNative: !!doc.isNative,
    versionsCount: versions.length,
    signaturesCount: sigs.length,
    acksCount: acks.length,
    commentsCount: ctx.comments.length,
    hasIsoAnalysis: !!ctx.isoAnalysis,
    isoAnalysisCount: ctx.isoAnalysis?.length || 0,
    showSharing,
  });

  return (
    <div className="space-y-6 animate-fade-in-up">
      <EntityBreadcrumb module="Documents" href="/documents" current={doc.reference} />

      <MissingApproverBanner doc={doc} currentUserId={user.id} />

      <DocumentHeader
        doc={doc}
        currentVersion={currentVersion}
        user={user}
        transitions={transitions}
        canEdit={canEdit}
        canAnalyze={canAnalyze}
        canOpenReadingMode={canOpenReadingMode}
        analyzing={ctx.analyzing}
        reviewInfo={reviewInfo}
        aiSummaryLoading={ctx.aiSummaryLoading}
        onAction={ctx.handleAction}
        onIsoAnalysis={ctx.handleIsoAnalysis}
        onAiSummary={ctx.handleAiSummary}
        onOpenReadingMode={() => ctx.setReadingModeOpen(true)}
        onOpenObsoleteDialog={() => ctx.setShowObsoleteDialog(true)}
        onOpenArchiveDialog={() => ctx.setShowArchiveDialog(true)}
        onOpenDeleteDialog={() => ctx.setShowDeleteDoc(true)}
        onTogglePublic={ctx.handleTogglePublic}
        aiQuestion={ctx.aiQuestion}
        aiQuestionOpen={ctx.aiQuestionOpen}
        aiAnswer={ctx.aiAnswer}
        aiAnswerSources={ctx.aiAnswerSources}
        aiAnswerLoading={ctx.aiAnswerLoading}
        onToggleAiQuestion={() => ctx.setAiQuestionOpen((v) => !v)}
        onAiQuestionChange={ctx.setAiQuestion}
        onAskAi={ctx.handleAskAi}
      />

      {canAnalyze && currentVersion && doc.status === "APPROVED" && (
        <div className="flex justify-end -mt-2">
          <Button variant="outline" size="sm" onClick={ctx.openSignatureRequest}>
            <PenLine className="h-3.5 w-3.5" />
            Demander signature
          </Button>
        </div>
      )}
      {ctx.signatureModal && currentVersion && (
        <DocumentSignatureRequestModal
          open={ctx.signatureModal}
          onClose={() => ctx.setSignatureModal(false)}
          currentVersionId={currentVersion.id}
          signers={ctx.signerList}
          templates={ctx.templates}
          onSuccess={ctx.refreshDocument}
        />
      )}

      <DraftEmptyBanner
        canEdit={canEdit}
        doc={doc}
        versionsCount={versions.length}
        onUploadClick={() => {
          ctx.setActiveTab("versions");
          setTimeout(() => ctx.fileInputRef.current?.click(), 100);
        }}
      />

      <ReopenBanner
        canEdit={canEdit}
        doc={doc}
        reopening={ctx.reopening}
        onReopen={ctx.handleReopen}
      />

      <AcknowledgmentBanner
        visible={showAckBanner}
        actionLoading={ctx.actionLoading}
        onAcknowledge={() => ctx.handleAction("acknowledge")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <DocumentWorkflowTimeline steps={workflowSteps} />
          <DocumentTabs
            tabs={tabs}
            activeTab={ctx.activeTab}
            onChange={(tab) => {
              ctx.setActiveTab(tab);
              if (tab === "history") ctx.loadHistory();
            }}
          >
            <DocumentTabContent
              activeTab={ctx.activeTab}
              doc={doc}
              currentVersion={currentVersion}
              versions={versions}
              signatures={sigs}
              acks={acks}
              docusealTemplates={ctx.docusealTemplates}
              currentUserId={user.id}
              canEdit={canEdit}
              canEditInline={canEditInline}
              canOpenReadingMode={canOpenReadingMode}
              previewUrl={previewUrl}
              uploadingVersion={ctx.uploadingVersion}
              fileInputRef={ctx.fileInputRef}
              aiSummary={ctx.aiSummary}
              comments={ctx.comments}
              commentText={ctx.commentText}
              commentSubmitting={ctx.commentSubmitting}
              history={
                ctx.history as unknown as {
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
                } | null
              }
              historyLoading={ctx.historyLoading}
              isoAnalysis={ctx.isoAnalysis}
              analyzing={ctx.analyzing}
              inlineContent={ctx.inlineContent}
              inlineSaving={ctx.inlineSaving}
              inlineDirty={ctx.inlineDirty}
              onSetConfirmSignId={ctx.setConfirmSignId}
              onUploadVersion={ctx.handleUploadVersion}
              onOpenReadingMode={() => ctx.setReadingModeOpen(true)}
              onCommentTextChange={ctx.setCommentText}
              onAddComment={ctx.handleAddComment}
              onAutoAssignIso={ctx.handleAutoAssign}
              onInlineChange={(html) => {
                ctx.setInlineContent(html);
                ctx.setInlineDirty(true);
              }}
              onInlineSave={ctx.handleSaveInlineContent}
            />
          </DocumentTabs>
        </div>

        <DocumentSidebar
          doc={doc}
          currentVersion={currentVersion}
          versions={versions}
          signatures={sigs}
          acks={acks}
          workflowSteps={workflowSteps}
          transitions={transitions}
          canEdit={canEdit}
          isOwner={user.id === doc.owner.id}
          currentUserId={user.id}
          actionLoading={ctx.actionLoading}
          reviewInfo={reviewInfo}
          relatedDocs={ctx.relatedDocs}
          ragRelatedDocs={ctx.ragRelatedDocs}
          ragRelatedLoading={ctx.ragRelatedLoading}
          onAction={ctx.handleAction}
          onOpenObsoleteDialog={() => ctx.setShowObsoleteDialog(true)}
          onOpenArchiveDialog={() => ctx.setShowArchiveDialog(true)}
        />
      </div>

      <DocumentDetailDialogs
        confirmSignId={ctx.confirmSignId}
        setConfirmSignId={ctx.setConfirmSignId}
        refreshDocument={ctx.refreshDocument}
        showObsoleteDialog={ctx.showObsoleteDialog}
        setShowObsoleteDialog={ctx.setShowObsoleteDialog}
        showArchiveDialog={ctx.showArchiveDialog}
        setShowArchiveDialog={ctx.setShowArchiveDialog}
        showDeleteDoc={ctx.showDeleteDoc}
        setShowDeleteDoc={ctx.setShowDeleteDoc}
        handleDeleteDoc={ctx.handleDeleteDoc}
        deletingDoc={ctx.deletingDoc}
        actionLoading={ctx.actionLoading}
        handleAction={ctx.handleAction}
        docTitle={doc.title}
      />

      {canOpenReadingMode && readingModePdfUrl && (
        <ReadingMode
          open={ctx.readingModeOpen}
          onClose={() => ctx.setReadingModeOpen(false)}
          documentTitle={`${doc.title} — v${currentVersion?.versionNumber ?? ""}`}
          documentId={doc.id}
          pdfUrl={readingModePdfUrl}
          onProgress={(percent) => {
            try {
              localStorage.setItem(`doc-progress-${doc.id}`, String(percent));
            } catch {
              /* noop */
            }
          }}
        />
      )}

      <DocumentRejectionDialog
        mode={ctx.showRejectDialog}
        comment={ctx.rejectComment}
        suggestions={ctx.rejectSuggestions}
        catalog={ctx.suggestionsCatalog}
        loading={ctx.actionLoading}
        onClose={() => {
          ctx.setShowRejectDialog(null);
          ctx.setRejectComment("");
          ctx.setRejectSuggestions(new Set());
        }}
        onCommentChange={ctx.setRejectComment}
        onSuggestionsChange={ctx.setRejectSuggestions}
        onConfirm={() => ctx.showRejectDialog && ctx.handleAction(ctx.showRejectDialog)}
      />
    </div>
  );
}
