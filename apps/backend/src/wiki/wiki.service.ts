import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { sanitizeRichText } from "../common/sanitize";
import { UserRole } from "../common/enums";
import { RequestUser } from "../common/interfaces";
import { slugify, generateUniqueSlug } from "../common/utils/slugify";
import { MentionsService } from "../mentions/mentions.service";
import { RagService } from "../rag/rag.service";
import { MeilisearchService, MeiliDocument } from "../search/meilisearch.service";
import { CacheService } from "../common/cache/cache.service";
import { BacklinkService } from "./backlink.service";
import { CreateWikiPageDto, UpdateWikiPageDto, WikiVisibility } from "./dto/create-wiki-page.dto";
import { ShareWikiPageDto } from "./dto/share-wiki-page.dto";

const EDIT_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

const isPrivilegedRole = (role: UserRole) =>
  role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;

@Injectable()
export class WikiService {
  private readonly logger = new Logger(WikiService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mentions?: MentionsService,
    @Optional() private readonly rag?: RagService,
    @Optional() private readonly meili?: MeilisearchService,
    @Optional() private readonly cache?: CacheService,
    @Optional() private readonly backlinks?: BacklinkService,
  ) {}

  /**
   * Recompute the persistent backlink index for a page (best-effort).
   * Called from create() / update() — failures are logged but never block
   * the user-facing operation.
   */
  private rebuildBacklinks(pageId: string): void {
    if (!this.backlinks) return;
    void this.backlinks.rebuildBacklinks(pageId).catch((err) => {
      this.logger.warn(`Backlink rebuild failed for ${pageId}: ${err?.message || err}`);
    });
  }

  /** Génère un slug unique depuis un titre (fallback si non fourni par user). */
  private autoSlug(title: string): Promise<string> {
    return generateUniqueSlug(
      title,
      async (candidate) =>
        !!(await this.prisma.wikiPage.findUnique({
          where: { slug: candidate },
        })),
      { maxLength: 200, fallback: "wiki-page" },
    );
  }

  /**
   * Push a wiki page to Meilisearch (non-blocking).
   */
  private indexForMeili(page: {
    id: string;
    title: string;
    content: string;
    slug?: string | null;
    category?: string | null;
    authorId?: string | null;
    updatedAt?: Date | null;
  }): void {
    if (!this.meili) return;
    const doc: MeiliDocument = {
      id: `wiki-${page.id}`,
      title: page.title ?? "",
      content: this.stripHtml(page.content ?? ""),
      type: "wiki",
      url: `/wiki/${page.slug ?? page.id}`,
      authorId: page.authorId ?? null,
      date: page.updatedAt?.toISOString?.() ?? null,
      category: page.category ?? null,
      tags: [page.category].filter(Boolean) as string[],
    };
    void this.meili
      .indexOne("wiki", doc)
      .catch((err) =>
        this.logger.warn(
          `Meilisearch indexation failed for wiki ${page.id}: ${err?.message || err}`,
        ),
      );
  }

  /**
   * Strip HTML tags from rich-text content to obtain a plain-text version
   * suitable for @mention scanning.
   */
  private stripHtml(content: string): string {
    return content.replace(/<[^>]*>/g, " ");
  }

  /**
   * Index (or re-index) a wiki page in the RAG chunks table so it becomes
   * searchable by the AI assistant. Runs asynchronously and never blocks
   * the caller.
   */
  private indexForRag(page: { id: string; title: string; content: string }): void {
    if (!this.rag) return;
    const plainText = `${page.title}\n\n${this.stripHtml(page.content)}`;
    void this.rag
      .indexSource("WIKI", page.id, plainText, { title: page.title })
      .catch((err) =>
        this.logger.warn(`RAG indexation failed for wiki ${page.id}: ${err?.message || err}`),
      );
  }

  private resolveAuthorName(
    author: { firstName?: string | null; lastName?: string | null } | null | undefined,
    fallbackEmail?: string | null,
  ): string {
    if (author) {
      const name = `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim();
      if (name) return name;
    }
    return fallbackEmail || "Un utilisateur";
  }

  /**
   * Build a visibility-aware Prisma filter so each user only sees pages they
   * are allowed to see (own pages, PUBLIC pages, DEPARTMENT scoped, ROLE
   * scoped, or explicit collaborators).
   */
  private buildVisibilityFilter(user: RequestUser): Prisma.WikiPageWhereInput {
    if (isPrivilegedRole(user.role)) {
      return {}; // admins see everything
    }

    const orClauses: Prisma.WikiPageWhereInput[] = [
      { authorId: user.id },
      { visibility: "PUBLIC" },
      { collaborators: { has: user.id } },
      { allowedRoles: { has: user.role } },
    ];

    if (user.departmentId) {
      orClauses.push({
        visibility: "DEPARTMENT",
        ownerDepartmentId: user.departmentId,
      });
    }

    return { OR: orClauses };
  }

  private canView(page: any, user: RequestUser): boolean {
    if (isPrivilegedRole(user.role)) return true;
    if (page.authorId === user.id) return true;
    if (page.visibility === "PUBLIC") return true;
    if (
      page.visibility === "DEPARTMENT" &&
      user.departmentId &&
      page.ownerDepartmentId === user.departmentId
    ) {
      return true;
    }
    if (
      page.visibility === "ROLE" &&
      Array.isArray(page.allowedRoles) &&
      page.allowedRoles.includes(user.role)
    ) {
      return true;
    }
    if (Array.isArray(page.collaborators) && page.collaborators.includes(user.id)) {
      return true;
    }
    return false;
  }

  private canEdit(page: any, user: RequestUser): boolean {
    if (isPrivilegedRole(user.role)) return true;
    if (page.authorId === user.id) return true;
    return Array.isArray(page.collaborators) && page.collaborators.includes(user.id);
  }

  async findAll(
    user: RequestUser,
    filters?: {
      category?: string;
      search?: string;
      mine?: boolean;
      tag?: string;
    },
  ) {
    const where: Prisma.WikiPageWhereInput = {
      ...this.buildVisibilityFilter(user),
      isPublished: true,
    };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.mine) {
      where.authorId = user.id;
    }

    // Tag filter — restrict to pages tagged with the given slug.
    if (filters?.tag) {
      const tagSlug = filters.tag.trim().toLowerCase();
      if (tagSlug) {
        // Le champ relation s'appelle `tagLinks` côté schema (cf WikiPageTag).
        // Le champ `tags` String[] existe aussi mais c'est l'ancien (legacy).
        (where as Record<string, unknown>).tagLinks = {
          some: { tag: { slug: tagSlug } },
        };
      }
    }

    if (filters?.search) {
      const searchOr: Prisma.WikiPageWhereInput[] = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { content: { contains: filters.search, mode: "insensitive" } },
        { category: { contains: filters.search, mode: "insensitive" } },
      ];
      // Combine with existing OR (visibility). Prisma does not allow two OR
      // at the same level, so we wrap both in an AND.
      const existingOr = where.OR;
      delete where.OR;
      where.AND = [...(existingOr ? [{ OR: existingOr }] : []), { OR: searchOr }];
    }

    const needsScoring = !!filters?.search;

    const rows = await this.prisma.wikiPage.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        isPublished: true,
        visibility: true,
        ownerDepartmentId: true,
        allowedRoles: true,
        collaborators: true,
        editLockUserId: true,
        editLockExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        ...(needsScoring ? { content: true } : {}),
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: needsScoring ? undefined : { updatedAt: "desc" },
      // Garde-fou pire-cas : `findAll` n'a pas de pagination (liste/recherche
      // wiki), et le scoring ci-dessous (regex + scan de contenu par page)
      // est synchrone et non borné. Ce `take` plafonne le coût CPU/mémoire
      // sans changer le comportement tant que le nombre de pages reste sous
      // ce seuil — pas de requête de comptage supplémentaire ici.
      take: 1000,
    });

    if (!needsScoring) {
      return rows;
    }

    const searchLower = filters!.search!.toLowerCase();
    const terms = searchLower.split(/\s+/).filter((t) => t.length >= 2);

    // `content` est sélectionné conditionnellement (needsScoring=true ici).
    type RowWithContent = (typeof rows)[number] & { content?: string };
    const scored = (rows as RowWithContent[]).map((row) => {
      const titleLower = (row.title ?? "").toLowerCase();
      const contentLower = (row.content ?? "").toLowerCase();
      const catLower = (row.category ?? "").toLowerCase();

      let score = 0;
      for (const term of terms) {
        // Title matches worth 5 pts each
        if (titleLower.includes(term)) score += 5;
        // Category matches worth 3 pts each
        if (catLower.includes(term)) score += 3;
        // Content occurrence count, 1 pt each (capped at 10)
        const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const hits = (row.content ?? "").match(re);
        score += Math.min(hits?.length ?? 0, 10);
      }
      // Bonus for exact phrase match
      if (terms.length > 1) {
        if (titleLower.includes(searchLower)) score += 10;
        if (contentLower.includes(searchLower)) score += 5;
      }

      // Build excerpt: ~150 chars around first match in content
      let excerpt: string | null = null;
      const rawContent = row.content ?? "";
      const plainContent = this.stripHtml(rawContent);
      const plainLower = plainContent.toLowerCase();
      let firstIdx = -1;
      for (const term of terms) {
        const idx = plainLower.indexOf(term);
        if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) firstIdx = idx;
      }
      if (firstIdx !== -1) {
        const start = Math.max(0, firstIdx - 40);
        const end = Math.min(plainContent.length, firstIdx + 110);
        const prefix = start > 0 ? "..." : "";
        const suffix = end < plainContent.length ? "..." : "";
        excerpt = `${prefix}${plainContent.slice(start, end).trim()}${suffix}`;
      } else {
        excerpt = plainContent.slice(0, 150).trim() || null;
      }

      // Omit full content from response
      const { content: _content, ...rest } = row;
      void _content;
      return { ...rest, score, excerpt };
    });

    scored.sort(
      (a, b) =>
        b.score - a.score || (b.updatedAt as Date).getTime() - (a.updatedAt as Date).getTime(),
    );
    return scored;
  }

  /**
   * Autocomplete: return up to `limit` titles matching the query prefix/substring.
   */
  async autocomplete(
    user: RequestUser,
    q: string,
    limit = 5,
  ): Promise<Array<{ id: string; title: string; slug: string; category: string | null }>> {
    const where: Prisma.WikiPageWhereInput = {
      ...this.buildVisibilityFilter(user),
      isPublished: true,
      title: { contains: q, mode: "insensitive" },
    };

    // Merge visibility OR with title filter via AND
    const existingOr = where.OR;
    if (existingOr) {
      delete where.OR;
      where.AND = [{ OR: existingOr }, { title: where.title }];
      delete where.title;
    }

    return this.prisma.wikiPage.findMany({
      where,
      select: { id: true, title: true, slug: true, category: true },
      orderBy: { title: "asc" },
      take: Math.min(Math.max(limit, 1), 20),
    });
  }

  /**
   * Return all categories with their article count.
   */
  async getCategories(user: RequestUser): Promise<Array<{ category: string; count: number }>> {
    const visFilter = this.buildVisibilityFilter(user);

    const rows = await this.prisma.wikiPage.findMany({
      where: {
        ...visFilter,
        isPublished: true,
        category: { not: null },
      },
      select: { category: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.category) continue;
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  }

  async findBySlug(slug: string, user: RequestUser) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { slug },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canView(page, user)) {
      throw new ForbiddenException("You cannot access this wiki page");
    }
    return page;
  }

  async create(data: CreateWikiPageDto, authorId: string) {
    // Auto-génère le slug depuis le titre si non fourni (ou normalise si fourni)
    const rawSlug = typeof data.slug === "string" ? data.slug.trim() : "";
    const slug = rawSlug
      ? slugify(rawSlug, { maxLength: 200 }) || (await this.autoSlug(data.title))
      : await this.autoSlug(data.title);

    const page = await this.prisma.wikiPage.create({
      data: {
        title: sanitizeRichText(data.title),
        slug,
        content: sanitizeRichText(data.content),
        category: data.category || null,
        isPublished: data.isPublished ?? true,
        authorId,
        visibility: data.visibility ?? "PUBLIC",
        ownerDepartmentId: data.ownerDepartmentId ?? null,
        allowedRoles: data.allowedRoles ?? [],
        collaborators: data.collaborators ?? [],
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Parse @mentions in the content and notify cited users (non-blocking).
    if (this.mentions && page.content) {
      const authorName = this.resolveAuthorName(page.author);
      void this.mentions
        .parseAndNotify({
          text: this.stripHtml(page.content),
          authorId,
          authorName,
          sourceType: "wiki",
          sourceId: page.id,
          sourceTitle: page.title,
          link: `/wiki/${page.slug}`,
        })
        .catch((err) => this.logger.warn(`mention parsing failed: ${err?.message || err}`));
    }

    // Index the new page for RAG-powered AI search (non-blocking).
    this.indexForRag(page);

    // Index the new page for Meilisearch (non-blocking).
    this.indexForMeili(page);

    // New content may introduce new backlinks — invalidate cache and rebuild
    // the persistent backlink index for this page.
    this.invalidateBacklinkCache();
    this.rebuildBacklinks(page.id);

    return page;
  }

  /**
   * Create a personal wiki page. Defaults to PRIVATE visibility and scopes
   * the owner department when the user has one.
   */
  async createPersonalPage(data: CreateWikiPageDto, user: RequestUser) {
    const visibility: WikiVisibility = data.visibility ?? "PRIVATE";
    const ownerDepartmentId: string | undefined =
      visibility === "DEPARTMENT"
        ? (data.ownerDepartmentId ?? user.departmentId ?? undefined)
        : data.ownerDepartmentId;
    return this.create(
      {
        ...data,
        visibility,
        ownerDepartmentId,
      },
      user.id,
    );
  }

  async update(id: string, data: UpdateWikiPageDto, user: RequestUser) {
    const existing = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Wiki page not found");

    if (!this.canEdit(existing, user)) {
      throw new ForbiddenException("You cannot edit this wiki page");
    }

    // If another user holds a non-expired lock, block the save.
    if (
      existing.editLockUserId &&
      existing.editLockUserId !== user.id &&
      existing.editLockExpiresAt &&
      existing.editLockExpiresAt.getTime() > Date.now()
    ) {
      throw new ConflictException("Page is locked by another user");
    }

    // Snapshot the previous content as a version entry before overwriting.
    if (data.content !== undefined && data.content !== existing.content) {
      await this.prisma.wikiPageVersion.create({
        data: {
          pageId: existing.id,
          content: existing.content,
          title: existing.title,
          authorId: existing.authorId,
          changeLog: data.changeLog ?? null,
        },
      });
    }

    const { changeLog: _changeLog, ...rest } = data;

    const updated = await this.prisma.wikiPage.update({
      where: { id },
      data: {
        ...rest,
        ...(data.title !== undefined && {
          title: sanitizeRichText(data.title),
        }),
        ...(data.content !== undefined && {
          content: sanitizeRichText(data.content),
        }),
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Parse @mentions on content update and notify cited users (non-blocking).
    if (this.mentions && data.content !== undefined && data.content !== existing.content) {
      const mentionsSvc = this.mentions;
      void (async () => {
        try {
          const author = await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { firstName: true, lastName: true, email: true },
          });
          const authorName = this.resolveAuthorName(author, user.email);
          await mentionsSvc.parseAndNotify({
            text: this.stripHtml(updated.content),
            authorId: user.id,
            authorName,
            sourceType: "wiki",
            sourceId: updated.id,
            sourceTitle: updated.title,
            link: `/wiki/${updated.slug}`,
          });
        } catch (err: any) {
          this.logger.warn(`mention parsing failed: ${err?.message || err}`);
        }
      })();
    }

    // Re-index updated content for RAG (non-blocking).
    if (data.content !== undefined || data.title !== undefined) {
      this.indexForRag(updated);
    }

    // Re-index updated content for Meilisearch (non-blocking).
    this.indexForMeili(updated);

    // Backlink graph may have changed if content or slug was edited.
    if (data.content !== undefined || data.slug !== undefined) {
      this.invalidateBacklinkCache();
      this.rebuildBacklinks(updated.id);
    }

    return updated;
  }

  async delete(id: string, user: RequestUser) {
    const existing = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Page wiki introuvable");

    if (!isPrivilegedRole(user.role) && existing.authorId !== user.id) {
      throw new ForbiddenException("Vous ne pouvez pas supprimer cette page wiki.");
    }

    const deleted = await this.prisma.wikiPage.delete({ where: { id } });

    // Désindexation complète
    void this.meili?.deleteDocument("wiki", id);
    void this.rag?.removeFromIndex("WIKI" as never, id).catch(() => undefined);

    // Removing a page can change backlinks of others; clear the cache.
    this.invalidateBacklinkCache();

    return deleted;
  }

  /**
   * Enregistre un feedback utilisateur (up/down + commentaire optionnel) dans
   * l'audit log. Pas de nouvelle table — on stocke comme évènement sérialisé
   * pour pouvoir agréger plus tard sans migration.
   */
  async recordFeedback(
    pageId: string,
    user: RequestUser,
    body: { rating: "up" | "down"; comment?: string },
  ) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { id: pageId },
      select: { id: true, title: true, slug: true },
    });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (body.rating !== "up" && body.rating !== "down") {
      throw new NotFoundException("Invalid rating");
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "WIKI_FEEDBACK",
        resourceType: "WikiPage",
        resourceId: page.id,
        metadata: {
          rating: body.rating,
          comment: body.comment?.slice(0, 500) ?? null,
          title: page.title,
          slug: page.slug,
        },
        severity: "INFO",
      },
    });

    return { success: true };
  }

  /**
   * Share a page — update visibility / collaborators. Only the author or an
   * admin can change the sharing settings.
   */
  async shareWith(id: string, dto: ShareWikiPageDto, user: RequestUser) {
    const existing = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Wiki page not found");

    if (!isPrivilegedRole(user.role) && existing.authorId !== user.id) {
      throw new ForbiddenException("Only the author or an admin can share");
    }

    return this.prisma.wikiPage.update({
      where: { id },
      data: {
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
        ...(dto.ownerDepartmentId !== undefined && {
          ownerDepartmentId: dto.ownerDepartmentId,
        }),
        ...(dto.allowedRoles !== undefined && {
          allowedRoles: dto.allowedRoles,
        }),
        ...(dto.collaborators !== undefined && {
          collaborators: dto.collaborators,
        }),
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Try to acquire the edit lock for 5 minutes. Returns
   * { success: true, expiresAt } if the caller now owns the lock, otherwise
   * { locked: true, by: { firstName, lastName, email }, expiresAt }.
   */
  async acquireEditLock(id: string, user: RequestUser) {
    const page = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canEdit(page, user)) {
      throw new ForbiddenException("You cannot edit this wiki page");
    }

    const now = Date.now();
    const lockHeld =
      page.editLockUserId && page.editLockExpiresAt && page.editLockExpiresAt.getTime() > now;

    if (lockHeld && page.editLockUserId !== user.id) {
      const holder = await this.prisma.user.findUnique({
        where: { id: page.editLockUserId! },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      return {
        locked: true,
        by: holder,
        expiresAt: page.editLockExpiresAt,
      };
    }

    const expiresAt = new Date(now + EDIT_LOCK_TTL_MS);
    await this.prisma.wikiPage.update({
      where: { id },
      data: {
        editLockUserId: user.id,
        editLockExpiresAt: expiresAt,
      },
    });

    return { success: true, expiresAt, by: { id: user.id } };
  }

  async releaseEditLock(id: string, user: RequestUser) {
    const page = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException("Wiki page not found");

    // Only the lock holder or an admin can release the lock.
    if (page.editLockUserId && page.editLockUserId !== user.id && !isPrivilegedRole(user.role)) {
      throw new ForbiddenException("Lock held by another user");
    }

    await this.prisma.wikiPage.update({
      where: { id },
      data: { editLockUserId: null, editLockExpiresAt: null },
    });
    return { success: true };
  }

  async getVersions(id: string, user: RequestUser, take = 50, skip = 0) {
    const page = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canView(page, user)) {
      throw new ForbiddenException("You cannot access this wiki page");
    }

    const [items, total] = await Promise.all([
      this.prisma.wikiPageVersion.findMany({
        where: { pageId: id },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(take, 1), 100),
        skip: Math.max(skip, 0),
        select: {
          id: true,
          title: true,
          authorId: true,
          changeLog: true,
          createdAt: true,
        },
      }),
      this.prisma.wikiPageVersion.count({ where: { pageId: id } }),
    ]);

    // Resolve author display names in a single query.
    const authorIds = Array.from(new Set(items.map((v) => v.authorId)));
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    const limit = Math.min(Math.max(take, 1), 100);
    return {
      data: items.map((v) => ({
        ...v,
        author: authorMap.get(v.authorId) ?? null,
      })),
      meta: {
        total,
        page: Math.floor(Math.max(skip, 0) / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find articles that link to a given page by slug (used by the
   * GET /wiki/pages/:slug/backlinks endpoint).
   *
   * Préfère l'index persistant (`WikiPageBacklink`) quand le service
   * BacklinkService est injecté ; retombe sur le scan plein-texte legacy
   * si nécessaire (backwards-compat avec les déploiements pré-migration).
   */
  async findBacklinksBySlug(slug: string, user: RequestUser) {
    const target = await this.prisma.wikiPage.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        authorId: true,
        visibility: true,
        ownerDepartmentId: true,
        allowedRoles: true,
        collaborators: true,
      },
    });
    if (!target) throw new NotFoundException("Wiki page not found");
    if (!this.canView(target, user)) {
      throw new ForbiddenException("You cannot access this wiki page");
    }
    return this.findBacklinks(target.id, user);
  }

  /**
   * Find articles that link to the given wiki page (i.e. "cited in").
   *
   * Matches three link shapes inside the content:
   *   - Wiki-style double-bracket links:   `[[slug]]` or `[[Titre|slug]]`
   *   - Direct path links:                  `/wiki/slug` (any attribute)
   *   - Markdown links:                     `[text](/wiki/slug)`
   *
   * Si l'index persistant `WikiPageBacklink` est disponible, on l'utilise
   * en priorité. Sinon (et pour préserver la compatibilité avec les liens
   * `/wiki/slug` non capturés par la regex `[[...]]`), on retombe sur le
   * scan plein-texte caché.
   *
   * Results are filtered by the caller's visibility. Scans are cached in
   * Redis for 5 minutes to keep the endpoint responsive.
   */
  async findBacklinks(id: string, user: RequestUser) {
    const page = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canView(page, user)) {
      throw new ForbiddenException("You cannot access this wiki page");
    }

    const slug = page.slug;
    const cacheKey = `wiki:backlinks:${id}:${slug}`;

    // Scan (fire cache-aside). The cached value contains the raw candidate
    // list; per-user visibility filtering happens after retrieval so the
    // cache can be shared across users.
    type CandidateRow = {
      id: string;
      title: string;
      slug: string;
      category: string | null;
      updatedAt: string;
      authorId: string;
      visibility: string;
      ownerDepartmentId: string | null;
      allowedRoles: string[];
      collaborators: string[];
      excerpt: string;
    };

    // Persistent backlink index (preferred path). Falls back to in-content
    // scan when the BacklinkService is unavailable (pre-migration deploys
    // or unit tests not wiring it).
    let candidates: CandidateRow[];
    if (this.backlinks) {
      const indexed = await this.backlinks.findBacklinksForSlug(slug);
      candidates = indexed.map((b) => ({
        id: b.id,
        title: b.title,
        slug: b.slug,
        category: b.category,
        updatedAt: b.updatedAt.toISOString(),
        authorId: b.authorId,
        visibility: b.visibility,
        ownerDepartmentId: b.ownerDepartmentId,
        allowedRoles: b.allowedRoles,
        collaborators: b.collaborators,
        excerpt: `${b.occurrenceCount} mention${b.occurrenceCount > 1 ? "s" : ""}`,
      }));
    } else {
      candidates = this.cache
        ? await this.cache.wrap<CandidateRow[]>(cacheKey, 300, () =>
            this.scanBacklinkCandidates(id, slug),
          )
        : await this.scanBacklinkCandidates(id, slug);
    }

    // Visibility filter — run each candidate through canView.
    const visible = candidates.filter((c) => this.canView(c, user));

    return {
      count: visible.length,
      items: visible.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        category: c.category,
        excerpt: c.excerpt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  /**
   * Low-level scan that parses wiki content for links to a given slug / id.
   * Returns candidate rows with enough metadata to perform visibility
   * checks without touching the DB again.
   */
  private async scanBacklinkCandidates(
    selfId: string,
    slug: string,
  ): Promise<
    Array<{
      id: string;
      title: string;
      slug: string;
      category: string | null;
      updatedAt: string;
      authorId: string;
      visibility: string;
      ownerDepartmentId: string | null;
      allowedRoles: string[];
      collaborators: string[];
      excerpt: string;
    }>
  > {
    const rows = await this.prisma.wikiPage.findMany({
      where: {
        id: { not: selfId },
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        category: true,
        authorId: true,
        visibility: true,
        ownerDepartmentId: true,
        allowedRoles: true,
        collaborators: true,
        updatedAt: true,
      },
    });

    const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Matches:
    //   [[slug]]          or [[Title|slug]]
    //   /wiki/slug        (href or plain path — bounded by non-slug chars)
    //   [text](/wiki/slug)  (markdown link targeting the slug)
    const patterns = [
      new RegExp(`\\[\\[(?:[^\\]|]*\\|)?${escapedSlug}\\s*\\]\\]`, "i"),
      new RegExp(`/wiki/${escapedSlug}(?=[^A-Za-z0-9_-]|$)`, "i"),
    ];

    const matches: Array<{
      id: string;
      title: string;
      slug: string;
      category: string | null;
      updatedAt: string;
      authorId: string;
      visibility: string;
      ownerDepartmentId: string | null;
      allowedRoles: string[];
      collaborators: string[];
      excerpt: string;
    }> = [];

    for (const r of rows) {
      const content = r.content ?? "";
      if (!patterns.some((p) => p.test(content))) continue;

      // Build an excerpt around the first match.
      const plain = this.stripHtml(content).replace(/\s+/g, " ").trim();
      const idx = patterns.reduce<number>((acc, p) => {
        if (acc >= 0) return acc;
        const m = p.exec(plain);
        return m ? m.index : -1;
      }, -1);
      const snippet =
        idx >= 0
          ? plain.slice(Math.max(0, idx - 80), Math.min(plain.length, idx + 160))
          : plain.slice(0, 200);
      const excerpt =
        (idx > 80 ? "…" : "") + snippet + (plain.length > (idx >= 0 ? idx + 160 : 200) ? "…" : "");

      matches.push({
        id: r.id,
        title: r.title,
        slug: r.slug,
        category: r.category,
        updatedAt: r.updatedAt.toISOString(),
        authorId: r.authorId,
        visibility: r.visibility ?? "PUBLIC",
        ownerDepartmentId: r.ownerDepartmentId,
        allowedRoles: r.allowedRoles ?? [],
        collaborators: r.collaborators ?? [],
        excerpt,
      });
    }

    return matches;
  }

  /**
   * Invalidate backlink caches. Called after any update/create/delete that
   * might change link relationships. Scoped to the target page pattern.
   */
  private invalidateBacklinkCache(): void {
    if (!this.cache) return;
    void this.cache.del("wiki:backlinks:*").catch(() => {
      /* noop — cache invalidation is best-effort */
    });
  }

  async restoreVersion(pageId: string, versionId: string, user: RequestUser) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { id: pageId },
    });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canEdit(page, user)) {
      throw new ForbiddenException("You cannot edit this wiki page");
    }

    const version = await this.prisma.wikiPageVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.pageId !== pageId) {
      throw new NotFoundException("Version not found");
    }

    // Snapshot the current state before restoring.
    await this.prisma.wikiPageVersion.create({
      data: {
        pageId: page.id,
        content: page.content,
        title: page.title,
        authorId: page.authorId,
        changeLog: `Snapshot before restore of ${versionId}`,
      },
    });

    return this.prisma.wikiPage.update({
      where: { id: pageId },
      data: {
        title: sanitizeRichText(version.title),
        content: sanitizeRichText(version.content),
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ---- Attachments ----

  private parseAttachments(raw: string | null | undefined): Array<{
    name: string;
    url: string;
    size: number;
    mimeType: string;
    uploadedAt: string;
  }> {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async getAttachments(pageId: string, user: RequestUser) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { id: pageId },
    });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canView(page, user)) {
      throw new ForbiddenException("You cannot access this wiki page");
    }
    return this.parseAttachments(page.attachments);
  }

  async addAttachment(pageId: string, user: RequestUser, file: Express.Multer.File) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { id: pageId },
    });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canEdit(page, user)) {
      throw new ForbiddenException("You cannot edit this wiki page");
    }

    const attachments = this.parseAttachments(page.attachments);
    const attachment = {
      name: file.originalname,
      url: `/uploads/wiki/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date().toISOString(),
    };
    attachments.push(attachment);

    await this.prisma.wikiPage.update({
      where: { id: pageId },
      data: { attachments: JSON.stringify(attachments) },
    });

    return attachment;
  }

  async removeAttachment(pageId: string, user: RequestUser, filename: string) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { id: pageId },
    });
    if (!page) throw new NotFoundException("Wiki page not found");
    if (!this.canEdit(page, user)) {
      throw new ForbiddenException("You cannot edit this wiki page");
    }

    const attachments = this.parseAttachments(page.attachments);
    const idx = attachments.findIndex((a) => path.basename(a.url) === filename);
    if (idx === -1) throw new NotFoundException("Attachment not found");

    const [removed] = attachments.splice(idx, 1);

    // Delete file from disk (best-effort)
    const filePath = path.join(process.cwd(), removed!.url);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err: any) {
      this.logger.warn(`Failed to delete attachment file ${filePath}: ${err?.message || err}`);
    }

    await this.prisma.wikiPage.update({
      where: { id: pageId },
      data: {
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
      },
    });

    return { success: true };
  }
}
