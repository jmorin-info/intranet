import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  GoneException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserRole } from "../common/enums";
import { RequestUser } from "../common/interfaces";
import { RagService, RagSearchContext } from "./rag.service";
import { InputGuardService } from "./guardrails/input-guard.service";
import { PrismaService } from "../prisma/prisma.service";
import { RagEvalService } from "./eval/rag-eval.service";

/**
 * Contrôleur RAG / AI Search.
 * Toutes les routes nécessitent une session authentifiée.
 */
@Controller("rag")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(
    private readonly ragService: RagService,
    private readonly inputGuard: InputGuardService,
    private readonly prisma: PrismaService,
    private readonly ragEvalService: RagEvalService,
  ) {}

  /** Pose une question au moteur RAG (avec filtrage RBAC ISO 27001 A.5.15 + guardrails P0.2). */
  @Post("ask")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async ask(@Body() body: { question: string }, @CurrentUser() user: RequestUser) {
    const raw = (body?.question ?? "").trim();

    // Guardrails input (P0.2)
    const guard = this.inputGuard.validate(raw, user.id);
    if (!guard.allowed) {
      return { answer: guard.reason, sources: [], durationMs: 0 };
    }

    const ctx: RagSearchContext = {
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };
    return this.ragService.answer(guard.sanitizedQuery, user.id, ctx);
  }

  /**
   * SSE streaming version of /ask.
   * Sends `token` events as the LLM generates, then a final `done` event with sources + metadata.
   */
  @Post("ask-stream")
  // 60 requêtes/min/utilisateur — éviter qu'un user abuse du chatbot LLM
  // (coût compute / quotas API), tout en laissant de la marge pour un usage normal.
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async askStream(
    @Body() body: { question: string },
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const raw = (body?.question ?? "").trim();

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    // Guardrails input (P0.2)
    const guard = this.inputGuard.validate(raw, user.id);
    if (!guard.allowed) {
      res.write(`data: ${JSON.stringify({ type: "token", token: guard.reason })}\n\n`);
      res.write(
        `data: ${JSON.stringify({ type: "done", sources: [], retrievalConfidence: 0, durationMs: 0 })}\n\n`,
      );
      res.end();
      return;
    }

    const question = guard.sanitizedQuery;
    const ctx: RagSearchContext = {
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };

    const write = (data: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    // Heartbeat anti-coupure passerelle pendant le prompt-eval CPU (cf.
    // documentSummaryStream) : commentaire SSE toutes les 10 s.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(`: keepalive\n\n`);
    }, 10_000);

    try {
      await this.ragService.answerStream(
        question,
        user.id,
        (token) => write({ type: "token", token }),
        (meta) => write({ type: "meta", ...meta }),
        ctx,
        // Événements de progression (retrieving / generating / model_fallback)
        // pour rendre l'attente lisible côté frontend (~15-40 s de prompt-eval CPU).
        (status) => write({ type: "status", ...status }),
      );
    } catch (err) {
      write({ type: "error", message: (err as Error).message });
    } finally {
      clearInterval(heartbeat);
      write({ type: "done" });
      if (!res.writableEnded) res.end();
    }
  }

  /**
   * Résumé IA d'un document.
   *
   * Sécurité : ouvert à TOUS les rôles authentifiés (fix 2026-07) — le
   * contrôle d'accès par classification (ISO 27001 A.5.15) est appliqué
   * DANS RagService.summarizeDocument via le contexte utilisateur : un
   * utilisateur ne peut résumer que ce qu'il a le droit de lire.
   *
   * Erreurs : 403 si classification inaccessible, 404 si document inconnu,
   * 503 si le LLM est indisponible/en dépassement de budget (plus de
   * 200 { summary: "Erreur…" } qui faussait cache et monitoring).
   */
  /**
   * Résumé IA en STREAMING (SSE) — chemin par défaut du frontend.
   *
   * Pourquoi : sur CPU un résumé prend 50 s–2 min ; en bloquant, la passerelle
   * réseau coupe la requête à ~30 s. Le flux SSE envoie les tokens au fil de
   * l'eau → la connexion reste active et l'utilisateur voit le résumé se
   * former. Même RBAC/cache que la route bloquante (conservée pour compat).
   */
  @Get("documents/:id/ai-summary-stream")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async documentSummaryStream(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const write = (data: Record<string, unknown>) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Heartbeat : sur CPU, le prompt-eval précède le 1er token de 20 à 60 s
    // selon la taille du document. Sans octet pendant ce délai, la passerelle
    // réseau (~30 s d'inactivité) coupe la connexion AVANT le 1er token. On
    // envoie donc un commentaire SSE (`:` = ignoré par EventSource) toutes les
    // 10 s tant que la génération n'a rien émis.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(`: keepalive\n\n`);
    }, 10_000);

    const ctx: RagSearchContext = {
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };
    try {
      await this.ragService.summarizeDocumentStream(
        id,
        ctx,
        (token) => write({ type: "token", token }),
        (status) => write({ type: "status", ...status }),
      );
    } catch (err) {
      // Erreurs métier → message lisible ; 403 explicite pour l'accès refusé.
      let message = "L'IA est momentanément indisponible ou surchargée — réessayez dans quelques minutes.";
      if (err instanceof ForbiddenException) {
        message = (err.getResponse() as { message?: string })?.message ?? err.message;
      } else if (err instanceof HttpException) {
        message = err.message;
      } else if ((err as { code?: string }).code === "P2025") {
        message = "Document introuvable.";
      }
      this.logger.warn({
        msg: "rag.ai_summary_stream.failed",
        documentId: id,
        userId: user.id,
        error: (err as Error).message,
      });
      write({ type: "error", message });
    } finally {
      clearInterval(heartbeat);
      write({ type: "done" });
      if (!res.writableEnded) res.end();
    }
  }

  @Get("documents/:id/ai-summary")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async documentSummary(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    const ctx: RagSearchContext = {
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };
    try {
      return await this.ragService.summarizeDocument(id, ctx);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Prisma findUniqueOrThrow → P2025 quand le document n'existe pas.
      if ((err as { code?: string }).code === "P2025") {
        throw new NotFoundException("Document introuvable");
      }
      this.logger.warn({
        msg: "rag.ai_summary.failed",
        documentId: id,
        userId: user.id,
        error: (err as Error).message,
      });
      throw new ServiceUnavailableException(
        "L'IA est momentanément indisponible ou surchargée — réessayez dans quelques minutes.",
      );
    }
  }

  /**
   * Suggestion IA de réponse pour un ticket.
   *
   * Sécurité : réservé aux agents support (REVIEWER+). Le service
   * `suggestTicketResponse` ne vérifie pas que l'appelant a accès au
   * ticket (creator / assignee / dept) — sans ce garde, n'importe quel
   * user pouvait fuiter le titre/description d'un ticket via son UUID.
   */
  @Get("tickets/:id/ai-suggest")
  @Roles(UserRole.REVIEWER, UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async ticketSuggestion(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    try {
      return await this.ragService.suggestTicketResponse(id);
    } catch (err) {
      // Dégradé volontaire (l'UI affiche le message), mais plus de catch muet :
      // on loggue en warn avec contexte pour le monitoring.
      this.logger.warn({
        msg: "rag.ticket_suggest.failed",
        ticketId: id,
        userId: user.id,
        error: (err as Error).message,
      });
      return { suggestion: `Erreur : ${(err as Error).message}` };
    }
  }

  /**
   * Question sur un article wiki.
   *
   * Sécurité : on délègue au WikiService.findBySlug-équivalent pour
   * appliquer le filtre de visibilité (PUBLIC / DEPARTMENT / ROLE /
   * PRIVATE+collaborators). `askAboutArticle` ne fait pas de check —
   * sans ce garde, un user pouvait lire les pages PRIVATE d'autrui.
   */
  @Post("wiki/:id/ask")
  async wikiAsk(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { question: string },
    @CurrentUser() user: RequestUser,
  ) {
    const question = (body?.question ?? "").trim();
    if (question.length < 2) {
      return {
        answer: "Veuillez saisir une question d'au moins 2 caractères.",
      };
    }
    // ACL : reproduire la logique WikiService.canView avant de laisser le LLM
    // reformuler le contenu de l'article (sinon on bypassse la visibilité
    // PRIVATE / DEPARTMENT / ROLE).
    const page = await this.prisma.wikiPage.findUnique({
      where: { id },
      select: {
        authorId: true,
        visibility: true,
        ownerDepartmentId: true,
        allowedRoles: true,
        collaborators: true,
      },
    });
    if (!page) throw new NotFoundException("Wiki page not found");
    const isPrivileged =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.AUDITEUR;
    const canView =
      isPrivileged ||
      page.authorId === user.id ||
      page.visibility === "PUBLIC" ||
      (page.visibility === "DEPARTMENT" &&
        !!user.departmentId &&
        page.ownerDepartmentId === user.departmentId) ||
      (page.visibility === "ROLE" &&
        Array.isArray(page.allowedRoles) &&
        (page.allowedRoles as string[]).includes(user.role)) ||
      (Array.isArray(page.collaborators) && (page.collaborators as string[]).includes(user.id));
    if (!canView) {
      throw new ForbiddenException("You cannot access this wiki page");
    }
    try {
      return await this.ragService.askAboutArticle(id, question);
    } catch (err) {
      this.logger.warn({
        msg: "rag.wiki_ask.failed",
        wikiPageId: id,
        userId: user.id,
        error: (err as Error).message,
      });
      return { answer: `Erreur : ${(err as Error).message}` };
    }
  }

  /** Réindexation complète (admin uniquement). */
  @Post("reindex")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reindex() {
    return this.ragService.reindexAll();
  }

  /**
   * Item 30 — Run un benchmark RAG sur le golden dataset (admin uniquement).
   *
   * Le run est stocke dans `RagBenchmarkRun` (Prisma) pour suivi historique
   * de l'evolution des metriques (recall@5, MRR, faithfulness, latence) au
   * fil des changements de configuration.
   *
   * Body :
   *  - `mode` (optional)  : label libre (defaut : derive des flags actifs)
   *  - `evalFaithfulness` (optional, default false) : LLM-judge (couteux)
   *  - `notes` (optional) : memo humain (changement teste, hypothese)
   *  - `persist` (optional, default true)
   *
   * Throttle : 1/min/admin pour eviter de surcharger le LLM (chaque run =
   * N appels retrieval + (optional) N appels LLM judge).
   */
  @Post("eval")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  async eval(
    @Body()
    body: {
      mode?: string;
      evalFaithfulness?: boolean;
      notes?: string;
      persist?: boolean;
    } = {},
    @CurrentUser() user: RequestUser,
  ) {
    const adminCtx: RagSearchContext = {
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };
    return this.ragEvalService.runEval({
      mode: body.mode,
      evalFaithfulness: body.evalFaithfulness ?? false,
      notes: body.notes,
      persist: body.persist ?? true,
      adminCtx,
    });
  }

  /**
   * Item 30 — Liste les derniers runs de benchmark (admin uniquement).
   * Permet de comparer les metriques au fil du temps via une UI simple.
   */
  @Get("eval/history")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async evalHistory() {
    const runs = await this.prisma.ragBenchmarkRun
      .findMany({
        orderBy: { runAt: "desc" },
        take: 50,
      })
      .catch(() => []);
    return { runs };
  }

  /** Statistiques (chunks par type, dernières requêtes). */
  @Get("stats")
  async stats() {
    return this.ragService.getStats();
  }

  /**
   * Submit feedback (thumbs up/down) for a RAG query.
   *
   * Feature 4 (P1.9 polish) : le champ `feedback` peut désormais contenir
   * soit un commentaire texte libre (retro-compat), soit une chaîne JSON
   * du shape `{"reason": "<categorie>", "comment": "<texte>", "v": 1}`.
   * On ne fait pas de migration Prisma — on réutilise la colonne existante
   * pour rester rétro-compatible et éviter un schema change pour 1 champ.
   *
   * Les catégories valides côté front sont standardisées
   * (cf. `apps/frontend/src/components/chatbot/feedback-validation.ts`).
   * Le backend accepte tout JSON valide, mais impose :
   *   - taille max 1000 chars (garde-fou DB + abus)
   *   - si JSON, la clé `reason` (string ≤ 64 chars) et `comment` (string ≤ 500 chars)
   */
  @Post(":id/feedback")
  async feedback(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { rating: number; feedback?: string },
  ) {
    const { rating, feedback } = body ?? {};

    // Validate rating
    if (rating === undefined || rating === null || ![-1, 0, 1].includes(rating)) {
      throw new BadRequestException("rating must be -1, 0, or 1");
    }

    // Validate feedback payload (text or JSON)
    if (feedback !== undefined && feedback !== null) {
      if (typeof feedback !== "string") {
        throw new BadRequestException("feedback must be a string");
      }
      if (feedback.length > 1000) {
        throw new BadRequestException("feedback must be ≤ 1000 characters");
      }
      // If it looks like JSON, soft-validate shape
      if (feedback.startsWith("{")) {
        try {
          const parsed = JSON.parse(feedback);
          if (parsed.reason && typeof parsed.reason !== "string") {
            throw new BadRequestException("feedback.reason must be a string");
          }
          if (parsed.reason && parsed.reason.length > 64) {
            throw new BadRequestException("feedback.reason too long");
          }
          if (parsed.comment && typeof parsed.comment !== "string") {
            throw new BadRequestException("feedback.comment must be a string");
          }
          if (parsed.comment && parsed.comment.length > 500) {
            throw new BadRequestException("feedback.comment too long");
          }
        } catch (err) {
          if (err instanceof BadRequestException) throw err;
          // Not valid JSON — still accept as free text (retro-compat)
        }
      }
    }

    // Verify the query log exists
    const existing = await this.prisma.ragQueryLog.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("RagQueryLog not found");
    }

    const updated = await this.prisma.ragQueryLog.update({
      where: { id },
      data: {
        rating,
        ...(feedback !== undefined ? { feedback } : {}),
      },
    });

    return { success: true, id: updated.id, rating: updated.rating };
  }

  /**
   * Feature 10 — Crée un lien public éphémère vers une conversation snapshot.
   * Le client envoie le tableau de messages (role/content/timestamp/sources).
   * On stocke dans `ChatbotShareLink` avec un token aléatoire et expire 7 jours.
   *
   * Retour : `{ token, url, expiresAt }` — l'URL pointe vers le frontend
   * (/share/conversation/:token) qui consommera GET /rag/conversations/share/:token.
   */
  @Post("conversations/share")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createShareLink(
    @Body()
    body: {
      messages: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp?: number;
        sources?: unknown;
      }>;
      ttlDays?: number;
    },
    @CurrentUser() user: RequestUser,
  ) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      throw new BadRequestException("messages must be a non-empty array");
    }
    if (messages.length > 100) {
      throw new BadRequestException("cannot share more than 100 messages");
    }
    // Garde-fou taille payload
    const totalChars = messages.reduce((acc, m) => acc + (m.content?.length ?? 0), 0);
    if (totalChars > 200_000) {
      throw new BadRequestException("conversation too large to share");
    }

    const ttlDays = Math.min(Math.max(1, body.ttlDays ?? 7), 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const token = randomBytes(24).toString("hex");

    const created = await this.prisma.chatbotShareLink.create({
      data: {
        token,
        ownerId: user.id,
        // Prisma.InputJsonValue : sérialisation directe du payload conversation.
        payload: messages as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    // L'URL frontend est construite côté client à partir du token retourné ;
    // on expose une URL relative pour rester portable (dev/prod, plusieurs hostnames).
    const url = `/share/conversation/${created.token}`;
    return {
      token: created.token,
      url,
      expiresAt: created.expiresAt.toISOString(),
    };
  }

  /**
   * Feature 10 — Lecture d'une conversation partagée (read-only, public).
   * Pas d'authentification requise. Refuse si expiré.
   */
  @Get("conversations/share/:token")
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getShareLink(@Param("token") token: string) {
    if (!token || token.length < 16) {
      throw new BadRequestException("invalid token");
    }
    const link = await this.prisma.chatbotShareLink.findUnique({
      where: { token },
    });
    if (!link) throw new NotFoundException("share link not found");
    if (link.expiresAt < new Date()) {
      throw new GoneException("share link expired");
    }
    // Compteur de vues (best-effort, non bloquant)
    void this.prisma.chatbotShareLink
      .update({ where: { id: link.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    return {
      token: link.token,
      messages: link.payload,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt.toISOString(),
      viewCount: link.viewCount + 1,
    };
  }
}
