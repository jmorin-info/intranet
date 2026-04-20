import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { ItExportsController } from './it-exports.controller';
import { ItExportsService } from './it-exports.service';

@Module({
  imports: [PrismaModule, AuditModule, StorageModule],
  controllers: [ItExportsController],
  providers: [ItExportsService],
  exports: [ItExportsService],
})
export class ItExportsModule {}
