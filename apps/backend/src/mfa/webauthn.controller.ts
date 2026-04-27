import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { UserThrottle } from "../auth/decorators/user-throttle.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { SkipMfaCheck } from "./decorators/skip-mfa-check.decorator";
import { WebAuthnService } from "./webauthn.service";
import {
  VerifyWebAuthnRegistrationDto,
  VerifyWebAuthnAuthenticationDto,
} from "./dto/webauthn.dto";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

/**
 * Endpoints WebAuthn / FIDO2 — item 18 Wave D.
 *
 * Toutes les routes nécessitent une session JWT valide (l'enrôlement et
 * l'authentification post-login). Le challenge inline au login passe par
 * `/auth/login` dans une 2ᵉ phase (cf docs).
 *
 * `@SkipMfaCheck()` : un utilisateur en attente d'enrôlement MFA doit
 * pouvoir enrôler une clé WebAuthn comme alternative à TOTP.
 */
@Controller("mfa/webauthn")
@UseGuards(JwtAuthGuard)
@SkipMfaCheck()
export class WebAuthnController {
  constructor(private readonly webauthnService: WebAuthnService) {}

  @Post("register/options")
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 5, ttl: 60_000 })
  registerOptions(@CurrentUser() user: RequestUser) {
    return this.webauthnService.generateRegistrationOptions(user.id);
  }

  @Post("register/verify")
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 5, ttl: 60_000 })
  registerVerify(
    @CurrentUser() user: RequestUser,
    @Body() body: VerifyWebAuthnRegistrationDto,
    @Req() req: Request,
  ) {
    return this.webauthnService.verifyRegistration(
      user.id,
      body.response as unknown as RegistrationResponseJSON,
      body.label,
      this.getCtx(req),
    );
  }

  @Post("authenticate/options")
  @HttpCode(HttpStatus.OK)
  // Anti brute-force : 10 essais / min — un peu plus généreux qu'une auth TOTP
  // car l'utilisateur peut tâtonner entre plusieurs clés.
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 10, ttl: 60_000 })
  authenticateOptions(@CurrentUser() user: RequestUser) {
    return this.webauthnService.generateAuthenticationOptions(user.id);
  }

  @Post("authenticate/verify")
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 10, ttl: 60_000 })
  authenticateVerify(
    @CurrentUser() user: RequestUser,
    @Body() body: VerifyWebAuthnAuthenticationDto,
    @Req() req: Request,
  ) {
    return this.webauthnService.verifyAuthentication(
      user.id,
      body.response as unknown as AuthenticationResponseJSON,
      this.getCtx(req),
    );
  }

  @Get("credentials")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  listCredentials(@CurrentUser() user: RequestUser) {
    return this.webauthnService.listCredentials(user.id);
  }

  @Delete("credentials/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async deleteCredential(
    @CurrentUser() user: RequestUser,
    @Param("id") credentialId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.webauthnService.deleteCredential(
      user.id,
      credentialId,
      this.getCtx(req),
    );
  }

  private getCtx(req: Request): { ip: string; userAgent: string } {
    return {
      ip: req.ip || req.socket?.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
    };
  }
}
