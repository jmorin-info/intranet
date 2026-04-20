import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTION)
  create(
    @Body() body: { userId: string; type: string; title: string; body?: string; resourceType?: string; resourceId?: string },
  ) {
    return this.notificationsService.create({
      userId: body.userId,
      type: body.type,
      title: body.title,
      body: body.body,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
    });
  }

  @Get()
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notificationsService.findByUser(user.id, {
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '20', 10),
    });
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Post('broadcast')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  broadcast(
    @Body() body: { type: string; title: string; body?: string; resourceType?: string; resourceId?: string; targetRole?: string; targetDepartmentId?: string },
  ) {
    return this.notificationsService.broadcast(body);
  }

  @Post('test-email')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  sendTestEmail(@CurrentUser() user: RequestUser) {
    return this.notificationsService.sendTestEmail(user.id);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: RequestUser) {
    return this.notificationsService.getUnreadCount(user.id).then((count) => ({
      count,
    }));
  }
}
