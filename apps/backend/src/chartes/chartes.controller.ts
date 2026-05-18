import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  NotFoundException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  ParseUUIDPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ChartesService } from "./chartes.service";
import { CharteExemptionsService } from "./charte-exemptions.service";
import { StorageService } from "../storage/storage.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";

@Controller("chartes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChartesController {
  constructor(
    private readonly chartesService: ChartesService,
    private readonly exemptionsService: CharteExemptionsService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    // On passe userId pour que chaque charte embarque `signedAt` (date de
    // signature par l'utilisateur courant) — évite l'affichage "À signer"
    // erroné dans /profile quand la charte est déjà signée.
    return this.chartesService.findAll(true, user.id);
  }

  @Get("unsigned")
  getUnsigned(@CurrentUser() user: RequestUser) {
    return this.chartesService.getUnsignedChartes(user.id);
  }

  @Get("status")
  async getStatus(@CurrentUser() user: RequestUser) {
    const allSigned = await this.chartesService.hasSignedAllChartes(user.id);
    return { allSigned };
  }

  @Post("from-document")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createFromDocument(
    @Body() body: { documentId: string; slug: string; isMandatory?: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.chartesService.createFromDocument(
      body.documentId,
      body.slug,
      body.isMandatory ?? true,
      user.id,
    );
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(
    @Body()
    body: {
      title: string;
      slug: string;
      isMandatory?: boolean;
      classification?: string;
    },
  ) {
    return this.chartesService.create(body);
  }

  @Post(":id/versions")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTION)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== "application/pdf") {
          cb(new Error("Seuls les fichiers PDF sont acceptés"), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  uploadVersion(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { versionNumber: string; changeLog?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.chartesService.uploadVersion(
      id,
      file,
      body.versionNumber,
      body.changeLog,
      user.id,
    );
  }

  @Patch(":id/direction-sign")
  @Roles(UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  markSignedByDirection(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chartesService.markSignedByDirection(id, user.id);
  }

  @Post(":id/sign")
  sign(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.chartesService.sign(
      id,
      user.id,
      req.ip || "",
      req.headers["user-agent"] || "",
    );
  }

  @Get(":id/signatures")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getSignatures(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("versionId") versionId?: string,
  ) {
    return this.chartesService.getSignatures(id, versionId);
  }

  @Get(":id/compliance")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getComplianceReport(@Param("id", ParseUUIDPipe) id: string) {
    return this.chartesService.getComplianceReport(id);
  }

  // Stream the active version PDF for a charte (authenticated users)
  @Get(":id/pdf")
  async streamPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const charteData = await this.chartesService.getCharteById(id);
    if (!charteData) throw new NotFoundException("Charte not found");

    const activeVersion = charteData.versions?.find(
      (v: { isActive: boolean }) => v.isActive,
    );
    if (!activeVersion)
      throw new NotFoundException("No active version for this charte");

    try {
      const stream = this.storageService.getFileStream(activeVersion.fileUrl);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${charteData.slug}-v${activeVersion.versionNumber}.pdf"`,
        "Cache-Control": "private, max-age=300",
      });
      stream.pipe(res);
    } catch {
      throw new NotFoundException("PDF file not found on storage");
    }
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chartesService.remove(id, user.id);
  }

  /**
   * Envoie une notification SIGNATURE_REMINDER à tous les non-signataires
   * actifs (en excluant ceux ayant une exemption active).
   * Retourne { sent, exempted, total } pour feedback UI.
   */
  @Post(":id/remind")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async remindUnsigned(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chartesService.remindUnsigned(id, user.id);
  }

  // -------------------------------------------------------------------------
  // Exemptions — retirer/redonner l'obligation de signature à une personne
  // sans toucher au statut "mandatory" de la charte ni aux autres signataires.
  // ISO 27001 A.5.34 — chaque action est tracée (audit log).
  // -------------------------------------------------------------------------

  @Get(":id/exemptions")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listExemptions(@Param("id", ParseUUIDPipe) id: string) {
    return this.exemptionsService.listForCharte(id);
  }

  @Post(":id/exemptions")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  grantExemption(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { userId: string; reason: string; expiresAt?: string | null },
    @CurrentUser() user: RequestUser,
  ) {
    return this.exemptionsService.grant({
      charteId: id,
      userId: body.userId,
      reason: body.reason,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      grantedById: user.id,
    });
  }

  @Delete(":id/exemptions/:exemptionId")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  revokeExemption(
    @Param("id", ParseUUIDPipe) _charteId: string,
    @Param("exemptionId", ParseUUIDPipe) exemptionId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.exemptionsService.revoke({
      exemptionId,
      revokedById: user.id,
      revokeReason: body?.reason,
    });
  }

  // :slug route MUST be last to avoid matching static routes like 'unsigned', 'status'
  @Get(":slug")
  findBySlug(@Param("slug") slug: string) {
    return this.chartesService.findBySlug(slug);
  }
}
