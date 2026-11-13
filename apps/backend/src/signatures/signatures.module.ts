import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { WebhookController } from './webhook.controller';
import { SignaturesService } from './signatures.service';
import { EvidenceService } from './evidence.service';
import { EvidenceReconciliationCron } from './evidence-reconciliation.cron';
import { SignatureCampaignsModule } from '../signature-campaigns/campaigns.module';

@Module({
  // SignatureCampaignsModule : le webhook DocuSeal unifié (WebhookController)
  // route les événements non consommés vers CampaignsService.handleWebhook.
  imports: [SignatureCampaignsModule],
  controllers: [SignaturesController, WebhookController],
  providers: [SignaturesService, EvidenceService, EvidenceReconciliationCron],
  exports: [SignaturesService, EvidenceService],
})
export class SignaturesModule {}
