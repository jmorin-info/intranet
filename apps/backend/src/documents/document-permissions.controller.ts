import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { RequireFreshMfa } from "../mfa/decorators/require-fresh-mfa.decorator";
import { RequestUser } from "../common/interfaces";
import {
  DocumentPermissionsService,
  GrantPermissionDto,
} from "./document-permissions.service";
import {
  DocumentSharesService,
  CreateShareDto,
} from "./document-shares.service";

/**
 * Endpoints permissions GED granulaires + partages publics.
 *
 * Les routes `/documents/:id/permissions/*` et `/documents/:id/shares/*`
 * exigent une authentification JWT + niveau ADMIN sur le document
 * (vérifié dans le service via `permissions.canAdmin`).
 *
 * Les routes `/shared/:token` sont publiques (pas de JWT) et soumises à
 * un rate-limit strict (10 req/min par IP via @Throttle).
 */
@Controller()
export class DocumentPermissionsController {
  constructor(
    private readonly permissionsService: DocumentPermissionsService,
    private readonly sharesService: DocumentSharesService,
  ) {}

  // ============================================================
  // PERMISSIONS — protégées par JWT
  // ============================================================

  @Get("documents/:id/permissions")
  @UseGuards(JwtAuthGuard)
  listPermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.permissionsService.listPermissions(id, user);
  }

  @Post("documents/:id/permissions")
  @UseGuards(JwtAuthGuard)
  grantPermission(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GrantPermissionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    return this.permissionsService.grantPermission(id, dto, user, ip);
  }

  @Delete("documents/:id/permissions/:permId")
  @UseGuards(JwtAuthGuard)
  revokePermission(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("permId", ParseUUIDPipe) permId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    return this.permissionsService.revokePermission(id, permId, user, ip);
  }

  // ============================================================
  // SHARES — protégées par JWT (création/listing/revoke)
  // ============================================================

  @Get("documents/:id/shares")
  @UseGuards(JwtAuthGuard)
  listShares(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sharesService.listShares(id, user);
  }

  /**
   * Création d'un share. MFA fresh requise si `requiresAuth=false` (lien
   * anonyme — risque accru d'exfiltration). On applique systématiquement
   * `@RequireFreshMfa` car la création d'un share modifie la surface
   * d'attaque (ISO 27001 A.8.5).
   */
  @Post("documents/:id/shares")
  @UseGuards(JwtAuthGuard)
  @RequireFreshMfa()
  createShare(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateShareDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    return this.sharesService.createShare(id, dto, user, ip);
  }

  @Delete("documents/:id/shares/:shareId")
  @UseGuards(JwtAuthGuard)
  revokeShare(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("shareId", ParseUUIDPipe) shareId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    return this.sharesService.revokeShare(id, shareId, user, ip);
  }

  // ============================================================
  // PUBLIC ACCESS via token — pas de JWT, rate-limit strict
  // ============================================================

  /**
   * GET /shared/:token — vérifie l'existence et l'expiration du share.
   * Si un mot de passe est requis, renvoie `{ requiresPassword: true }`.
   * Sinon renvoie les meta du document (sans le contenu binaire).
   *
   * Rate-limit : 10 requêtes / minute / IP (anti-bruteforce token).
   */
  @Get("shared/:token")
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  accessShareGet(
    @Param("token") token: string,
    @Req() req: Request,
    @CurrentUser() user?: RequestUser,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    const ua = (req.headers["user-agent"] as string) || undefined;
    return this.sharesService.accessShare(token, null, ip, ua, user?.id);
  }

  /**
   * POST /shared/:token — accès avec mot de passe.
   * Le mot de passe transite uniquement en POST/JSON, jamais dans l'URL.
   *
   * Rate-limit : 10 tentatives / minute / IP. Après 5 mauvais mdp consécutifs
   * sur le même share, le service auto-révoque le lien.
   */
  @Post("shared/:token")
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  accessSharePost(
    @Param("token") token: string,
    @Body() body: { password?: string },
    @Req() req: Request,
    @CurrentUser() user?: RequestUser,
  ) {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    const ua = (req.headers["user-agent"] as string) || undefined;
    return this.sharesService.accessShare(
      token,
      body?.password ?? null,
      ip,
      ua,
      user?.id,
    );
  }
}
