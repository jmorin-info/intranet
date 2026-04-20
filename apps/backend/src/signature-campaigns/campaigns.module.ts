import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsCron } from './campaigns.cron';

/**
 * Module des campagnes de signature automatisees (DocuSeal).
 * A importer dans app.module.ts apres execution de la migration Prisma.
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignsCron],
  exports: [CampaignsService],
})
export class SignatureCampaignsModule {}
