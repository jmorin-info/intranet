import { Controller, Get, Param, Query, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

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
      this.prisma.newsPost.count({ where: { deletedAt: null, isPublished: true } }),
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
    const p = parseInt(page || '1');
    const l = Math.min(parseInt(limit || '10'), 20);
    // Show all published news in public view (targetRoles filtering is for the authenticated intranet)
    const where = { deletedAt: null as null, isPublished: true };

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
      where: { slug, isPublished: true, deletedAt: null, targetRoles: { isEmpty: true } },
      select: {
        id: true, title: true, slug: true, content: true, excerpt: true,
        coverImageUrl: true, category: true, publishedAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    });
  }

  @Get('documents')
  async getPublicDocuments(@Query('page') page: string, @Query('limit') limit: string) {
    const p = parseInt(page || '1');
    const l = Math.min(parseInt(limit || '10'), 20);
    const where = { deletedAt: null as null, status: 'APPROVED' as const, isPublic: true };

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: {
          id: true, title: true, reference: true, category: true,
          description: true, updatedAt: true,
          owner: { select: { firstName: true, lastName: true } },
          isoControls: { include: { isoControl: { select: { code: true, title: true } } } },
          versions: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, fileType: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (p - 1) * l, take: l,
      }),
      this.prisma.document.count({ where }),
    ]);
    return { data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
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
      where: { id: docId, status: 'APPROVED', isPublic: true, deletedAt: null },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!doc || !doc.versions[0]) throw new NotFoundException('Document introuvable');

    const version = doc.versions[0];
    try {
      const stream = this.storageService.getFileStream(version.fileUrl);
      const filename = version.fileUrl.split('/').pop() || 'document';
      res.set({
        'Content-Type': version.fileType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
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
    const l = Math.min(parseInt(limit || '10'), 30);

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
