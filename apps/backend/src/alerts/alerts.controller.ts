import { Controller, Get, Post, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AlertsService } from './alerts.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { CreateAlertDto } from './dto/create-alert.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll() { return this.alertsService.findAll(); }

  @Get('unread')
  getUnread(@CurrentUser() user: RequestUser) {
    return this.alertsService.getUnreadForUser(user.id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  create(@Body() body: CreateAlertDto, @CurrentUser() user: RequestUser) {
    return this.alertsService.create(body, user.id);
  }

  @Post('mark-all-read')
  markAllAsRead(@CurrentUser() user: RequestUser) {
    return this.alertsService.markAllAsRead(user.id);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getStats() {
    return this.alertsService.getStats();
  }

  @Post(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.alertsService.markRead(id, user.id);
  }
}
