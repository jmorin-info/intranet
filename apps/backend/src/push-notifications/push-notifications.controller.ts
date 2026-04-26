import { Body, Controller, Get, Post, UseGuards, Req, Optional } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { PushNotificationsService } from './push-notifications.service';
import { SubscribeDto, UnsubscribeDto } from './dto/subscribe.dto';
import { AuditService } from '../audit/audit.service';

/**
 * Web Push subscriptions controller.
 *
 * Audit (RGPD Art. 30 + ISO 27001 A.5.13) — every subscribe/unsubscribe is
 * logged with PUSH_SUBSCRIBE / PUSH_UNSUBSCRIBE so that we keep a trail of
 * which endpoints (technical, no PII) were registered when by whom.
 */
@Controller('push')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PushNotificationsController {
  constructor(
    private readonly service: PushNotificationsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return {
      enabled: this.service.isEnabled(),
      publicKey: this.service.getVapidPublicKey(),
    };
  }

  /**
   * Capacités Web Push exposées au frontend pour orchestrer le flow
   * d'autorisation côté client (notamment Safari iOS, qui n'autorise
   * `Notification.requestPermission()` qu'après installation à
   * l'écran d'accueil).
   *
   * `supportsSafari` indique simplement que le serveur sait gérer les
   * souscriptions Safari Web Push (web-push >= 3.5.0, ce qui est notre
   * cas) — le frontend reste seul juge de la compatibilité réelle du
   * navigateur courant.
   */
  @Get('capabilities')
  getCapabilities() {
    return {
      enabled: this.service.isEnabled(),
      vapidPublicKey: this.service.getVapidPublicKey(),
      // Aligné sur le standard Web Push depuis iOS 16.4 (mars 2023) /
      // macOS Safari 16. La lib `web-push` >= 3.5.0 est compatible nativement.
      supportsSafari: true,
      // Plateformes que le frontend peut déclarer. Sert aussi à valider
      // côté UI le statut "non supporté" sans deviner.
      knownPlatforms: ['ios', 'macos', 'android', 'desktop', 'unknown'],
    };
  }

  @Post('subscribe')
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const userAgent = dto.userAgent || (req.headers['user-agent'] as string | undefined);
    const result = await this.service.subscribe(
      user.id,
      dto.endpoint,
      dto.keys.p256dh,
      dto.keys.auth,
      userAgent,
      dto.platform,
    );
    if (this.audit) {
      void this.audit
        .log({
          userId: user.id,
          ipAddress: req.ip,
          userAgent,
          action: 'PUSH_SUBSCRIBE',
          resourceType: 'PushSubscription',
          resourceId: result.id,
          metadata: {
            // Only the host part of the endpoint URL is kept — never the full
            // URL (which is technically a per-device identifier).
            endpointHost: safeEndpointHost(dto.endpoint),
            platform: result.platform,
          },
        })
        .catch(() => undefined);
    }
    return { success: true, ...result };
  }

  @Post('unsubscribe')
  async unsubscribe(
    @Body() dto: UnsubscribeDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const result = await this.service.unsubscribe(user.id, dto.endpoint);
    if (this.audit) {
      void this.audit
        .log({
          userId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          action: 'PUSH_UNSUBSCRIBE',
          resourceType: 'PushSubscription',
          metadata: {
            endpointHost: safeEndpointHost(dto.endpoint),
            removed: result.removed,
          },
        })
        .catch(() => undefined);
    }
    return { success: true, ...result };
  }

  @Post('test')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async sendTest(@CurrentUser() user: RequestUser) {
    await this.service.sendToUser(user.id, {
      title: 'OMNITECH — Notification de test',
      body: 'Les notifications push fonctionnent correctement.',
      icon: '/logo-icon.png',
      url: '/dashboard',
      tag: 'test',
    });
    return { success: true, message: 'Notification envoyée' };
  }
}

/**
 * Strip the path/query of a push endpoint for audit logs — we only keep
 * the host (e.g. fcm.googleapis.com), which is enough to know the push
 * provider but never identifies the device.
 */
function safeEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown';
  }
}
