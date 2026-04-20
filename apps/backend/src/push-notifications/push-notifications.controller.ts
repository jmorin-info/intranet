import { Body, Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { PushNotificationsService } from './push-notifications.service';
import { SubscribeDto, UnsubscribeDto } from './dto/subscribe.dto';

@Controller('push')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PushNotificationsController {
  constructor(private readonly service: PushNotificationsService) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return {
      enabled: this.service.isEnabled(),
      publicKey: this.service.getVapidPublicKey(),
    };
  }

  @Post('subscribe')
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const userAgent = dto.userAgent || (req.headers['user-agent'] as string | undefined);
    const result = await this.service.subscribe(
      user.id,
      dto.endpoint,
      dto.keys.p256dh,
      dto.keys.auth,
      userAgent,
    );
    return { success: true, ...result };
  }

  @Post('unsubscribe')
  async unsubscribe(@Body() dto: UnsubscribeDto, @CurrentUser() user: RequestUser) {
    const result = await this.service.unsubscribe(user.id, dto.endpoint);
    return { success: true, ...result };
  }

  @Post('test')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async sendTest(@CurrentUser() user: RequestUser) {
    await this.service.sendToUser(user.id, {
      title: 'OMNITECH — Notification de test',
      body: 'Les notifications push fonctionnent correctement.',
      icon: '/logo-icon.png',
      url: '/dashboard',
      tag: 'test',
    });
    return { success: true, message: 'Notification envoyée' };
  }
}
