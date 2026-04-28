/**
 * Shared types for the documents list page (`(app)/documents/page.tsx`).
 * Extracted from the page itself to keep the orchestrator focused.
 */

export interface Document {
  id: string;
  title: string;
  reference: string;
  status: string;
  category: string;
  classification?: string;
  description: string;
  nextReviewDate: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; firstName: string; lastName: string };
  isoControls?: Array<{
    isoControl: { code: string; title: string; titleFr?: string };
  }>;
  _count?: { acknowledgments?: number; versions?: number };
}

export interface PaginatedDocs {
  data: Document[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export type StatusTabKey =
  | "all"
  | "drafts"
  | "review"
  | "published"
  | "expired"
  | "archived";
