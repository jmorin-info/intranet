import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { OutlookSyncService } from "./outlook-sync.service";
import { GoogleCalendarSyncService } from "./google-calendar-sync.service";
import { CalendarSyncCron } from "./calendar-sync.cron";
import { OAuthCredsService } from "./oauth-creds.service";

@Module({
  imports: [PrismaModule],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    OutlookSyncService,
    GoogleCalendarSyncService,
    CalendarSyncCron,
    OAuthCredsService,
  ],
  exports: [
    CalendarService,
    OutlookSyncService,
    GoogleCalendarSyncService,
    OAuthCredsService,
  ],
})
export class CalendarModule {}
