import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { slugify } from "../common/utils/slugify";
import { UserRole } from "../common/enums";
import { RequestUser } from "../common/interfaces";

const isPrivilegedRole = (role: UserRole) =>
  role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export interface CreateWikiTagInput {
  name: string;
  slug?: string;
  colorHex?: string | null;
}

/**
 * WikiTagService — gestion des tags persistants pour les pages wiki.
 *
 * Tags = many-to-many `WikiPage <-> WikiTag` via `WikiPageTag`.
 * Endpoints exposés via WikiTagController :
 *   - GET    /wiki/tags                 → liste tous les tags
 *   - POST   /wiki/tags                 → admin : crée un tag
 *   - DELETE /wiki/tags/:id             → admin : supprime un tag
 *   - PATCH  /wiki/pages/:id/tags       → assigne / remplace les tags d'une page
 */
@Injectable()
export class WikiTagService {
  private readonly logger = new Logger(WikiTagService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liste tous les tags avec le nombre de pages associées.
   * Pas de filtrage de visibilité ici : un tag est métadata globale.
   */
  async listAll(): Promise<
    Array<{
      id: string;
      slug: string;
      name: string;
      colorHex: string | null;
      pageCount: number;
    }>
  > {
    const tags = await this.prisma.wikiTag.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        _count: { select: { pages: true } },
      },
    });
    return tags.map((t: any) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      colorHex: t.colorHex,
      pageCount: t._count?.pages ?? 0,
    }));
  }

  /**
   * Liste les tags rattachés à une page donnée.
   */
  async listForPage(pageId: string) {
    const rows = await this.prisma.wikiPageTag.findMany({
      where: { pageId },
      include: { tag: true },
    });
    return rows.map((r: any) => ({
      id: r.tag.id,
      slug: r.tag.slug,
      name: r.tag.name,
      colorHex: r.tag.colorHex,
    }));
  }

  /**
   * Crée un nouveau tag (admins only).
   */
  async create(input: CreateWikiTagInput, user: RequestUser) {
    if (!isPrivilegedRole(user.role)) {
      throw new ForbiddenException("Only admins can create wiki tags");
    }
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("name is required");

    const slug =
      input.slug?.trim() ||
      slugify(name, { maxLength: 60 }) ||
      `tag-${Date.now()}`;

    const colorHex = this.sanitizeColor(input.colorHex);

    try {
      return await this.prisma.wikiTag.create({
        data: { name, slug, colorHex },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictException(`Tag with slug "${slug}" already exists`);
      }
      throw err;
    }
  }

  /**
   * Supprime un tag (admins only). Cascade supprime les associations.
   */
  async remove(tagId: string, user: RequestUser) {
    if (!isPrivilegedRole(user.role)) {
      throw new ForbiddenException("Only admins can delete wiki tags");
    }
    const tag = await this.prisma.wikiTag.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException("Tag not found");
    await this.prisma.wikiTag.delete({ where: { id: tagId } });
    return { success: true };
  }

  /**
   * Remplace l'ensemble des tags rattachés à une page.
   * Auteur ou admin uniquement.
   *
   * `tagIds` doit contenir des UUIDs valides correspondant à des tags existants.
   */
  async setPageTags(
    pageId: string,
    tagIds: string[],
    user: RequestUser,
  ): Promise<{ success: true; tags: string[] }> {
    const page = await this.prisma.wikiPage.findUnique({
      where: { id: pageId },
      select: { id: true, authorId: true, collaborators: true },
    });
    if (!page) throw new NotFoundException("Wiki page not found");

    const canEdit =
      isPrivilegedRole(user.role) ||
      page.authorId === user.id ||
      (page.collaborators ?? []).includes(user.id);
    if (!canEdit) {
      throw new ForbiddenException("You cannot edit tags for this wiki page");
    }

    const cleanedIds = Array.from(new Set((tagIds ?? []).filter(Boolean)));

    // Validate that all provided tag IDs exist
    if (cleanedIds.length > 0) {
      const existing = await this.prisma.wikiTag.findMany({
        where: { id: { in: cleanedIds } },
        select: { id: true },
      });
      if (existing.length !== cleanedIds.length) {
        throw new BadRequestException("One or more tag IDs do not exist");
      }
    }

    // Replace strategy: deleteMany + createMany inside a transaction
    await this.prisma.$transaction([
      this.prisma.wikiPageTag.deleteMany({ where: { pageId } }),
      ...(cleanedIds.length > 0
        ? [
            this.prisma.wikiPageTag.createMany({
              data: cleanedIds.map((tagId) => ({ pageId, tagId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return { success: true, tags: cleanedIds };
  }

  /**
   * Lookup pages by tag slug. Used by the frontend filter chip.
   */
  async findPagesByTagSlug(tagSlug: string): Promise<string[]> {
    const tag = await this.prisma.wikiTag.findUnique({
      where: { slug: tagSlug.toLowerCase() },
      select: { id: true },
    });
    if (!tag) return [];
    const rows = await this.prisma.wikiPageTag.findMany({
      where: { tagId: tag.id },
      select: { pageId: true },
    });
    return rows.map((r) => r.pageId);
  }

  private sanitizeColor(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!HEX_COLOR_RE.test(trimmed)) {
      throw new BadRequestException(`Invalid hex color: ${value}`);
    }
    return trimmed;
  }
}
