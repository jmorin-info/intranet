import { Body, Controller, Logger, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/interfaces';
import { SignedPdfService, SignedPdfInput } from './signed-pdf.service';

interface GeneratePdfDto {
  title: string;
  subtitle?: string;
  sections: SignedPdfInput['sections'];
  reference?: string;
  context?: string;
}

@Controller('exports')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  private readonly logger = new Logger(ExportsController.name);
  constructor(private readonly signedPdf: SignedPdfService) {}

  /**
   * Génère un PDF signé (hash SHA-256 + UUID + timestamp + métadonnées) à
   * partir de contenu structuré envoyé depuis n'importe quelle page de
   * l'intranet (rapport d'audit, procès-verbal, revue de gestion, etc.).
   *
   * Limite de taille : 1 Mo de payload JSON (validation implicite via
   * NestJS global body-parser).
   */
  @Post('pdf')
  async exportPdf(
    @Body() dto: GeneratePdfDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const result = await this.signedPdf.generate({
      title: dto.title,
      subtitle: dto.subtitle,
      sections: dto.sections || [],
      metadata: {
        author:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
          user.email,
        authorEmail: user.email,
        reference: dto.reference,
        context: dto.context,
      },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'X-Export-Id': result.exportId,
      'X-Export-Hash': result.hash,
      'X-Export-GeneratedAt': result.generatedAt,
      'Cache-Control': 'private, no-store',
    });
    res.send(result.buffer);
  }
}
