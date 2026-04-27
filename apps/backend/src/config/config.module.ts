import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AppConfigController } from './config.controller';
import { AppConfigService } from './config.service';

@Module({
  // forwardRef because AuditModule re-imports AppConfigModule for the
  // anonymization retention policy storage. Nest resolves the cycle at
  // bootstrap.
  imports: [PrismaModule, forwardRef(() => AuditModule)],
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
