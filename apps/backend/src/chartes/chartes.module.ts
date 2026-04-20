import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { ChartesController } from './chartes.controller';
import { ChartesService } from './chartes.service';

@Module({
  imports: [PrismaModule, AuditModule, StorageModule],
  controllers: [ChartesController],
  providers: [ChartesService],
  exports: [ChartesService],
})
export class ChartesModule {}
