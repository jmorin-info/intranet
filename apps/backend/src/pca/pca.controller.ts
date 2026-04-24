import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { PcaService } from './pca.service';

/**
 * PCA / Plan de Continuité d'Activité — endpoints ISO 27001 A.5.30.
 *
 * Réservé aux SUPER_ADMIN : déclencher un test impacte (même non
 * destructivement) des ressources sensibles (lecture du répertoire des
 * backups, exécution de scripts shell privilégiés…).
 */
@Controller('pca')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PcaController {
  constructor(private readonly pca: PcaService) {}

  @Get('scenarios')
  listScenarios() {
    return this.pca.listScenarios();
  }

  @Get('schedule')
  listSchedule() {
    return this.pca.listScheduledJobs();
  }

  @Get('kpis')
  async kpis() {
    return this.pca.getKpis();
  }

  @Get('runs')
  async listRuns(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('scenarioId') scenarioId?: string,
  ) {
    return this.pca.listRuns({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      scenarioId,
    });
  }

  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    return this.pca.getRun(id);
  }

  @Get('runs/:id/logs')
  async getRunLogs(@Param('id') id: string) {
    return this.pca.getRunLogs(id);
  }

  @Post('runs')
  async startRun(
    @Body() body: { scenarioId: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Headers('x-confirm') confirmHeader?: string,
  ) {
    return this.pca.startRun({
      scenarioId: body.scenarioId,
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      confirmHeader,
    });
  }
}
