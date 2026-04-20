import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataRetentionController } from './data-retention.controller';
import { DataRetentionService } from './data-retention.service';
import { DataRetentionScheduler } from './data-retention.scheduler';

/**
 * DataRetentionModule — ISO 27001 A.5.33 automated retention/archival.
 *
 * AuditModule is @Global so AuditService is injectable here without an
 * explicit import. Schedule module is registered globally in AppModule via
 * ScheduleModule.forRoot(), so @Cron decorators on the scheduler work out
 * of the box.
 */
@Module({
  imports: [PrismaModule],
  controllers: [DataRetentionController],
  providers: [DataRetentionService, DataRetentionScheduler],
  exports: [DataRetentionService],
})
export class DataRetentionModule {}
