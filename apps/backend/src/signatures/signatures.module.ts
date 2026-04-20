import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { WebhookController } from './webhook.controller';
import { SignaturesService } from './signatures.service';

@Module({
  controllers: [SignaturesController, WebhookController],
  providers: [SignaturesService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
