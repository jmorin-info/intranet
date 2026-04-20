import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma-health.indicator';
import { MetricsService } from './metrics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OfficeModule } from '../office/office.module';

@Module({
  imports: [TerminusModule, PrismaModule, OfficeModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, MetricsService],
})
export class HealthModule {}
