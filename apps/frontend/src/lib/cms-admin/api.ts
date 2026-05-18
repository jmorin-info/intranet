"use client";

import { api } from "@/lib/api";
import type {
  ContentBlock,
  ContentPage,
  ContentRevision,
  ContentStatus,
  PaginatedResult,
} from "./types";

// ─── Pages ────────────────────────────────────────────────────────────

export interface ListPagesParams {
  status?: ContentStatus;
  locale?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export async function listPages(params: ListPagesParams = {}) {
  const res = await api.get<PaginatedResult<ContentPage>>(
    "/admin/content/pages",
    {
      params: {
        status: params.status,
        locale: params.locale,
        q: params.q,
        page: params.page ?? 1,
        limit: params.limit ?? 20,
      },
    },
  );
  return res.data;
}

export async function getPage(id: string) {
  const res = await api.get<ContentPage>(`/admin/content/pages/${id}`);
  return res.data;
}

export interface CreatePageInput {
  title: string;
  slug?: string;
  locale?: string;
  excerpt?: string;
  content: string;
  status?: ContentStatus;
  seoTitle?: string;
  seoDescription?: string;
}

export async function createPage(input: CreatePageInput) {
  const res = await api.post<ContentPage>("/admin/content/pages", input);
  return res.data;
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  status?: ContentStatus;
  seoTitle?: string;
  seoDescription?: string;
  revisionComment?: string;
}

export async function updatePage(id: string, input: UpdatePageInput) {
  const res = await api.patch<ContentPage>(`/admin/content/pages/${id}`, input);
  return res.data;
}

export async function publishPage(id: string) {
  const res = await api.post<ContentPage>(`/admin/content/pages/${id}/publish`);
  return res.data;
}

export async function unpublishPage(id: string) {
  const res = await api.post<ContentPage>(
    `/admin/content/pages/${id}/unpublish`,
  );
  return res.data;
}

export async function deletePage(id: string) {
  await api.delete(`/admin/content/pages/${id}`);
}

export async function listRevisions(
  pageId: string,
  params: { page?: number; limit?: number } = {},
) {
  const res = await api.get<PaginatedResult<ContentRevision>>(
    `/admin/content/pages/${pageId}/revisions`,
    {
      params: { page: params.page ?? 1, limit: params.limit ?? 20 },
    },
  );
  return res.data;
}

export async function restoreRevision(pageId: string, version: number) {
  const res = await api.post<ContentPage>(
    `/admin/content/pages/${pageId}/revisions/${version}/restore`,
  );
  return res.data;
}

// ─── Blocks ───────────────────────────────────────────────────────────

export interface ListBlocksParams {
  prefix?: string;
  locale?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export async function listBlocks(params: ListBlocksParams = {}) {
  const res = await api.get<PaginatedResult<ContentBlock>>(
    "/admin/content/blocks",
    {
      params: {
        prefix: params.prefix,
        locale: params.locale,
        q: params.q,
        page: params.page ?? 1,
        limit: params.limit ?? 50,
      },
    },
  );
  return res.data;
}

export async function getBlock(id: string) {
  const res = await api.get<ContentBlock>(`/admin/content/blocks/${id}`);
  return res.data;
}

export interface CreateBlockInput {
  key: string;
  locale?: string;
  title?: string;
  body: string;
  data?: unknown;
  status?: ContentStatus;
}

export async function createBlock(input: CreateBlockInput) {
  const res = await api.post<ContentBlock>("/admin/content/blocks", input);
  return res.data;
}

export interface UpdateBlockInput {
  title?: string;
  body?: string;
  data?: unknown;
  status?: ContentStatus;
}

export async function updateBlock(id: string, input: UpdateBlockInput) {
  const res = await api.patch<ContentBlock>(
    `/admin/content/blocks/${id}`,
    input,
  );
  return res.data;
}

export async function deleteBlock(id: string) {
  await api.delete(`/admin/content/blocks/${id}`);
}
