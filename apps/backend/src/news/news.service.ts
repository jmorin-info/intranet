import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MentionsService } from "../mentions/mentions.service";
import {
  MeilisearchService,
  MeiliDocument,
} from "../search/meilisearch.service";
import { CreateNewsDto } from "./dto/create-news.dto";
import { UpdateNewsDto } from "./dto/update-news.dto";
import { UserRole } from "../common/enums";
import { sanitizeRichText } from "../common/sanitize";
import { CacheService } from "../common/cache/cache.service";

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly mentions?: MentionsService,
    @Optional() private readonly meili?: MeilisearchService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  /** Wipe cached news lists (any role / any page). Called on every mutation. */
  private invalidateNewsListCache(): void {
    if (!this.cache) return;
    void this.cache.del("news:list:*");
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Push a news post to Meilisearch (non-blocking).
   */
  private indexForMeili(post: any): void {
    if (!this.meili) return;
    const payload: MeiliDocument = {
      id: `news-${post.id}`,
      title: post.title ?? "",
      content: this.stripHtml(post.content ?? post.excerpt ?? ""),
      type: "news",
      url: `/news/${post.slug ?? post.id}`,
      authorId: post.authorId ?? null,
      date: post.publishedAt?.toISOString?.() ?? null,
      category: post.category ?? null,
      tags: [post.category].filter(Boolean),
    };
    void this.meili
      .indexOne("news", payload)
      .catch((err) =>
        this.logger.warn(
          `Meilisearch indexation failed for news ${post.id}: ${err?.message || err}`,
        ),
      );
  }

  async findAll(
    pagination: { page?: number; limit?: number },
    currentUserRole: UserRole,
  ) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;

    // Posts with empty targetRoles are visible to everyone
    const where: any = {
      deletedAt: null,
      isPublished: true,
      OR: [
        { targetRoles: { has: currentUserRole } },
        { targetRoles: { isEmpty: true } },
      ],
    };

    const fetch = async () => {
      const [data, total] = await Promise.all([
        this.prisma.newsPost.findMany({
          where,
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true },
            },
            _count: {
              select: { views: true },
            },
          },
          orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.newsPost.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    };

    // News mutate slowly (creation = manual editorial action) → cache 120s.
    // Key scoped by role + page + limit so each role sees a coherent ACL view.
    if (!this.cache) return fetch();
    const key = `news:list:role=${currentUserRole}:page=${page}:limit=${limit}`;
    return this.cache.wrap(key, 120, fetch);
  }

  async findBySlug(slug: string, currentUserRole: UserRole) {
    const post = await this.prisma.newsPost.findUnique({
      where: { slug },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { views: true },
        },
      },
    });

    if (!post || post.deletedAt) {
      throw new NotFoundException("News post not found");
    }

    // Check role access — empty targetRoles = visible to all
    if (
      post.isPublished &&
      post.targetRoles.length > 0 &&
      !post.targetRoles.includes(currentUserRole as any)
    ) {
      throw new NotFoundException("News post not found");
    }

    return post;
  }

  async create(dto: CreateNewsDto, authorId: string) {
    const slug = await this.generateSlug(dto.title);

    const isPublished = dto.isPublished ?? false;
    const targetRoles =
      dto.targetRoles && dto.targetRoles.length > 0
        ? (dto.targetRoles as any[])
        : [];

    const post = await this.prisma.newsPost.create({
      data: {
        title: sanitizeRichText(dto.title),
        slug,
        content: sanitizeRichText(dto.content),
        excerpt: dto.excerpt ? sanitizeRichText(dto.excerpt) : undefined,
        coverImageUrl: dto.coverImageUrl,
        category: dto.category,
        isPinned: dto.isPinned ?? false,
        isPublished,
        publishedAt: isPublished ? new Date() : null,
        authorId,
        targetRoles,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(`News post created: ${post.slug} by ${authorId}`);

    // Notify all active users about the new article
    if (isPublished) {
      this.notificationsService
        .broadcast({
          type: "NEWS_POSTED",
          title: `Nouvel article : ${post.title}`,
          body: post.excerpt || post.title,
          resourceType: "NewsPost",
          resourceId: post.id,
        })
        .catch((err) => this.logger.warn(`News notification failed: ${err}`));
    }

    // Extract @mentions in title + excerpt + plain-text of content to notify individually
    if (this.mentions && isPublished) {
      const authorName =
        `${post.author.firstName} ${post.author.lastName}`.trim() ||
        "Un auteur";
      const plain = `${dto.title}\n${dto.excerpt || ""}\n${dto.content.replace(/<[^>]*>/g, " ")}`;
      void this.mentions
        .parseAndNotify({
          text: plain,
          authorId,
          authorName,
          sourceType: "news",
          sourceId: post.id,
          sourceTitle: post.title,
          link: `/news/${post.slug}`,
        })
        .catch((err) =>
          this.logger.warn(`mention parsing failed: ${err?.message || err}`),
        );
    }

    this.indexForMeili(post);
    this.invalidateNewsListCache();

    return post;
  }

  async update(id: string, dto: UpdateNewsDto, editorId?: string) {
    const post = await this.prisma.newsPost.findUnique({ where: { id } });

    if (!post || post.deletedAt) {
      throw new NotFoundException("News post not found");
    }

    const updateData: any = {};
    if (dto.title !== undefined) {
      updateData.title = sanitizeRichText(dto.title);
      updateData.slug = await this.generateSlug(dto.title);
    }
    if (dto.content !== undefined)
      updateData.content = sanitizeRichText(dto.content);
    if (dto.excerpt !== undefined)
      updateData.excerpt = sanitizeRichText(dto.excerpt);
    if (dto.coverImageUrl !== undefined)
      updateData.coverImageUrl = dto.coverImageUrl;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.isPinned !== undefined) updateData.isPinned = dto.isPinned;
    if (dto.isPublished !== undefined) {
      updateData.isPublished = dto.isPublished;
      if (dto.isPublished && !post.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }
    if (dto.targetRoles !== undefined)
      updateData.targetRoles = dto.targetRoles as any[];

    const updated = await this.prisma.newsPost.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Parse @mentions when content or title changes on a published post (non-blocking).
    const contentChanged = dto.content !== undefined || dto.title !== undefined;
    const isPublished = updated.isPublished;
    if (this.mentions && editorId && contentChanged && isPublished) {
      const authorName =
        `${updated.author.firstName} ${updated.author.lastName}`.trim() ||
        "Un auteur";
      const plain = `${updated.title}\n${updated.content.replace(/<[^>]*>/g, " ")}`;
      void this.mentions
        .parseAndNotify({
          text: plain,
          authorId: editorId,
          authorName,
          sourceType: "news",
          sourceId: updated.id,
          sourceTitle: updated.title,
          link: `/news/${updated.slug}`,
        })
        .catch((err) =>
          this.logger.warn(`mention parsing failed: ${err?.message || err}`),
        );
    }

    this.indexForMeili(updated);
    this.invalidateNewsListCache();

    return updated;
  }

  async softDelete(id: string) {
    const post = await this.prisma.newsPost.findUnique({ where: { id } });

    if (!post || post.deletedAt) {
      throw new NotFoundException("Actualité introuvable");
    }

    // Libère le slug pour qu'une future actualité puisse réutiliser le même
    // titre. On suffixe avec timestamp pour garder l'audit trail tout en
    // dégageant le slug unique côté DB.
    const releasedSlug =
      `${post.slug}.deleted-${Date.now().toString(36)}`.slice(0, 200);

    await this.prisma.newsPost.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: releasedSlug,
      },
    });

    // Désindexe de Meilisearch. Les actualités ne sont pas indexées par le
    // RAG (cf. enum RagSourceType) — pas besoin de removeFromIndex.
    void this.meili?.deleteDocument("news", id);
    this.invalidateNewsListCache();

    return { message: "Actualité supprimée" };
  }

  async publish(id: string) {
    const post = await this.prisma.newsPost.findUnique({ where: { id } });

    if (!post || post.deletedAt) {
      throw new NotFoundException("News post not found");
    }

    const published = await this.prisma.newsPost.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    this.invalidateNewsListCache();
    return published;
  }

  async recordView(newsPostId: string, userId: string) {
    try {
      await this.prisma.newsPostView.upsert({
        where: {
          newsPostId_userId: {
            newsPostId,
            userId,
          },
        },
        create: {
          newsPostId,
          userId,
        },
        update: {
          viewedAt: new Date(),
        },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(`Failed to record view: ${err.message}`);
    }
  }

  async getViewCount(newsPostId: string): Promise<number> {
    return this.prisma.newsPostView.count({
      where: { newsPostId },
    });
  }

  /**
   * Liste détaillée des utilisateurs ayant lu une actualité (ADMIN+).
   * Utile pour tracker la diffusion effective d'une communication.
   */
  async getViewers(newsPostId: string) {
    const [views, totalActiveUsers] = await Promise.all([
      this.prisma.newsPostView.findMany({
        where: { newsPostId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { viewedAt: "desc" },
      }),
      this.prisma.user.count({
        where: { isActive: true, deletedAt: null },
      }),
    ]);

    const readRate =
      totalActiveUsers > 0
        ? Math.round((views.length / totalActiveUsers) * 100)
        : 0;

    return {
      viewers: views.map((v) => ({
        userId: v.user.id,
        firstName: v.user.firstName,
        lastName: v.user.lastName,
        email: v.user.email,
        role: v.user.role,
        department: v.user.department,
        viewedAt: v.viewedAt,
      })),
      summary: {
        totalViewers: views.length,
        totalActiveUsers,
        readRate,
      },
    };
  }

  /**
   * Liste des utilisateurs actifs qui N'ONT PAS encore lu une actualité
   * (utile pour relances ciblées, notifications ISO 27001 A.5.13).
   */
  async getNonViewers(newsPostId: string) {
    const [activeUsers, views] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          department: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.newsPostView.findMany({
        where: { newsPostId },
        select: { userId: true },
      }),
    ]);

    const viewerIds = new Set(views.map((v) => v.userId));
    return activeUsers.filter((u) => !viewerIds.has(u.id));
  }

  async getPopularArticles(limit = 5) {
    const articles = await this.prisma.newsPost.findMany({
      where: { isPublished: true, deletedAt: null },
      include: {
        _count: { select: { views: true } },
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { views: { _count: "desc" } },
      take: limit,
    });
    return articles;
  }

  async getCategoryStats() {
    const stats = await this.prisma.newsPost.groupBy({
      by: ["category"],
      _count: true,
      where: { isPublished: true, deletedAt: null },
    });
    return stats.map((s) => ({
      category: s.category || "Sans catégorie",
      count: s._count,
    }));
  }

  private async generateSlug(title: string): Promise<string> {
    let slug = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const existing = await this.prisma.newsPost.findUnique({
      where: { slug },
    });

    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    return slug;
  }
}
