import { BadRequestException, Controller, Get, Param, Query, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const publicNewsWhere = { deletedAt: null, isPublished: true, targetRoles: { isEmpty: true } };
const publicDocumentWhere = {
  deletedAt: null, status: 'APPROVED' as const, isPublic: true,
  classification: 'PUBLIC', scanStatus: 'CLEAN', currentVersionId: { not: null },
};

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new BadRequestException('La pagination doit contenir des entiers positifs');
  }
  return Math.min(Number(value), maximum);
}

@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  @Get('info')
  async getPublicInfo() {
    const [totalDocs, approvedDocs, newsCount, userCount, veilleCount, ticketsResolved, deptCount, wikiCount] = await Promise.all([
      this.prisma.document.count({ where: { deletedAt: null } }),
      this.prisma.document.count({ where: { deletedAt: null, status: 'APPROVED' } }),
      this.prisma.newsPost.count({ where: publicNewsWhere }),
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.veilleItem.count(),
      this.prisma.ticket.count({ where: { status: { in: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.department.count(),
      this.prisma.wikiPage.count({ where: { isPublished: true } }).catch(() => 0),
    ]);

    return {
      appName: (await this.prisma.appConfig.findUnique({ where: { key: 'app_name' } }))?.value || 'OMNITECH Intranet',
      stats: {
        documents: totalDocs, approved: approvedDocs, news: newsCount,
        collaborators: userCount, veille: veilleCount,
        ticketsResolved, departments: deptCount, wiki: wikiCount,
      },
    };
  }

  @Get('news')
  async getPublicNews(@Query('page') page: string, @Query('limit') limit: string) {
    const p = positiveInteger(page, 1, 1_000_000);
    const l = positiveInteger(limit, 10, 20);
    const where = publicNewsWhere;

    const [data, total] = await Promise.all([
      this.prisma.newsPost.findMany({
        where,
        select: {
          id: true, title: true, slug: true, excerpt: true, coverImageUrl: true,
          category: true, isPinned: true, publishedAt: true,
          author: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip: (p - 1) * l, take: l,
      }),
      this.prisma.newsPost.count({ where }),
    ]);
    return { data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Get('news/:slug')
  async getPublicNewsArticle(@Param('slug') slug: string) {
    return this.prisma.newsPost.findFirst({
      where: { ...publicNewsWhere, slug },
      select: {
        id: true, title: true, slug: true, content: true, excerpt: true,
        coverImageUrl: true, category: true, publishedAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    });
  }

  @Get('documents')
  async getPublicDocuments(@Query('page') page: string, @Query('limit') limit: string) {
    const p = positiveInteger(page, 1, 1_000_000);
    const l = positiveInteger(limit, 10, 20);
    const where = publicDocumentWhere;

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: {
          id: true, title: true, reference: true, category: true,
          description: true, updatedAt: true, currentVersionId: true,
          owner: { select: { firstName: true, lastName: true } },
          isoControls: { include: { isoControl: { select: { code: true, title: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (p - 1) * l, take: l,
      }),
      this.prisma.document.count({ where }),
    ]);
    // At most one requested version per document, independent of the size of its history.
    const versions = data.length ? await this.prisma.documentVersion.findMany({
      where: { OR: data.map((document) => ({ id: document.currentVersionId!, documentId: document.id })) },
      select: { id: true, documentId: true, fileType: true },
    }) : [];
    const byDocument = new Map(versions.map(({ documentId, ...version }) => [documentId, version]));
    const documents = data.map(({ currentVersionId, ...document }) => ({
      ...document, versions: byDocument.has(document.id) ? [byDocument.get(document.id)!] : [],
    }));
    return { data: documents, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  /**
   * Public document file download (for approved + public documents only)
   */
  @Get('documents/:docId/download')
  async downloadPublicDocument(
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { ...publicDocumentWhere, id: docId },
    });

    // Recheck the policy explicitly as well as in the query, before opening a stream.
    if (!doc || doc.deletedAt || doc.status !== 'APPROVED' || !doc.isPublic ||
        doc.classification !== 'PUBLIC' || doc.scanStatus !== 'CLEAN' || !doc.currentVersionId) {
      throw new NotFoundException('Document introuvable');
    }

    const version = await this.prisma.documentVersion.findFirst({
      where: { id: doc.currentVersionId, documentId: doc.id },
    });
    if (!version) throw new NotFoundException('Document introuvable');

    try {
      const stream = this.storageService.getFileStream(version.fileUrl);
      const filename = (version.fileUrl.split('/').pop() || 'document').replace(/[^\x20-\x7e]|["\\]/g, '_');
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      });
      stream.once('error', () => {
        if (res.headersSent) res.destroy();
        else res.status(404).end();
      });
      stream.pipe(res);
    } catch {
      throw new NotFoundException('Fichier introuvable');
    }
  }

  /**
   * Public veille items (latest security alerts — no auth needed)
   */
  @Get('veille')
  async getPublicVeille(@Query('limit') limit: string) {
    const l = positiveInteger(limit, 10, 30);

    const data = await this.prisma.veilleItem.findMany({
      select: {
        id: true, title: true, description: true, sourceUrl: true,
        sourceName: true, severity: true, cveId: true, publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: l,
    });

    return { data };
  }
}
