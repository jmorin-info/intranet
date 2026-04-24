"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useAuthStore } from "@/stores/auth-store";
import { useDocumentStore } from "@/stores/document-store";
import { useTestimonialTrigger } from "@/hooks/use-testimonial-trigger";
import { eventBus, createEvent } from "@/lib/events";
import { getDocComments, addDocComment } from "./helpers";
import type {
  DocumentDetail,
  SignatureData,
  DocumentComment,
  DocuSealTemplate,
  IsoAnalysisItem,
  RelatedDoc,
  RejectionSuggestionsCatalog,
} from "./types";

/**
 * Hook centralisant TOUT l'état local et les handlers API de la page
 * /documents/[id]. Extrait du monolithe afin de réduire drastiquement la
 * taille du composant page (<500 lignes cible).
 */
export function useDocumentDetail(id: string | undefined) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { maybePrompt: maybePromptTestimonial } = useTestimonialTrigger();
  const decrementPendingCount = useDocumentStore(
    (s) => s.decrementPendingCount,
  );

  // --- Core state ---
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("details");
  const [autoSwitchedPreview, setAutoSwitchedPreview] = useState(false);

  // --- Dialogs ---
  const [showObsoleteDialog, setShowObsoleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDoc, setShowDeleteDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [readingModeOpen, setReadingModeOpen] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [reopening, setReopening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmSignId, setConfirmSignId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  // --- Rejection dialog ---
  const [showRejectDialog, setShowRejectDialog] = useState<
    "reject-review" | "reject-direction" | null
  >(null);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectSuggestions, setRejectSuggestions] = useState<Set<string>>(
    new Set(),
  );
  const [suggestionsCatalog, setSuggestionsCatalog] =
    useState<RejectionSuggestionsCatalog | null>(null);

  // --- History tab ---
  const [history, setHistory] = useState<{
    timeline?: Array<Record<string, unknown>>;
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // --- ISO analysis ---
  const [isoAnalysis, setIsoAnalysis] = useState<IsoAnalysisItem[] | null>(
    null,
  );

  // --- Related ---
  const [relatedDocs, setRelatedDocs] = useState<RelatedDoc[]>([]);
  const [ragRelatedDocs, setRagRelatedDocs] = useState<RelatedDoc[]>([]);
  const [ragRelatedLoading, setRagRelatedLoading] = useState(false);

  // --- Comments ---
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // --- AI ---
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiQuestionOpen, setAiQuestionOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiAnswerSources, setAiAnswerSources] = useState<
    Array<{ title?: string; reference?: string }>
  >([]);
  const [aiAnswerLoading, setAiAnswerLoading] = useState(false);

  // --- Signature modal ---
  const [docusealTemplates, setDocusealTemplates] = useState<
    DocuSealTemplate[]
  >([]);
  const [signatureModal, setSignatureModal] = useState(false);
  const [signerList, setSignerList] = useState<
    Array<{ id: string; firstName: string; lastName: string; role: string }>
  >([]);
  const [templates, setTemplates] = useState<DocuSealTemplate[]>([]);

  // --- Inline editing ---
  const [inlineContent, setInlineContent] = useState<string>("");
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineDirty, setInlineDirty] = useState(false);

  const refreshDocument = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get(`/documents/${id}`);
      const allSignatures = (data.versions || []).flatMap(
        (v: { signatureRequests?: SignatureData[] }) =>
          v.signatureRequests || [],
      );
      data.signatureRequests = allSignatures;
      setDoc(data);
      if (data?.isNative) {
        setInlineContent(data.content || "");
        setInlineDirty(false);
      }
      if (user) {
        setHasAcknowledged(
          data.acknowledgments?.some(
            (a: { user?: { id?: string } }) => a.user?.id === user.id,
          ) || false,
        );
      }
    } catch {
      toast.error("Document introuvable");
      router.push("/documents");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  const handleUploadVersion = async (file: File) => {
    if (!file || !id) return;
    setUploadingVersion(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("changeLog", "Upload depuis la page document");
      await api.post(`/documents/${id}/versions`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Version uploadée");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshDocument();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      toast.error(msg || "Erreur upload");
    } finally {
      setUploadingVersion(false);
    }
  };

  const handleReopen = async () => {
    if (!id) return;
    if (
      !confirm(
        "Réouvrir ce document le repassera en brouillon. Le workflow de revue devra être relancé. Continuer ?",
      )
    )
      return;
    setReopening(true);
    try {
      await api.post(`/documents/${id}/reopen`);
      toast.success("Document réouvert (statut Brouillon)");
      await refreshDocument();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      toast.error(msg || "Erreur réouverture");
    } finally {
      setReopening(false);
    }
  };

  const handleDeleteDoc = async () => {
    if (!doc) return;
    setDeletingDoc(true);
    try {
      await api.delete(`/documents/${doc.id}`);
      toast.success("Document supprimé");
      router.push("/documents");
    } catch {
      toast.error("Erreur suppression");
    } finally {
      setDeletingDoc(false);
    }
  };

  const handleAiSummary = async () => {
    if (!doc) return;
    setAiSummaryLoading(true);
    try {
      const { data } = await api.get(`/rag/documents/${doc.id}/ai-summary`, {
        timeout: 120_000,
      });
      setAiSummary(data.summary);
    } catch {
      setAiSummary("IA non disponible actuellement.");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleAskAi = async () => {
    if (!doc || !aiQuestion.trim()) return;
    setAiAnswerLoading(true);
    setAiAnswer(null);
    setAiAnswerSources([]);
    try {
      const { data } = await api.post(
        "/rag/ask",
        { question: `Concernant ${doc.title}: ${aiQuestion}` },
        { timeout: 120_000 },
      );
      setAiAnswer(data.answer || "Pas de réponse disponible.");
      setAiAnswerSources(data.sources || []);
    } catch {
      setAiAnswer("IA non disponible actuellement.");
    } finally {
      setAiAnswerLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    async function fetchDocument() {
      try {
        const { data } = await api.get(`/documents/${id}`);
        const allSignatures = (data.versions || []).flatMap(
          (v: { signatureRequests?: SignatureData[] }) =>
            v.signatureRequests || [],
        );
        data.signatureRequests = allSignatures;
        setDoc(data);
        if (data?.isNative) {
          setInlineContent(data.content || "");
          setInlineDirty(false);
        }
        if (user) {
          setHasAcknowledged(
            data.acknowledgments?.some(
              (a: { user?: { id?: string } }) => a.user?.id === user.id,
            ) || false,
          );
        }
        api
          .get(`/documents/${id}/related`)
          .then(({ data: related }) => {
            setRelatedDocs(related || []);
          })
          .catch(() => {
            /* non-critical */
          });
        setComments(getDocComments(id!));
      } catch {
        toast.error("Document introuvable");
        router.push("/documents");
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchDocument();
  }, [id, router, user]);

  // Auto-switch to preview
  useEffect(() => {
    if (autoSwitchedPreview) return;
    if (!doc) return;
    const firstVersion = doc.versions?.[0];
    if (!firstVersion) return;
    const isPdfOrDocx = /\.(pdf|docx?)$/i.test(firstVersion.fileType || "");
    if (isPdfOrDocx && !doc.isNative && activeTab === "details") {
      setActiveTab("preview");
      setAutoSwitchedPreview(true);
    }
  }, [doc, activeTab, autoSwitchedPreview]);

  useEffect(() => {
    if (activeTab === "signatures" && docusealTemplates.length === 0) {
      api
        .get("/signatures/templates")
        .then(({ data }) => {
          const tpls = Array.isArray(data) ? data : [];
          setDocusealTemplates(tpls);
        })
        .catch(() => {
          /* templates unavailable */
        });
    }
  }, [activeTab, docusealTemplates.length]);

  // RAG-based related docs
  useEffect(() => {
    if (!doc?.title) return;
    setRagRelatedLoading(true);
    api
      .get("/ai/search", { params: { q: doc.title } })
      .then(({ data }) => {
        const docs = (data?.documents || [])
          .filter((d: { id: string }) => d.id !== doc.id)
          .slice(0, 4)
          .map(
            (d: {
              id: string;
              title: string;
              reference?: string;
              category?: string;
              status?: string;
            }) => ({
              id: d.id,
              title: d.title,
              reference: d.reference || "",
              category: d.category || "",
              status: d.status || "DRAFT",
            }),
          );
        setRagRelatedDocs(docs);
      })
      .catch(() => {
        /* non-critical */
      })
      .finally(() => setRagRelatedLoading(false));
  }, [doc?.title, doc?.id]);

  // Rejection suggestions catalog
  useEffect(() => {
    if (showRejectDialog && !suggestionsCatalog) {
      api
        .get("/documents/rejection-suggestions")
        .then(({ data }) => setSuggestionsCatalog(data))
        .catch(() => {
          /* fallback to free text */
        });
    }
  }, [showRejectDialog, suggestionsCatalog]);

  const handleAction = async (action: string) => {
    if (!doc) return;
    setActionLoading(true);
    try {
      switch (action) {
        case "submit-review":
          await api.post(`/documents/${doc.id}/submit-review`);
          toast.success("Soumis en revue");
          break;
        case "approve-review":
          await api.post(`/documents/${doc.id}/approve-review`);
          decrementPendingCount();
          toast.success("Revue validée");
          break;
        case "request-approval":
          await api.post(`/documents/${doc.id}/request-approval`);
          toast.success("Approbation demandee");
          break;
        case "approve-direction":
          await api.post(`/documents/${doc.id}/approve`);
          decrementPendingCount();
          toast.success("Document approuve");
          maybePromptTestimonial("document_approved");
          break;
        case "reject-review":
          if (!rejectComment.trim() || rejectComment.trim().length < 10) {
            setShowRejectDialog("reject-review");
            return;
          }
          await api.post(`/documents/${doc.id}/reject-review`, {
            comment: rejectComment,
            suggestions: Array.from(rejectSuggestions),
          });
          decrementPendingCount();
          toast.success("Revue rejetee");
          setShowRejectDialog(null);
          setRejectComment("");
          setRejectSuggestions(new Set());
          break;
        case "reject-direction":
          if (!rejectComment.trim() || rejectComment.trim().length < 10) {
            setShowRejectDialog("reject-direction");
            return;
          }
          await api.post(`/documents/${doc.id}/reject`, {
            comment: rejectComment,
            suggestions: Array.from(rejectSuggestions),
          });
          decrementPendingCount();
          toast.success("Document rejete");
          setShowRejectDialog(null);
          setRejectComment("");
          setRejectSuggestions(new Set());
          break;
        case "mark-obsolete":
          await api.post(`/documents/${doc.id}/obsolete`);
          toast.success("Marque obsolete");
          setShowObsoleteDialog(false);
          break;
        case "archive":
          await api.patch(`/documents/${doc.id}`, { status: "ARCHIVED" });
          toast.success("Document archivé");
          setShowArchiveDialog(false);
          break;
        case "acknowledge":
          await api.post(`/documents/${doc.id}/acknowledge`);
          toast.success("Accuse enregistre");
          setHasAcknowledged(true);
          break;
        case "force-approve":
          await api.post(`/documents/${doc.id}/force-approve`, {
            makePermanent: false,
          });
          toast.success(
            "Document publie directement (workflow court-circuite)",
          );
          break;
        case "force-approve-permanent":
          await api.post(`/documents/${doc.id}/force-approve`, {
            makePermanent: true,
          });
          toast.success("Document publie + marque permanent");
          break;
      }
      const { data: refreshed } = await api.get(`/documents/${doc.id}`);
      refreshed.signatureRequests = (refreshed.versions || []).flatMap(
        (v: { signatureRequests?: unknown[] }) => v.signatureRequests || [],
      );
      setDoc(refreshed);
      const eventType = ["approve-review", "approve-direction"].includes(action)
        ? ("APPROVED" as const)
        : ["reject-review", "reject-direction"].includes(action)
          ? ("REJECTED" as const)
          : action === "submit-review"
            ? ("STATUS_CHANGED" as const)
            : action === "mark-obsolete" || action === "archive"
              ? ("STATUS_CHANGED" as const)
              : ("UPDATED" as const);
      eventBus.emit(
        createEvent(eventType, "DOCUMENT", doc.id, {
          from: doc.status,
          to: refreshed.status,
          optimistic: false,
          label: `${doc.reference} ${action}`,
        }),
      );
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Erreur";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleIsoAnalysis = async () => {
    if (!doc) return;
    setAnalyzing(true);
    try {
      const { data } = await api.get(`/iso-analyzer/analyze/${doc.id}`);
      setIsoAnalysis(data.results || []);
      setActiveTab("iso-analysis");
      toast.success("Analyse ISO terminée");
    } catch {
      toast.error("Erreur analyse ISO");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAutoAssign = async () => {
    if (!doc) return;
    setAnalyzing(true);
    try {
      await api.post(`/iso-analyzer/auto-assign/${doc.id}`);
      toast.success("ISO auto-assignes");
      await refreshDocument();
    } catch {
      toast.error("Erreur d'assignation");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!doc) return;
    try {
      await api.patch(`/documents/${doc.id}`, { isPublic: !doc.isPublic });
      toast.success("Visibilite mise a jour");
      await refreshDocument();
    } catch {
      toast.error("Erreur");
    }
  };

  const loadHistory = async () => {
    if (history) return;
    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/documents/${doc!.id}/history`);
      setHistory(data);
    } catch (err) {
      logger.error(err, { context: "useDocumentDetail: load history" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddComment = () => {
    if (!doc || !user || !commentText.trim()) return;
    setCommentSubmitting(true);
    const entry = addDocComment({
      documentId: doc.id,
      authorName: `${user.firstName} ${user.lastName}`,
      authorEmail: user.email || "",
      content: commentText.trim(),
    });
    setComments((prev) => [entry, ...prev]);
    setCommentText("");
    setCommentSubmitting(false);
    toast.success("Commentaire ajouté");
  };

  const handleSaveInlineContent = async () => {
    if (!doc) return;
    setInlineSaving(true);
    try {
      await api.patch(`/documents/${doc.id}/content`, {
        content: inlineContent,
      });
      toast.success("Contenu enregistré");
      setInlineDirty(false);
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Erreur lors de l'enregistrement";
      toast.error(msg);
    } finally {
      setInlineSaving(false);
    }
  };

  const openSignatureRequest = async () => {
    const [usersRes, tplRes] = await Promise.all([
      api.get("/users?limit=200").catch(() => ({ data: { data: [] } })),
      api.get("/signatures/templates").catch(() => ({ data: { data: [] } })),
    ]);
    const users = usersRes.data?.data || usersRes.data || [];
    const eligible = users.filter(
      (u: { role: string; isActive?: boolean }) =>
        ["DIRECTION", "SUPER_ADMIN", "ADMIN", "REVIEWER"].includes(u.role) &&
        u.isActive !== false,
    );
    setSignerList(eligible.length > 0 ? eligible : users.slice(0, 30));
    setTemplates(tplRes.data?.data || []);
    setSignatureModal(true);
  };

  return {
    user,
    // state
    doc,
    loading,
    activeTab,
    setActiveTab,
    showObsoleteDialog,
    setShowObsoleteDialog,
    showArchiveDialog,
    setShowArchiveDialog,
    showDeleteDoc,
    setShowDeleteDoc,
    deletingDoc,
    readingModeOpen,
    setReadingModeOpen,
    uploadingVersion,
    reopening,
    fileInputRef,
    confirmSignId,
    setConfirmSignId,
    actionLoading,
    analyzing,
    hasAcknowledged,
    showRejectDialog,
    setShowRejectDialog,
    rejectComment,
    setRejectComment,
    rejectSuggestions,
    setRejectSuggestions,
    suggestionsCatalog,
    history,
    historyLoading,
    isoAnalysis,
    relatedDocs,
    ragRelatedDocs,
    ragRelatedLoading,
    comments,
    commentText,
    setCommentText,
    commentSubmitting,
    aiSummary,
    aiSummaryLoading,
    aiQuestionOpen,
    setAiQuestionOpen,
    aiQuestion,
    setAiQuestion,
    aiAnswer,
    aiAnswerSources,
    aiAnswerLoading,
    docusealTemplates,
    signatureModal,
    setSignatureModal,
    signerList,
    templates,
    inlineContent,
    setInlineContent,
    inlineSaving,
    inlineDirty,
    setInlineDirty,
    // handlers
    refreshDocument,
    handleAction,
    handleUploadVersion,
    handleReopen,
    handleDeleteDoc,
    handleAiSummary,
    handleAskAi,
    handleIsoAnalysis,
    handleAutoAssign,
    handleTogglePublic,
    loadHistory,
    handleAddComment,
    handleSaveInlineContent,
    openSignatureRequest,
  };
}
