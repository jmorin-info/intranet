import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, generateUniqueSlug } from '../common/utils/slugify';
import { MeilisearchService } from '../search/meilisearch.service';

@Injectable()
export class RunbooksService {
  private readonly logger = new Logger(RunbooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly meili?: MeilisearchService,
  ) {}

  /**
   * Pousse (ou rafraichit) un runbook dans l'index Meilisearch `runbooks`.
   * Non-bloquant : toute erreur est loguee mais ne remonte pas a l'appelant.
   * On n'indexe que les runbooks publies — les drafts restent hors de la
   * recherche globale pour eviter toute fuite de contenu non pret.
   */
  private indexForMeili(runbook: {
    id: string;
    title: string;
    slug?: string | null;
    description?: string | null;
    content?: string | null;
    category?: string | null;
    version?: string | null;
    authorId?: string | null;
    updatedAt?: Date | null;
    isPublished?: boolean;
  }): void {
    if (!this.meili) return;
    if (runbook.isPublished === false) {
      // Si on republie plus tard, l'update hook reindexera ; si c'etait publie
      // avant et qu'on repasse en draft, on le retire de l'index.
      void this.meili.deleteDocument('runbook', runbook.id).catch(() => undefined);
      return;
    }
    const doc = this.meili.runbookToMeiliDocument(runbook);
    void this.meili.indexOne('runbook', doc).catch((err) =>
      this.logger.warn(`Meilisearch indexation failed for runbook ${runbook.id}: ${err?.message || err}`),
    );
  }

  async findAll(filters?: { isPublished?: boolean; category?: string; search?: string }) {
    const where: any = {};
    if (filters?.isPublished !== undefined) where.isPublished = filters.isPublished;
    if (filters?.category) where.category = filters.category;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.runbook.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        category: true,
        version: true,
        isPublished: true,
        createdAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Lookup intelligent : si le paramètre ressemble à un UUID on cherche par
   * id (et on inclut les executions comme findById), sinon par slug.
   * Le frontend passe indifféremment l'un ou l'autre selon le contexte
   * (listing → slug, detail page → id).
   */
  async findBySlug(slugOrId: string) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(slugOrId)) {
      return this.findById(slugOrId);
    }
    const runbook = await this.prisma.runbook.findUnique({ where: { slug: slugOrId } });
    if (!runbook) throw new NotFoundException('Runbook introuvable');
    return runbook;
  }

  async findById(id: string) {
    const runbook = await this.prisma.runbook.findUnique({
      where: { id },
      include: { executions: { orderBy: { startedAt: 'desc' }, take: 10 } },
    });
    if (!runbook) throw new NotFoundException('Runbook introuvable');
    return runbook;
  }

  async create(data: {
    title: string;
    slug?: string;
    description?: string;
    category?: string;
    content: string;
    authorId: string;
  }) {
    // Auto-génère slug depuis titre si non fourni (ou normalise si fourni)
    const rawSlug = typeof data.slug === 'string' ? data.slug.trim() : '';
    const slug = rawSlug
      ? (slugify(rawSlug, { maxLength: 120 }) || await this.autoSlug(data.title))
      : await this.autoSlug(data.title);

    const created = await this.prisma.runbook.create({
      data: { ...data, slug, isPublished: true },
    });

    // Index dans Meilisearch (non-bloquant).
    this.indexForMeili(created);

    return created;
  }

  private autoSlug(title: string): Promise<string> {
    return generateUniqueSlug(
      title,
      async (candidate) => !!(await this.prisma.runbook.findUnique({ where: { slug: candidate } })),
      { maxLength: 120, fallback: 'runbook' },
    );
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      content?: string;
      isPublished?: boolean;
      version?: string;
    },
  ) {
    await this.findById(id);
    const updated = await this.prisma.runbook.update({ where: { id }, data });

    // Re-indexation Meilisearch : publish/unpublish gere par indexForMeili.
    this.indexForMeili(updated);

    return updated;
  }

  /**
   * Supprime un runbook (et desindexe Meilisearch). Non exposee actuellement
   * par le controller, mais disponible pour les flows admin / cleanup tests.
   */
  async delete(id: string) {
    await this.findById(id);
    const deleted = await this.prisma.runbook.delete({ where: { id } });
    void this.meili?.deleteDocument('runbook', id).catch(() => undefined);
    return deleted;
  }

  async startExecution(runbookId: string, executorId: string) {
    await this.findById(runbookId);
    return this.prisma.runbookExecution.create({
      data: { runbookId, executorId, stepsData: '[]' },
    });
  }

  async updateExecution(executionId: string, stepsData: string, isComplete: boolean) {
    return this.prisma.runbookExecution.update({
      where: { id: executionId },
      data: {
        stepsData,
        isComplete,
        completedAt: isComplete ? new Date() : undefined,
      },
    });
  }

  async getExecutions(runbookId: string) {
    await this.findById(runbookId);
    return this.prisma.runbookExecution.findMany({
      where: { runbookId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }
}
