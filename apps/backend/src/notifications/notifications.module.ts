import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationPreferencesController } from "./notification-preferences.controller";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { DigestService } from "./digest.service";
import { PushNotificationsModule } from "../push-notifications/push-notifications.module";
import { SmsModule } from "../sms/sms.module";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:
          process.env.JWT_ACCESS_SECRET || "omnitech-access-secret-change-me",
      }),
    }),
    PushNotificationsModule,
    SmsModule,
  ],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationPreferencesService,
    DigestService,
  ],
  exports: [
    NotificationsService,
    NotificationPreferencesService,
    DigestService,
  ],
})
export class NotificationsModule {}
