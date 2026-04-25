import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { OutlookSyncService } from './outlook-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [CalendarController],
  providers: [CalendarService, OutlookSyncService],
  exports: [CalendarService, OutlookSyncService],
})
export class CalendarModule {}
