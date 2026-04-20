import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SignaturesService } from './signatures.service';

@Controller('signatures')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly webhookSecret: string;

  constructor(private readonly signaturesService: SignaturesService) {
    this.webhookSecret = process.env.DOCUSEAL_WEBHOOK_SECRET || '';
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-docuseal-signature') signature: string,
  ) {
    // Validate webhook secret
    if (this.webhookSecret && signature !== this.webhookSecret) {
      this.logger.warn('Invalid webhook signature received');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(`DocuSeal webhook received: ${payload.event_type || payload.type}`);

    await this.signaturesService.handleWebhook(payload);

    return { received: true };
  }
}
