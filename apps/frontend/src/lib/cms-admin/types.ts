/**
 * Types partagés par les pages admin /admin/content/* — gardés côté frontend
 * pour ne pas dépendre du Prisma client backend. Doivent rester alignés avec
 * `apps/backend/src/content/*` et le schema Prisma.
 */

export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface ContentAuthor {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface ContentPage {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  content: string;
  status: ContentStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  authorId: string;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  author?: ContentAuthor;
  updatedBy?: ContentAuthor | null;
}

export interface ContentRevision {
  id: string;
  pageId: string;
  version: number;
  title: string;
  content: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: ContentStatus;
  authorId: string;
  comment: string | null;
  createdAt: string;
  author?: ContentAuthor;
}

export interface ContentBlock {
  id: string;
  key: string;
  locale: string;
  title: string | null;
  body: string;
  data: unknown;
  status: ContentStatus;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy?: ContentAuthor | null;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type ContentLocale = (typeof SUPPORTED_LOCALES)[number];
