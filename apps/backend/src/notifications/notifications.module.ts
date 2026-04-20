import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:
          process.env.JWT_ACCESS_SECRET || 'omnitech-access-secret-change-me',
      }),
    }),
    PushNotificationsModule,
    SmsModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
