import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { IsoAnalyzerController } from './iso-analyzer.controller';
import { IsoAnalyzerService } from './iso-analyzer.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [IsoAnalyzerController],
  providers: [IsoAnalyzerService],
  exports: [IsoAnalyzerService],
})
export class IsoAnalyzerModule {}
