import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { rowsToCsv, csvFilename, CsvColumn } from '../common/utils/csv-export';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SignaturesService } from './signatures.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { RequireFreshMfa } from '../mfa/decorators/require-fresh-mfa.decorator';

@Controller('signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
// Toutes les actions sur les signatures (template, soumission, signature) sont
// considérées sensibles : exigent une re-validation MFA récente (12 h max).
@RequireFreshMfa()
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  listTemplates() {
    return this.signaturesService.listTemplates();
  }

  @Get('submissions')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  listSubmissions() {
    return this.signaturesService.listSubmissions();
  }

  @Get('submissions/:submissionId')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  getSubmission(@Param('submissionId') submissionId: string) {
    return this.signaturesService.getSubmission(submissionId);
  }

  @Get('all')
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  listAllSignatureRequests() {
    return this.signaturesService.listAllSignatureRequests();
  }

  /**
   * CSV export of all signature requests (max 1000 rows).
   * ISO 27001 A.5.10 — export contrôlé.
   */
  @Get('export/csv')
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  async exportCsv(
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ) {
    const all = await this.signaturesService.listAllSignatureRequests();
    const filtered = status
      ? all.filter((r: { status: string }) => r.status === status)
      : all;

    type Row = {
      status: string;
      createdAt: Date | string;
      signedAt: Date | string | null;
      signer: { firstName: string; lastName: string; email: string } | null;
      requestedBy: { firstName: string; lastName: string; email: string } | null;
      documentVersion: {
        versionNumber?: string | null;
        document: { title: string; reference: string };
      };
    };

    const columns: CsvColumn<Row>[] = [
      { header: 'Document', accessor: (r) => r.documentVersion.document.title },
      { header: 'Référence', accessor: (r) => r.documentVersion.document.reference },
      { header: 'Version', accessor: (r) => r.documentVersion.versionNumber ?? '' },
      { header: 'Statut', accessor: (r) => r.status },
      {
        header: 'Signataire',
        accessor: (r) =>
          r.signer ? `${r.signer.firstName} ${r.signer.lastName}` : '',
      },
      { header: 'Email signataire', accessor: (r) => r.signer?.email ?? '' },
      {
        header: 'Demandé par',
        accessor: (r) =>
          r.requestedBy
            ? `${r.requestedBy.firstName} ${r.requestedBy.lastName}`
            : '',
      },
      {
        header: 'Demandé le',
        accessor: (r) =>
          r.createdAt ? new Date(r.createdAt).toISOString() : '',
      },
      {
        header: 'Signé le',
        accessor: (r) =>
          r.signedAt ? new Date(r.signedAt).toISOString() : '',
      },
    ];

    const csv = rowsToCsv<Row>(filtered.slice(0, 1000) as Row[], columns);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('signatures')}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(csv);
  }

  @Post('request')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  createRequest(
    @Body() dto: CreateSignatureDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signaturesService.createSignatureRequest(
      dto.documentVersionId,
      dto.signerId,
      user.id,
      dto.templateId,
    );
  }

  @Get('my')
  getMySignatures(@CurrentUser() user: RequestUser) {
    return this.signaturesService.getMySignatures(user.id);
  }

  @Patch(':id/sign')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async signDirectly(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    // Verify the user is the signer
    const sig = await this.signaturesService.getStatus(id);
    if (sig.signerId !== user.id) {
      throw new ForbiddenException('Seul le signataire désigné peut signer');
    }
    return this.signaturesService.signDirectly(id, user.id);
  }

  @Get(':id')
  @Roles(UserRole.COLLABORATEUR)
  getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.signaturesService.getStatus(id);
  }

  @Get('document/:documentId')
  @Roles(UserRole.COLLABORATEUR)
  getByDocument(@Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.signaturesService.getByDocument(documentId);
  }
}
