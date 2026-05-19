import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { DocumentsService } from "./documents.service";
import { StorageService } from "../storage/storage.service";
import {
  CreateDocumentDto,
  UpdateInlineContentDto,
} from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { DocumentFiltersDto } from "./dto/document-filters.dto";
import { BulkClassificationDto, BulkIdsDto } from "../common/dto/bulk-ids.dto";
import { rowsToCsv, csvFilename, CsvColumn } from "../common/utils/csv-export";
import { RequestUser } from "../common/interfaces";
import { UserRole, ROLE_HIERARCHY } from "../common/enums";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

/**
 * Build a download-friendly filename preserving the *last* extension.
 *
 * Bug fix : auparavant, on utilisait `result.fileName.split('/').pop()` qui
 * renvoyait le nom interne du storage (ex. `<uuid>.md`). Le client voyait
 * donc un UUID sans rapport avec son document. Pire, si la `reference` du
 * document contenait des points (ex. `OMS-PRO-IT-0006-v1.0`), un naïf
 * `split('.')[0]` côté client tronquait `.md`.
 *
 * On construit désormais un nom lisible :
 *   <reference>-v<version>.<ext>
 * où <ext> vient du chemin réel (path.extname → garde le DERNIER point) et
 * fallback sur `bin` si introuvable.
 */
function buildDownloadFilename(
  reference: string,
  versionNumber: string | number | null | undefined,
  storageFilePath: string,
): string {
  const segment = storageFilePath.split("/").pop() || "";
  const ext = path.extname(segment).replace(/^\./, "") || "bin";
  const safeRef = (reference || "document").replace(/[\\/:*?"<>|]/g, "_");
  const v = versionNumber != null ? String(versionNumber) : "1";
  return `${safeRef}-v${v}.${ext}`;
}

@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
  ) {}

  @Get("templates")
  @Roles(UserRole.COLLABORATEUR)
  getTemplates() {
    return [
      {
        id: "policy",
        titlePrefix: "Politique de sécurité",
        category: "POLICY",
        classificationDefault: "CONFIDENTIEL",
        description:
          "Définit les règles et orientations de sécurité de l'information conformément à la norme ISO 27001 (A.5.1).",
      },
      {
        id: "procedure",
        titlePrefix: "Procédure opérationnelle",
        category: "PROCEDURE",
        classificationDefault: "INTERNE",
        description:
          "Décrit les étapes d'un processus opérationnel ou de contrôle de sécurité (ISO 27001 A.8).",
      },
      {
        id: "plan",
        titlePrefix: "Plan de continuité",
        category: "PLAN",
        classificationDefault: "CONFIDENTIEL",
        description:
          "Plan de continuité d'activité ou de reprise après sinistre (ISO 27001 A.5.30).",
      },
      {
        id: "report",
        titlePrefix: "Rapport d'audit",
        category: "REPORT",
        classificationDefault: "CONFIDENTIEL",
        description:
          "Rapport issu d'un audit interne ou externe de sécurité (ISO 27001 A.9.2).",
      },
      {
        id: "guide",
        titlePrefix: "Guide utilisateur",
        category: "GUIDE",
        classificationDefault: "PUBLIC",
        description:
          "Guide de sensibilisation ou d'utilisation destiné aux collaborateurs (ISO 27001 A.6.3).",
      },
    ];
  }

  @Get()
  @Roles(UserRole.COLLABORATEUR)
  findAll(
    @Query() filters: DocumentFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.findAll(filters, user);
  }

  @Get("statistics")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  getStatistics() {
    return this.documentsService.getStatistics();
  }

  /**
   * CSV export of the filtered document list (max 1000 rows).
   * ISO 27001 A.5.10 — export contrôlé (traçabilité + anti-injection).
   */
  @Get("export/csv")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  async exportCsv(
    @Query() filters: DocumentFiltersDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const result = await this.documentsService.findAll(
      { ...filters, page: "1", limit: "1000" },
      user,
    );
    const rows = result.data;

    type DocRow = {
      reference: string;
      title: string;
      category: string;
      classification: string | null;
      status: string;
      owner?: { firstName: string; lastName: string } | null;
      createdAt: Date | string;
    };

    const columns: CsvColumn<DocRow>[] = [
      { header: "Référence", accessor: (d) => d.reference },
      { header: "Titre", accessor: (d) => d.title },
      { header: "Catégorie", accessor: (d) => d.category },
      { header: "Classification", accessor: (d) => d.classification ?? "" },
      { header: "Statut", accessor: (d) => d.status },
      {
        header: "Propriétaire",
        accessor: (d) =>
          d.owner ? `${d.owner.firstName} ${d.owner.lastName}` : "",
      },
      {
        header: "Créé le",
        accessor: (d) =>
          d.createdAt ? new Date(d.createdAt).toISOString().split("T")[0] : "",
      },
    ];

    const csv = rowsToCsv<DocRow>(rows as DocRow[], columns);

    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("documents")}"`,
      "Cache-Control": "private, no-store",
    });
    res.send(csv);
  }

  /**
   * Bulk soft-delete multiple documents at once (max 100).
   * Only ADMIN / SUPER_ADMIN.
   */
  @Post("bulk/delete")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  bulkDelete(@Body() dto: BulkIdsDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.bulkSoftDelete(dto.ids, user);
  }

  /**
   * Bulk archive (set status = ARCHIVED) — ADMIN / SUPER_ADMIN only.
   * ISO 27001 A.5.10 — controlled bulk modification with audit trail.
   */
  @Post("bulk/archive")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  bulkArchive(@Body() dto: BulkIdsDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.bulkArchive(dto.ids, user);
  }

  /**
   * Bulk reclassify — ADMIN / SUPER_ADMIN only.
   * ISO 27001 A.5.12 — information classification change with audit trail.
   */
  @Post("bulk/classify")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  bulkClassify(
    @Body() dto: BulkClassificationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.bulkClassify(
      dto.ids,
      dto.classification,
      user,
    );
  }

  @Get(":id/history")
  @Roles(UserRole.COLLABORATEUR)
  async getHistory(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.getHistory(id, user);
  }

  @Get(":id/related")
  @Roles(UserRole.COLLABORATEUR)
  findRelated(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query("limit") limit?: string,
  ) {
    return this.documentsService.findRelated(
      id,
      limit ? parseInt(limit, 10) : 5,
      user,
    );
  }

  @Get(":id")
  @Roles(UserRole.COLLABORATEUR)
  findById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.findById(id, user);
  }

  @Post()
  @Roles(
    UserRole.ADMIN,
    UserRole.REVIEWER,
    UserRole.SUPER_ADMIN,
    UserRole.DIRECTION,
  )
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.create(dto, user.id);
  }

  /**
   * Create a document and publish it immediately (status = APPROVED) without
   * going through the review/approval workflow. For permanent documents that
   * don't require validation (info notes, shared references).
   * Reserved to ADMIN+ since it bypasses the 4-eyes principle.
   */
  @Post("direct-publish")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  async directPublish(
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.directPublish(dto, user);
  }

  /**
   * Force-approve an EXISTING document : transitions it straight to APPROVED
   * regardless of its current status (DRAFT / IN_REVIEW / etc.) and cancels
   * any pending workflow. Used for permanent docs whose author missed the
   * direct-publish checkbox at creation. ADMIN+ only, audit logged WARN.
   */
  @Post(":id/force-approve")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  async forceApprove(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { makePermanent?: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.forceApprove(
      id,
      user,
      body?.makePermanent ?? false,
    );
  }

  /**
   * Réouvre un document ARCHIVED ou OBSOLETE en le remettant en DRAFT.
   * Utilisé quand il faut produire une nouvelle version d'un document qui
   * était archivé ou marqué obsolète. Le propriétaire ou un ADMIN peut le faire.
   * Après réouverture, un nouvel upload de version peut être effectué via
   * /documents/:id/versions, et le workflow repartira à zéro.
   */
  @Post(":id/reopen")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reopen(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.reopenDocument(id, user);
  }

  /**
   * Create a document authored inline (HTML content directly in the intranet,
   * no file upload). ISO 27001 A.5.1 — full GED traceability.
   */
  @Post("inline")
  @Roles(
    UserRole.ADMIN,
    UserRole.REVIEWER,
    UserRole.SUPER_ADMIN,
    UserRole.DIRECTION,
  )
  createInline(
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.createInline(dto, user.id);
  }

  /**
   * Update the inline HTML content of a native document.
   * Only the owner, assigned reviewer, or ADMIN+ may edit,
   * and only while the document is in DRAFT or IN_REVIEW.
   */
  @Patch(":id/content")
  @Roles(UserRole.COLLABORATEUR)
  updateInlineContent(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateInlineContentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.updateInlineContent(id, dto.content, user);
  }

  @Patch(":id")
  @Roles(
    UserRole.ADMIN,
    UserRole.REVIEWER,
    UserRole.SUPER_ADMIN,
    UserRole.DIRECTION,
  )
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.update(id, dto, user);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  softDelete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.softDelete(id, user);
  }

  @Post(":id/versions")
  @Roles(
    UserRole.ADMIN,
    UserRole.REVIEWER,
    UserRole.SUPER_ADMIN,
    UserRole.DIRECTION,
  )
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }),
  )
  uploadVersion(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("changeLog") changeLog: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException("Fichier requis");
    return this.documentsService.uploadVersion(id, file, changeLog, user.id);
  }

  @Get(":id/versions")
  @Roles(UserRole.COLLABORATEUR)
  getVersions(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.getVersions(id, user);
  }

  /**
   * Réimport d'un document obsolète : crée une nouvelle version
   * sans supprimer les anciens hash, le document repasse en DRAFT.
   * ISO 27001 A.5.28 — préservation des preuves.
   */
  @Post(":id/reimport")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.REVIEWER,
    UserRole.DIRECTION,
  )
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }),
  )
  async reimportObsolete(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("changeLog") changeLog: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException("Fichier requis");
    return this.documentsService.reimportObsolete(id, file, changeLog, user.id);
  }

  /** Shortcut: download latest version of a document */
  @Get(":id/download")
  @Roles(UserRole.COLLABORATEUR)
  async downloadLatest(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query("inline") inline: string,
    @Query("raw") raw: string,
    @Res() res: Response,
  ) {
    // Find latest version
    const versions = await this.documentsService.getVersions(id, user);
    if (!versions || versions.length === 0)
      throw new NotFoundException("Aucune version disponible");
    const latestVersionId = versions[0].id;
    await this.streamWatermarkedDocument(
      id,
      latestVersionId,
      user,
      inline,
      raw,
      res,
    );
  }

  @Get(":id/versions/:versionId/download")
  @Roles(UserRole.COLLABORATEUR)
  async downloadVersion(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @CurrentUser() user: RequestUser,
    @Query("inline") inline: string,
    @Query("raw") raw: string,
    @Res() res: Response,
  ) {
    await this.streamWatermarkedDocument(id, versionId, user, inline, raw, res);
  }

  /**
   * Stream a document version to the client, applying a universal watermark
   * to PDFs for traceability (ISO 27001 A.5.12 / A.5.13).
   *
   * The watermark carries the user email, the ISO-8601 timestamp, the
   * document classification and the OMNITECH branding. It is applied on
   * EVERY page (header + footer) to deter partial screenshots, and
   * covers every authenticated user (including ADMIN) since insider
   * exfiltration must be traceable as well.
   *
   * An opt-out (?raw=true) is reserved to SUPER_ADMIN only, for
   * legitimate use-cases such as backup export or migration.
   */
  private async streamWatermarkedDocument(
    id: string,
    versionId: string,
    user: RequestUser,
    inline: string,
    raw: string,
    res: Response,
  ): Promise<void> {
    const result = await this.documentsService.getDownloadUrl(
      id,
      versionId,
      user,
    );
    const filePath = this.storageService.getFilePath(result.fileName);

    if (!fs.existsSync(filePath))
      throw new NotFoundException("File not found on disk");

    // Friendly filename based on the document reference + version + real
    // extension (preserves `.md`, `.pdf`, etc. — does NOT split on first dot).
    const filename = buildDownloadFilename(
      result.documentReference,
      result.versionNumber,
      result.fileName,
    );
    const disposition = inline === "true" ? "inline" : "attachment";
    const isPdf =
      !!result.fileType?.includes("pdf") ||
      filename.toLowerCase().endsWith(".pdf");

    // Opt-out RAW stream — reserved to SUPER_ADMIN (ISO 27001 A.5.15 ségrégation)
    // Used for backup export / migration / legal discovery.
    const userLevel = ROLE_HIERARCHY[user.role as UserRole] ?? 0;
    const isSuperAdmin = userLevel >= ROLE_HIERARCHY[UserRole.SUPER_ADMIN];
    const rawRequested = raw === "true" && isSuperAdmin;

    // Retrieve classification from document meta (fallback INTERNE)
    let classification = "INTERNE";
    try {
      const doc = await this.documentsService.findById(id, user);
      const cls = doc?.classification;
      if (typeof cls === "string" && cls.length > 0)
        classification = cls.toUpperCase();
    } catch {
      // ignore — stick to fallback
    }

    // Universal watermark on PDF for every user (ISO 27001 A.5.12 — traçabilité)
    if (isPdf && !rawRequested) {
      try {
        const pdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes, {
          ignoreEncryption: true,
        });
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();

        const timestamp =
          new Date().toISOString().replace("T", " ").split(".")[0] + "Z";
        const dateOnly = timestamp.split(" ")[0];
        const watermarkFoot = `OMNITECH SECURITY — ${user.email} — ${timestamp}`;
        const classificationLabel = `OMNITECH SECURITY — DOCUMENT ${classification}`;

        // Diagonal centred mark for the classification (deters partial screenshots)
        // Color shifts with classification to give it a visual signature.
        const classColor =
          classification === "SECRET"
            ? rgb(0.85, 0.15, 0.15)
            : classification === "CONFIDENTIEL"
              ? rgb(0.8, 0.5, 0.1)
              : classification === "INTERNE"
                ? rgb(0.35, 0.45, 0.65)
                : rgb(0.55, 0.65, 0.55); // PUBLIC

        for (const page of pages) {
          const { width, height } = page.getSize();

          // Footer (user + timestamp ISO)
          page.drawText(watermarkFoot, {
            x: 30,
            y: 15,
            size: 7,
            font,
            color: rgb(0.55, 0.55, 0.55),
            opacity: 0.6,
          });
          // Top right classification
          page.drawText(classificationLabel, {
            x: Math.max(30, width - 280),
            y: height - 15,
            size: 7,
            font,
            color: classColor,
            opacity: 0.6,
          });
          // Top left repeated mark with date
          page.drawText(`${user.email} · ${dateOnly}`, {
            x: 30,
            y: height - 15,
            size: 6,
            font,
            color: rgb(0.55, 0.55, 0.55),
            opacity: 0.5,
          });
          // Diagonal classification stamp (mid page) — only for non-PUBLIC
          if (classification !== "PUBLIC") {
            page.drawText(`[${classification}]`, {
              x: width / 2 - 60,
              y: height / 2,
              size: 42,
              font,
              color: classColor,
              opacity: 0.08,
              rotate: degrees(30),
            });
          }
        }

        const watermarkedBytes = await pdfDoc.save();
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Length": String(watermarkedBytes.length),
          "Cache-Control": "private, no-store",
          "X-Watermark": `classification=${classification};user=${encodeURIComponent(user.email)}`,
        });
        res.end(Buffer.from(watermarkedBytes));
        return;
      } catch {
        // Fallback to raw file if watermarking fails (preserves availability)
      }
    }

    // Stream raw file (non-PDF, or raw=true opt-out for SUPER_ADMIN)
    const stream = this.storageService.getFileStream(result.fileName);
    res.set({
      "Content-Type": result.fileType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=3600",
      ...(rawRequested ? { "X-Raw-Export": "super-admin" } : {}),
    });
    stream.pipe(res);
  }
}
