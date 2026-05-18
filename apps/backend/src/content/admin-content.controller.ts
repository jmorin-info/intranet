import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  BadRequestException,
  Req,
  HttpCode,
} from "@nestjs/common";
import { Request } from "express";
import { ContentStatus } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { UserThrottle } from "../auth/decorators/user-throttle.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { safeParseInt } from "../common/validation-helpers";
import { ContentService, AuditContext } from "./content.service";
import { CreateContentPageDto } from "./dto/create-content-page.dto";
import { UpdateContentPageDto } from "./dto/update-content-page.dto";
import { CreateContentBlockDto } from "./dto/create-content-block.dto";
import { UpdateContentBlockDto } from "./dto/update-content-block.dto";

@Controller("admin/content")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  // ─── Pages ──────────────────────────────────────────────────────────

  @Get("pages")
  listPages(
    @Query("status") status: string,
    @Query("locale") locale: string,
    @Query("q") search: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const parsedPage = safeParseInt(page, 1);
    const parsedLimit = safeParseInt(limit, 20);
    if (parsedPage < 1) throw new BadRequestException("page must be >= 1");
    if (parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException("limit must be between 1 and 100");
    }
    const statusFilter =
      status && Object.values(ContentStatus).includes(status as ContentStatus)
        ? (status as ContentStatus)
        : undefined;
    return this.content.listPages({
      status: statusFilter,
      locale: locale || undefined,
      search: search || undefined,
      page: parsedPage,
      limit: parsedLimit,
    });
  }

  @Get("pages/:id")
  getPage(@Param("id", ParseUUIDPipe) id: string) {
    return this.content.getPageById(id);
  }

  @Post("pages")
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 30, ttl: 60_000 })
  createPage(
    @Body() dto: CreateContentPageDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.content.createPage(dto, this.auditCtx(user, req));
  }

  @Patch("pages/:id")
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 60, ttl: 60_000 })
  updatePage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentPageDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.content.updatePage(id, dto, this.auditCtx(user, req));
  }

  @Post("pages/:id/publish")
  publishPage(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.content.publishPage(id, this.auditCtx(user, req));
  }

  @Post("pages/:id/unpublish")
  unpublishPage(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.content.unpublishPage(id, this.auditCtx(user, req));
  }

  @Delete("pages/:id")
  @HttpCode(204)
  async deletePage(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.content.deletePage(id, this.auditCtx(user, req));
  }

  @Get("pages/:id/revisions")
  listRevisions(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const parsedPage = safeParseInt(page, 1);
    const parsedLimit = safeParseInt(limit, 20);
    if (parsedPage < 1) throw new BadRequestException("page must be >= 1");
    if (parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException("limit must be between 1 and 100");
    }
    return this.content.listRevisions(id, parsedPage, parsedLimit);
  }

  @Post("pages/:id/revisions/:version/restore")
  restoreRevision(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("version", ParseIntPipe) version: number,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (version < 1) throw new BadRequestException("version must be >= 1");
    return this.content.restoreRevision(id, version, this.auditCtx(user, req));
  }

  // ─── Blocks ─────────────────────────────────────────────────────────

  @Get("blocks")
  listBlocks(
    @Query("prefix") prefix: string,
    @Query("locale") locale: string,
    @Query("q") search: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const parsedPage = safeParseInt(page, 1);
    const parsedLimit = safeParseInt(limit, 50);
    if (parsedPage < 1) throw new BadRequestException("page must be >= 1");
    if (parsedLimit < 1 || parsedLimit > 200) {
      throw new BadRequestException("limit must be between 1 and 200");
    }
    return this.content.listBlocks({
      prefix: prefix || undefined,
      locale: locale || undefined,
      search: search || undefined,
      page: parsedPage,
      limit: parsedLimit,
    });
  }

  @Get("blocks/:id")
  getBlock(@Param("id", ParseUUIDPipe) id: string) {
    return this.content.getBlockById(id);
  }

  @Post("blocks")
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 60, ttl: 60_000 })
  createBlock(
    @Body() dto: CreateContentBlockDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.content.createBlock(dto, this.auditCtx(user, req));
  }

  @Patch("blocks/:id")
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 120, ttl: 60_000 })
  updateBlock(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentBlockDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.content.updateBlock(id, dto, this.auditCtx(user, req));
  }

  @Delete("blocks/:id")
  @HttpCode(204)
  async deleteBlock(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.content.deleteBlock(id, this.auditCtx(user, req));
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private auditCtx(user: RequestUser, req: Request): AuditContext {
    return {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: (req.headers["user-agent"] as string) || undefined,
    };
  }
}
