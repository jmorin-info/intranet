import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PcaController } from './pca.controller';
import { PcaService } from './pca.service';

/**
 * Module PCA — tests de continuité d'activité (ISO 27001 A.5.30).
 * AuditService est fourni globalement par AuditModule (@Global).
 */
@Module({
  imports: [PrismaModule],
  controllers: [PcaController],
  providers: [PcaService],
  exports: [PcaService],
})
export class PcaModule {}
