import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { MfaService } from "./mfa.service";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { DisableMfaDto } from "./dto/disable-mfa.dto";

@Controller("mfa")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("setup")
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  enforce(@Body("roles") roles?: string[]) {
    return this.mfaService.enforceMfa(roles);
  }

  @Post("backup-codes")
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
