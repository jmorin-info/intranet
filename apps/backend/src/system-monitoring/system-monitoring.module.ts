import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemMonitoringController } from './system-monitoring.controller';
import { SystemMonitoringService } from './system-monitoring.service';

@Module({
  imports: [PrismaModule],
  controllers: [SystemMonitoringController],
  providers: [SystemMonitoringService],
})
export class SystemMonitoringModule {}
