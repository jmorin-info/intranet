import { Injectable, Logger } from '@nestjs/common';

/**
 * Skeleton de synchronisation Outlook (Microsoft Graph).
 *
 * Phase 1 (cette PR) : interface + no-op. La synchro se fait par abonnement
 * iCal (URL publique signee par token, exposee par CalendarController).
 *
 * Phase 2 (a venir) : OAuth Microsoft Graph + sync push bi-directionnelle.
 *  - Stocker le `refresh_token` chiffre en DB (UserOutlookCredential)
 *  - Cron : push des CalendarEvent[userId=...] vers le calendrier Outlook
 *  - Webhook subscriptions /me/events pour recevoir les modifs distantes
 *  - Mapper VEVENT.UID <-> Microsoft eventId pour conserver l'idempotence
 */
@Injectable()
export class OutlookSyncService {
  private readonly logger = new Logger(OutlookSyncService.name);

  /**
   * Pousse un evenement individuel vers Outlook.
   * @returns vrai si la synchro a reussi, faux sinon (no-op pour l'instant).
   */
  async pushEvent(_userId: string, _event: { id: string; title: string; startDate: Date }): Promise<boolean> {
    // implementer Phase 2 : OAuth Microsoft Graph + sync push
    this.logger.debug('OutlookSyncService.pushEvent — no-op (Phase 2 a venir)');
    return false;
  }

  /**
   * Recupere les modifs distantes pour un utilisateur (pull).
   */
  async pullChanges(_userId: string): Promise<{ updated: number; deleted: number }> {
    // implementer Phase 2 : OAuth Microsoft Graph + sync push
    this.logger.debug('OutlookSyncService.pullChanges — no-op (Phase 2 a venir)');
    return { updated: 0, deleted: 0 };
  }

  /**
   * Indique si l'utilisateur a connecte son compte Outlook.
   */
  async isConnected(_userId: string): Promise<boolean> {
    // implementer Phase 2 : OAuth Microsoft Graph + sync push
    return false;
  }
}
