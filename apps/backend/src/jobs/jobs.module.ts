import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReviewReminderProcessor } from './review-reminder.processor';
import { FileProcessingProcessor } from './file-processing.processor';
import { DataExportProcessor } from './data-export.processor';
import { JobsService } from './jobs.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'review-reminders' },
      { name: 'file-processing' },
      { name: 'data-export' },
    ),
    NotificationsModule,
  ],
  providers: [
    ReviewReminderProcessor,
    FileProcessingProcessor,
    DataExportProcessor,
    JobsService,
  ],
  exports: [BullModule],
})
export class JobsModule {}
