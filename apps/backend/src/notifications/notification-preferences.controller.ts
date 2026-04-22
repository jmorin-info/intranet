import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferences,
  NotificationPreferencesService,
} from './notification-preferences.service';

@Controller('notifications/preferences')
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  constructor(private readonly prefsService: NotificationPreferencesService) {}

  @Get()
  async get(@CurrentUser() user: RequestUser): Promise<NotificationPreferences> {
    return this.prefsService.get(user.id);
  }

  @Get('defaults')
  getDefaults(): NotificationPreferences {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  /**
   * PUT /notifications/preferences
   * body = partial preferences, merged server-side with current state.
   */
  @Put()
  async update(
    @CurrentUser() user: RequestUser,
    @Body() body: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    return this.prefsService.update(user.id, body || {});
  }
}
