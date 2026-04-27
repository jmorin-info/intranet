import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { WebhookController } from './webhook.controller';
import { SignaturesService } from './signatures.service';
import { EvidenceService } from './evidence.service';

@Module({
  controllers: [SignaturesController, WebhookController],
  providers: [SignaturesService, EvidenceService],
  exports: [SignaturesService, EvidenceService],
})
export class SignaturesModule {}
