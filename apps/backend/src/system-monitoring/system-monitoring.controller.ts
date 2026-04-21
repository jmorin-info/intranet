import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { SystemMonitoringService } from './system-monitoring.service';

@Controller('system-monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SystemMonitoringController {
  constructor(private readonly service: SystemMonitoringService) {}

  @Get('resources')
  resources() {
    return this.service.getSystemResources();
  }

  @Get('intranet-usage')
  intranetUsage() {
    return this.service.getIntranetUsage();
  }

  @Get('storage-per-user')
  storagePerUser(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.service.getStoragePerUser(
      Number.isFinite(parsed) && parsed > 0 ? parsed : 50,
    );
  }
}
