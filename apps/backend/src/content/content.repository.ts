import { Injectable } from "@nestjs/common";
import { Prisma, ContentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Fragments d'include réutilisables. Évite la divergence entre routes et les
 * sur-requêtes (le `User` complet contient passwordHash, MFA, etc.).
 */
const AUTHOR_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

export const CONTENT_PAGE_LIST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  updatedBy: { select: AUTHOR_SELECT },
} satisfies Prisma.ContentPageInclude;

export const CONTENT_PAGE_DETAIL_INCLUDE = {
  ...CONTENT_PAGE_LIST_INCLUDE,
} satisfies Prisma.ContentPageInclude;

const REVISION_INCLUDE = {
  author: { select: AUTHOR_SELECT },
} satisfies Prisma.ContentRevisionInclude;

const BLOCK_INCLUDE = {
  updatedBy: { select: AUTHOR_SELECT },
} satisfies Prisma.ContentBlockInclude;

export interface ListPagesParams {
  status?: ContentStatus;
  locale?: string;
  search?: string;
  page: number;
  limit: number;
  /** Inclure les soft-deleted (admin only, défaut false). */
  includeDeleted?: boolean;
}

export interface ListBlocksParams {
  prefix?: string;
  locale?: string;
  search?: string;
  page: number;
  limit: number;
}

@Injectable()
export class ContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Pages ──────────────────────────────────────────────────────────

  async findManyPages(params: ListPagesParams) {
    const where: Prisma.ContentPageWhereInput = {
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.status ? { status: params.status } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: "insensitive" } },
              { slug: { contains: params.search, mode: "insensitive" } },
              { excerpt: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.contentPage.findMany({
        where,
        include: CONTENT_PAGE_LIST_INCLUDE,
        orderBy: { updatedAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.contentPage.count({ where }),
    ]);

    return { data, total };
  }

  findPageById(id: string) {
    return this.prisma.contentPage.findFirst({
      where: { id, deletedAt: null },
      include: CONTENT_PAGE_DETAIL_INCLUDE,
    });
  }

  /** Lecture publique : seulement PUBLISHED, par slug + locale. */
  findPublishedBySlug(slug: string, locale: string) {
    return this.prisma.contentPage.findFirst({
      where: { slug, locale, status: ContentStatus.PUBLISHED, deletedAt: null },
      include: CONTENT_PAGE_DETAIL_INCLUDE,
    });
  }

  /** Lookup d'unicité du slug (utilisé par generateUniqueSlug). */
  async isSlugTaken(slug: string, locale: string, excludeId?: string) {
    const found = await this.prisma.contentPage.findFirst({
      where: {
        slug,
        locale,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  createPage(data: Prisma.ContentPageCreateInput) {
    return this.prisma.contentPage.create({
      data,
      include: CONTENT_PAGE_DETAIL_INCLUDE,
    });
  }

  updatePage(id: string, data: Prisma.ContentPageUpdateInput) {
    return this.prisma.contentPage.update({
      where: { id },
      data,
      include: CONTENT_PAGE_DETAIL_INCLUDE,
    });
  }

  softDeletePage(id: string) {
    return this.prisma.contentPage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Revisions ──────────────────────────────────────────────────────

  /** Numéro de version suivant pour une page (1 si aucune révision). */
  async nextRevisionVersion(pageId: string): Promise<number> {
    const last = await this.prisma.contentRevision.findFirst({
      where: { pageId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return (last?.version ?? 0) + 1;
  }

  createRevision(data: Prisma.ContentRevisionCreateInput) {
    return this.prisma.contentRevision.create({ data });
  }

  async findRevisions(pageId: string, page: number, limit: number) {
    const where: Prisma.ContentRevisionWhereInput = { pageId };
    const [data, total] = await Promise.all([
      this.prisma.contentRevision.findMany({
        where,
        include: REVISION_INCLUDE,
        orderBy: { version: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contentRevision.count({ where }),
    ]);
    return { data, total };
  }

  findRevision(pageId: string, version: number) {
    return this.prisma.contentRevision.findUnique({
      where: { pageId_version: { pageId, version } },
      include: REVISION_INCLUDE,
    });
  }

  // ─── Blocks ─────────────────────────────────────────────────────────

  async findManyBlocks(params: ListBlocksParams) {
    const where: Prisma.ContentBlockWhereInput = {
      deletedAt: null,
      ...(params.locale ? { locale: params.locale } : {}),
      ...(params.prefix ? { key: { startsWith: params.prefix } } : {}),
      ...(params.search
        ? {
            OR: [
              { key: { contains: params.search, mode: "insensitive" } },
              { title: { contains: params.search, mode: "insensitive" } },
              { body: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.contentBlock.findMany({
        where,
        include: BLOCK_INCLUDE,
        orderBy: [{ key: "asc" }, { locale: "asc" }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.contentBlock.count({ where }),
    ]);
    return { data, total };
  }

  findBlockById(id: string) {
    return this.prisma.contentBlock.findFirst({
      where: { id, deletedAt: null },
      include: BLOCK_INCLUDE,
    });
  }

  findBlocksByKeys(keys: string[], locale: string) {
    return this.prisma.contentBlock.findMany({
      where: {
        key: { in: keys },
        locale,
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      },
    });
  }

  async isBlockKeyTaken(key: string, locale: string) {
    const found = await this.prisma.contentBlock.findFirst({
      where: { key, locale, deletedAt: null },
      select: { id: true },
    });
    return !!found;
  }

  createBlock(data: Prisma.ContentBlockCreateInput) {
    return this.prisma.contentBlock.create({
      data,
      include: BLOCK_INCLUDE,
    });
  }

  updateBlock(id: string, data: Prisma.ContentBlockUpdateInput) {
    return this.prisma.contentBlock.update({
      where: { id },
      data,
      include: BLOCK_INCLUDE,
    });
  }

  softDeleteBlock(id: string) {
    return this.prisma.contentBlock.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
