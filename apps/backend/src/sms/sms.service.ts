import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service d'envoi SMS via l'API OVH.
 *
 * Utilisé en fallback / escalade pour les alertes critiques
 * (types SECURITY_ALERT, ALERT_CRITICAL) lorsque l'email ou la push
 * ne sont pas suffisants. Scaffold only — l'appel fetch réel est
 * stubbé et doit être validé en conditions réelles.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  // Configuration OVH SMS (cf. https://api.ovh.com/console/#/sms)
  private readonly enabled: boolean;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly consumerKey: string;
  private readonly serviceName: string;
  private readonly sender: string;

  private static readonly OVH_ENDPOINT_BASE = 'https://eu.api.ovh.com/1.0';
  private static readonly MAX_SMS_LENGTH = 160;
  private static readonly FETCH_TIMEOUT_MS = 5000;

  constructor(private readonly prisma: PrismaService) {
    this.enabled = process.env.OVH_SMS_ENABLED === 'true';
    this.appKey = process.env.OVH_SMS_APP_KEY || '';
    this.appSecret = process.env.OVH_SMS_APP_SECRET || '';
    this.consumerKey = process.env.OVH_SMS_CONSUMER_KEY || '';
    this.serviceName = process.env.OVH_SMS_SERVICE_NAME || '';
    this.sender = process.env.OVH_SMS_SENDER || 'OMNITECH';
  }

  /** Indique si le service est activé ET totalement configuré. */
  isEnabled(): boolean {
    return (
      this.enabled &&
      !!this.appKey &&
      !!this.appSecret &&
      !!this.consumerKey &&
      !!this.serviceName
    );
  }

  /** Indique si toutes les credentials sont présentes (pour /sms/status). */
  isConfigured(): boolean {
    return (
      !!this.appKey &&
      !!this.appSecret &&
      !!this.consumerKey &&
      !!this.serviceName
    );
  }

  /**
   * Envoie un SMS via OVH. Ne throw jamais — retourne toujours un
   * objet { ok, message } exploitable par l'appelant.
   */
  async sendSms(
    recipient: string,
    message: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (!this.isEnabled()) {
      this.logger.warn(
        `[SMS] Service désactivé ou mal configuré — envoi ignoré (to=${recipient})`,
      );
      return { ok: false, message: 'Service SMS désactivé' };
    }

    // Validation format E.164 (+[indicatif][numéro], 8 à 15 digits)
    const e164 = /^\+[1-9]\d{7,14}$/;
    if (!e164.test(recipient)) {
      this.logger.warn(`[SMS] Numéro invalide (non E.164) : ${recipient}`);
      return { ok: false, message: 'Numéro invalide' };
    }

    // Troncature du message à 160 caractères (SMS simple)
    let payloadMessage = message;
    if (payloadMessage.length > SmsService.MAX_SMS_LENGTH) {
      this.logger.warn(
        `[SMS] Message tronqué de ${payloadMessage.length} à ${SmsService.MAX_SMS_LENGTH} caractères`,
      );
      payloadMessage = payloadMessage.slice(0, SmsService.MAX_SMS_LENGTH);
    }

    const method = 'POST';
    const url = `${SmsService.OVH_ENDPOINT_BASE}/sms/${encodeURIComponent(
      this.serviceName,
    )}/jobs`;
    const body = JSON.stringify({
      charset: 'UTF-8',
      coding: '7bit',
      message: payloadMessage,
      receivers: [recipient],
      sender: this.sender,
      senderForResponse: false,
      noStopClause: false,
      priority: 'high',
    });

    // Signature OVH : $1$ + sha1(appSecret + '+' + consumerKey + '+' + method + '+' + url + '+' + body + '+' + timestamp)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = `${this.appSecret}+${this.consumerKey}+${method}+${url}+${body}+${timestamp}`;
    const signature = `$1$${createHash('sha1').update(toSign).digest('hex')}`;

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SmsService.FETCH_TIMEOUT_MS,
    );

    try {
      // TODO: tester en conditions réelles
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Ovh-Application': this.appKey,
          'X-Ovh-Consumer': this.consumerKey,
          'X-Ovh-Timestamp': timestamp,
          'X-Ovh-Signature': signature,
        },
        body,
        signal: controller.signal as AbortSignal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        this.logger.error(
          `[SMS] Échec OVH (${response.status}) to=${recipient} — ${errText.slice(0, 200)}`,
        );
        if (response.status >= 500) {
          return { ok: false, message: `Erreur serveur OVH (${response.status})` };
        }
        return { ok: false, message: `Erreur OVH (${response.status})` };
      }

      this.logger.log(`[SMS] Envoyé avec succès to=${recipient}`);
      return { ok: true, message: 'SMS envoyé' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        this.logger.error(`[SMS] Timeout (>${SmsService.FETCH_TIMEOUT_MS}ms) to=${recipient}`);
        return { ok: false, message: 'Timeout OVH' };
      }
      this.logger.error(
        `[SMS] Erreur réseau to=${recipient} — ${err?.message || err}`,
      );
      return { ok: false, message: 'Erreur réseau' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Escalade d'une alerte critique vers SMS pour un utilisateur donné.
   * Récupère le numéro de téléphone depuis la table User (champ `phone`).
   */
  async sendCriticalAlert(
    userId: string,
    title: string,
    body: string,
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true },
    });

    if (!user) {
      this.logger.warn(`[SMS] User introuvable (id=${userId})`);
      return { ok: false, message: 'Utilisateur introuvable' };
    }

    // NOTE: le schéma actuel expose `phone` (String?) — pas `phoneNumber`.
    // TODO: si un jour un champ dédié `phoneNumber` normalisé E.164 est
    // ajouté, basculer ici pour éviter les soucis de format.
    const phone = user.phone?.trim();
    if (!phone) {
      this.logger.warn(
        `[SMS] Pas de numéro de téléphone pour user=${userId} — escalade SMS ignorée`,
      );
      return { ok: false, message: 'Pas de numéro de téléphone' };
    }

    const formatted = `[OMNITECH CRITIQUE] ${title}\n${body}`;
    const result = await this.sendSms(phone, formatted);

    // Audit log explicite pour l'escalade critique (succès ou échec)
    if (result.ok) {
      this.logger.log(
        `[SMS][AUDIT] Escalade critique OK user=${userId} title="${title}"`,
      );
    } else {
      this.logger.error(
        `[SMS][AUDIT] Escalade critique KO user=${userId} title="${title}" reason="${result.message}"`,
      );
    }

    return result;
  }
}
