import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { MfaService } from "./mfa.service";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { DisableMfaDto } from "./dto/disable-mfa.dto";
import { SetMfaPolicyDto } from "./dto/set-mfa-policy.dto";
import { RevalidateMfaDto } from "./dto/revalidate-mfa.dto";
import { SkipMfaCheck } from "./decorators/skip-mfa-check.decorator";
import { RequireFreshMfa } from "./decorators/require-fresh-mfa.decorator";
import { setAccessTokenCookie } from "../common/cookies.util";

@Controller("mfa")
@UseGuards(JwtAuthGuard, RolesGuard)
// Tous les endpoints MFA sont exemptés de `MfaRequiredGuard` — l'utilisateur en
// attente d'enrôlement DOIT pouvoir accéder à /mfa/setup, /mfa/activate, etc.
@SkipMfaCheck()
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("setup")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  setup(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.mfaService.setupMfa(user.id, this.getCtx(req));
  }

  @Post("activate")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  activate(
    @CurrentUser() user: RequestUser,
    @Body("code") code: string,
    @Req() req: Request,
  ) {
    return this.mfaService.activateMfa(user.id, code, this.getCtx(req));
  }

  @Post("verify")
  async verify(@CurrentUser() user: RequestUser, @Body("code") code: string) {
    const valid = await this.mfaService.verifyMfa(user.id, code);
    return { valid };
  }

  /**
   * Self-service MFA disable — exige une ré-auth explicite (password OU code TOTP/secours)
   * pour empêcher qu'une session volée sauve la 2FA sans challenge.
   */
  @Post("disable/me")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  disableOwn(
    @CurrentUser() user: RequestUser,
    @Body() body: DisableMfaDto,
    @Req() req: Request,
  ) {
    return this.mfaService.disableMfaOwn(
      user.id,
      { password: body.password, code: body.code },
      this.getCtx(req),
    );
  }

  @Post("disable/:userId")
  @Roles(UserRole.SUPER_ADMIN)
  @RequireFreshMfa()
  disable(
    @CurrentUser() admin: RequestUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Req() req: Request,
  ) {
    return this.mfaService.disableMfa(userId, {
      actorId: admin.id,
      method: "admin",
      ...this.getCtx(req),
    });
  }

  @Post("enforce")
  @Roles(UserRole.SUPER_ADMIN)
  @RequireFreshMfa()
  enforce(@Body("roles") roles?: string[]) {
    return this.mfaService.enforceMfa(roles);
  }

  @Post("backup-codes")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async generateBackupCodes(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const codes = await this.mfaService.generateBackupCodes(
      user.id,
      this.getCtx(req),
    );
    return { codes };
  }

  /**
   * Politique MFA per-user — pose ou retire le flag `mfaRequired` avec
   * traçabilité (mfaEnforcedAt, mfaEnforcedById). SUPER_ADMIN uniquement,
   * throttlé pour limiter les abus.
   */
  @Patch("users/:id/policy")
  @Roles(UserRole.SUPER_ADMIN)
  // Modifier la politique MFA d'un autre utilisateur exige soi-même une
  // re-validation MFA récente (anti-pivot session volée).
  @RequireFreshMfa()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async setMfaPolicy(
    @CurrentUser() admin: RequestUser,
    @Param("id", ParseUUIDPipe) targetUserId: string,
    @Body() body: SetMfaPolicyDto,
    @Req() req: Request,
  ) {
    return this.mfaService.setMfaPolicy(
      targetUserId,
      body.enforced,
      admin.id,
      this.getCtx(req),
    );
  }

  /**
   * Re-validation MFA — appelée par le front quand un endpoint sensible a
   * renvoyé `MFA_REVALIDATION_REQUIRED`. Vérifie le code TOTP/secours, met à
   * jour `mfaValidatedAt` sur la session active, et signe un nouvel access
   * token avec le claim rafraîchi. Le frontend stocke le nouveau token et
   * retente la requête initiale.
   */
  @Post("revalidate")
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async revalidate(
    @CurrentUser() user: RequestUser,
    @Body() body: RevalidateMfaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mfaService.revalidateMfa(user.id, body.code);

    // Signe un nouveau JWT avec le claim mfaValidatedAt rafraîchi. On lit le
    // user complet pour récupérer email/role/dept afin que le payload soit
    // cohérent avec ce que produit `AuthService.login()`.
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, role: true, departmentId: true },
    });
    if (!dbUser) {
      // Ne devrait jamais arriver — JwtAuthGuard a déjà résolu l'utilisateur.
      throw new Error("User not found after revalidation");
    }
    const accessToken = this.authService.generateAccessToken({
      sub: dbUser.id,
      email: dbUser.email,
      role: dbUser.role as UserRole,
      departmentId: dbUser.departmentId ?? undefined,
      mfaValidatedAt: result.mfaValidatedAt,
    });

    // ANSSI A.5.34 / OWASP A05 — JWT en cookie httpOnly (anti-XSS).
    setAccessTokenCookie(res, accessToken);

    return {
      accessToken,
      mfaValidatedAt: result.mfaValidatedAt,
    };
  }

  @Get("status")
  async status(@CurrentUser() user: RequestUser) {
    const [mfaEnabled, fullUser] = await Promise.all([
      this.mfaService.isMfaRequired(user.id),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          mfaEnabled: true,
          lastLoginAt: true,
          chartesAcceptedAt: true,
        },
      }),
    ]);
    return {
      mfaEnabled,
      lastLoginAt: fullUser?.lastLoginAt,
      chartesAcceptedAt: fullUser?.chartesAcceptedAt,
    };
  }

  private getCtx(req: Request): { ip: string; userAgent: string } {
    return {
      ip: req.ip || req.socket?.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
    };
  }
}
