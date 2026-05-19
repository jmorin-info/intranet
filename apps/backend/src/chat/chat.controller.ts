import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { UserThrottle } from "../auth/decorators/user-throttle.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { ChatbotUnifiedGuard } from "./guards/chatbot-unified.guard";
import { SessionOwnerGuard } from "./guards/session-owner.guard";
import { SessionService } from "./session.service";
import { FeedbackService } from "./feedback.service";
import { ChatStreamService, StreamEmitter } from "./chat-stream.service";
import { ChatService } from "./chat.service";
import { CreateSessionDto } from "./dto/create-session.dto";
import { UpdateSessionDto } from "./dto/update-session.dto";
import { AskStreamDto } from "./dto/ask-stream.dto";
import { FeedbackDto } from "./dto/feedback.dto";
import { ListSessionsDto } from "./dto/list-sessions.dto";

/**
 * Controller REST du backend chatbot unifié (Mission 3 Phase 1).
 *
 * Toutes les routes sont gatées par ChatbotUnifiedGuard : tant que le flag
 * CHATBOT_UNIFIED_ENABLED est à false (default), chaque endpoint retourne
 * 404 (pour masquer l'existence). Ordre des guards : unified > jwt > roles
 * > owner.
 *
 * RolesGuard + @Roles(COLLABORATEUR) au niveau classe : un chatbot LLM
 * consomme du GPU/CPU et accède à du contexte interne — PRESTATAIRE et
 * AUDITEUR sont exclus par défaut (alignement post audit PRESTATAIRE).
 */
@Controller("chat")
@UseGuards(ChatbotUnifiedGuard, JwtAuthGuard, RolesGuard)
@Roles(UserRole.COLLABORATEUR)
export class ChatController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly feedbackService: FeedbackService,
    private readonly chatStream: ChatStreamService,
    private readonly chatService: ChatService,
  ) {}

  // ---------------------------------------------------------------- Sessions

  @Post("sessions")
  async createSession(
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sessionService.create(user.id, dto);
  }

  @Get("sessions")
  async listSessions(
    @Query() query: ListSessionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    const archived =
      query.archived === "true"
        ? true
        : query.archived === "false"
          ? false
          : undefined;
    return this.sessionService.list({
      userId: user.id,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      archived,
      surface: query.surface,
    });
  }

  @Get("sessions/:id")
  @UseGuards(SessionOwnerGuard)
  async getSession(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.sessionService.findById(id, user.id);
  }

  @Patch("sessions/:id")
  @UseGuards(SessionOwnerGuard)
  async updateSession(@Param("id") id: string, @Body() dto: UpdateSessionDto) {
    return this.sessionService.update(id, dto);
  }

  @Delete("sessions/:id")
  @UseGuards(SessionOwnerGuard)
  @HttpCode(204)
  async deleteSession(@Param("id") id: string) {
    await this.sessionService.softDelete(id);
    // 204 No Content
  }

  // ------------------------------------------------------------- Ask stream

  @Post("ask-stream")
  // Anti-spam Ollama : 60 messages/h par utilisateur (les requêtes LLM sont
  // coûteuses en GPU/CPU ; un humain n'envoie pas plus d'une question/min en
  // moyenne sur la durée). Remplace l'ancien throttle 10/min/IP qui pénalisait
  // les bureaux derrière NAT.
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 60, ttl: 60 * 60_000 })
  async askStream(
    @Body() dto: AskStreamDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    if (!dto.query || dto.query.trim().length === 0) {
      throw new BadRequestException("La question est vide.");
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const emitter: StreamEmitter = {
      writeToken: (token: string) => {
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
      },
      writeEvent: (eventName: string, data: Record<string, unknown>) => {
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      },
      close: () => {
        res.end();
      },
    };

    try {
      await this.chatStream.run(user, dto, emitter);
    } catch (err) {
      emitter.writeEvent("error", { message: (err as Error).message });
      emitter.close();
    }
  }

  // ----------------------------------------------------------------- Regen

  @Post("messages/:id/regenerate")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async regenerate(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const emitter: StreamEmitter = {
      writeToken: (token) =>
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`),
      writeEvent: (e, d) =>
        res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`),
      close: () => res.end(),
    };

    await this.chatStream.regenerate(user, id, emitter);
  }

  // -------------------------------------------------------------- Feedback

  @Post("messages/:id/feedback")
  async feedback(
    @Param("id") id: string,
    @Body() dto: FeedbackDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.feedbackService.submit(id, user.id, dto);
  }

  // ----------------------------------------------------------- Suggestions

  @Get("suggestions")
  async suggestions(
    @Query("contextType") contextType: string | undefined,
    @Query("entityId") entityId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return {
      suggestions: this.chatService.getSuggestions({
        contextType: contextType ?? "generic",
        entityId,
        userDepartmentId: user.departmentId,
      }),
    };
  }
}
