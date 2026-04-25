import {
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { RssiDashboardService } from './rssi-dashboard.service';
import { RssiSmsiPdfGenerator } from './pdf-generator';

/**
 * Dashboard consolidé pour le RSSI : endpoints granulaires pour
 * la refonte du tableau de bord (cyber-score, état SMSI, tendance,
 * conformité, indicateurs ops) + génération du PDF SMSI ISO 27001.
 */
@Controller('rssi-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN)
export class RssiDashboardController {
  private readonly logger = new Logger(RssiDashboardController.name);

  constructor(
    private readonly service: RssiDashboardService,
    private readonly pdf: RssiSmsiPdfGenerator,
  ) {}

  @Get('snapshot')
  getSnapshot() {
    return this.service.getSnapshot();
  }

  @Get('smsi-state')
  getSmsiState() {
    return this.service.getSmsiState();
  }

  @Get('incidents-trend')
  getIncidentTrend() {
    return this.service.getIncidentTrend();
  }

  @Get('compliance-progress')
  getComplianceProgress() {
    return this.service.getComplianceProgress();
  }

  @Get('indicators')
  getOperationalIndicators() {
    return this.service.getOperationalIndicators();
  }

  /**
   * Génère le rapport SMSI ISO 27001 (9 chapitres) signé SHA-256.
   * Réservé ADMIN / SUPER_ADMIN.
   */
  @Post('report.pdf')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async generateReport(@Req() req: Request, @Res() res: Response) {
    const user = (req as any).user as
      | {
          email?: string;
          firstName?: string;
          lastName?: string;
        }
      | undefined;
    const author = user
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
        user.email ||
        'RSSI'
      : 'RSSI';

    const result = await this.pdf.generate({
      author,
      authorEmail: user?.email,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.setHeader('X-Export-Id', result.exportId);
    res.setHeader('X-Export-Hash', result.hash);
    res.setHeader('X-Generated-At', result.generatedAt);
    res.send(result.buffer);
    this.logger.log(
      `[smsi-pdf] sent export=${result.exportId} to=${author} bytes=${result.buffer.byteLength}`,
    );
  }
}
