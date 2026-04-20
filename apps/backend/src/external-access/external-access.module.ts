import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExternalAccessController } from './external-access.controller';
import { ExternalAccessService } from './external-access.service';
import { PrestataireSessionGuard } from './prestataire-session.guard';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [ExternalAccessController],
  providers: [ExternalAccessService, PrestataireSessionGuard],
  exports: [ExternalAccessService],
})
export class ExternalAccessModule {}
