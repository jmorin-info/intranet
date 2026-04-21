import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Res,
  UseGuards, UseInterceptors, UploadedFile, ParseUUIDPipe, NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';
import { StorageService } from '../storage/storage.service';
import { CreateDocumentDto, UpdateInlineContentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentFiltersDto } from './dto/document-filters.dto';
import { BulkClassificationDto, BulkIdsDto } from '../common/dto/bulk-ids.dto';
import { rowsToCsv, csvFilename, CsvColumn } from '../common/utils/csv-export';
import { RequestUser } from '../common/interfaces';
import { UserRole, ROLE_HIERARCHY } from '../common/enums';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
  ) {}

  @Get('templates')
  getTemplates() {
    return [
      {
        id: 'policy',
        titlePrefix: 'Politique de sécurité',
        category: 'POLICY',
        classificationDefault: 'CONFIDENTIEL',
        description: 'Définit les règles et orientations de sécurité de l\'information conformément à la norme ISO 27001 (A.5.1).',
      },
      {
        id: 'procedure',
        titlePrefix: 'Procédure opérationnelle',
        category: 'PROCEDURE',
        classificationDefault: 'INTERNE',
        description: 'Décrit les étapes d\'un processus opérationnel ou de contrôle de sécurité (ISO 27001 A.8).',
      },
      {
        id: 'plan',
        titlePrefix: 'Plan de continuité',
        category: 'PLAN',
        classificationDefault: 'CONFIDENTIEL',
        description: 'Plan de continuité d\'activité ou de reprise après sinistre (ISO 27001 A.5.30).',
      },
      {
        id: 'report',
        titlePrefix: 'Rapport d\'audit',
        category: 'REPORT',
        classificationDefault: 'CONFIDENTIEL',
        description: 'Rapport issu d\'un audit interne ou externe de sécurité (ISO 27001 A.9.2).',
      },
      {
        id: 'guide',
        titlePrefix: 'Guide utilisateur',
        category: 'GUIDE',
        classificationDefault: 'PUBLIC',
        description: 'Guide de sensibilisation ou d\'utilisation destiné aux collaborateurs (ISO 27001 A.6.3).',
      },
    ];
  }

  @Get()
  findAll(@Query() filters: DocumentFiltersDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.findAll(filters, user);
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  getStatistics() {
    return this.documentsService.getStatistics();
  }

  /**
   * CSV export of the filtered document list (max 1000 rows).
   * ISO 27001 A.5.10 — export contrôlé (traçabilité + anti-injection).
   */
  @Get('export/csv')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  async exportCsv(
    @Query() filters: DocumentFiltersDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const result = await this.documentsService.findAll(
      { ...filters, page: '1', limit: '1000' },
      user,
    );
    const rows = Array.isArray(result)
      ? (result as any[])
      : ((result as any)?.data ?? []);

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
      { header: 'Référence', accessor: (d) => d.reference },
      { header: 'Titre', accessor: (d) => d.title },
      { header: 'Catégorie', accessor: (d) => d.category },
      { header: 'Classification', accessor: (d) => d.classification ?? '' },
      { header: 'Statut', accessor: (d) => d.status },
      {
        header: 'Propriétaire',
        accessor: (d) =>
          d.owner ? `${d.owner.firstName} ${d.owner.lastName}` : '',
      },
      {
        header: 'Créé le',
        accessor: (d) =>
          d.createdAt ? new Date(d.createdAt).toISOString().split('T')[0] : '',
      },
    ];

    const csv = rowsToCsv<DocRow>(rows as DocRow[], columns);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('documents')}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(csv);
  }

  /**
   * Bulk soft-delete multiple documents at once (max 100).
   * Only ADMIN / SUPER_ADMIN.
   */
  @Post('bulk/delete')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  bulkDelete(@Body() dto: BulkIdsDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.bulkSoftDelete(dto.ids, user);
  }

  /**
   * Bulk archive (set status = ARCHIVED) — ADMIN / SUPER_ADMIN only.
   * ISO 27001 A.5.10 — controlled bulk modification with audit trail.
   */
  @Post('bulk/archive')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  bulkArchive(@Body() dto: BulkIdsDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.bulkArchive(dto.ids, user);
  }

  /**
   * Bulk reclassify — ADMIN / SUPER_ADMIN only.
   * ISO 27001 A.5.12 — information classification change with audit trail.
   */
  @Post('bulk/classify')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  bulkClassify(
    @Body() dto: BulkClassificationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.bulkClassify(dto.ids, dto.classification, user);
  }

  @Get(':id/history')
  async getHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.getHistory(id, user);
  }

  @Get(':id/related')
  findRelated(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    return this.documentsService.findRelated(id, limit ? parseInt(limit, 10) : 5, user);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.findById(id, user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.create(dto, user.id);
  }

  /**
   * Create a document and publish it immediately (status = APPROVED) without
   * going through the review/approval workflow. For permanent documents that
   * don't require validation (info notes, shared references).
   * Reserved to ADMIN+ since it bypasses the 4-eyes principle.
   */
  @Post('direct-publish')
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
  @Post(':id/force-approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  async forceApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { makePermanent?: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.forceApprove(id, user, body?.makePermanent ?? false);
  }

  /**
   * Réouvre un document ARCHIVED ou OBSOLETE en le remettant en DRAFT.
   * Utilisé quand il faut produire une nouvelle version d'un document qui
   * était archivé ou marqué obsolète. Le propriétaire ou un ADMIN peut le faire.
   * Après réouverture, un nouvel upload de version peut être effectué via
   * /documents/:id/versions, et le workflow repartira à zéro.
   */
  @Post(':id/reopen')
  async reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.reopenDocument(id, user);
  }

  /**
   * Create a document authored inline (HTML content directly in the intranet,
   * no file upload). ISO 27001 A.5.1 — full GED traceability.
   */
  @Post('inline')
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
  @Patch(':id/content')
  updateInlineContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInlineContentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.updateInlineContent(id, dto.content, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  softDelete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.softDelete(id, user);
  }

  @Post(':id/versions')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }))
  uploadVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('changeLog') changeLog: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Fichier requis');
    return this.documentsService.uploadVersion(id, file, changeLog, user.id);
  }

  @Get(':id/versions')
  getVersions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.getVersions(id, user);
  }

  /**
   * Réimport d'un document obsolète : crée une nouvelle version
   * sans supprimer les anciens hash, le document repasse en DRAFT.
   * ISO 27001 A.5.28 — préservation des preuves.
   */
  @Post(':id/reimport')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER, UserRole.DIRECTION)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }))
  async reimportObsolete(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('changeLog') changeLog: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Fichier requis');
    return this.documentsService.reimportObsolete(id, file, changeLog, user.id);
  }

  /** Shortcut: download latest version of a document */
  @Get(':id/download')
  async downloadLatest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    // Find latest version
    const versions = await this.documentsService.getVersions(id, user);
    if (!versions || versions.length === 0) throw new NotFoundException('Aucune version disponible');
    const latestVersionId = versions[0].id;
    const result = await this.documentsService.getDownloadUrl(id, latestVersionId, user);
    const filePath = this.storageService.getFilePath(result.fileName);
    if (!require('fs').existsSync(filePath)) throw new NotFoundException('File not found on disk');
    const filename = result.fileName.split('/').pop() || 'document';
    const disposition = inline === 'true' ? 'inline' : 'attachment';
    res.set({ 'Content-Type': result.fileType || 'application/octet-stream', 'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"` });
    require('fs').createReadStream(filePath).pipe(res);
  }

  @Get(':id/versions/:versionId/download')
  async downloadVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: RequestUser,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const result = await this.documentsService.getDownloadUrl(id, versionId, user);
    const filePath = this.storageService.getFilePath(result.fileName);

    if (!fs.existsSync(filePath)) throw new NotFoundException('File not found on disk');

    const filename = result.fileName.split('/').pop() || 'document';
    const disposition = inline === 'true' ? 'inline' : 'attachment';
    const isPdf = result.fileType?.includes('pdf');
    const userLevel = ROLE_HIERARCHY[user.role as UserRole] ?? 0;
    const isAdmin = userLevel >= ROLE_HIERARCHY[UserRole.ADMIN];

    // Watermark PDF for non-admin users (ISO 27001 A.5.12 — traçabilité)
    if (isPdf && !isAdmin) {
      try {
        const pdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();
        const watermarkText = `OMNITECH SECURITY — ${user.email} — ${new Date().toISOString().split('T')[0]}`;

        for (const page of pages) {
          const { width } = page.getSize();
          // Bottom watermark with user email + date
          page.drawText(watermarkText, {
            x: 30, y: 15,
            size: 7, font,
            color: rgb(0.7, 0.7, 0.7),
            opacity: 0.5,
          });
          // Top right classification
          page.drawText('OMNITECH SECURITY — DOCUMENT CONFIDENTIEL', {
            x: width - 280, y: 15,
            size: 6, font,
            color: rgb(0.8, 0.8, 0.8),
            opacity: 0.4,
          });
        }

        const watermarkedBytes = await pdfDoc.save();
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${disposition}; filename="${filename}"`,
          'Content-Length': String(watermarkedBytes.length),
          'Cache-Control': 'private, no-cache',
        });
        res.end(Buffer.from(watermarkedBytes));
        return;
      } catch {
        // Fallback to raw file if watermarking fails
      }
    }

    // Stream raw file (admin or non-PDF)
    const stream = this.storageService.getFileStream(result.fileName);
    res.set({
      'Content-Type': result.fileType || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    stream.pipe(res);
  }
}
