'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useDocumentStore } from '@/stores/document-store';
import { toast } from 'sonner';
import {
  isRoleAtLeast,
  UserRole,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  getStatusTransitions,
  formatFileSize,
} from '@omnitech/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  StatusBadge,
  IsoControlBadge,
  SignatureBadge,
  Badge,
  WorkflowTimeline,
  ConfirmDialog,
  Skeleton,
  Tabs,
  Dialog,
  Textarea,
} from '@omnitech/ui';
import type { WorkflowStep } from '@omnitech/ui';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft,
  ChevronDown,
  Edit,
  Download,
  FileText,
  Eye,
  UserCheck,
  PenLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  Hash,
  Printer,
  Link2,
  FileImage,
  ArrowLeftRight,
  BookOpen,
  Layers,
  History,
  Maximize2,
  Copy,
  Check,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import { BookmarkButton } from '@/components/bookmark-button';
import { useTranslation } from '@/lib/i18n';
import { EntityBreadcrumb } from '@/components/ui/entity-breadcrumb';
import { eventBus, createEvent } from '@/lib/events';
import type { DiffVersion } from '@/components/documents/version-diff';

const PdfViewer = dynamic(
  () => import('@/components/viewers/pdf-viewer').then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);
const DocxViewer = dynamic(
  () => import('@/components/viewers/docx-viewer').then((m) => m.DocxViewer),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);
const InlineEditor = dynamic(
  () => import('@/components/documents/inline-editor').then((m) => m.InlineEditor),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);
const ReadingMode = dynamic(
  () => import('@/components/documents/reading-mode').then((m) => m.ReadingMode),
  { ssr: false },
);
const VersionDiff = dynamic(
  () => import('@/components/documents/version-diff').then((m) => m.VersionDiff),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);
const WorkflowPanel = dynamic(
  () => import('@/components/documents/workflow-panel').then((m) => m.WorkflowPanel),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);

// --- Document Comments (localStorage-based, ready for backend migration) ---
interface DocumentComment {
  id: string;
  documentId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
}

const COMMENTS_STORAGE_KEY = 'omnitech_doc_comments';

function getDocComments(documentId: string): DocumentComment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COMMENTS_STORAGE_KEY);
    const all: DocumentComment[] = raw ? JSON.parse(raw) : [];
    return all.filter((c) => c.documentId === documentId).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch {
    return [];
  }
}

function addDocComment(comment: Omit<DocumentComment, 'id' | 'createdAt'>): DocumentComment {
  const all: DocumentComment[] = (() => {
    try {
      const raw = localStorage.getItem(COMMENTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();
  const entry: DocumentComment = {
    ...comment,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  all.push(entry);
  localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(all.slice(-500)));
  return entry;
}

interface DocumentVersion {
  id: string;
  versionNumber: string;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  checksum: string;
  changeLog: string | null;
  uploadedBy: { firstName: string; lastName: string };
  createdAt: string;
}

interface ValidationStepData {
  id: string;
  stepType: string;
  assignedTo: { firstName: string; lastName: string };
  action: string | null;
  comment: string | null;
  actionAt: string | null;
}

interface SignatureData {
  id: string;
  status: string;
  signer: { id: string; firstName: string; lastName: string };
  signedAt: string | null;
  requestedBy: { firstName: string; lastName: string };
  docusealSubmissionId: string | null;
  docusealSlug?: string | null;
}

interface DocuSealTemplate {
  id: number;
  name: string;
  created_at: string;
}

interface AcknowledgmentData {
  id: string;
  user: { firstName: string; lastName: string };
  acknowledgedAt: string;
}

interface DocumentDetail {
  id: string;
  title: string;
  reference: string;
  description: string | null;
  status: string;
  category: string;
  classification: string | null;
  nextReviewDate: string | null;
  isPublic: boolean;
  isNative?: boolean;
  content?: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; firstName: string; lastName: string };
  reviewer: { id: string; firstName: string; lastName: string } | null;
  approver: { id: string; firstName: string; lastName: string } | null;
  isoControls: Array<{ isoControl: { id: string; code: string; title: string; titleFr?: string } }>;
  versions: DocumentVersion[];
  validationRequests: Array<{
    id: string;
    status: string;
    currentStep: string;
    steps: ValidationStepData[];
  }>;
  signatureRequests: SignatureData[];
  acknowledgments: AcknowledgmentData[];
}

export default function DocumentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const decrementPendingCount = useDocumentStore(s => s.decrementPendingCount);

  const handleDownload = async (url: string, filename: string, inline = false) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      if (inline) {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      toast.error('Erreur de téléchargement');
    }
  };
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');

  // Inline status dropdown (unified UX — same pattern as tickets/incidents)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [showObsoleteDialog, setShowObsoleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [reopening, setReopening] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showRejectDialog, setShowRejectDialog] = useState<'reject-review' | 'reject-direction' | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectSuggestions, setRejectSuggestions] = useState<Set<string>>(new Set());
  const [suggestionsCatalog, setSuggestionsCatalog] = useState<{
    categories: Array<{ name: string; items: Array<{ key: string; label: string }> }>;
  } | null>(null);
  const [confirmSignId, setConfirmSignId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [history, setHistory] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isoAnalysis, setIsoAnalysis] = useState<Array<{
    controlCode: string;
    controlTitle: string;
    relevanceScore: number;
    justification: string;
    conformityStatus: string;
    matchedKeywords: string[];
  }> | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showDeleteDoc, setShowDeleteDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [relatedDocs, setRelatedDocs] = useState<Array<{
    id: string; title: string; reference: string; category: string; status: string; updatedAt: string;
    isoControls: Array<{ isoControl: { code: string; title: string; titleFr?: string } }>;
  }>>([]);
  // --- Comments ---
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  // --- RAG Related Documents ---
  const [ragRelatedDocs, setRagRelatedDocs] = useState<Array<{
    id: string; title: string; reference: string; category: string; status: string;
  }>>([]);
  const [ragRelatedLoading, setRagRelatedLoading] = useState(false);
  // --- Ask AI about this document ---
  const [aiQuestionOpen, setAiQuestionOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiAnswerSources, setAiAnswerSources] = useState<Array<{ title?: string; reference?: string }>>([]);
  const [aiAnswerLoading, setAiAnswerLoading] = useState(false);

  const handleAiSummary = async () => {
    if (!doc) return;
    setAiSummaryLoading(true);
    try {
      const { data } = await api.get(`/rag/documents/${doc.id}/ai-summary`, { timeout: 120_000 });
      setAiSummary(data.summary);
    } catch {
      setAiSummary('IA non disponible actuellement.');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleDeleteDoc = async () => {
    if (!doc) return;
    setDeletingDoc(true);
    try {
      await api.delete(`/documents/${doc.id}`);
      toast.success('Document supprimé');
      router.push('/documents');
    } catch { toast.error('Erreur suppression'); }
    finally { setDeletingDoc(false); }
  };
  const [docusealTemplates, setDocusealTemplates] = useState<DocuSealTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [signatureModal, setSignatureModal] = useState(false);
  const [signerList, setSignerList] = useState<Array<{id: string; firstName: string; lastName: string; role: string}>>([]);
  const [selectedSigner, setSelectedSigner] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);
  const [templates, setTemplates] = useState<DocuSealTemplate[]>([]);
  const [readingModeOpen, setReadingModeOpen] = useState(false);
  const [inlineContent, setInlineContent] = useState<string>('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineDirty, setInlineDirty] = useState(false);
  // --- Comparaison de versions (task GED) ---
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeft, setCompareLeft] = useState<string | null>(null);
  const [compareRight, setCompareRight] = useState<string | null>(null);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [copiedChecksum, setCopiedChecksum] = useState<string | null>(null);
  const copyChecksum = async (checksum: string) => {
    try {
      await navigator.clipboard.writeText(checksum);
      setCopiedChecksum(checksum);
      toast.success('Checksum copié');
      setTimeout(() => setCopiedChecksum(null), 2000);
    } catch {
      toast.error('Copie impossible');
    }
  };

  // Extrait en fonction nommée pour pouvoir rafraîchir après upload/reopen
  // sans dupliquer la logique de chargement.
  const refreshDocument = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get(`/documents/${id}`);
      const allSignatures = (data.versions || []).flatMap(
        (v: { signatureRequests?: SignatureData[] }) => v.signatureRequests || [],
      );
      data.signatureRequests = allSignatures;
      setDoc(data);
      if (data?.isNative) {
        setInlineContent(data.content || '');
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
      toast.error('Document introuvable');
      router.push('/documents');
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
      formData.append('file', file);
      formData.append('changeLog', 'Upload depuis la page document');
      await api.post(`/documents/${id}/versions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Version uploadée');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshDocument();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur upload');
    } finally {
      setUploadingVersion(false);
    }
  };

  const handleReopen = async () => {
    if (!id) return;
    if (!confirm('Réouvrir ce document le repassera en brouillon. Le workflow de revue devra être relancé. Continuer ?')) return;
    setReopening(true);
    try {
      await api.post(`/documents/${id}/reopen`);
      toast.success('Document réouvert (statut Brouillon)');
      await refreshDocument();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur réouverture');
    } finally {
      setReopening(false);
    }
  };

  useEffect(() => {
    async function fetchDocument() {
      try {
        const { data } = await api.get(`/documents/${id}`);
        // Flatten signatureRequests from versions into doc level
        const allSignatures = (data.versions || []).flatMap(
          (v: { signatureRequests?: SignatureData[] }) => v.signatureRequests || [],
        );
        data.signatureRequests = allSignatures;
        setDoc(data);
        if (data?.isNative) {
          setInlineContent(data.content || '');
          setInlineDirty(false);
        }
        if (user) {
          setHasAcknowledged(
            data.acknowledgments?.some(
              (a: { user?: { id?: string } }) => a.user?.id === user.id,
            ) || false,
          );
        }
        // Fetch related documents
        api.get(`/documents/${id}/related`).then(({ data: related }) => {
          setRelatedDocs(related || []);
        }).catch(() => { /* non-critical */ });
        // Load comments from localStorage (pas de modele DocumentComment cote
        // backend — les commentaires sont stockes localement par user). Si un
        // modele backend est ajoute plus tard, restaurer l'appel api.get.
        setComments(getDocComments(id));
      } catch {
        toast.error('Document introuvable');
        router.push('/documents');
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchDocument();
  }, [id, router, user]);

  // Auto-bascule sur l'onglet Aperçu quand le document arrive et qu'il est
  // visualisable (PDF/DOCX non-native). Évite à l'utilisateur de cliquer
  // manuellement pour voir le contenu qu'il vient d'ouvrir. On ne bascule
  // qu'une fois (transition 'details' initial → 'preview') pour respecter
  // les choix de navigation ultérieurs.
  const [autoSwitchedPreview, setAutoSwitchedPreview] = useState(false);
  useEffect(() => {
    if (autoSwitchedPreview) return;
    if (!doc) return;
    const firstVersion = doc.versions?.[0];
    if (!firstVersion) return;
    const isPdfOrDocx = /\.(pdf|docx?)$/i.test(firstVersion.fileType || '');
    if (isPdfOrDocx && !doc.isNative && activeTab === 'details') {
      setActiveTab('preview');
      setAutoSwitchedPreview(true);
    }
  }, [doc, activeTab, autoSwitchedPreview]);

  useEffect(() => {
    if (activeTab === 'signatures' && docusealTemplates.length === 0) {
      api.get('/signatures/templates')
        .then(({ data }) => {
          const templates = Array.isArray(data) ? data : [];
          setDocusealTemplates(templates);
          if (templates.length > 0 && !selectedTemplateId) {
            setSelectedTemplateId(templates[0].id);
          }
        })
        .catch(() => { /* templates unavailable */ });
    }
  }, [activeTab, docusealTemplates.length, selectedTemplateId]);

  // --- Fetch RAG-based related documents when title is available ---
  useEffect(() => {
    if (!doc?.title) return;
    setRagRelatedLoading(true);
    api.get('/ai/search', { params: { q: doc.title } })
      .then(({ data }) => {
        const docs = (data?.documents || [])
          .filter((d: { id: string }) => d.id !== doc.id)
          .slice(0, 4)
          .map((d: { id: string; title: string; reference?: string; category?: string; status?: string }) => ({
            id: d.id,
            title: d.title,
            reference: d.reference || '',
            category: d.category || '',
            status: d.status || 'DRAFT',
          }));
        setRagRelatedDocs(docs);
      })
      .catch(() => { /* non-critical */ })
      .finally(() => setRagRelatedLoading(false));
  }, [doc?.title, doc?.id]);

  // --- Ask AI about this document ---
  const handleAskAi = async () => {
    if (!doc || !aiQuestion.trim()) return;
    setAiAnswerLoading(true);
    setAiAnswer(null);
    setAiAnswerSources([]);
    try {
      const { data } = await api.post('/rag/ask', {
        question: `Concernant ${doc.title}: ${aiQuestion}`,
      }, { timeout: 120_000 });
      setAiAnswer(data.answer || 'Pas de réponse disponible.');
      setAiAnswerSources(data.sources || []);
    } catch {
      setAiAnswer('IA non disponible actuellement.');
    } finally {
      setAiAnswerLoading(false);
    }
  };

  // Load rejection suggestions catalog when a reject dialog is opened
  useEffect(() => {
    if (showRejectDialog && !suggestionsCatalog) {
      api.get('/documents/rejection-suggestions')
        .then(({ data }) => setSuggestionsCatalog(data))
        .catch(() => { /* optional — fallback to free text only */ });
    }
  }, [showRejectDialog, suggestionsCatalog]);

  const handleAction = async (action: string) => {
    if (!doc) return;
    setActionLoading(true);
    try {
      switch (action) {
        case 'submit-review':
          await api.post(`/documents/${doc.id}/submit-review`);
          toast.success('Soumis en revue');
          break;
        case 'approve-review':
          await api.post(`/documents/${doc.id}/approve-review`);
          decrementPendingCount();
          toast.success('Revue validée');
          break;
        case 'request-approval':
          await api.post(`/documents/${doc.id}/request-approval`);
          toast.success('Approbation demandee');
          break;
        case 'approve-direction':
          await api.post(`/documents/${doc.id}/approve`);
          decrementPendingCount();
          toast.success('Document approuve');
          break;
        case 'reject-review':
          if (!rejectComment.trim() || rejectComment.trim().length < 10) { setShowRejectDialog('reject-review'); return; }
          await api.post(`/documents/${doc.id}/reject-review`, {
            comment: rejectComment,
            suggestions: Array.from(rejectSuggestions),
          });
          decrementPendingCount();
          toast.success('Revue rejetee');
          setShowRejectDialog(null);
          setRejectComment('');
          setRejectSuggestions(new Set());
          break;
        case 'reject-direction':
          if (!rejectComment.trim() || rejectComment.trim().length < 10) { setShowRejectDialog('reject-direction'); return; }
          await api.post(`/documents/${doc.id}/reject`, {
            comment: rejectComment,
            suggestions: Array.from(rejectSuggestions),
          });
          decrementPendingCount();
          toast.success('Document rejete');
          setShowRejectDialog(null);
          setRejectComment('');
          setRejectSuggestions(new Set());
          break;
        case 'mark-obsolete':
          await api.post(`/documents/${doc.id}/obsolete`);
          toast.success('Marque obsolete');
          setShowObsoleteDialog(false);
          break;
        case 'archive':
          await api.patch(`/documents/${doc.id}`, { status: 'ARCHIVED' });
          toast.success('Document archivé');
          setShowArchiveDialog(false);
          break;
        case 'acknowledge':
          await api.post(`/documents/${doc.id}/acknowledge`);
          toast.success('Accuse enregistre');
          setHasAcknowledged(true);
          break;
        case 'force-approve':
          await api.post(`/documents/${doc.id}/force-approve`, { makePermanent: false });
          toast.success('Document publie directement (workflow court-circuite)');
          break;
        case 'force-approve-permanent':
          await api.post(`/documents/${doc.id}/force-approve`, { makePermanent: true });
          toast.success('Document publie + marque permanent (aucune date de revue)');
          break;
      }
      // Refresh document with flatten
      const { data: refreshed } = await api.get(`/documents/${doc.id}`);
      refreshed.signatureRequests = (refreshed.versions || []).flatMap(
        (v: { signatureRequests?: unknown[] }) => v.signatureRequests || [],
      );
      setDoc(refreshed);
      // Emit confirmed event for cross-module sync
      const eventType = (['approve-review', 'approve-direction'].includes(action)) ? 'APPROVED' as const
        : (['reject-review', 'reject-direction'].includes(action)) ? 'REJECTED' as const
        : action === 'submit-review' ? 'STATUS_CHANGED' as const
        : action === 'mark-obsolete' || action === 'archive' ? 'STATUS_CHANGED' as const
        : 'UPDATED' as const;
      eventBus.emit(createEvent(eventType, 'DOCUMENT', doc.id, {
        from: doc.status, to: refreshed.status, optimistic: false, label: `${doc.reference} ${action}`,
      }));
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur';
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!doc || !user) return (
    <div className="max-w-5xl mx-auto py-12 text-center">
      <FileText className="h-12 w-12 text-seal-gray-500/30 mx-auto mb-4" />
      <p className="text-lg font-medium text-seal-navy dark:text-white">Document introuvable</p>
      <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">Ce document n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
      <Button variant="outline" className="mt-4" onClick={() => router.push('/documents')}>
        <ArrowLeft className="h-4 w-4" /> {t('documents.detail.back')}
      </Button>
    </div>
  );

  const versions = doc.versions || [];
  const sigs = doc.signatureRequests || [];
  const acks = doc.acknowledgments || [];
  const isos = doc.isoControls || [];
  const currentVersion = versions[0];
  const canEdit = isRoleAtLeast(user.role, UserRole.ADMIN) || doc.owner.id === user.id;
  const transitions = getStatusTransitions(doc.status as never, user.role);
  const showAckBanner = doc.status === 'APPROVED' && !hasAcknowledged;

  // Build workflow steps (ISO 27001 A.5.1 — cycle d'approbation GED)
  const workflowSteps: WorkflowStep[] = [
    {
      label: 'Rédaction',
      status: doc.status === 'DRAFT' ? 'current' : 'completed',
      actor: `${doc.owner.firstName} ${doc.owner.lastName}`,
      date: formatDate(doc.createdAt),
    },
    {
      label: 'Revue technique',
      status:
        doc.status === 'IN_REVIEW'
          ? 'current'
          : ['REVIEW_APPROVED', 'PENDING_APPROVAL', 'APPROVED', 'OBSOLETE'].includes(doc.status)
          ? 'completed'
          : 'pending',
      actor: doc.reviewer ? `${doc.reviewer.firstName} ${doc.reviewer.lastName}` : undefined,
    },
    {
      label: 'Confirmation rédacteur',
      status:
        doc.status === 'REVIEW_APPROVED'
          ? 'current'
          : ['PENDING_APPROVAL', 'APPROVED', 'OBSOLETE'].includes(doc.status)
          ? 'completed'
          : 'pending',
      actor: `${doc.owner.firstName} ${doc.owner.lastName}`,
    },
    {
      label: 'Approbation Direction',
      status:
        doc.status === 'PENDING_APPROVAL'
          ? 'current'
          : ['APPROVED', 'OBSOLETE'].includes(doc.status)
          ? 'completed'
          : 'pending',
      actor: doc.approver ? `${doc.approver.firstName} ${doc.approver.lastName}` : undefined,
    },
    {
      label: 'Publié',
      // APPROVED = publication finale effective → étape 'completed' (vert),
      // pas 'current' (orange clignotant). OBSOLETE reste completed par
      // cohérence historique (le doc a bien été publié à un moment).
      status:
        doc.status === 'APPROVED' || doc.status === 'OBSOLETE'
          ? 'completed'
          : 'pending',
      date: doc.status === 'APPROVED' ? formatDate(doc.updatedAt) : undefined,
    },
  ];

  const canAnalyze = user && isRoleAtLeast(user.role, UserRole.REVIEWER);

  const handleIsoAnalysis = async () => {
    if (!doc) return;
    setAnalyzing(true);
    try {
      const { data } = await api.get(`/iso-analyzer/analyze/${doc.id}`);
      setIsoAnalysis(data.results || []);
      setActiveTab('iso-analysis');
      toast.success('Analyse ISO terminée');
    } catch {
      toast.error('Erreur analyse ISO');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAutoAssign = async () => {
    if (!doc) return;
    setAnalyzing(true);
    try {
      const { data } = await api.post(`/iso-analyzer/auto-assign/${doc.id}`);
      toast.success('ISO auto-assignes');
      // Refresh document
      const { data: refreshed } = await api.get(`/documents/${doc.id}`);
      const allSigs = (refreshed.versions || []).flatMap(
        (v: { signatureRequests?: unknown[] }) => v.signatureRequests || [],
      );
      refreshed.signatureRequests = allSigs;
      setDoc(refreshed);
    } catch {
      toast.error('Erreur d\'assignation');
    } finally {
      setAnalyzing(false);
    }
  };

  const canPreview = currentVersion && /\.(pdf|docx?)$/i.test(currentVersion.fileType || '');
  const previewUrl = currentVersion?.fileUrl ? (currentVersion.fileUrl.startsWith('http') ? currentVersion.fileUrl : `${process.env.NEXT_PUBLIC_API_URL || ''}${currentVersion.fileUrl.startsWith('/') ? '' : '/'}${currentVersion.fileUrl}`) : '';
  // URL for the inline viewer used in the focus reading mode
  const isPdf = currentVersion && /\.pdf$/i.test(currentVersion.fileType || '');
  const readingModePdfUrl = isPdf
    ? `${process.env.NEXT_PUBLIC_API_URL || ''}/documents/${doc.id}/download?inline=true`
    : undefined;
  const canOpenReadingMode = Boolean(isPdf);

  const tabs = [
    // Aperçu en PREMIER quand le document est visualisable (PDF/DOCX) : pour
    // que l'utilisateur voie directement le contenu plutôt que d'avoir à
    // cliquer sur "Stirling PDF" (éditeur lourd) ou à changer d'onglet.
    ...(canPreview && !doc.isNative ? [{ id: 'preview', label: 'Aperçu', icon: <Eye className="h-3.5 w-3.5" /> }] : []),
    ...(doc.isNative ? [{ id: 'inline-edit', label: 'Éditer en ligne', icon: <PenLine className="h-3.5 w-3.5" /> }] : []),
    { id: 'details', label: 'Détails', icon: <FileText className="h-3.5 w-3.5" /> },
    { id: 'versions', label: 'Versions', count: versions.length, icon: <Layers className="h-3.5 w-3.5" /> },
    { id: 'signatures', label: 'Signatures', count: sigs?.length || 0, icon: <PenLine className="h-3.5 w-3.5" /> },
    { id: 'acknowledgments', label: 'Accusés', count: acks.length, icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { id: 'history', label: 'Historique', icon: <History className="h-3.5 w-3.5" /> },
    { id: 'comments', label: 'Commentaires', count: comments.length, icon: <MessageSquare className="h-3.5 w-3.5" /> },
    ...(isoAnalysis ? [{ id: 'iso-analysis', label: 'Analyse ISO', count: isoAnalysis.length, icon: <Shield className="h-3.5 w-3.5" /> }] : []),
  ];

  const canEditInline =
    !!doc.isNative &&
    (canEdit || doc.reviewer?.id === user.id) &&
    (doc.status === 'DRAFT' || doc.status === 'IN_REVIEW');

  const handleSaveInlineContent = async () => {
    if (!doc) return;
    setInlineSaving(true);
    try {
      await api.patch(`/documents/${doc.id}/content`, { content: inlineContent });
      toast.success('Contenu enregistré');
      setInlineDirty(false);
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Erreur lors de l'enregistrement";
      toast.error(msg);
    } finally {
      setInlineSaving(false);
    }
  };

  const loadHistory = async () => {
    if (history) return;
    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/documents/${doc.id}/history`);
      setHistory(data);
    } catch (err) { console.error('Failed to load document history:', err); }
    finally { setHistoryLoading(false); }
  };

  const handleAddComment = async () => {
    if (!doc || !user || !commentText.trim()) return;
    setCommentSubmitting(true);
    // Pas de modele DocumentComment backend — persistance localStorage.
    const entry = addDocComment({
      documentId: doc.id,
      authorName: `${user.firstName} ${user.lastName}`,
      authorEmail: user.email || '',
      content: commentText.trim(),
    });
    setComments((prev) => [entry, ...prev]);
    setCommentText('');
    setCommentSubmitting(false);
    toast.success('Commentaire ajouté');
  };

  // Status bar color mapping
  const statusBarColor: Record<string, string> = {
    DRAFT: 'bg-blue-500',
    IN_REVIEW: 'bg-amber-500',
    REVIEW_APPROVED: 'bg-[#296DC1]',
    PENDING_APPROVAL: 'bg-purple-500',
    APPROVED: 'bg-emerald-500',
    OBSOLETE: 'bg-gray-400',
    ARCHIVED: 'bg-gray-300',
  };

  // Review deadline color coding
  const getReviewDeadlineInfo = () => {
    if (!doc.nextReviewDate) return null;
    const diffMs = new Date(doc.nextReviewDate).getTime() - Date.now();
    const days = Math.floor(diffMs / 86400000);
    if (days < 0) return { text: `En retard de ${Math.abs(days)}j`, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', dot: 'bg-red-500' };
    if (days <= 14) return { text: `Dans ${days}j`, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', dot: 'bg-amber-500' };
    return { text: `Dans ${days}j`, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500' };
  };
  const reviewInfo = getReviewDeadlineInfo();

  return (
    <div className="space-y-6 animate-fade-in-up">
      <EntityBreadcrumb module="Documents" href="/documents" current={doc.reference} />

      {/* Workflow alert : approbateur final manquant quand statut IN_REVIEW */}
      {doc.status === 'IN_REVIEW' && !doc.approver && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-seal-navy dark:text-white">
              Approbateur final manquant
            </p>
            <p className="text-seal-gray-500 dark:text-slate-300 mt-1">
              Ce document est en revue mais n'a pas d'approbateur final assigné. Le
              reviewer ne pourra pas valider la revue tant qu'un approbateur n'a
              pas été désigné. Cliquez sur <strong>Modifier</strong> pour en
              assigner un.
            </p>
          </div>
          {user?.id === doc.owner?.id && (
            <Link
              href={`/documents/${doc.id}/edit`}
              className="flex-shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition"
            >
              Modifier
            </Link>
          )}
        </div>
      )}

      {/* Compact header card */}
      <Card className="shadow-sm rounded-xl overflow-hidden">
        {/* Status indicator bar */}
        <div className={`h-1 ${statusBarColor[doc.status] || 'bg-gray-300'}`} />
        <div className="p-5 space-y-3">
          {/* Line 1: Back + Reference + Classification + Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors duration-200"
              >
                <ArrowLeft className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
              </button>
              <span className="font-mono text-[11px] text-seal-gray-500 dark:text-slate-400">{doc.reference}</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                doc.classification === 'PUBLIC' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                doc.classification === 'CONFIDENTIEL' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                doc.classification === 'SECRET' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              }`}>
                {doc.classification || 'INTERNE'}
              </span>
              {/* Inline status dropdown — unified UX with tickets/incidents */}
              <div ref={statusDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => transitions.length > 0 && setStatusDropdownOpen(o => !o)}
                  className={`inline-flex items-center gap-1 transition ${transitions.length > 0 ? 'cursor-pointer hover:ring-2 hover:ring-primary/30 rounded-full' : 'cursor-default'}`}
                >
                  <StatusBadge status={doc.status as 'DRAFT' | 'IN_REVIEW' | 'REVIEW_APPROVED' | 'PENDING_APPROVAL' | 'APPROVED' | 'OBSOLETE' | 'ARCHIVED'} />
                  {transitions.length > 0 && <ChevronDown className={`h-3 w-3 text-seal-gray-500 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />}
                </button>
                {statusDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 animate-fade-in-up">
                    {doc.status === 'DRAFT' && transitions.includes('IN_REVIEW' as never) && (
                      <button type="button" onClick={() => { setStatusDropdownOpen(false); handleAction('submit-review'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                        <Eye className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-seal-navy dark:text-white">Soumettre en revue</span>
                      </button>
                    )}
                    {/* ADMIN+ shortcut : forcer approbation sur doc existant
                        (bypass workflow, pour docs permanents ou refus de
                        passer par la revue). */}
                    {user && isRoleAtLeast(user.role, UserRole.ADMIN) && doc.status !== 'APPROVED' && doc.status !== 'OBSOLETE' && doc.status !== 'ARCHIVED' && (
                      <>
                        <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
                        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-seal-gray-500 font-semibold">
                          Actions admin
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusDropdownOpen(false);
                            if (confirm('Publier ce document directement ? Les workflows pending seront annulés.')) {
                              handleAction('force-approve');
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-seal-navy dark:text-white">Publier directement</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusDropdownOpen(false);
                            if (confirm('Publier + marquer permanent ? La date de revue sera supprimée.')) {
                              handleAction('force-approve-permanent');
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                        >
                          <Shield className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-seal-navy dark:text-white">Publier + permanent</span>
                        </button>
                        <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
                      </>
                    )}
                    {doc.status === 'IN_REVIEW' && transitions.includes('REVIEW_APPROVED' as never) && (
                      <button
                        type="button"
                        disabled={!doc.approver}
                        onClick={() => { setStatusDropdownOpen(false); handleAction('approve-review'); }}
                        title={!doc.approver ? "Assignez d'abord un approbateur final (bouton 'Modifier')" : undefined}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-seal-navy dark:text-white">Valider la revue</span>
                        {!doc.approver && <span className="ml-auto text-[10px] text-seal-gray-500">(approbateur requis)</span>}
                      </button>
                    )}
                    {doc.status === 'IN_REVIEW' && (
                      <button type="button" onClick={() => { setStatusDropdownOpen(false); handleAction('reject-review'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-seal-navy dark:text-white">Rejeter la revue</span>
                      </button>
                    )}
                    {doc.status === 'REVIEW_APPROVED' && user?.id === doc.owner?.id && (
                      <button type="button" onClick={() => { setStatusDropdownOpen(false); handleAction('request-approval'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-seal-navy dark:text-white">Demander approbation</span>
                      </button>
                    )}
                    {doc.status === 'PENDING_APPROVAL' && transitions.includes('APPROVED' as never) && (
                      <button type="button" onClick={() => { setStatusDropdownOpen(false); handleAction('approve-direction'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-seal-navy dark:text-white">Approuver</span>
                      </button>
                    )}
                    {doc.status === 'PENDING_APPROVAL' && (
                      <button type="button" onClick={() => { setStatusDropdownOpen(false); handleAction('reject-direction'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-seal-navy dark:text-white">Refuser</span>
                      </button>
                    )}
                    {doc.status === 'APPROVED' && transitions.includes('OBSOLETE' as never) && (
                      <button type="button" onClick={() => { setStatusDropdownOpen(false); setShowObsoleteDialog(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-seal-navy dark:text-white">Marquer obsolete</span>
                      </button>
                    )}
                    {transitions.includes('ARCHIVED' as never) && (
                      <button type="button" onClick={() => { setStatusDropdownOpen(false); setShowArchiveDialog(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-seal-navy dark:text-white">Archiver</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <BookmarkButton type="document" id={doc.id} title={doc.title} href={`/documents/${doc.id}`} />
            </div>
            {/* Actions aligned right */}
            <div className="flex items-center gap-2 flex-wrap justify-end no-print">
              {currentVersion && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    handleDownload(
                      `/documents/${doc.id}/versions/${currentVersion.id}/download`,
                      `${doc.reference}-v${currentVersion.versionNumber}`,
                      true,
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  Télécharger
                </Button>
              )}
              {canEdit && doc.status === 'DRAFT' && (
                <Button variant="outline" size="sm" onClick={() => router.push(`/documents/${doc.id}/edit`)}>
                  <Edit className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              )}
              {canOpenReadingMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReadingModeOpen(true)}
                  title="Mode lecture plein ecran"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Lecture
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={handleAiSummary}
                disabled={aiSummaryLoading}
                title="Générer un résumé intelligent du document via l'IA OMNITECH"
                className="gap-2"
              >
                <Sparkles className={`h-4 w-4 ${aiSummaryLoading ? 'animate-spin' : ''}`} />
                {aiSummaryLoading ? 'Analyse en cours…' : 'Résumé IA'}
              </Button>
              {/* Stirling PDF / OnlyOffice */}
              {currentVersion && (() => {
                const fileUrl = (currentVersion.fileUrl || '').toLowerCase();
                const fileType = (currentVersion.fileType || '').toLowerCase();
                const extMatch = fileUrl.match(/\.([a-z0-9]+)(\?|$|\/)/);
                const extension = extMatch && extMatch[1] ? extMatch[1] : '';
                const isPdfFile = extension === 'pdf' || fileType.includes('pdf');
                const isOfficeDoc =
                  /^(docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|rtf)$/.test(extension) ||
                  ['word', 'excel', 'powerpoint', 'officedocument', 'opendocument', 'text/plain', 'text/csv', 'application/rtf', 'msword']
                    .some((m) => fileType.includes(m));

                if (isPdfFile) {
                  return (
                    <div className="relative group">
                      <div className="flex">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => router.push(`/tools/pdf?doc=${doc.id}&version=${currentVersion.id}`)}
                          title="Outils PDF avancés (merge, split, OCR, compression, filigrane)"
                          className="rounded-r-none"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Outils PDF
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-l-none border-l px-1.5"
                          title="Plus d'actions PDF"
                          aria-label="Plus d'actions PDF"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </Button>
                      </div>
                      <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 hidden group-hover:block">
                        {[
                          { label: 'Fusionner avec...', path: '/merge-pdfs' },
                          { label: 'Compresser', path: '/compress-pdf' },
                          { label: 'OCR (reconnaissance texte)', path: '/ocr-pdf' },
                          { label: 'Ajouter filigrane', path: '/add-watermark' },
                        ].map((tool) => (
                          <button
                            key={tool.path}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white first:rounded-t-lg last:rounded-b-lg transition-colors duration-200"
                            onClick={() => router.push(`/tools/pdf?doc=${doc.id}&version=${currentVersion.id}`)}
                          >
                            {tool.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (isOfficeDoc) {
                  const e = extension.toLowerCase();
                  let formatLabel = 'OnlyOffice';
                  let formatColor = 'text-primary';
                  if (/^docx?$/.test(e) || e === 'odt' || e === 'rtf') { formatLabel = 'OnlyOffice · Word'; formatColor = 'text-blue-600'; }
                  else if (/^xlsx?$/.test(e) || e === 'ods' || e === 'csv') { formatLabel = 'OnlyOffice · Excel'; formatColor = 'text-emerald-600'; }
                  else if (/^pptx?$/.test(e) || e === 'odp') { formatLabel = 'OnlyOffice · PowerPoint'; formatColor = 'text-orange-600'; }
                  return (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/documents/${doc.id}/editor`)}
                      title={`Ouvrir dans l'editeur ${formatLabel}`}
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span className={`text-[10px] ${formatColor}`}>{formatLabel}</span>
                    </Button>
                  );
                }
                return null;
              })()}
              <Button
                variant="outline"
                size="sm"
                className="no-print"
                onClick={() => {
                  // Si le doc a un fichier (PDF, DOCX…) on l'ouvre dans un
                  // nouvel onglet en mode inline : le navigateur affichera
                  // son propre viewer avec son bouton imprimer sur le CONTENU,
                  // pas sur la page intranet.
                  // Pour les documents natifs inline (HTML), fallback sur
                  // window.print() mais avec nos classes no-print pour
                  // masquer l'UI qui n'est pas le contenu.
                  if (currentVersion?.id) {
                    const w = window.open(`/api/v1/documents/${doc.id}/download?inline=true`, '_blank');
                    if (w) w.focus();
                  } else {
                    window.print();
                  }
                }}
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/documents/${doc.id}`;
                  navigator.clipboard?.writeText(url)
                    .then(() => toast.success('Lien copie'))
                    .catch(() => toast.error('Impossible de copier'));
                }}>
                <Link2 className="h-3 w-3" /> Partager
              </Button>
              {canAnalyze && (
                <Button variant="outline" size="sm" onClick={handleIsoAnalysis} loading={analyzing}>
                  <Shield className="h-3.5 w-3.5" />
                  ISO
                </Button>
              )}
              {isRoleAtLeast(user.role, UserRole.ADMIN) && (
                <Button
                  variant={doc.isPublic ? 'primary' : 'outline'}
                  size="sm"
                  onClick={async () => {
                    try {
                      await api.patch(`/documents/${doc.id}`, { isPublic: !doc.isPublic });
                      toast.success('Visibilite mise a jour');
                      const { data } = await api.get(`/documents/${doc.id}`);
                      data.signatureRequests = (data.versions || []).flatMap((v: any) => v.signatureRequests || []);
                      setDoc(data);
                    } catch { toast.error('Erreur'); }
                  }}
                >
                  <Eye className="h-3 w-3" />
                  {doc.isPublic ? 'Public' : 'Public'}
                </Button>
              )}
              {(isRoleAtLeast(user.role, UserRole.ADMIN) || doc.owner?.id === user.id) && (
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowDeleteDoc(true)}>
                  <XCircle className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Line 2: Title + Ask AI */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-medium text-seal-navy dark:text-white">{doc.title}</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAiQuestionOpen((v) => !v)}
              className="gap-1.5 text-xs"
              title="Poser une question à l'IA sur ce document"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Poser une question
            </Button>
          </div>

          {/* AI Question inline panel */}
          {aiQuestionOpen && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-seal-navy dark:text-white">Question sur ce document</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !aiAnswerLoading) handleAskAi(); }}
                  placeholder="Ex: Quels sont les contrôles ISO couverts ?"
                  className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  disabled={aiAnswerLoading}
                />
                <Button
                  size="sm"
                  onClick={handleAskAi}
                  disabled={aiAnswerLoading || !aiQuestion.trim()}
                  className="gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {aiAnswerLoading ? 'Analyse…' : 'Envoyer'}
                </Button>
              </div>
              {aiAnswerLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              )}
              {aiAnswer && !aiAnswerLoading && (
                <div className="rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 p-3 space-y-2">
                  <p className="text-sm leading-relaxed text-seal-navy dark:text-slate-200 whitespace-pre-wrap">{aiAnswer}</p>
                  {aiAnswerSources.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 mb-1">Sources</p>
                      <div className="flex flex-wrap gap-1.5">
                        {aiAnswerSources.map((src, idx) => (
                          <span key={idx} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">
                            {src.title || src.reference || `Source ${idx + 1}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Line 3: Inline metadata */}
          <div className="flex items-center gap-4 flex-wrap text-[11px] text-seal-gray-500 dark:text-slate-400">
            <span>
              Proprietaire : <span className="text-seal-navy dark:text-white font-medium">{doc.owner.firstName} {doc.owner.lastName}</span>
            </span>
            <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
            <span>
              Categorie : <Badge variant="navy" className="text-[10px] ml-0.5">{DOCUMENT_CATEGORY_LABELS[doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS]}</Badge>
            </span>
            <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
            <span>
              Mis à jour : <span className="text-seal-navy dark:text-white font-medium">{formatDate(doc.updatedAt)}</span>
            </span>
            {reviewInfo && (
              <>
                <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${reviewInfo.bg} ${reviewInfo.color}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${reviewInfo.dot}`} />
                  Revision {reviewInfo.text}
                </span>
              </>
            )}
            {doc.nextReviewDate && new Date(doc.nextReviewDate).getTime() < Date.now() && (
              <>
                <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#892034]/15 dark:bg-red-900/30 px-3 py-1 text-[11px] font-bold text-[#892034] dark:text-red-400 animate-pulse">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Revision en retard
                </span>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Signature request button + modal (kept outside header card) */}
      {canAnalyze && currentVersion && doc.status === 'APPROVED' && (
        <div className="flex justify-end -mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const [usersRes, tplRes] = await Promise.all([
                api.get('/users?limit=200').catch(() => ({ data: { data: [] } })),
                api.get('/signatures/templates').catch(() => ({ data: { data: [] } })),
              ]);
              const users = usersRes.data?.data || usersRes.data || [];
              const eligible = users.filter((u: any) => ['DIRECTION','SUPER_ADMIN','ADMIN','REVIEWER'].includes(u.role) && u.isActive !== false);
              setSignerList(eligible.length > 0 ? eligible : users.slice(0, 30));
              setTemplates(tplRes.data?.data || []);
              setSignatureModal(true);
            }}
          >
            <PenLine className="h-3.5 w-3.5" />
            Demander signature
          </Button>
        </div>
      )}
          {signatureModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSignatureModal(false)}>
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-medium text-seal-navy dark:text-white mb-4">Demander une signature</h3>

                {templates.length > 0 && (
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">Modèle DocuSeal (optionnel)</label>
                    <select className="w-full rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                      value={selectedTemplate || ''} onChange={e => setSelectedTemplate(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Sans modèle</option>
                      {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">Signataire</label>
                  <select className="w-full rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={selectedSigner} onChange={e => setSelectedSigner(e.target.value)}>
                    <option value="">Sélectionner...</option>
                    {signerList.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.role})</option>)}
                  </select>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1" loading={signingLoading} disabled={!selectedSigner}
                    onClick={async () => {
                      setSigningLoading(true);
                      try {
                        await api.post('/signatures/request', {
                          documentVersionId: currentVersion!.id,
                          signerId: selectedSigner,
                          ...(selectedTemplate ? { templateId: selectedTemplate } : {}),
                        });
                        toast.success('Signature demandee');
                        setSignatureModal(false);
                        const { data } = await api.get(`/documents/${doc.id}`);
                        const allSigs = (data.versions || []).flatMap((v: any) => v.signatureRequests || []);
                        data.signatureRequests = allSigs;
                        setDoc(data);
                      } catch { toast.error('Erreur signature'); }
                      finally { setSigningLoading(false); }
                    }}>
                    Envoyer
                  </Button>
                  <Button variant="outline" onClick={() => setSignatureModal(false)}>Annuler</Button>
                </div>
              </div>
            </div>
          )}

      {/* Banner DRAFT sans version : incite à uploader le fichier */}
      {canEdit && doc.status === 'DRAFT' && versions.length === 0 && (
        <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-[#F9964A] bg-[#F9964A]/5 p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[#F9964A]" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Brouillon sans contenu
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                Uploadez un fichier pour commencer la rédaction. Tant qu&apos;il n&apos;y a pas de version, le document reste en brouillon et n&apos;est pas publiable.
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setActiveTab('versions');
              setTimeout(() => fileInputRef.current?.click(), 100);
            }}
          >
            <FileText className="h-4 w-4 mr-1" />
            Uploader un fichier
          </Button>
        </div>
      )}

      {/* Banner ARCHIVED / OBSOLETE : permet de réouvrir en brouillon pour
          produire une nouvelle version (cas : document périmé à mettre à jour). */}
      {canEdit && (doc.status === 'ARCHIVED' || doc.status === 'OBSOLETE') && (
        <div className="flex items-center justify-between rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-[#892034]" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Document {doc.status === 'OBSOLETE' ? 'obsolète' : 'archivé'}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                Réouvrez le document pour le repasser en brouillon et produire une nouvelle version. L&apos;historique et la référence sont préservés.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleReopen}
            loading={reopening}
            disabled={reopening}
          >
            Réouvrir en brouillon
          </Button>
        </div>
      )}

      {/* Acknowledgment banner */}
      {showAckBanner && (
        <div className="flex items-center justify-between rounded-card border-2 border-primary bg-primary-light p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Accusé de réception requis
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                Veuillez confirmer la lecture de ce document
              </p>
            </div>
          </div>
          <Button onClick={() => handleAction('acknowledge')} loading={actionLoading}>
            <CheckCircle2 className="h-4 w-4" />
            J&apos;ai lu et approuvé
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Horizontal workflow timeline */}
          <Card className="shadow-sm rounded-xl">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-0 overflow-x-auto">
                {workflowSteps.map((step, idx) => (
                  <React.Fragment key={idx}>
                    {/* Step */}
                    <div className="flex flex-col items-center min-w-[100px] flex-shrink-0">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                          step.status === 'completed'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : step.status === 'current'
                            ? 'border-primary bg-primary text-white animate-pulse shadow-lg shadow-primary/30'
                            : 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-500'
                        }`}
                      >
                        {step.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : step.status === 'current' ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-slate-600" />
                        )}
                      </div>
                      <span className={`mt-1.5 text-[11px] font-medium text-center leading-tight ${
                        step.status === 'pending' ? 'text-seal-gray-500 dark:text-slate-500' : 'text-seal-navy dark:text-white'
                      }`}>
                        {step.label}
                      </span>
                      {step.actor && (
                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 text-center mt-0.5 max-w-[90px] truncate">
                          {step.actor}
                        </span>
                      )}
                      {step.date && (
                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 text-center">
                          {step.date}
                        </span>
                      )}
                    </div>
                    {/* Connector line */}
                    {idx < workflowSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 min-w-[20px] mx-1 rounded ${
                        step.status === 'completed' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700'
                      }`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm rounded-xl">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={(tab: string) => { setActiveTab(tab); if (tab === 'history') loadHistory(); }} />
            <CardContent>
              {activeTab === 'details' && (
                <div className="space-y-4">
                  {doc.description && (
                    <div>
                      <h3 className="text-sm font-medium text-seal-navy dark:text-white mb-1">Description</h3>
                      <p className="text-sm text-gray-700 dark:text-slate-300">{doc.description}</p>
                    </div>
                  )}

                  {aiSummary && (
                    <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent dark:from-primary/10 dark:via-primary/5 p-6 shadow-sm">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="h-8 w-8 rounded-lg bg-primary/15 dark:bg-primary/25 flex items-center justify-center">
                          <Sparkles className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-seal-navy dark:text-white">Résumé IA</h3>
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">Généré par l&apos;assistant OMNITECH (Ollama)</p>
                        </div>
                      </div>
                      <div className="text-sm leading-relaxed text-seal-navy dark:text-slate-200 whitespace-pre-wrap wiki-content">
                        {aiSummary}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400">Responsable</p>
                      <p className="text-sm font-semibold text-seal-navy dark:text-white">
                        {doc.owner.firstName} {doc.owner.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400">Prochaine révision</p>
                      <p className="text-sm font-semibold text-seal-navy dark:text-white">
                        {doc.nextReviewDate ? formatDate(doc.nextReviewDate) : 'Non défini'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400">Créé le</p>
                      <p className="text-sm text-seal-navy dark:text-white">{formatDateTime(doc.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400">Dernière modification</p>
                      <p className="text-sm text-seal-navy dark:text-white">{formatDateTime(doc.updatedAt)}</p>
                    </div>
                  </div>

                  {isos.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-seal-navy dark:text-white mb-2">Contrôles de sécurité</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {isos.map(({ isoControl }) => (
                          <IsoControlBadge
                            key={isoControl.code}
                            code={isoControl.code}
                            title={isoControl.titleFr || isoControl.title}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {currentVersion && (
                    <div>
                      <h3 className="text-sm font-medium text-seal-navy dark:text-white mb-2">Version actuelle</h3>
                      <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-primary" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-seal-navy dark:text-white">
                              v{currentVersion.versionNumber} — {currentVersion.fileType}
                            </p>
                            <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                              {formatFileSize(currentVersion.fileSizeBytes)} — Checksum SHA-256
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 rounded bg-gray-100 dark:bg-slate-800 p-2">
                          <p className="font-mono text-[10px] text-seal-gray-500 dark:text-slate-400 break-all">
                            <Hash className="inline h-3 w-3 mr-0.5" />
                            {currentVersion.checksum}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'preview' && currentVersion && (
                <div className="space-y-2">
                  {canOpenReadingMode && (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReadingModeOpen(true)}
                        className="text-[11px]"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        Plein ecran
                      </Button>
                    </div>
                  )}
                  <div className="min-h-[70vh]">
                    {/\.pdf$/i.test(currentVersion.fileType || '') ? (
                      <PdfViewer
                        url={previewUrl}
                        onOpenReadingMode={() => setReadingModeOpen(true)}
                      />
                    ) : /\.docx?$/i.test(currentVersion.fileType || '') ? (
                      <DocxViewer url={previewUrl} />
                    ) : (
                      <div className="flex items-center justify-center py-12 text-sm text-seal-gray-500 dark:text-slate-400">
                        <FileImage className="h-5 w-5 mr-2" />
                        Aperçu non disponible pour ce format
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'versions' && (
                <div className="space-y-3">
                  {/* Upload zone : toujours visible si l'utilisateur peut éditer.
                      Pour un DRAFT sans version, devient la zone principale
                      d'ajout de contenu. Pour les docs avec versions, permet
                      d'ajouter une nouvelle version (1.1, 1.2...). */}
                  {canEdit && doc.status !== 'ARCHIVED' && doc.status !== 'OBSOLETE' && (
                    <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/40 p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-[#F9964A]/15 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-[#F9964A]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {versions.length === 0 ? 'Uploader le fichier du document' : 'Ajouter une nouvelle version'}
                          </p>
                          <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5">
                            {versions.length === 0
                              ? 'Ce brouillon n\'a pas encore de contenu. Déposez un fichier pour démarrer.'
                              : 'Incrémente automatiquement la version (1.1, 1.2…). Le hash SHA-256 est calculé à l\'upload.'}
                          </p>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept=".pdf,.docx,.doc,.xlsx,.xls,.md,.txt,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadVersion(file);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => fileInputRef.current?.click()}
                          loading={uploadingVersion}
                          disabled={uploadingVersion}
                        >
                          Choisir un fichier
                        </Button>
                      </div>
                    </div>
                  )}
                  {versions.length === 0 ? (
                    !canEdit && (
                      <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">Aucune version</p>
                    )
                  ) : (
                    <>
                      {/* Barre d'action compare */}
                      <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-2">
                        <div className="text-xs text-seal-gray-500 dark:text-slate-400">
                          {compareMode ? (
                            <span>
                              Sélectionnez <span className="font-semibold text-seal-navy dark:text-white">deux versions</span> à comparer
                              {compareLeft && compareRight ? ' — prêt' : compareLeft ? ' — 1/2' : ' — 0/2'}
                            </span>
                          ) : (
                            <span>{versions.length} version{versions.length > 1 ? 's' : ''} dans l&apos;historique</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {compareMode && compareLeft && compareRight && (
                            <button
                              onClick={() => setShowDiffDialog(true)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary/90 transition"
                            >
                              <ArrowLeftRight className="h-3 w-3" /> Afficher le diff
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setCompareMode(!compareMode);
                              setCompareLeft(null);
                              setCompareRight(null);
                            }}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                              compareMode
                                ? 'border-[#892034] text-[#892034] hover:bg-[#892034]/5'
                                : 'border-gray-200 dark:border-slate-700 text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                            {compareMode ? 'Annuler' : 'Comparer'}
                          </button>
                        </div>
                      </div>

                      {/* Vertical timeline for versions */}
                      <div className="relative">
                        {/* Vertical timeline line */}
                        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-700" />

                        {versions.map((version, vIdx) => {
                          const isCurrent = vIdx === 0;
                          const isOld = vIdx >= 2;
                          const isSelected = compareLeft === version.id || compareRight === version.id;
                          return (
                            <div
                              key={version.id}
                              className={`relative flex items-start gap-4 pb-4 ${isOld ? 'opacity-60' : ''}`}
                            >
                              {/* Timeline node */}
                              <div className={[
                                'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 flex-shrink-0 transition-all',
                                isCurrent
                                  ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20'
                                  : isSelected
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400',
                              ].join(' ')}>
                                {isCurrent ? (
                                  <Layers className="h-4 w-4" />
                                ) : (
                                  <FileText className="h-4 w-4" />
                                )}
                              </div>

                              {/* Version card */}
                              <div className={`flex-1 rounded-lg border p-3 transition ${
                                isSelected
                                  ? 'border-primary bg-primary/5'
                                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                              }`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {compareMode && (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {
                                            if (isSelected) {
                                              if (compareLeft === version.id) setCompareLeft(null);
                                              else if (compareRight === version.id) setCompareRight(null);
                                            } else if (!compareLeft) {
                                              setCompareLeft(version.id);
                                            } else if (!compareRight) {
                                              setCompareRight(version.id);
                                            } else {
                                              setCompareLeft(compareRight);
                                              setCompareRight(version.id);
                                            }
                                          }}
                                          className="h-4 w-4 accent-primary"
                                        />
                                      )}
                                      <p className="text-sm font-semibold text-seal-navy dark:text-white">
                                        Version {version.versionNumber}
                                      </p>
                                      {isCurrent && (
                                        <span className="inline-flex items-center rounded-full bg-[#006233]/10 px-2 py-0.5 text-[10px] font-semibold text-[#006233]">
                                          Version actuelle
                                        </span>
                                      )}
                                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-seal-gray-500">
                                        {formatFileSize(version.fileSizeBytes)}
                                      </span>
                                    </div>
                                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                                      {version.uploadedBy.firstName} {version.uploadedBy.lastName} —{' '}
                                      {formatDateTime(version.createdAt)}
                                    </p>
                                    {version.changeLog && (
                                      <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 italic">
                                        &laquo; {version.changeLog} &raquo;
                                      </p>
                                    )}
                                    <button
                                      onClick={() => copyChecksum(version.checksum)}
                                      title="Cliquer pour copier le checksum SHA-256"
                                      className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] text-seal-gray-500 hover:text-primary transition break-all text-left"
                                    >
                                      {copiedChecksum === version.checksum ? <Check className="h-3 w-3 flex-shrink-0 text-emerald-500" /> : <Hash className="h-3 w-3 flex-shrink-0" />}
                                      <span className="truncate max-w-[260px]">{version.checksum}</span>
                                    </button>
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleDownload(
                                        `/documents/${doc.id}/versions/${version.id}/download`,
                                        `${doc.reference}-v${version.versionNumber}`,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition hover:underline flex-shrink-0"
                                    title={`Télécharger la version ${version.versionNumber}`}
                                  >
                                    <Download className="h-3 w-3" />
                                    Télécharger
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Dialog diff de versions */}
              {showDiffDialog && compareLeft && compareRight && (() => {
                const leftV = versions.find((v) => v.id === compareLeft);
                const rightV = versions.find((v) => v.id === compareRight);
                if (!leftV || !rightV) return null;
                const toDiffVersion = (v: DocumentVersion): DiffVersion => ({
                  id: v.id,
                  versionNumber: v.versionNumber,
                  checksum: v.checksum,
                  fileSizeBytes: v.fileSizeBytes,
                  fileType: v.fileType,
                  createdAt: v.createdAt,
                  changeLog: v.changeLog,
                  uploadedBy: v.uploadedBy,
                  // Contenu inline texte si doc natif (sinon null => fallback métadonnées)
                  content: doc?.isNative ? doc?.content || null : null,
                });
                return (
                  <Dialog
                    open={showDiffDialog}
                    onClose={() => setShowDiffDialog(false)}
                    title={`Comparaison v${leftV.versionNumber} ↔ v${rightV.versionNumber}`}
                    className="max-w-4xl"
                  >
                    <div className="max-h-[70vh] overflow-auto">
                      <VersionDiff left={toDiffVersion(leftV)} right={toDiffVersion(rightV)} />
                    </div>
                  </Dialog>
                );
              })()}

              {activeTab === 'signatures' && (
                <div className="space-y-4">
                  {/* DocuSeal templates info */}
                  {docusealTemplates.length > 0 && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                        Modeles DocuSeal disponibles
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {docusealTemplates.map((tpl) => (
                          <span
                            key={tpl.id}
                            className="inline-flex items-center rounded bg-blue-100 dark:bg-blue-800 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200"
                          >
                            #{tpl.id} {tpl.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {sigs.length === 0 ? (
                    <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">Aucune signature</p>
                  ) : (
                    sigs.map((sig) => (
                      <div
                        key={sig.id}
                        className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
                      >
                        <PenLine className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {sig.signer.firstName} {sig.signer.lastName}
                          </p>
                          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                            Demande par {sig.requestedBy.firstName} {sig.requestedBy.lastName}
                          </p>
                          {sig.status === 'PENDING' && (
                            <div className="flex gap-2 mt-1">
                              {sig.docusealSubmissionId ? (
                                <a
                                  href={`${process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'http://localhost:7000'}/s/${sig.docusealSlug || sig.docusealSubmissionId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                                >
                                  <PenLine className="h-3.5 w-3.5" />
                                  Signer via DocuSeal
                                </a>
                              ) : null}
                              {sig.signer.id === user?.id && (
                                <button
                                  onClick={() => setConfirmSignId(sig.id)}
                                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Signer
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <SignatureBadge status={sig.status as 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED'} />
                        {sig.signedAt && (
                          <span className="text-xs text-seal-gray-500 dark:text-slate-400">{formatDateTime(sig.signedAt)}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'acknowledgments' && (
                <div className="space-y-3">
                  {acks.length === 0 ? (
                    <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">Aucun accusé de réception</p>
                  ) : (
                    acks.map((ack) => (
                      <div
                        key={ack.id}
                        className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
                      >
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {ack.user.firstName} {ack.user.lastName}
                          </p>
                        </div>
                        <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                          {formatDateTime(ack.acknowledgedAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-3">
                  {historyLoading ? (
                    <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-gray-100 dark:bg-slate-800 rounded-lg" />)}</div>
                  ) : history?.timeline?.length > 0 ? (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-700" />

                      {history.timeline.map((entry: any, i: number) => (
                        <div key={i} className="flex gap-4 pb-4 relative">
                          {/* Timeline dot */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                            entry.type === 'version' ? 'bg-primary text-white' :
                            entry.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                            entry.severity === 'WARN' ? 'bg-amber-500 text-white' :
                            'bg-gray-200 dark:bg-slate-600 text-seal-gray-500 dark:text-slate-400'
                          }`}>
                            {entry.type === 'version' ? <FileText className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                          </div>

                          <div className="flex-1 bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                {entry.type === 'version' ? (
                                  <p className="text-sm font-semibold text-seal-navy dark:text-white">
                                    Version {entry.versionNumber} uploadée
                                  </p>
                                ) : (
                                  <p className="text-sm font-semibold text-seal-navy dark:text-white">
                                    {entry.action?.replace(/_/g, ' ')}
                                  </p>
                                )}
                                {entry.changeLog && <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">{entry.changeLog}</p>}
                                {entry.user && <p className="text-xs text-seal-gray-500 dark:text-slate-400">{entry.user.firstName} {entry.user.lastName}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-seal-gray-500 dark:text-slate-500">{formatDate(entry.date)}</p>
                                {entry.fileSize && <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">{(entry.fileSize / 1024).toFixed(0)} Ko</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">Aucun historique disponible</p>
                  )}
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="space-y-4">
                  {/* Comment input */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Ajouter un commentaire..."
                        className="w-full rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white placeholder:text-seal-gray-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 min-h-[60px] resize-y"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            handleAddComment();
                          }
                        }}
                      />
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">
                        Ctrl+Entree pour envoyer
                      </p>
                    </div>
                    <Button
                      onClick={handleAddComment}
                      disabled={!commentText.trim() || commentSubmitting}
                      loading={commentSubmitting}
                      className="self-start"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Envoyer
                    </Button>
                  </div>

                  {/* Comments list */}
                  {comments.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="h-8 w-8 text-seal-gray-500/30 mx-auto mb-2" />
                      <p className="text-sm text-seal-gray-500 dark:text-slate-400">Aucun commentaire pour le moment</p>
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
              )}

              {activeTab === 'inline-edit' && doc.isNative && (
                <div className="space-y-3">
                  {!canEditInline && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300">
                      Le contenu est en lecture seule (statut verrouillé ou droits insuffisants).
                    </div>
                  )}
                  <InlineEditor
                    value={inlineContent}
                    disabled={!canEditInline}
                    onChange={(html) => {
                      setInlineContent(html);
                      setInlineDirty(true);
                    }}
                  />
                  {canEditInline && (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-seal-gray-500">
                        {inlineDirty ? 'Modifications non enregistrées' : 'À jour'}
                      </span>
                      <Button
                        onClick={handleSaveInlineContent}
                        loading={inlineSaving}
                        disabled={!inlineDirty}
                      >
                        <PenLine className="h-4 w-4" />
                        Enregistrer
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'iso-analysis' && isoAnalysis && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-seal-gray-500 dark:text-slate-400">{isoAnalysis.length} contrôles identifiés</p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAutoAssign}
                      loading={analyzing}
                    >
                      Assigner automatiquement
                    </Button>
                  </div>
                  {isoAnalysis.map((item) => (
                    <div
                      key={item.controlCode}
                      className="rounded-lg border border-gray-200 dark:border-slate-700 p-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <IsoControlBadge code={item.controlCode} title={item.controlTitle} />
                        <Badge
                          variant={
                            item.conformityStatus === 'CONFORME'
                              ? 'approved'
                              : item.conformityStatus === 'PARTIELLEMENT_CONFORME'
                              ? 'pending-approval'
                              : 'draft'
                          }
                        >
                          {item.conformityStatus === 'CONFORME'
                            ? 'Conforme'
                            : item.conformityStatus === 'PARTIELLEMENT_CONFORME'
                            ? 'Partiel'
                            : 'A evaluer'}
                        </Badge>
                        <span className="ml-auto text-xs font-semibold text-seal-navy dark:text-white">
                          {item.relevanceScore}%
                        </span>
                      </div>
                      <p className="text-sm text-seal-navy dark:text-white font-semibold">{item.controlTitle}</p>
                      <p className="text-xs text-gray-600 dark:text-slate-300 mt-1">{item.justification}</p>
                      {item.matchedKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.matchedKeywords.map((kw) => (
                            <span key={kw} className="rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {/* Workflow (vertical, compact) */}
          <Card className="shadow-sm rounded-xl">
            <CardHeader>
              <h3 className="text-sm font-medium text-seal-navy dark:text-white">Cycle de vie</h3>
            </CardHeader>
            <CardContent>
              <WorkflowTimeline steps={workflowSteps} />
            </CardContent>

            {/* Actions */}
            {transitions.length > 0 && (
              <CardFooter>
                <div className="space-y-2">
                  {doc.status === 'DRAFT' && transitions.includes('IN_REVIEW' as never) && (
                    <Button
                      className="w-full"
                      onClick={() => handleAction('submit-review')}
                      loading={actionLoading}
                    >
                      <Eye className="h-4 w-4" />
                      Soumettre pour revue
                    </Button>
                  )}
                  {doc.status === 'IN_REVIEW' && transitions.includes('REVIEW_APPROVED' as never) && (
                    <Button
                      className="w-full"
                      onClick={() => handleAction('approve-review')}
                      loading={actionLoading}
                    >
                      <UserCheck className="h-4 w-4" />
                      Valider la revue technique
                    </Button>
                  )}
                  {/* REVIEW_APPROVED : seul le rédacteur (owner) peut lancer l'approbation finale */}
                  {doc.status === 'REVIEW_APPROVED' && user?.id === doc.owner?.id && (
                    <>
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                        La revue a été validée par le réviseur. Vous pouvez prendre en compte
                        les retours puis lancer la demande d&apos;approbation finale.
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => handleAction('request-approval')}
                        loading={actionLoading}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Demander l&apos;approbation
                      </Button>
                    </>
                  )}
                  {doc.status === 'REVIEW_APPROVED' && user?.id !== doc.owner?.id && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300">
                      Revue validée — en attente que le rédacteur lance la demande d&apos;approbation.
                    </div>
                  )}
                  {doc.status === 'PENDING_APPROVAL' && transitions.includes('APPROVED' as never) && (
                    <Button
                      className="w-full"
                      onClick={() => handleAction('approve-direction')}
                      loading={actionLoading}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Valider (Direction)
                    </Button>
                  )}
                  {doc.status === 'IN_REVIEW' && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleAction('reject-review')}
                      loading={actionLoading}
                    >
                      <XCircle className="h-4 w-4" />
                      Rejeter la revue
                    </Button>
                  )}
                  {doc.status === 'PENDING_APPROVAL' && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleAction('reject-direction')}
                      loading={actionLoading}
                    >
                      <XCircle className="h-4 w-4" />
                      Refuser (Direction)
                    </Button>
                  )}
                  {doc.status === 'APPROVED' && transitions.includes('OBSOLETE' as never) && (
                    <Button
                      variant="danger"
                      className="w-full"
                      onClick={() => setShowObsoleteDialog(true)}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Marquer obsolète
                    </Button>
                  )}
                  {transitions.includes('ARCHIVED' as never) && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowArchiveDialog(true)}
                    >
                      <History className="h-4 w-4" />
                      Archiver
                    </Button>
                  )}
                </div>
              </CardFooter>
            )}
          </Card>

          {/* Multi-reviewer approval workflow (configurable) */}
          {currentVersion && (
            <div id="workflow" className="scroll-mt-20">
            <WorkflowPanel
              documentId={doc.id}
              currentVersionId={currentVersion.id}
              canStartWorkflow={canEdit}
              documentCategory={doc.category}
            />
            </div>
          )}

          {/* Document Metadata */}
          <Card className="shadow-sm rounded-xl">
            <CardHeader>
              <h3 className="text-sm font-medium text-seal-navy dark:text-white">Métadonnées</h3>
            </CardHeader>
            <CardContent className="space-y-2.5 text-[11px]">
              <div className="flex justify-between items-start">
                <span className="text-seal-gray-500 dark:text-slate-400">Référence</span>
                <span className="font-mono font-semibold text-seal-navy dark:text-white">{doc.reference}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-seal-gray-500 dark:text-slate-400">Catégorie</span>
                <Badge variant="navy">{DOCUMENT_CATEGORY_LABELS[doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS]}</Badge>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-seal-gray-500 dark:text-slate-400">Classification</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  doc.classification === 'PUBLIC' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                  doc.classification === 'CONFIDENTIEL' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                  doc.classification === 'SECRET' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}>
                  {doc.classification || 'INTERNE'}
                </span>
              </div>
              <div className="border-t border-gray-100 dark:border-slate-700 pt-2" />
              <div className="flex justify-between items-start">
                <span className="text-seal-gray-500 dark:text-slate-400">Propriétaire</span>
                <span className="text-seal-navy dark:text-white font-medium">{doc.owner.firstName} {doc.owner.lastName}</span>
              </div>
              {doc.reviewer && (
                <div className="flex justify-between items-start">
                  <span className="text-seal-gray-500 dark:text-slate-400">Réviseur</span>
                  <span className="text-seal-navy dark:text-white font-medium">{doc.reviewer.firstName} {doc.reviewer.lastName}</span>
                </div>
              )}
              {doc.approver && (
                <div className="flex justify-between items-start">
                  <span className="text-seal-gray-500 dark:text-slate-400">Approbateur</span>
                  <span className="text-seal-navy dark:text-white font-medium">{doc.approver.firstName} {doc.approver.lastName}</span>
                </div>
              )}
              <div className="border-t border-gray-100 dark:border-slate-700 pt-2" />
              <div className="flex justify-between items-start">
                <span className="text-seal-gray-500 dark:text-slate-400">Créé le</span>
                <span className="text-seal-navy dark:text-white">{formatDate(doc.createdAt)}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-seal-gray-500 dark:text-slate-400">Modifié le</span>
                <span className="text-seal-navy dark:text-white">{formatDate(doc.updatedAt)}</span>
              </div>
              {doc.nextReviewDate && (
                <div className="flex justify-between items-start">
                  <span className="text-seal-gray-500 dark:text-slate-400">Prochaine révision</span>
                  <span className={`font-semibold ${reviewInfo?.color || 'text-seal-navy dark:text-white'}`}>{formatDate(doc.nextReviewDate)}</span>
                </div>
              )}
              <div className="flex justify-between items-start">
                <span className="text-seal-gray-500 dark:text-slate-400">Visibilité</span>
                <span className={`font-semibold ${doc.isPublic ? 'text-emerald-600 dark:text-emerald-400' : 'text-seal-gray-500 dark:text-slate-400'}`}>{doc.isPublic ? 'Public' : 'Privé'}</span>
              </div>
            </CardContent>
          </Card>

          {/* ISO Controls linked */}
          {isos.length > 0 && (
            <Card className="shadow-sm rounded-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-seal-navy dark:text-white">
                    <Shield className="inline h-3.5 w-3.5 mr-1.5" />
                    Controles ISO
                  </h3>
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1.5">
                    {isos.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {isos.map(({ isoControl }) => {
                  const annexLetter = isoControl.code.match(/^A\.(\d+)/)?.[1];
                  const domainColors: Record<string, string> = {
                    '5': 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10',
                    '6': 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10',
                    '7': 'border-l-purple-500 bg-purple-50/50 dark:bg-purple-900/10',
                    '8': 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10',
                  };
                  const colorClass = (annexLetter && domainColors[annexLetter]) || 'border-l-gray-400 bg-gray-50/50 dark:bg-slate-800/50';
                  return (
                    <div
                      key={isoControl.id}
                      className={`rounded-lg border-l-[3px] p-2.5 ${colorClass} transition-colors`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 flex-shrink-0">{isoControl.code}</span>
                      </div>
                      <p className="text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed mt-1">
                        {isoControl.titleFr || isoControl.title}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Signature status summary */}
          {sigs.length > 0 && (
            <Card className="shadow-sm rounded-xl">
              <CardHeader>
                <h3 className="text-sm font-medium text-seal-navy dark:text-white">
                  <PenLine className="inline h-3.5 w-3.5 mr-1.5" />
                  Signatures
                </h3>
              </CardHeader>
              <CardContent>
                {(() => {
                  const signed = sigs.filter(s => s.status === 'SIGNED').length;
                  const total = sigs.length;
                  const pending = sigs.filter(s => s.status === 'PENDING').length;
                  const rejected = sigs.filter(s => s.status === 'REJECTED').length;
                  const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-seal-navy dark:text-white">{signed} / {total}</span>
                        <span className="text-xs text-seal-gray-500 dark:text-slate-400">{pct}% signées</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex gap-3 text-[10px]">
                        {pending > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold">{pending} en attente</span>}
                        {rejected > 0 && <span className="text-red-600 dark:text-red-400 font-semibold">{rejected} refusées</span>}
                        {signed > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{signed} signées</span>}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <Card className="shadow-sm rounded-xl">
            <CardHeader>
              <h3 className="text-sm font-medium text-seal-navy dark:text-white">Statistiques</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">Versions</span>
                <span className="text-sm font-semibold text-seal-navy dark:text-white">{versions.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">Signatures</span>
                <span className="text-sm font-semibold text-seal-navy dark:text-white">{sigs.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">Accusés de réception</span>
                <span className="text-sm font-semibold text-seal-navy dark:text-white">{acks.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">Contrôles ISO</span>
                <span className="text-sm font-semibold text-seal-navy dark:text-white">{isos.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Related Documents (combined: endpoint + RAG similarity) */}
          {ragRelatedLoading && (
            <Card className="shadow-sm rounded-xl">
              <CardHeader>
                <h3 className="text-sm font-medium text-seal-navy dark:text-white">
                  <BookOpen className="inline h-3.5 w-3.5 mr-1.5" />
                  Documents liés
                </h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </CardContent>
            </Card>
          )}
          {!ragRelatedLoading && (() => {
            // Merge related docs from endpoint and RAG, deduplicate by id, max 4
            const seenIds = new Set<string>();
            const merged: Array<{
              id: string; title: string; reference: string; category: string; status: string;
              isoControls?: Array<{ isoControl: { code: string; title: string; titleFr?: string } }>;
            }> = [];
            for (const rd of relatedDocs) {
              if (!seenIds.has(rd.id)) { seenIds.add(rd.id); merged.push(rd); }
            }
            for (const rd of ragRelatedDocs) {
              if (!seenIds.has(rd.id) && merged.length < 4) { seenIds.add(rd.id); merged.push(rd); }
            }
            if (merged.length === 0) return null;
            return (
              <Card className="shadow-sm rounded-xl">
                <CardHeader>
                  <h3 className="text-sm font-medium text-seal-navy dark:text-white">
                    <BookOpen className="inline h-3.5 w-3.5 mr-1.5" />
                    Documents liés
                  </h3>
                </CardHeader>
                <CardContent className="space-y-2">
                  {merged.slice(0, 4).map((rd) => (
                    <Link
                      key={rd.id}
                      href={`/documents/${rd.id}`}
                      className="block rounded-lg border border-gray-100 dark:border-slate-700 p-2.5 hover:border-primary/50 hover:bg-primary/5 transition-all"
                    >
                      <p className="text-xs font-semibold text-seal-navy dark:text-white line-clamp-1">{rd.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-[10px] text-seal-gray-500 dark:text-slate-400">{rd.reference}</span>
                        <StatusBadge status={rd.status as 'DRAFT' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'OBSOLETE' | 'ARCHIVED'} />
                      </div>
                      {rd.category && (
                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 mt-1 block">
                          {DOCUMENT_CATEGORY_LABELS[rd.category as keyof typeof DOCUMENT_CATEGORY_LABELS] || rd.category}
                        </span>
                      )}
                      {rd.isoControls && rd.isoControls.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {rd.isoControls.slice(0, 2).map(({ isoControl }) => (
                            <span key={isoControl.code} className="text-[9px] font-mono bg-primary/10 text-primary rounded px-1 py-0.5">{isoControl.code}</span>
                          ))}
                          {rd.isoControls.length > 2 && (
                            <span className="text-[9px] text-seal-gray-500 dark:text-slate-400">+{rd.isoControls.length - 2}</span>
                          )}
                        </div>
                      )}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>

      {/* Sign confirmation dialog */}
      <ConfirmDialog
        open={!!confirmSignId}
        onClose={() => setConfirmSignId(null)}
        onConfirm={async () => {
          const sigId = confirmSignId;
          setConfirmSignId(null);
          try {
            await api.patch(`/signatures/${sigId}/sign`);
            toast.success('Document signé');
            const { data } = await api.get(`/documents/${doc!.id}`);
            const allSigs = (data.versions || []).flatMap((v: any) => v.signatureRequests || []);
            data.signatureRequests = allSigs;
            setDoc(data);
          } catch { toast.error('Erreur signature'); }
        }}
        title="Confirmer la signature"
        description="Confirmez-vous la signature de ce document ?"
        confirmLabel="Signer"
        variant="primary"
      />

      {/* Obsolete dialog */}
      <ConfirmDialog
        open={showObsoleteDialog}
        onClose={() => setShowObsoleteDialog(false)}
        onConfirm={() => handleAction('mark-obsolete')}
        title="Marquer comme obsolète"
        description="Ce document sera marqué comme obsolète et ne sera plus visible par les collaborateurs. Cette action est réversible."
        confirmLabel="Confirmer"
        variant="danger"
        loading={actionLoading}
      />
      {/* Archive dialog */}
      <ConfirmDialog
        open={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        onConfirm={() => handleAction('archive')}
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
        description={`Supprimer définitivement "${doc?.title}" ? Cette action est irréversible et supprimera toutes les versions et signatures associées.`}
        confirmLabel="Supprimer"
        variant="danger"
      />

      {/* Reading mode (focus reading) */}
      {canOpenReadingMode && readingModePdfUrl && (
        <ReadingMode
          open={readingModeOpen}
          onClose={() => setReadingModeOpen(false)}
          documentTitle={`${doc.title} — v${currentVersion?.versionNumber ?? ''}`}
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

      {/* Rejection dialog with suggestions */}
      <Dialog
        open={!!showRejectDialog}
        onClose={() => { setShowRejectDialog(null); setRejectComment(''); setRejectSuggestions(new Set()); }}
        title={showRejectDialog === 'reject-review' ? 'Rejeter la revue technique' : 'Rejeter le document'}
        description="Indiquez le motif du refus et cochez les suggestions d'amélioration pour guider le rédacteur."
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <Textarea
            label="Motif du refus (obligatoire, minimum 10 caractères)"
            placeholder="Ex: Le document ne couvre pas les contrôles ISO 27001 A.8.1 et A.8.2. Merci de compléter la section sur le contrôle d'accès avant de soumettre à nouveau."
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            className="min-h-[100px]"
          />

          {suggestionsCatalog && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 p-4 max-h-[320px] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">
                    Suggestions d&apos;amélioration
                  </p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                    Cochez les points à retravailler. Le rédacteur les verra dans sa notification.
                  </p>
                </div>
                {rejectSuggestions.size > 0 && (
                  <span className="text-xs font-semibold text-primary">
                    {rejectSuggestions.size} sélectionnée{rejectSuggestions.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {suggestionsCatalog.categories.map((cat) => (
                  <div key={cat.name}>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
                      {cat.name}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {cat.items.map((item) => {
                        const checked = rejectSuggestions.has(item.key);
                        return (
                          <label
                            key={item.key}
                            className={`flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                              checked
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-white dark:hover:bg-slate-800 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = new Set(rejectSuggestions);
                                if (checked) next.delete(item.key);
                                else next.add(item.key);
                                setRejectSuggestions(next);
                              }}
                              className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className={`text-xs leading-snug ${checked ? 'text-seal-navy dark:text-white font-medium' : 'text-seal-gray-500 dark:text-slate-400'}`}>
                              {item.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
              {rejectComment.trim().length < 10
                ? `${10 - rejectComment.trim().length} caractère(s) restant(s) avant validation`
                : '✓ Commentaire suffisant'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowRejectDialog(null); setRejectComment(''); setRejectSuggestions(new Set()); }}>
                Annuler
              </Button>
              <Button
                variant="danger"
                disabled={rejectComment.trim().length < 10}
                loading={actionLoading}
                onClick={() => showRejectDialog && handleAction(showRejectDialog)}
              >
                Rejeter avec suggestions
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
