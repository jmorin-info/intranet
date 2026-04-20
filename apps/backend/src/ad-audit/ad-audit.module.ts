import { Module } from '@nestjs/common';
import { AdAuditController } from './ad-audit.controller';
import { AdAuditService } from './ad-audit.service';

@Module({
  controllers: [AdAuditController],
  providers: [AdAuditService],
})
export class AdAuditModule {}
