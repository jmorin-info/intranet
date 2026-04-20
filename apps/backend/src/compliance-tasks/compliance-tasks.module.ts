import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceTasksController } from './compliance-tasks.controller';
import { ComplianceTasksService } from './compliance-tasks.service';

@Module({
  imports: [PrismaModule],
  controllers: [ComplianceTasksController],
  providers: [ComplianceTasksService],
  exports: [ComplianceTasksService],
})
export class ComplianceTasksModule {}
