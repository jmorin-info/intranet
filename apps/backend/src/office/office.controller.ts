import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OfficeService } from "./office.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";

/**
 * OnlyOffice Docs integration controller.
 *
 * Routes principales (authentifiées JWT) :
 *   GET  /office/status                    — statut du service
 *   GET  /office/supported-extensions      — liste des extensions supportées
 *   GET  /office/editor/:documentId        — génère la config pour ouvrir un document dans l'éditeur
 *
 * Routes publiques (signées par token OnlyOffice) :
 *   GET  /office/file?token=...            — téléchargement du fichier par OnlyOffice Docs
 *   POST /office/callback?token=...        — callback de sauvegarde depuis OnlyOffice Docs
 */
@Controller("office")
export class OfficeController {
  private readonly logger = new Logger(OfficeController.name);
  constructor(private readonly officeService: OfficeService) {}

  /**
   * Endpoint PUBLIC léger de disponibilité de l'éditeur (cache 30s côté
   * service). Consommé par le frontend pour masquer/désactiver les boutons
   * OnlyOffice et afficher un message « maintenance » propre au lieu de
   * laisser l'utilisateur tomber sur le watchdog de l'éditeur.
   */
  @Public()
  @SkipThrottle()
  @Get("availability")
  async getAvailability() {
    return this.officeService.getAvailability();
  }

  @Get("status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getStatus() {
    const health = await this.officeService.healthCheck();
    return {
      enabled: this.officeService.isEnabled(),
      url: this.officeService.getDocumentServerUrl(),
      ...health,
      runtime: this.officeService.getRuntimeInfo(),
    };
  }

  /**
   * Diagnostic approfondi: vérifie l'accessibilité de l'URL interne utilisée
   * par OnlyOffice Docs pour télécharger le fichier. À appeler depuis l'UI
   * lorsque l'éditeur charge la barre mais pas le document.
   */
  @Get("diagnose")
  @UseGuards(JwtAuthGuard, RolesGuard)
  async diagnose() {
    const [health, reachability, jwt] = await Promise.all([
      this.officeService.healthCheck(),
      this.officeService.diagnoseInternalReachability(),
      this.officeService.testCommandService(),
    ]);
    return {
      runtime: this.officeService.getRuntimeInfo(),
      docsServerHealth: health,
      backendReachability: reachability,
      jwtMatch: jwt.jwtMatch,
      jwtMessage: jwt.jwtMessage,
      jwtHttpStatus: jwt.httpStatus,
    };
  }

  /**
   * Teste la configuration JWT en appelant CommandService du Docs Server avec
   * un token signé avec le secret backend. Permet de valider la config avant
   * d'ouvrir un vrai document (sinon le symptôme est "canvas vide silencieux").
   * Réservé ADMIN car ça expose des infos serveur.
   */
  @Post("test-jwt")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async testJwt() {
    const result = await this.officeService.testCommandService();
    return {
      runtime: this.officeService.getRuntimeInfo(),
      ...result,
    };
  }

  @Get("supported-extensions")
  @UseGuards(JwtAuthGuard, RolesGuard)
  getSupportedExtensions() {
    return this.officeService.getSupportedExtensions();
  }

  /**
   * Construit la config OnlyOffice pour ouvrir un document dans l'éditeur.
   * Le frontend passe cette config à DocsAPI.DocEditor.
   */
  @Get("editor/:documentId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getEditorConfig(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("mode") mode: "edit" | "view" = "edit",
    @CurrentUser() user: RequestUser,
  ) {
    return this.officeService.buildEditorConfig(documentId, user, mode);
  }

  /**
   * Historique des versions pour le panneau « Historique » de l'éditeur
   * (événement onRequestHistory → docEditor.refreshHistory()).
   */
  @Get("history/:documentId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getHistory(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.officeService.getHistory(documentId, user);
  }

  /**
   * Données d'une version précise (fileUrl tokenisée view-only) pour
   * onRequestHistoryData → docEditor.setHistoryData().
   */
  @Get("history/:documentId/version/:versionId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getHistoryVersionData(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.officeService.getHistoryVersionData(documentId, versionId, user);
  }

  /**
   * Restaure une version antérieure (onRequestRestore) : crée une version
   * mineure copiant la version cible et invalide la session Docs Server.
   */
  @Post("restore/:documentId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async restoreVersion(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() body: { versionId?: string },
    @CurrentUser() user: RequestUser,
  ) {
    if (!body?.versionId) {
      throw new BadRequestException('Le champ "versionId" est requis');
    }
    return this.officeService.restoreVersion(documentId, body.versionId, user);
  }

  /**
   * Force la sauvegarde de la session en cours via CommandService
   * (c:'forcesave'). Branché sur le Ctrl+S du frontend.
   */
  @Post("forcesave/:documentId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async forceSave(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() body: { key?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.officeService.forceSave(documentId, user, body?.key);
  }

  /**
   * Endpoint PUBLIC appelé par OnlyOffice Docs pour télécharger le fichier.
   * L'authentification se fait via un token signé dans l'URL.
   */
  @Public()
  @SkipThrottle()
  @Get("file")
  async downloadFile(@Query("token") token: string, @Req() req: Request, @Res() res: Response) {
    // Instrumentation pour diagnostiquer les cas "canvas vide" — trace chaque
    // tentative de téléchargement par OnlyOffice avec l'origine + user-agent.
    if (typeof token !== "string" || !token || token.length > 4096) throw new BadRequestException("Token de fichier invalide.");
    const userAgent = req.headers["user-agent"];
    const forwarded = req.headers["x-forwarded-for"];
    const ua = typeof userAgent === "string" ? userAgent : "unknown";
    const clientIp = typeof forwarded === "string" ? forwarded.slice(0, 128) : req.ip;
    this.logger.log(
      `[office/file] GET from ip=${clientIp} ua="${ua.substring(0, 60)}" tokenLen=${(token || "").length}`,
    );

    if (!token) {
      this.logger.warn("[office/file] missing token");
      throw new BadRequestException("Token manquant");
    }

    const payload = this.officeService.verifyFileAccessToken(token);
    if (!payload) {
      this.logger.warn("[office/file] invalid or expired token");
      throw new NotFoundException("Token invalide ou expiré");
    }
    this.logger.log(`[office/file] token ok versionId=${payload.documentVersionId}`);

    try {
      const result = await this.officeService.getFileStreamForOnlyOffice(payload.documentVersionId);
      this.logger.log(
        `[office/file] streaming "${result.fileName}" contentType=${result.contentType}`,
      );
      res.set({
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.fileName)}"`,
        "Cache-Control": "private, no-cache",
        // Important: autoriser OnlyOffice Docs (cross-origin) à lire le fichier
        "Access-Control-Allow-Origin": "*",
      });
      result.stream.pipe(res);
    } catch (err) {
      this.logger.error(`[office/file] stream failed: ${err instanceof Error ? err.message : err}`);
      throw new NotFoundException(err instanceof Error ? err.message : "Fichier introuvable");
    }
  }

  /**
   * Endpoint PUBLIC appelé par OnlyOffice Docs pour sauvegarder les modifications.
   * Vérifie le token signé avant de traiter le callback.
   *
   * IMPORTANT: OnlyOffice attend un statut HTTP 200 + body `{"error": 0}`.
   * Sans @HttpCode(200), NestJS renvoie 201 par défaut sur un POST → OnlyOffice
   * considère cela comme une erreur.
   */
  @Public()
  @SkipThrottle()
  @Post("callback")
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Query("token") token: string, @Body() body: any, @Req() req: Request) {
    // OnlyOffice s'attend à recevoir `{ error: 0 }` en cas de succès
    if (!token) {
      return { error: 1 };
    }

    const payload = this.officeService.verifyCallbackToken(token);
    if (!payload) {
      this.logger.warn("[office/callback] token de callback invalide ou expiré");
      return { error: 1 };
    }

    // Vérification du JWT ENTRANT signé par le Docs Server (body.token ou
    // header Authorization) — le payload vérifié fait autorité sur le body.
    const verified = this.officeService.verifyIncomingCallbackJwt(
      body,
      req.headers.authorization as string | undefined,
    );
    if (!verified.ok) {
      this.logger.warn(`[office/callback] JWT Docs Server rejeté : ${verified.reason}`);
      return { error: 1 };
    }

    return this.officeService.handleCallback(
      verified.data,
      payload.documentVersionId,
      payload.userId,
    );
  }
}
