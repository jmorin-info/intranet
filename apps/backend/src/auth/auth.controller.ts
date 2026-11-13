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
import { WebAuthnService } from "../mfa/webauthn.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UserThrottlerGuard } from "./guards/user-throttler.guard";
import { UserThrottle } from "./decorators/user-throttle.decorator";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { RequestUser } from "../common/interfaces";
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
    private readonly webauthnService: WebAuthnService,
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

    // Check if MFA (TOTP) ou WebAuthn est actif pour ce compte
    const hasWebauthn = await this.webauthnService.hasCredentials(user.id);
    const totpEnabled = user.mfaEnabled && user.mfaSecret;
    if (totpEnabled || hasWebauthn) {
      const mfaCode = loginDto.mfaCode;
      const webauthnResponse = loginDto.webauthnResponse;

      // Branche WebAuthn — l'utilisateur a signé avec sa clé.
      if (webauthnResponse && hasWebauthn) {
        try {
          await this.webauthnService.verifyAuthentication(
            user.id,
            webauthnResponse as any,
            { ip, userAgent },
          );
        } catch (err) {
          throw new UnauthorizedException(
            err instanceof Error ? err.message : "WebAuthn invalide",
          );
        }
        const result = await this.authService.login(user, ip, userAgent, true);
        setRefreshTokenCookie(res, result.refreshToken);
        setAccessTokenCookie(res, result.accessToken);
        return result;
      }

      // Branche TOTP / backup code.
      if (mfaCode && totpEnabled) {
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

      // Aucune réponse MFA fournie — signale au frontend les méthodes possibles.
      return {
        mfaRequired: true,
        email: user.email,
        methods: {
          totp: !!totpEnabled,
          webauthn: hasWebauthn,
        },
        message: "Authentification multifacteur requise",
      };
    }

    // Politique MFA : enrôlement obligatoire à la première connexion pour tous
    // les utilisateurs qui n'ont pas encore activé MFA. Le frontend redirige
    // vers /mfa avant toute autre action tant que le flag est posé.
    // (Avant : limité aux PRESTATAIRE ou users avec mfaRequired=true.)
    const mfaSetupRequired = !user.mfaEnabled;

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

  @Public()
  @Post(["logout", "refresh/logout"])
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refreshToken;
    const authorization = req.headers.authorization;
    const accessToken = req.cookies?.accessToken || (typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : undefined);
    // Storage failures must not claim successful revocation. They surface as
    // 5xx so the caller can retry, without clearing the only revocation proof.
    const verified = await this.authService.logoutSession(token, accessToken);
    if (!verified) {
      // /logout may not receive an old refresh-scoped cookie. Preserve it so
      // an older client can refresh/migrate and retry. The alias receives all
      // supported cookie paths and can safely remove invalid browser state.
      if (req.path.endsWith("/refresh/logout")) {
        clearRefreshTokenCookie(res);
        clearAccessTokenCookie(res);
      }
      throw new UnauthorizedException("Aucune session vérifiable à déconnecter");
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

  /**
   * Wave D item 18 — récupère un challenge WebAuthn pour un utilisateur connu
   * par email, AVANT le login. Permet le bouton "Utiliser ma clé de sécurité"
   * dans la modale MFA. Anti-énumération : on retourne {webauthn:false} si le
   * compte n'existe pas ou n'a pas de clé, sans révéler la cause.
   */
  @Public()
  @AllowCrossSite()
  @Post("login/webauthn-options")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async webauthnLoginOptions(@Body() body: { email: string }) {
    if (!body?.email) {
      return { webauthn: false };
    }
    const user = await this.usersService
      .findByEmail(body.email)
      .catch(() => null);
    if (!user) return { webauthn: false };
    const hasKeys = await this.webauthnService.hasCredentials(user.id);
    if (!hasKeys) return { webauthn: false };
    try {
      const options = await this.webauthnService.generateAuthenticationOptions(
        user.id,
      );
      return { webauthn: true, options };
    } catch (err) {
      this.logger.warn(
        `webauthn options gen failed for ${body.email}: ${err instanceof Error ? err.message : err}`,
      );
      return { webauthn: false };
    }
  }
}
