import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { SmsService } from './sms.service';

interface TestSmsDto {
  recipient: string;
  message: string;
}

/**
 * Endpoints d'administration du service SMS (OVH).
 * Réservés aux ADMIN pour consulter la configuration et tester l'envoi.
 */
@Controller('sms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(private readonly smsService: SmsService) {}

  /** Retourne l'état de configuration du provider SMS. */
  @Get('status')
  getStatus() {
    return {
      enabled: this.smsService.isEnabled(),
      configured: this.smsService.isConfigured(),
      provider: 'OVH',
    };
  }

  /**
   * Envoie un SMS de test (payload tronqué à 160 caractères côté service).
   * Utile pour valider les credentials OVH une fois le module enregistré.
   */
  @Post('test')
  @HttpCode(200)
  async sendTest(@Body() dto: TestSmsDto) {
    const recipient = dto?.recipient?.trim() || '';
    const message = dto?.message?.trim() || '';

    this.logger.log(
      `[SMS][TEST] Requête d'envoi de test to=${recipient} len=${message.length}`,
    );

    // Le service se charge de la validation E.164 et de la troncature 160c.
    return this.smsService.sendSms(recipient, message);
  }
}
