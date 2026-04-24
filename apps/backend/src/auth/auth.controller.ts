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
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { UsersService } from "../users/users.service";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly mfaService: MfaService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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
        // MFA verified — proceed with full login
        const result = await this.authService.login(user, ip, userAgent);
        this.setRefreshTokenCookie(res, result.refreshToken);
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
      (user.role === UserRole.PRESTATAIRE ||
        (user as any).mfaRequired === true);

    // Login (with optional mfaSetupRequired flag)
    const loginResult = await this.authService.login(user, ip, userAgent);
    this.setRefreshTokenCookie(res, loginResult.refreshToken);
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
      this.setRefreshTokenCookie(res, result.refreshToken);
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
    res.clearCookie("refreshToken", { path: "/api/v1/auth/refresh" });
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

  /** Store refresh token in a httpOnly cookie (ANSSI R16). */
  private setRefreshTokenCookie(res: Response, refreshToken: string): void {
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/v1/auth/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}
