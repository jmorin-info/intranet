import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtService } from "@nestjs/jwt";
import { OfficeService } from "../office/office.service";
import { EphemeralSessionService } from "./ephemeral-session.service";
import { RequestUser } from "../common/interfaces";

const EDITABLE_EXT = ["docx", "xlsx", "pptx", "odt", "ods", "odp", "txt", "csv"];
const VIEWABLE_EXT = ["doc", "xls", "ppt", "pdf", "rtf", "epub", "fb2"];

/**
 * Routes "Ouvrir dans OnlyOffice" pour les fichiers SMB
 * (chemin parallèle au flow GED qui passe par un Document persisté).
 */
@Controller("fileserver/smb-office")
export class SmbOfficeController {
  private readonly logger = new Logger(SmbOfficeController.name);

  constructor(
    private readonly sessions: EphemeralSessionService,
    private readonly officeService: OfficeService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Crée une session éphémère pour le fichier SMB et renvoie une config OnlyOffice
   * prête à être passée à `DocsAPI.DocEditor`.
   */
  @Post("open")
  @UseGuards(JwtAuthGuard)
  async openFile(
    @Body() body: { path: string; mode?: "edit" | "view" },
    @CurrentUser() user: RequestUser,
  ) {
    if (!body?.path) {
      throw new BadRequestException('Le champ "path" est requis');
    }
    if (!this.officeService.isEnabled()) {
      throw new BadRequestException("OnlyOffice est désactivé côté backend");
    }

    const mode: "edit" | "view" = body.mode === "view" ? "view" : "edit";

    // Détermine l'extension et la capacité d'édition
    const fileNameRaw = body.path.replace(/\\/g, "/").split("/").pop() || "";
    const extMatch = fileNameRaw.match(/\.([^.]+)$/);
    const extension = extMatch ? extMatch[1]!.toLowerCase() : "";
    const isEditableFormat = EDITABLE_EXT.includes(extension);
    const isViewableFormat = VIEWABLE_EXT.includes(extension);
    if (!isEditableFormat && !isViewableFormat) {
      throw new BadRequestException(`Extension .${extension || "?"} non supportée par OnlyOffice`);
    }

    // Tous les utilisateurs ayant accès au partage peuvent éditer (l'autorisation
    // SMB est gérée par le serveur AD côté FileserverService). La distinction
    // viewer/editor reste utile pour les formats legacy non éditables.
    const canEdit = mode === "edit" && isEditableFormat;

    const { session, token } = this.sessions.createSession({
      rawPath: body.path,
      userId: user.id,
      userRole: user.role,
      canEdit,
    });

    // Construit la config OnlyOffice à la main (on ne peut pas réutiliser
    // buildEditorConfig qui exige un Document persisté en DB).
    const internalBackendUrl = (
      process.env.ONLYOFFICE_INTERNAL_URL ||
      process.env.APP_URL ||
      "http://localhost:3000"
    )
      .replace(/\/api\/?$/, "")
      .replace(/\/$/, "");

    const fileUrl = `${internalBackendUrl}/api/fileserver/smb-office/file/${session.sessionId}?token=${token}`;
    const callbackUrl = `${internalBackendUrl}/api/fileserver/smb-office/callback/${session.sessionId}?token=${token}`;

    const documentType = this.officeService.getDocumentType(extension);

    // Key OnlyOffice STABLE par session : le sessionId est unique par
    // ouverture, la clé ne doit pas dériver dans le temps (le minuteBucket
    // isolait chaque rechargement dans une session Docs Server distincte).
    // La session Docs Server est purgée explicitement via dropSession() au
    // callback final (status 2).
    const key = `smb-${session.sessionId}`;

    const config: any = {
      document: {
        fileType: extension,
        key,
        title: session.fileName,
        url: fileUrl,
        permissions: {
          edit: canEdit,
          download: true,
          print: true,
          review: canEdit,
          comment: canEdit,
        },
      },
      documentType,
      editorConfig: {
        mode: canEdit ? "edit" : "view",
        lang: "fr-FR",
        callbackUrl: canEdit ? callbackUrl : undefined,
        user: {
          id: user.id,
          name: `${user.firstName || ""} ${user.lastName || user.email}`.trim(),
        },
        customization: {
          autosave: true,
          forcesave: true,
          toolbarNoTabs: false,
          uiTheme: "theme-classic-light",
        },
      },
    };

    // Signe la config avec le secret partagé OnlyOffice si disponible
    const onlyofficeSecret = this.officeService.getJwtSecret();
    if (onlyofficeSecret) {
      config.token = this.jwtService.sign(config, {
        secret: onlyofficeSecret,
        expiresIn: "8h",
      });
    }

    return {
      sessionId: session.sessionId,
      documentServerUrl: this.officeService.getDocumentServerUrl(),
      canEdit,
      extension,
      fileName: session.fileName,
      config,
    };
  }

  /**
   * Endpoint PUBLIC appelé par OnlyOffice Docs Server pour télécharger le fichier.
   * Auth via le token JWT en query string (signé côté EphemeralSessionService).
   */
  @Public()
  @SkipThrottle()
  @Get("file/:sessionId")
  async downloadFile(
    @Param("sessionId") sessionId: string,
    @Query("token") token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException("Token manquant");
    }
    const tokenSessionId = this.sessions.verifyToken(token);
    if (!tokenSessionId || tokenSessionId !== sessionId) {
      throw new NotFoundException("Token invalide ou expiré");
    }

    const { buffer, fileName } = this.sessions.getFileBuffer(sessionId);
    this.logger.log(`[smb-office/file] streaming sessionId=${sessionId} bytes=${buffer.length}`);
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-cache",
      "Access-Control-Allow-Origin": "*",
      "Content-Length": buffer.length.toString(),
    });
    res.send(buffer);
  }

  /**
   * Endpoint PUBLIC : callback OnlyOffice. Statuts 2 et 6 → on télécharge le
   * fichier modifié depuis OnlyOffice et on le réécrit dans SMB.
   */
  @Public()
  @SkipThrottle()
  @Post("callback/:sessionId")
  @HttpCode(HttpStatus.OK)
  async handleCallback(
    @Param("sessionId") sessionId: string,
    @Query("token") token: string,
    @Body() body: any,
    @Req() req: Request,
  ): Promise<{ error: number }> {
    if (typeof token !== "string" || !token || token.length > 4096) {
      this.logger.warn(`[smb-office/callback] token manquant sessionId=${sessionId}`);
      return { error: 1 };
    }
    const tokenSessionId = this.sessions.verifyToken(token);
    if (!tokenSessionId || tokenSessionId !== sessionId) {
      this.logger.warn(`[smb-office/callback] token invalide sessionId=${sessionId}`);
      return { error: 1 };
    }

    // Vérification du JWT ENTRANT signé par le Docs Server (body.token ou
    // header Authorization) — le payload vérifié fait autorité sur le body.
    const verified = this.officeService.verifyIncomingCallbackJwt(
      body,
      req.headers.authorization as string | undefined,
    );
    if (!verified.ok) {
      this.logger.warn(
        `[smb-office/callback] JWT Docs Server rejeté sessionId=${sessionId} : ${verified.reason}`,
      );
      return { error: 1 };
    }
    const callbackData = verified.data;

    const status = callbackData?.status;
    // 1 = editing, 4 = closed no changes : pas d'action
    if (status !== 2 && status !== 6) {
      // 3 / 7 = save error
      if (status === 3 || status === 7) {
        this.logger.warn(
          `[smb-office/callback] OnlyOffice save error status=${status} session=${sessionId} body=${JSON.stringify(callbackData).slice(0, 400)}`,
        );
      }
      return { error: 0 };
    }

    const downloadUrl = callbackData?.url;
    if (typeof downloadUrl !== "string" || !downloadUrl) {
      this.logger.warn(`[smb-office/callback] pas d'URL de téléchargement sessionId=${sessionId}`);
      return { error: 1 };
    }

    // Anti-SSRF : le backend ne télécharge que depuis le Docs Server
    if (!this.officeService.isAllowedDownloadUrl(downloadUrl)) {
      this.logger.warn(
        `[smb-office/callback] origine ou chemin de téléchargement non autorisé sessionId=${sessionId}`,
      );
      return { error: 1 };
    }

    try {
      const buffer = await this.officeService.downloadCallbackFile(downloadUrl);
      this.sessions.saveFile(sessionId, buffer);
      this.logger.log(
        `[smb-office/callback] fichier sauvegardé sessionId=${sessionId} bytes=${buffer.length}`,
      );

      // Fin de session (status 2 = tous les éditeurs ont fermé) : purge du
      // cache Docs Server pour que la prochaine ouverture (nouveau sessionId,
      // nouvelle clé) reparte proprement.
      if (status === 2) {
        const sessionKey =
          typeof callbackData?.key === "string" && callbackData.key
            ? callbackData.key
            : `smb-${sessionId}`;
        void this.officeService.dropSession(sessionKey).catch(() => undefined);
      }
      return { error: 0 };
    } catch (err: any) {
      this.logger.error(
        `[smb-office/callback] échec sauvegarde sessionId=${sessionId} : ${err?.message || err}`,
      );
      return { error: 1 };
    }
  }
}
