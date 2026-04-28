import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Wave B post-launch — Admin view des retours utilisateurs sur le chatbot.
 *
 * Couvre DEUX sources de feedback (cohabitation Mission 3) :
 *
 *   1. RagQueryLog       — feedback historique sur /rag/:id/feedback
 *      Le champ `feedback` peut être texte libre OU JSON
 *      `{"reason": "<categorie>", "comment": "<texte>", "v": 1}`.
 *
 *   2. ChatMessageFeedback — feedback unifié (Mission 3 Phase 1)
 *      `{ rating: HELPFUL | NOT_HELPFUL, reason, comment }`.
 *
 * Endpoint : GET /api/v1/admin/chat/feedback
 *   - réservé ADMIN + SUPER_ADMIN
 *   - retour aggregé par défaut (les négatifs en priorité)
 *   - ?rating=negative|positive|all          (default = negative)
 *   - ?source=rag|unified|all                (default = all)
 *   - ?limit=1..200                          (default = 50)
 *   - ?since=<ISO>                           (default = 30j)
 *
 * Auditabilité ISO 27001 A.5.34 / A.8.15 — la liste contient les
 * messageId/queryId, l'auteur du feedback, et la raison standardisée.
 * On ne renvoie PAS le contenu du message lui-même par défaut (PII RAG)
 * sauf pour les RagQueryLog où c'est la query utilisateur initiale.
 */
@Controller("admin/chat")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminChatFeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("feedback")
  async listFeedback(
    @Query("rating") rating: string | undefined,
    @Query("source") source: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @Query("since") sinceRaw: string | undefined,
  ) {
    // ---- Parse + validation ----
    const ratingFilter =
      rating === "positive" || rating === "negative" || rating === "all"
        ? rating
        : "negative";
    const sourceFilter =
      source === "rag" || source === "unified" || source === "all"
        ? source
        : "all";

    let limit = 50;
    if (limitRaw) {
      const n = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        throw new BadRequestException("limit must be between 1 and 200");
      }
      limit = n;
    }

    let since: Date;
    if (sinceRaw) {
      const d = new Date(sinceRaw);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException("since must be a valid ISO datetime");
      }
      since = d;
    } else {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 jours
    }

    // ---- 1. RagQueryLog (legacy) ----
    type RagItem = {
      id: string;
      source: "rag";
      rating: number;
      query: string;
      reason: string | null;
      comment: string | null;
      rawFeedback: string | null;
      userId: string;
      userName: string | null;
      createdAt: Date;
    };

    const ragWhere: Record<string, unknown> = { createdAt: { gte: since } };
    if (ratingFilter === "negative") ragWhere.rating = -1;
    else if (ratingFilter === "positive") ragWhere.rating = 1;
    else ragWhere.rating = { not: null };

    const ragItems: RagItem[] =
      sourceFilter === "unified"
        ? []
        : await this.prisma.ragQueryLog
            .findMany({
              where: ragWhere,
              orderBy: { createdAt: "desc" },
              take: limit,
              include: {
                user: { select: { firstName: true, lastName: true, email: true } },
              },
            })
            .then((rows) =>
              rows.map((row): RagItem => {
                let reason: string | null = null;
                let comment: string | null = null;
                if (row.feedback && row.feedback.trim().startsWith("{")) {
                  try {
                    const parsed = JSON.parse(row.feedback);
                    if (typeof parsed.reason === "string") reason = parsed.reason;
                    if (typeof parsed.comment === "string") comment = parsed.comment;
                  } catch {
                    /* texte libre */
                  }
                } else if (row.feedback) {
                  comment = row.feedback;
                }
                const u = row.user;
                return {
                  id: row.id,
                  source: "rag",
                  rating: row.rating ?? 0,
                  query: row.query,
                  reason,
                  comment,
                  rawFeedback: row.feedback ?? null,
                  userId: row.userId,
                  userName: u
                    ? [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                      u.email
                    : null,
                  createdAt: row.createdAt,
                };
              }),
            );

    // ---- 2. ChatMessageFeedback (unified) ----
    type UnifiedItem = {
      id: string;
      source: "unified";
      messageId: string;
      rating: "HELPFUL" | "NOT_HELPFUL";
      reason: string | null;
      comment: string | null;
      userId: string;
      userName: string | null;
      createdAt: Date;
    };

    const unifiedWhere: Record<string, unknown> = { createdAt: { gte: since } };
    if (ratingFilter === "negative") unifiedWhere.rating = "NOT_HELPFUL";
    else if (ratingFilter === "positive") unifiedWhere.rating = "HELPFUL";

    const unifiedItems: UnifiedItem[] =
      sourceFilter === "rag"
        ? []
        : await this.prisma.chatMessageFeedback
            .findMany({
              where: unifiedWhere,
              orderBy: { createdAt: "desc" },
              take: limit,
              include: {
                user: { select: { firstName: true, lastName: true, email: true } },
              },
            })
            .then((rows) =>
              rows.map((row): UnifiedItem => {
                const u = row.user;
                return {
                  id: row.id,
                  source: "unified",
                  messageId: row.messageId,
                  rating: row.rating,
                  reason: row.reason ?? null,
                  comment: row.comment ?? null,
                  userId: row.userId,
                  userName: u
                    ? [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                      u.email
                    : null,
                  createdAt: row.createdAt,
                };
              }),
            );

    // ---- Aggregate stats (top reasons + counts) ----
    const allItems: Array<RagItem | UnifiedItem> = [...ragItems, ...unifiedItems];
    allItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const reasonCounts: Record<string, number> = {};
    for (const item of allItems) {
      if (!item.reason) continue;
      reasonCounts[item.reason] = (reasonCounts[item.reason] ?? 0) + 1;
    }
    const topReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const negativeCount = allItems.filter(
      (it) =>
        ("rating" in it && typeof it.rating === "number" && it.rating === -1) ||
        ("rating" in it && it.rating === "NOT_HELPFUL"),
    ).length;
    const positiveCount = allItems.filter(
      (it) =>
        ("rating" in it && typeof it.rating === "number" && it.rating === 1) ||
        ("rating" in it && it.rating === "HELPFUL"),
    ).length;

    return {
      meta: {
        total: allItems.length,
        negativeCount,
        positiveCount,
        since: since.toISOString(),
        ratingFilter,
        sourceFilter,
      },
      topReasons,
      items: allItems.slice(0, limit),
    };
  }
}
