import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { MfaService } from "../mfa/mfa.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UserThrottlerGuard } from "./guards/user-throttler.guard";
import { UserThrottle } from "./decorators/user-throttle.decorator";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { UsersService } from "../users/users.service";
import { SkipMfaCheck } from "../mfa/decorators/skip-mfa-check.decorator";
import { AllowCrossSite } from "./decorators/allow-cross-site.decorator";
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  setAccessTokenCookie,
  clearAccessTokenCookie,
} from "../common/cookies.util";

@Controller("auth")
// Tous les endpoints d'auth doivent rester accessibles, y compris pour les
// utilisateurs en attente d'enrôlement MFA — sinon /auth/me casserait /mfa et
// /auth/logout deviendrait inatteignable.
@SkipMfaCheck()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly mfaService: MfaService,
  ) {}

  @Public()
  // Login peut être déclenché depuis un IdP externe (SSO) — Sec-Fetch-Site
  // sera alors `cross-site`. On autorise explicitement cette navigation.
  @AllowCrossSite()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  // Anti brute-force ANSSI R59 : 5 tentatives/min. Avant authentification,
  // le tracker retombe automatiquement sur l'IP (le guard ne dispose pas de
  // req.user puisque la route est @Public). Le ThrottlerGuard global (300/min IP)
  // continue de s'appliquer en plus.
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 5, ttl: 60_000 })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    // Check if MFA is enabled for this user
    if (user.mfaEnabled && user.mfaSecret) {
      // If mfaCode is provided in the login request, verify it immediately
      const mfaCode = loginDto.mfaCode;
      if (mfaCode) {
        const valid = await this.mfaService.verifyMfa(user.id, mfaCode);
        if (!valid) {
          // Try backup code as fallback
          const backupValid = await this.mfaService.verifyBackupCode(
            user.id,
            mfaCode,
          );
          if (!backupValid) {
            throw new UnauthorizedException("Code MFA invalide");
          }
          // Backup code was valid — proceed
        }
        // MFA verified — proceed with full login + signe mfaValidatedAt pour
        // FreshMfaGuard (autorise les endpoints sensibles pendant 12 h sans
        // re-challenge).
        const result = await this.authService.login(user, ip, userAgent, true);
        setRefreshTokenCookie(res, result.refreshToken);
        // ANSSI A.5.34 / OWASP A05 — JWT en cookie httpOnly (anti-XSS).
        // On renvoie aussi le token dans le body pour rétrocompat front
        // (le frontend ne le persiste plus en localStorage mais peut le lire
        // en transitoire pendant la migration).
        setAccessTokenCookie(res, result.accessToken);
        return result;
      }

      // No mfaCode provided — return mfaRequired flag
      // Do NOT issue a JWT yet
      return {
        mfaRequired: true,
        email: user.email,
        message: "Code MFA requis",
      };
    }

    // Politique MFA : prestataires par défaut + utilisateurs ciblés par
    // `mfaRequired=true` (admin a imposé la politique MFA).
    // Dans ces cas, on émet un token avec un flag mfaSetupRequired pour que le
    // frontend redirige vers la page d'enrôlement MFA avant toute autre action.
    const mfaSetupRequired =
      !user.mfaEnabled &&
      (user.role === UserRole.PRESTATAIRE || user.mfaRequired === true);

    // Login (with optional mfaSetupRequired flag)
    const loginResult = await this.authService.login(user, ip, userAgent);
    setRefreshTokenCookie(res, loginResult.refreshToken);
    // ANSSI A.5.34 / OWASP A05 — JWT en cookie httpOnly (anti-XSS).
    setAccessTokenCookie(res, loginResult.accessToken);
    if (mfaSetupRequired) {
      return { ...loginResult, mfaSetupRequired: true };
    }
    return loginResult;
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    // ANSSI R16 : le refresh token vient exclusivement du cookie httpOnly.
    // Pas de fallback body — empêche toute exposition du token côté JS.
    const token: string | undefined = req.cookies?.refreshToken as
      | string
      | undefined;

    if (!token) {
      throw new UnauthorizedException(
        "Session expirée, veuillez vous reconnecter",
      );
    }

    try {
      const result = await this.authService.refreshTokens(token, ip, userAgent);
      setRefreshTokenCookie(res, result.refreshToken);
      // ANSSI A.5.34 / OWASP A05 — JWT en cookie httpOnly (anti-XSS).
      setAccessTokenCookie(res, result.accessToken);
      return result;
    } catch (err) {
      // Toute erreur de token (expiré, invalide, révoqué, malformé) DOIT renvoyer 401 — jamais 400.
      // Sinon l'intercepteur axios du frontend ne déclenche pas son flow de déconnexion propre.
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(
        `refresh failed from ${ip}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException("Session expirée");
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Best-effort : on n'échoue jamais un logout pour un refreshToken manquant/bancal,
    // sinon le frontend se retrouve bloqué en boucle 400 et ne nettoie pas son état local.
    try {
      // ANSSI R16 : le refresh token vient exclusivement du cookie httpOnly.
      const token: string | undefined = req.cookies?.refreshToken as
        | string
        | undefined;
      if (token) {
        await this.authService.logout(user.id, token);
      }
    } catch (err) {
      this.logger.warn(
        `logout cleanup failed for user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    clearRefreshTokenCookie(res);
    clearAccessTokenCookie(res);
    return { message: "Logged out successfully" };
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPasswordWithToken(body.token, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: RequestUser) {
    return this.usersService.findById(user.id);
  }
}
