import { Global, Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditAnonymizationService } from './audit-anonymization.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AppConfigModule } from '../config/config.module';

@Global()
@Module({
  // forwardRef on AppConfigModule because AppConfigModule imports AuditModule
  // (AppConfigService.upsert audits via AuditService). The cycle is broken at
  // resolution time by Nest's forwardRef.
  imports: [PrismaModule, forwardRef(() => AppConfigModule)],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditAnonymizationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService, AuditAnonymizationService],
})
export class AuditModule {}
