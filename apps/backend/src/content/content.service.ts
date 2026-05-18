import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { sanitizePlainText, sanitizeRichText } from "../common/sanitize";
import { generateUniqueSlug } from "../common/utils/slugify";
import { ContentRepository } from "./content.repository";
import { CreateContentPageDto } from "./dto/create-content-page.dto";
import { UpdateContentPageDto } from "./dto/update-content-page.dto";
import { CreateContentBlockDto } from "./dto/create-content-block.dto";
import { UpdateContentBlockDto } from "./dto/update-content-block.dto";

const DEFAULT_LOCALE = "fr";

/**
 * Métadonnées audit propagées par le controller (extraites de la requête HTTP).
 * Permettent à AuditService de stocker IP + User-Agent pour traçabilité.
 */
export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly repo: ContentRepository,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // Pages
  // ═══════════════════════════════════════════════════════════════════

  async listPages(params: {
    status?: ContentStatus;
    locale?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const { data, total } = await this.repo.findManyPages({
      ...params,
      includeDeleted: false,
    });
    return {
      data,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }

  async getPageById(id: string) {
    const page = await this.repo.findPageById(id);
    if (!page) throw new NotFoundException("ContentPage not found");
    return page;
  }

  async getPublishedPage(slug: string, locale: string) {
    const page = await this.repo.findPublishedBySlug(slug, locale);
    if (!page) throw new NotFoundException("Page not found");
    return page;
  }

  async createPage(dto: CreateContentPageDto, ctx: AuditContext) {
    const title = sanitizePlainText(dto.title);
    if (!title) {
      throw new BadRequestException("title is required");
    }
    const locale = dto.locale ?? DEFAULT_LOCALE;

    const slug = await this.resolveSlug(dto.slug, title, locale);

    const content = sanitizeRichText(dto.content);
    const excerpt = dto.excerpt ? sanitizePlainText(dto.excerpt) : null;
    const seoTitle = dto.seoTitle ? sanitizePlainText(dto.seoTitle) : null;
    const seoDescription = dto.seoDescription
      ? sanitizePlainText(dto.seoDescription)
      : null;
    const status = dto.status ?? ContentStatus.DRAFT;

    const created = await this.repo.createPage({
      slug,
      locale,
      title,
      excerpt,
      content,
      status,
      seoTitle,
      seoDescription,
      publishedAt: status === ContentStatus.PUBLISHED ? new Date() : null,
      author: { connect: { id: ctx.userId } },
    });

    await this.repo.createRevision({
      page: { connect: { id: created.id } },
      version: 1,
      title,
      content,
      excerpt,
      seoTitle,
      seoDescription,
      status,
      author: { connect: { id: ctx.userId } },
      comment: "Création initiale",
    });

    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_PAGE_CREATED",
      resourceType: "ContentPage",
      resourceId: created.id,
      metadata: { slug, locale, status, title },
    });

    return created;
  }

  async updatePage(id: string, dto: UpdateContentPageDto, ctx: AuditContext) {
    const existing = await this.getPageById(id);

    // Slug : si demandé différent, on revérifie l'unicité.
    let nextSlug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      const taken = await this.repo.isSlugTaken(
        dto.slug,
        existing.locale,
        existing.id,
      );
      if (taken) {
        throw new ConflictException(
          `slug "${dto.slug}" est déjà utilisé pour la locale ${existing.locale}`,
        );
      }
      nextSlug = dto.slug;
    }

    const nextTitle = dto.title ? sanitizePlainText(dto.title) : existing.title;
    const nextContent =
      dto.content !== undefined
        ? sanitizeRichText(dto.content)
        : existing.content;
    const nextExcerpt =
      dto.excerpt !== undefined
        ? dto.excerpt
          ? sanitizePlainText(dto.excerpt)
          : null
        : existing.excerpt;
    const nextSeoTitle =
      dto.seoTitle !== undefined
        ? dto.seoTitle
          ? sanitizePlainText(dto.seoTitle)
          : null
        : existing.seoTitle;
    const nextSeoDesc =
      dto.seoDescription !== undefined
        ? dto.seoDescription
          ? sanitizePlainText(dto.seoDescription)
          : null
        : existing.seoDescription;
    const nextStatus = dto.status ?? existing.status;

    // Snapshot AVANT écrasement.
    const nextVersion = await this.repo.nextRevisionVersion(existing.id);
    await this.repo.createRevision({
      page: { connect: { id: existing.id } },
      version: nextVersion,
      title: existing.title,
      content: existing.content,
      excerpt: existing.excerpt,
      seoTitle: existing.seoTitle,
      seoDescription: existing.seoDescription,
      status: existing.status,
      author: { connect: { id: ctx.userId } },
      comment: dto.revisionComment ?? null,
    });

    // Première publication ? On renseigne publishedAt.
    let publishedAtUpdate: Date | undefined | null;
    if (nextStatus === ContentStatus.PUBLISHED && !existing.publishedAt) {
      publishedAtUpdate = new Date();
    } else {
      publishedAtUpdate = undefined; // ne pas toucher
    }

    const updated = await this.repo.updatePage(existing.id, {
      slug: nextSlug,
      title: nextTitle,
      content: nextContent,
      excerpt: nextExcerpt,
      seoTitle: nextSeoTitle,
      seoDescription: nextSeoDesc,
      status: nextStatus,
      ...(publishedAtUpdate !== undefined
        ? { publishedAt: publishedAtUpdate }
        : {}),
      updatedBy: { connect: { id: ctx.userId } },
    });

    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_PAGE_UPDATED",
      resourceType: "ContentPage",
      resourceId: existing.id,
      metadata: {
        revisionVersion: nextVersion,
        diff: {
          title: nextTitle !== existing.title,
          slug: nextSlug !== existing.slug,
          status: nextStatus !== existing.status,
          content: nextContent !== existing.content,
        },
      },
    });

    return updated;
  }

  async publishPage(id: string, ctx: AuditContext) {
    const existing = await this.getPageById(id);
    if (existing.status === ContentStatus.PUBLISHED) {
      return existing;
    }
    const updated = await this.repo.updatePage(existing.id, {
      status: ContentStatus.PUBLISHED,
      publishedAt: existing.publishedAt ?? new Date(),
      updatedBy: { connect: { id: ctx.userId } },
    });
    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_PAGE_PUBLISHED",
      resourceType: "ContentPage",
      resourceId: existing.id,
      metadata: { slug: existing.slug, locale: existing.locale },
    });
    return updated;
  }

  async unpublishPage(id: string, ctx: AuditContext) {
    const existing = await this.getPageById(id);
    if (existing.status !== ContentStatus.PUBLISHED) {
      return existing;
    }
    const updated = await this.repo.updatePage(existing.id, {
      status: ContentStatus.ARCHIVED,
      updatedBy: { connect: { id: ctx.userId } },
    });
    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_PAGE_UNPUBLISHED",
      resourceType: "ContentPage",
      resourceId: existing.id,
      metadata: { slug: existing.slug, locale: existing.locale },
    });
    return updated;
  }

  async deletePage(id: string, ctx: AuditContext) {
    const existing = await this.getPageById(id);
    await this.repo.softDeletePage(existing.id);
    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_PAGE_DELETED",
      resourceType: "ContentPage",
      resourceId: existing.id,
      severity: "WARN",
      metadata: { slug: existing.slug, locale: existing.locale },
    });
  }

  // ─── Révisions ──────────────────────────────────────────────────────

  async listRevisions(pageId: string, page: number, limit: number) {
    await this.getPageById(pageId); // 404 si page absente
    const { data, total } = await this.repo.findRevisions(pageId, page, limit);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async restoreRevision(pageId: string, version: number, ctx: AuditContext) {
    const existing = await this.getPageById(pageId);
    const rev = await this.repo.findRevision(pageId, version);
    if (!rev) throw new NotFoundException("Revision not found");

    // Snapshot de l'état courant avant restauration.
    const nextVersion = await this.repo.nextRevisionVersion(existing.id);
    await this.repo.createRevision({
      page: { connect: { id: existing.id } },
      version: nextVersion,
      title: existing.title,
      content: existing.content,
      excerpt: existing.excerpt,
      seoTitle: existing.seoTitle,
      seoDescription: existing.seoDescription,
      status: existing.status,
      author: { connect: { id: ctx.userId } },
      comment: `Snapshot avant restauration v${version}`,
    });

    const updated = await this.repo.updatePage(existing.id, {
      title: rev.title,
      content: rev.content,
      excerpt: rev.excerpt,
      seoTitle: rev.seoTitle,
      seoDescription: rev.seoDescription,
      updatedBy: { connect: { id: ctx.userId } },
    });

    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_PAGE_RESTORED",
      resourceType: "ContentPage",
      resourceId: existing.id,
      metadata: { restoredVersion: version, newSnapshotVersion: nextVersion },
    });

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Blocks
  // ═══════════════════════════════════════════════════════════════════

  async listBlocks(params: {
    prefix?: string;
    locale?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const { data, total } = await this.repo.findManyBlocks(params);
    return {
      data,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }

  async getBlockById(id: string) {
    const block = await this.repo.findBlockById(id);
    if (!block) throw new NotFoundException("ContentBlock not found");
    return block;
  }

  async getPublishedBlocksByKeys(keys: string[], locale: string) {
    if (keys.length === 0) return {};
    if (keys.length > 50) {
      throw new BadRequestException("Trop de clés demandées (max 50)");
    }
    const rows = await this.repo.findBlocksByKeys(keys, locale);
    const result: Record<
      string,
      {
        key: string;
        locale: string;
        title: string | null;
        body: string;
        data: Prisma.JsonValue;
        updatedAt: Date;
      }
    > = {};
    for (const row of rows) {
      result[row.key] = {
        key: row.key,
        locale: row.locale,
        title: row.title,
        body: row.body,
        data: row.data ?? null,
        updatedAt: row.updatedAt,
      };
    }
    return result;
  }

  async createBlock(dto: CreateContentBlockDto, ctx: AuditContext) {
    const locale = dto.locale ?? DEFAULT_LOCALE;
    const taken = await this.repo.isBlockKeyTaken(dto.key, locale);
    if (taken) {
      throw new ConflictException(
        `clé "${dto.key}" déjà utilisée pour la locale ${locale}`,
      );
    }

    const body = sanitizeRichText(dto.body);
    const title = dto.title ? sanitizePlainText(dto.title) : null;
    const data =
      dto.data === undefined
        ? Prisma.DbNull
        : (dto.data as Prisma.InputJsonValue);

    const created = await this.repo.createBlock({
      key: dto.key,
      locale,
      title,
      body,
      data,
      status: dto.status ?? ContentStatus.PUBLISHED,
      updatedBy: { connect: { id: ctx.userId } },
    });

    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_BLOCK_CREATED",
      resourceType: "ContentBlock",
      resourceId: created.id,
      metadata: { key: dto.key, locale, status: created.status },
    });

    return created;
  }

  async updateBlock(id: string, dto: UpdateContentBlockDto, ctx: AuditContext) {
    const existing = await this.getBlockById(id);

    const updates: Prisma.ContentBlockUpdateInput = {
      updatedBy: { connect: { id: ctx.userId } },
    };
    if (dto.title !== undefined) {
      updates.title = dto.title ? sanitizePlainText(dto.title) : null;
    }
    if (dto.body !== undefined) {
      updates.body = sanitizeRichText(dto.body);
    }
    if (dto.data !== undefined) {
      updates.data =
        dto.data === null ? Prisma.DbNull : (dto.data as Prisma.InputJsonValue);
    }
    if (dto.status !== undefined) {
      updates.status = dto.status;
    }

    const updated = await this.repo.updateBlock(existing.id, updates);
    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_BLOCK_UPDATED",
      resourceType: "ContentBlock",
      resourceId: existing.id,
      metadata: {
        key: existing.key,
        locale: existing.locale,
        statusChanged:
          dto.status !== undefined && dto.status !== existing.status,
      },
    });
    return updated;
  }

  async deleteBlock(id: string, ctx: AuditContext) {
    const existing = await this.getBlockById(id);
    await this.repo.softDeleteBlock(existing.id);
    await this.audit.log({
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: "CONTENT_BLOCK_DELETED",
      resourceType: "ContentBlock",
      resourceId: existing.id,
      severity: "WARN",
      metadata: { key: existing.key, locale: existing.locale },
    });
  }

  // ─── Helpers internes ──────────────────────────────────────────────

  private async resolveSlug(
    provided: string | undefined,
    title: string,
    locale: string,
  ): Promise<string> {
    if (provided) {
      const taken = await this.repo.isSlugTaken(provided, locale);
      if (taken) {
        throw new ConflictException(
          `slug "${provided}" est déjà utilisé pour la locale ${locale}`,
        );
      }
      return provided;
    }
    return generateUniqueSlug(
      title,
      (candidate) => this.repo.isSlugTaken(candidate, locale),
      { maxLength: 120 },
    );
  }
}
