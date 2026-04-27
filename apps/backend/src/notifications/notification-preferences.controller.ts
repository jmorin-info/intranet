import { Body, Controller, Get, Patch, Put, UseGuards } from "@nestjs/common";
import { DigestFrequency as PrismaDigestFrequency } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DigestFrequency,
  NotificationPreferences,
  NotificationPreferencesService,
  toPrismaFrequency,
} from "./notification-preferences.service";

@Controller("notifications/preferences")
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  constructor(private readonly prefsService: NotificationPreferencesService) {}

  @Get()
  async get(
    @CurrentUser() user: RequestUser,
  ): Promise<NotificationPreferences> {
    return this.prefsService.get(user.id);
  }

  @Get("defaults")
  getDefaults(): NotificationPreferences {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  /**
   * PUT /notifications/preferences
   * body = partial preferences, merged server-side with current state.
   * Supporte aussi un champ top-level `digestFrequency` (NONE/DAILY/WEEKLY,
   * ou les valeurs legacy off/daily/weekly).
   */
  @Put()
  async update(
    @CurrentUser() user: RequestUser,
    @Body()
    body: Partial<NotificationPreferences> & {
      digestFrequency?: PrismaDigestFrequency | DigestFrequency | string;
    },
  ): Promise<NotificationPreferences> {
    return this.prefsService.update(user.id, body || {});
  }

  /**
   * PATCH /notifications/preferences — alias léger pour les patches partiels.
   * Identique au PUT côté serveur (merge), exposé pour respecter REST :
   * un PATCH partiel est plus correct sémantiquement qu'un PUT (le PUT est
   * conservé pour rétrocompat).
   */
  @Patch()
  async patch(
    @CurrentUser() user: RequestUser,
    @Body()
    body: Partial<NotificationPreferences> & {
      digestFrequency?: PrismaDigestFrequency | DigestFrequency | string;
    },
  ): Promise<NotificationPreferences> {
    return this.prefsService.update(user.id, body || {});
  }

  /**
   * Endpoint dédié pour le frontend digest : retourne uniquement la fréquence
   * typée. Évite d'avoir à parser tout l'objet NotificationPreferences quand
   * un composant simple (toggle/select) ne s'intéresse qu'au digest.
   */
  @Get("digest-frequency")
  async getDigestFrequency(
    @CurrentUser() user: RequestUser,
  ): Promise<{ digestFrequency: PrismaDigestFrequency }> {
    const value = await this.prefsService.getDigestFrequency(user.id);
    return { digestFrequency: toPrismaFrequency(value) };
  }

  /**
   * PATCH /notifications/preferences/digest-frequency
   * body: { digestFrequency: 'NONE' | 'DAILY' | 'WEEKLY' }
   * Helper pour un sélecteur unique dans le profil utilisateur.
   */
  @Patch("digest-frequency")
  async setDigestFrequency(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      digestFrequency?: PrismaDigestFrequency | DigestFrequency | string;
    },
  ): Promise<{ digestFrequency: PrismaDigestFrequency }> {
    const updated = await this.prefsService.update(user.id, {
      digestFrequency: body?.digestFrequency,
    });
    return { digestFrequency: toPrismaFrequency(updated.email.digest) };
  }
}
