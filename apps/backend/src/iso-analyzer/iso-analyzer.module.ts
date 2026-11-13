import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { IsoAnalyzerController } from './iso-analyzer.controller';
import { IsoAnalyzerService } from './iso-analyzer.service';

@Module({
  imports: [PrismaModule, AuditModule, StorageModule],
  controllers: [IsoAnalyzerController],
  providers: [IsoAnalyzerService],
  exports: [IsoAnalyzerService],
})
export class IsoAnalyzerModule {}
