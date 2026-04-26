import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getInit() {
    const now = new Date();

    const [
      totalDocuments,
      approvedDocuments,
      pendingReview,
      pendingApproval,
      overdueRevision,
      pendingSignatures,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      recentDocuments,
      pinnedNews,
    ] = await Promise.all([
      // Document stats
      this.prisma.document.count({ where: { deletedAt: null } }),
      this.prisma.document.count({ where: { status: 'APPROVED', deletedAt: null } }),
      this.prisma.document.count({ where: { status: 'IN_REVIEW', deletedAt: null } }),
      this.prisma.document.count({
        where: { status: { in: ['PENDING_APPROVAL', 'REVIEW_APPROVED'] }, deletedAt: null },
      }),
      this.prisma.document.count({
        where: { nextReviewDate: { lt: now }, status: 'APPROVED', deletedAt: null },
      }),
      // Pending signatures: count documents with PENDING_APPROVAL status as proxy
      this.prisma.document.count({
        where: { status: 'PENDING_APPROVAL', deletedAt: null },
      }),

      // Ticket stats
      this.prisma.ticket.count({ where: { status: 'OPEN' } }),
      this.prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.ticket.count({ where: { status: { in: ['RESOLVED', 'CLOSED'] } } }),

      // Recent documents
      this.prisma.document.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          reference: true,
          status: true,
          updatedAt: true,
          owner: { select: { firstName: true, lastName: true } },
        },
      }),

      // Pinned news
      this.prisma.newsPost.findMany({
        where: { isPublished: true, isPinned: true, deletedAt: null },
        orderBy: { publishedAt: 'desc' },
        take: 4,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          publishedAt: true,
          author: { select: { firstName: true, lastName: true } },
        },
      }).catch(() => []),
    ]);

    return {
      stats: {
        totalDocuments,
        approvedDocuments,
        pendingReview,
        pendingApproval,
        overdueRevision,
        pendingSignatures,
      },
      ticketStats: {
        open: openTickets,
        inProgress: inProgressTickets,
        resolved: resolvedTickets,
      },
      recentDocuments,
      pinnedNews,
    };
  }
}
