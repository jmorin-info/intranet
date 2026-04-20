import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { GedDashboardService } from './ged-dashboard.service';

/**
 * Controller dédié au widget GED dashboard. Exposé sous /documents/ged.
 * Isolé de DocumentsController pour ne pas toucher aux fichiers déjà en cours
 * d'édition par d'autres agents.
 */
@Controller('documents/ged')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GedDashboardController {
  constructor(private readonly gedDashboardService: GedDashboardService) {}

  @Get('my-summary')
  getMyGedSummary(@CurrentUser() user: RequestUser) {
    return this.gedDashboardService.getMyGedSummary(user);
  }
}
