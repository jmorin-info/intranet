import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { OutlookSyncService } from './outlook-sync.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { CalendarSyncCron } from './calendar-sync.cron';

@Module({
  imports: [PrismaModule],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    OutlookSyncService,
    GoogleCalendarSyncService,
    CalendarSyncCron,
  ],
  exports: [CalendarService, OutlookSyncService, GoogleCalendarSyncService],
})
export class CalendarModule {}
