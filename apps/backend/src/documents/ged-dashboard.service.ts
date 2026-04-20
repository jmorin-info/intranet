import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/interfaces';

export interface GedDashboardSummary {
  myDrafts: number;
  myInReview: number;
  toApproveByMe: number;
  toConfirmByMe: number;
  nearReviewDate: number;
  total: number;
}

/**
 * Service dédié au widget "GED Dashboard" (compteurs par utilisateur).
 * Isolé de DocumentsService pour éviter toute collision avec les autres agents
 * qui travaillent simultanément sur documents.service.ts.
 */
@Injectable()
export class GedDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyGedSummary(user: RequestUser): Promise<GedDashboardSummary> {
    const userId = user.id;

    // Fenêtre "proches de revue" : date next review dans les 30 jours à venir
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const [
      myDrafts,
      myInReview,
      toApproveByMe,
      toConfirmByMe,
      nearReviewDate,
      total,
    ] = await Promise.all([
      // Brouillons dont je suis owner
      this.prisma.document.count({
        where: {
          deletedAt: null,
          ownerId: userId,
          status: 'DRAFT',
        },
      }),
      // Mes docs en revue
      this.prisma.document.count({
        where: {
          deletedAt: null,
          ownerId: userId,
          status: { in: ['IN_REVIEW', 'PENDING_APPROVAL'] },
        },
      }),
      // Docs à approuver en tant qu'approver
      this.prisma.document.count({
        where: {
          deletedAt: null,
          approverId: userId,
          status: 'PENDING_APPROVAL',
        },
      }),
      // Docs en REVIEW_APPROVED dont je suis owner (= à confirmer)
      this.prisma.document.count({
        where: {
          deletedAt: null,
          ownerId: userId,
          status: 'REVIEW_APPROVED',
        },
      }),
      // Docs proches de leur revue annuelle (owner ou reviewer = moi)
      this.prisma.document.count({
        where: {
          deletedAt: null,
          status: 'APPROVED',
          nextReviewDate: { gte: now, lte: in30Days },
          OR: [{ ownerId: userId }, { reviewerId: userId }],
        },
      }),
      // Total docs accessibles à l'utilisateur (où il est impliqué)
      this.prisma.document.count({
        where: {
          deletedAt: null,
          OR: [
            { ownerId: userId },
            { reviewerId: userId },
            { approverId: userId },
          ],
        },
      }),
    ]);

    return {
      myDrafts,
      myInReview,
      toApproveByMe,
      toConfirmByMe,
      nearReviewDate,
      total,
    };
  }
}
