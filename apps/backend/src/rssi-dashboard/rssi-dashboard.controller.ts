import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { RssiDashboardService } from './rssi-dashboard.service';

/**
 * Dashboard consolidé pour le RSSI : un seul endpoint qui agrège
 * les KPI de tous les modules. Réservé aux rôles privilégiés.
 */
@Controller('rssi-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.REVIEWER)
export class RssiDashboardController {
  constructor(private readonly service: RssiDashboardService) {}

  @Get('snapshot')
  getSnapshot() {
    return this.service.getSnapshot();
  }
}
