import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * Web Push notifications service (ISO 27001 A.5.13 — Communication des informations).
 *
 * Sends browser push notifications to users via VAPID protocol.
 * Subscriptions are stored in PushSubscription table; expired subs (410 Gone) are auto-deleted.
 *
 * Configuration:
 *   VAPID_PUBLIC_KEY  — public key (also exposed to frontend)
 *   VAPID_PRIVATE_KEY — private key (kept secret)
 *   VAPID_SUBJECT     — contact mailto, e.g. mailto:rssi@omnitech.security
 *
 * If VAPID keys are missing at boot, the service logs a warning and silently no-ops on send.
 */
@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);
  private vapidPublicKey: string | null = null;
  private vapidPrivateKey: string | null = null;
  private vapidSubject = 'mailto:rssi@omnitech.security';
  private enabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || null;
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || null;
    if (process.env.VAPID_SUBJECT) {
      this.vapidSubject = process.env.VAPID_SUBJECT;
    }

    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      this.logger.warn(
        'VAPID keys not configured. Web Push disabled. Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in env (generate with `web-push generate-vapid-keys`).',
      );
      return;
    }

    try {
      webpush.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);
      this.enabled = true;
      this.logger.log('Web Push notifications enabled (VAPID configured)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize Web Push: ${msg}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getVapidPublicKey(): string | null {
    return this.vapidPublicKey;
  }

  /**
   * Détecte la plateforme cliente à partir d'un User-Agent et/ou d'un
   * indice explicite fourni par le client. Permet de tracer si la
   * souscription provient de Safari iOS (PWA installée) ou autre.
   *
   * Heuristique basique — se contente d'inspecter les motifs UA usuels.
   * Le client peut surcharger via le champ `platform` de la requête, ce
   * qui est plus fiable côté frontend (matchMedia('(display-mode: standalone)')
   * + 'standalone' in navigator).
   */
  static detectPlatform(userAgent?: string, hint?: string): string {
    const allowed = new Set(['ios', 'macos', 'android', 'desktop', 'unknown']);
    if (hint && allowed.has(hint)) return hint;
    if (!userAgent) return 'unknown';
    const ua = userAgent.toLowerCase();
    // iPad sur iPadOS 13+ rapporte "Macintosh" — on lève l'ambiguïté
    // via la présence du Touch UI (point tactile). Faute d'accès au DOM
    // côté backend, on s'appuie surtout sur le hint client.
    if (/iphone|ipod/.test(ua)) return 'ios';
    if (/ipad/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/macintosh|mac os x/.test(ua)) return 'macos';
    if (/windows|linux|cros/.test(ua)) return 'desktop';
    return 'unknown';
  }

  /** Upsert a push subscription for a user. */
  async subscribe(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    userAgent?: string,
    platform?: string,
  ): Promise<{ id: string; platform: string }> {
    const detected = PushNotificationsService.detectPlatform(userAgent, platform);
    const sub = await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent: userAgent ?? null,
        platform: detected,
      },
      update: {
        userId,
        p256dh,
        auth,
        userAgent: userAgent ?? null,
        platform: detected,
        lastUsed: new Date(),
      },
    });
    return { id: sub.id, platform: detected };
  }

  /** Remove a push subscription by endpoint (per-user safety check). */
  async unsubscribe(userId: string, endpoint: string): Promise<{ removed: number }> {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
    return { removed: result.count };
  }

  /** Send a push to all subscriptions belonging to a single user. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;
    await this.dispatch(subs, payload);
  }

  /** Send to all active users with a given role. */
  async sendToRole(role: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { user: { role: role as never, isActive: true, deletedAt: null } },
    });
    if (subs.length === 0) return;
    await this.dispatch(subs, payload);
  }

  /** Broadcast to every active user. Use sparingly. */
  async sendBroadcast(payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { user: { isActive: true, deletedAt: null } },
    });
    if (subs.length === 0) return;
    await this.dispatch(subs, payload);
  }

  /** Internal: send to a list of subs and clean up gone ones. */
  private async dispatch(
    subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
    payload: PushPayload,
  ): Promise<void> {
    const json = JSON.stringify(payload);
    const expired: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            json,
            { TTL: 86400 },
          );
        } catch (err) {
          // Type guard for webpush errors which carry statusCode
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            expired.push(sub.id);
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Push send failed (${status ?? 'unknown'}): ${msg}`);
          }
        }
      }),
    );

    if (expired.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
      this.logger.log(`Removed ${expired.length} expired push subscriptions`);
    }
  }
}
