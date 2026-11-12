// Types partagés par les sous-composants de la page /documents/[id].
// Extrait du monolithe `page.tsx` pour faciliter le typage des props.

export interface DocumentComment {
  id: string;
  documentId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
}

export interface DocumentVersion {
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

export interface ValidationStepData {
  id: string;
  stepType: string;
  assignedTo: { id?: string; firstName: string; lastName: string };
  // Décideur réel (≠ assigné en cas de dérogation ADMIN). Peut être absent
  // pour les étapes historiques antérieures au champ decidedById.
  decidedBy?: { id?: string; firstName: string; lastName: string } | null;
  action: string | null;
  comment: string | null;
  actionAt: string | null;
  createdAt?: string;
}

export interface SignatureData {
  id: string;
  status: string;
  signer: { id: string; firstName: string; lastName: string };
  signedAt: string | null;
  requestedBy: { firstName: string; lastName: string };
  docusealSubmissionId: string | null;
  docusealSlug?: string | null;
}

export interface DocuSealTemplate {
  id: number;
  name: string;
  created_at: string;
}

export interface AcknowledgmentData {
  id: string;
  user: { firstName: string; lastName: string };
  acknowledgedAt: string;
}

export interface DocumentDetail {
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
  currentVersionId?: string | null;
  scanStatus?: 'CLEAN' | 'PENDING' | 'ERROR' | 'INFECTED';
  content?: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; firstName: string; lastName: string };
  verifier: { id: string; firstName: string; lastName: string } | null;
  reviewer: { id: string; firstName: string; lastName: string } | null;
  approver: { id: string; firstName: string; lastName: string } | null;
  isoControls: Array<{
    isoControl: { id: string; code: string; title: string; titleFr?: string };
  }>;
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

export interface IsoAnalysisItem {
  controlCode: string;
  controlTitle: string;
  relevanceScore: number;
  justification: string;
  conformityStatus: string;
  matchedKeywords: string[];
}

export interface RelatedDoc {
  id: string;
  title: string;
  reference: string;
  category: string;
  status: string;
  updatedAt?: string;
  isoControls?: Array<{
    isoControl: { code: string; title: string; titleFr?: string };
  }>;
}

export interface RejectionSuggestionsCatalog {
  categories: Array<{
    name: string;
    items: Array<{ key: string; label: string }>;
  }>;
}
