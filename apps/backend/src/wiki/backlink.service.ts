import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * BacklinkService — extraction et persistance des liens [[slug]] entre pages
 * wiki. Alimente la table `WikiPageBacklink` qui sert de cache rapide pour
 * l'endpoint GET /wiki/pages/:slug/backlinks.
 *
 * Politique d'extraction :
 *  - Markdown / HTML wiki-style : `[[slug]]` ou `[[Titre|slug]]`
 *  - Le slug capturé est normalisé (lowercased, trimmed). Les caractères
 *    autorisés dans un slug Prisma sont a-z, 0-9, `-`, `_`.
 *  - Les liens absolus `/wiki/<slug>` ne sont PAS comptés ici (ils restent
 *    gérés par `WikiService.scanBacklinkCandidates()` legacy / fallback).
 *
 * Idempotent : `rebuildBacklinks(pageId)` remplace intégralement la liste
 * des backlinks de la page modifiée.
 */
@Injectable()
export class BacklinkService {
  private readonly logger = new Logger(BacklinkService.name);

  /**
   * Regex « source de vérité » pour détecter `[[slug]]` ou `[[Titre|slug]]`.
   * - Le slug est capturé dans le groupe 1 ou groupe 2 selon la forme.
   * - Slug autorisé : a-z, A-Z, 0-9, `-`, `_`.
   */
  static readonly LINK_REGEX = /\[\[(?:([^\[\]|]+)\|)?([A-Za-z0-9_-]+)\s*\]\]/g;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extrait tous les slugs liés depuis le contenu (markdown/HTML).
   * Retourne un tableau dédupliqué (slugs en lowercase).
   *
   * Exposé statique pour pouvoir être testé en isolation et réutilisé par
   * d'autres services (search indexing, RAG…).
   */
  static extractLinks(content: string | null | undefined): string[] {
    if (!content) return [];
    const found = new Set<string>();
    // Reset stateful global regex
    const re = new RegExp(BacklinkService.LINK_REGEX.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const slug = match[2]?.trim().toLowerCase();
      if (slug) found.add(slug);
    }
    return Array.from(found);
  }

  /**
   * Variante qui retourne aussi le nombre d'occurrences (utile pour
   * `WikiPageBacklink.occurrenceCount`).
   */
  static countLinks(content: string | null | undefined): Map<string, number> {
    const counts = new Map<string, number>();
    if (!content) return counts;
    const re = new RegExp(BacklinkService.LINK_REGEX.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const slug = match[2]?.trim().toLowerCase();
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Recalcule la liste des backlinks émis par la page `pageId`.
   *
   * Stratégie : on supprime les anciens backlinks « from = pageId » et on
   * réinsère les nouveaux. Les conflits de @@unique([fromPageId, toPageSlug])
   * sont gérés par un upsert pour rester idempotent même en cas de double
   * appel concurrent (rare mais possible côté tests).
   *
   * Retourne le nombre de backlinks insérés.
   */
  async rebuildBacklinks(pageId: string): Promise<number> {
    const page = await this.prisma.wikiPage.findUnique({
      where: { id: pageId },
      select: { id: true, content: true },
    });
    if (!page) {
      this.logger.warn(`rebuildBacklinks: page ${pageId} not found`);
      return 0;
    }

    const counts = BacklinkService.countLinks(page.content);

    // Tx atomique : delete-then-recreate. Pas de findMany inutile.
    await this.prisma.$transaction([
      this.prisma.wikiPageBacklink.deleteMany({
        where: { fromPageId: pageId },
      }),
      ...(counts.size > 0
        ? [
            this.prisma.wikiPageBacklink.createMany({
              data: Array.from(counts.entries()).map(
                ([toPageSlug, occurrenceCount]) => ({
                  fromPageId: pageId,
                  toPageSlug,
                  occurrenceCount,
                }),
              ),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return counts.size;
  }

  /**
   * Liste les pages qui linkent vers le slug donné.
   *
   * Retour : tableau de `{ id, title, slug, occurrenceCount, updatedAt }`,
   * trié par occurrenceCount desc puis updatedAt desc.
   *
   * Le filtrage de visibilité est fait par l'appelant (WikiService) — ce
   * service ne connaît pas la notion de RequestUser pour rester pur DB.
   */
  async findBacklinksForSlug(slug: string): Promise<
    Array<{
      id: string;
      title: string;
      slug: string;
      category: string | null;
      occurrenceCount: number;
      updatedAt: Date;
      authorId: string;
      visibility: string;
      ownerDepartmentId: string | null;
      allowedRoles: string[];
      collaborators: string[];
    }>
  > {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return [];

    const rows = await this.prisma.wikiPageBacklink.findMany({
      where: { toPageSlug: normalized },
      include: {
        fromPage: {
          select: {
            id: true,
            title: true,
            slug: true,
            category: true,
            updatedAt: true,
            authorId: true,
            visibility: true,
            ownerDepartmentId: true,
            allowedRoles: true,
            collaborators: true,
            isPublished: true,
          },
        },
      },
      orderBy: [{ occurrenceCount: "desc" }, { createdAt: "desc" }],
    });

    return rows
      .filter((r) => r.fromPage && r.fromPage.isPublished)
      .map((r) => ({
        id: r.fromPage.id,
        title: r.fromPage.title,
        slug: r.fromPage.slug,
        category: r.fromPage.category,
        occurrenceCount: r.occurrenceCount,
        updatedAt: r.fromPage.updatedAt,
        authorId: r.fromPage.authorId,
        visibility: r.fromPage.visibility ?? "PUBLIC",
        ownerDepartmentId: r.fromPage.ownerDepartmentId,
        allowedRoles: r.fromPage.allowedRoles ?? [],
        collaborators: r.fromPage.collaborators ?? [],
      }));
  }
}
