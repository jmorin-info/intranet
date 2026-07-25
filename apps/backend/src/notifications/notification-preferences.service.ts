import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  DigestFrequency as PrismaDigestFrequency,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type NotificationChannel = "email" | "inApp" | "push";
export type NotificationCategory =
  | "tickets"
  | "documents"
  | "incidents"
  | "mentions"
  | "veille";

/**
 * Représentation legacy (JSON) de la fréquence de digest.
 * Conservée pour rétrocompat de l'API PUT /notifications/preferences.
 *
 * La source de vérité typée est `User.digestFrequency` (enum Postgres) :
 *   NONE   ↔ 'off'
 *   DAILY  ↔ 'daily'
 *   WEEKLY ↔ 'weekly'
 *
 * Les helpers `toPrismaFrequency` / `fromPrismaFrequency` font la conversion.
 */
export type DigestFrequency = "off" | "daily" | "weekly";

/** Conversion JSON-legacy → enum Prisma typé. */
export function toPrismaFrequency(
  value: string | undefined | null,
): PrismaDigestFrequency {
  if (!value) return PrismaDigestFrequency.DAILY;
  const v = String(value).toLowerCase();
  if (v === "off" || v === "none") return PrismaDigestFrequency.NONE;
  if (v === "weekly") return PrismaDigestFrequency.WEEKLY;
  return PrismaDigestFrequency.DAILY;
}

/** Conversion enum Prisma typé → JSON-legacy. */
export function fromPrismaFrequency(
  value: PrismaDigestFrequency | string | undefined | null,
): DigestFrequency {
  if (!value) return "daily";
  const v = String(value).toUpperCase();
  if (v === "NONE") return "off";
  if (v === "WEEKLY") return "weekly";
  return "daily";
}

export interface EmailChannelPrefs {
  tickets: boolean;
  documents: boolean;
  incidents: boolean;
  mentions: boolean;
  /** Veille cyber — OFF par défaut (anti-spam si SMTP réactivé). */
  veille: boolean;
  digest: DigestFrequency;
}

export interface InAppChannelPrefs {
  tickets: boolean;
  documents: boolean;
  incidents: boolean;
  mentions: boolean;
  veille: boolean;
}

// La veille (comme les documents) n'est jamais éligible au push navigateur.
export interface PushChannelPrefs {
  tickets: boolean;
  incidents: boolean;
  mentions: boolean;
}

export interface NotificationPreferences {
  email: EmailChannelPrefs;
  inApp: InAppChannelPrefs;
  push: PushChannelPrefs;
}

/**
 * Default preferences applied when a user has never customised them.
 * - In-app + email: all categories ON — SAUF la veille (email OFF par
 *   défaut : ~28 notifs/semaine/admin, on ne veut pas d'emails immédiats
 *   le jour où SMTP est réactivé).
 * - Push: mentions + incidents only (conservative, less noisy)
 * - Digest email: daily
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email: {
    tickets: true,
    documents: true,
    incidents: true,
    mentions: true,
    veille: false,
    digest: "daily",
  },
  inApp: {
    tickets: true,
    documents: true,
    incidents: true,
    mentions: true,
    veille: true,
  },
  push: {
    tickets: false,
    incidents: true,
    mentions: true,
  },
};

/**
 * Map a NotificationType to a category used by the preferences matrix.
 * Returns null when the type is not user-mutable (e.g. critical security
 * alerts, always sent through every channel regardless of prefs).
 */
export function categoryFromType(
  type: string | undefined | null,
): NotificationCategory | null {
  if (!type) return null;
  const t = String(type).toUpperCase();
  if (t.startsWith("VEILLE_")) return "veille";
  if (t.startsWith("TICKET_")) return "tickets";
  if (
    t.startsWith("DOC_") ||
    t === "SIGNATURE_NEEDED" ||
    t === "ACK_REQUIRED" ||
    t === "REVIEW_OVERDUE"
  )
    return "documents";
  if (t === "INCIDENT_CREATED" || t.startsWith("INCIDENT_")) return "incidents";
  if (t === "MENTION" || t.endsWith("_MENTION")) return "mentions";
  return null;
}

@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get preferences for a user, falling back to defaults if never set.
   * Always returns a fully-populated object (no partial shapes).
   */
  async get(userId: string): Promise<NotificationPreferences> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationPreferences: true },
      });
      return this.mergeWithDefaults(user?.notificationPreferences);
    } catch (err) {
      this.logger.warn(
        `Failed to load prefs for ${userId}: ${err instanceof Error ? err.message : err}`,
      );
      return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    }
  }

  /**
   * Update preferences with a partial patch, merged with the current state.
   * Always persists a fully-normalised object.
   *
   * Accepte aussi un champ `digestFrequency` (top-level) en complément du
   * champ legacy `email.digest` — plus pratique côté frontend (un select
   * unique). Si les deux sont fournis, `digestFrequency` (top-level) prend
   * la priorité car il représente la valeur typée canonique.
   *
   * Side-effect : la colonne typée `User.digestFrequency` est synchronisée
   * en même temps que le JSON, en une seule transaction Prisma.
   */
  async update(
    userId: string,
    patch: Partial<NotificationPreferences> & {
      digestFrequency?: PrismaDigestFrequency | DigestFrequency | string;
    },
  ): Promise<NotificationPreferences> {
    const current = await this.get(userId);
    const next: NotificationPreferences = {
      email: { ...current.email, ...(patch.email || {}) },
      inApp: { ...current.inApp, ...(patch.inApp || {}) },
      push: { ...current.push, ...(patch.push || {}) },
    };

    // Top-level digestFrequency wins over legacy email.digest if present.
    if (patch.digestFrequency !== undefined) {
      next.email.digest = fromPrismaFrequency(patch.digestFrequency);
    }

    // Normalise digest value (defensive)
    if (
      next.email.digest !== "off" &&
      next.email.digest !== "daily" &&
      next.email.digest !== "weekly"
    ) {
      next.email.digest = "daily";
    }

    const typedFreq = toPrismaFrequency(next.email.digest);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        // Prisma.InputJsonValue : sérialisation directe des préférences typées.
        notificationPreferences: next as unknown as Prisma.InputJsonValue,
        // Source de vérité typée — synchronisée pour le cron digest.
        digestFrequency: typedFreq,
      },
    });

    return next;
  }

  /**
   * Should we send a notification of a given type via a given channel?
   * - If the category is unknown (non-mutable type like SECURITY_ALERT), allow.
   * - If the user has no prefs row, allow (backward compat = all on).
   * - Otherwise return the boolean of prefs[channel][category].
   */
  async isChannelEnabled(
    userId: string,
    channel: NotificationChannel,
    type: string | undefined,
  ): Promise<boolean> {
    const category = categoryFromType(type);
    if (!category) return true; // non-mutable types always pass

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationPreferences: true },
      });
      const raw = user?.notificationPreferences;
      if (!raw) {
        // No prefs yet → default-allow (backward compat), SAUF la veille :
        // son défaut documenté est email=OFF / push=OFF, seul l'in-app passe.
        if (category === "veille") return channel === "inApp";
        return true;
      }

      const prefs = this.mergeWithDefaults(raw);
      if (channel === "push") {
        // documents et veille ne sont jamais dans la matrice push.
        if (category === "documents" || category === "veille") return false;
        // PushChannelPrefs has all keys except 'documents'/'veille' — typed indexing.
        return Boolean(
          (prefs.push as unknown as Record<string, boolean>)[category],
        );
      }
      return Boolean(
        (prefs[channel] as Record<NotificationCategory, boolean>)[category],
      );
    } catch (err) {
      this.logger.warn(
        `Pref check failed (${channel}/${type}): ${err instanceof Error ? err.message : err}`,
      );
      return true; // fail-open
    }
  }

  /**
   * Digest frequency for a user (for the daily cron).
   * Lit en priorité la colonne typée `User.digestFrequency` (rapide, indexée),
   * et retombe sur le JSON `notificationPreferences.email.digest` si la colonne
   * est absente (ex: en environnement de test sans la migration appliquée).
   */
  async getDigestFrequency(userId: string): Promise<DigestFrequency> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { digestFrequency: true, notificationPreferences: true },
      });
      if (user?.digestFrequency) {
        return fromPrismaFrequency(user.digestFrequency);
      }
      return this.mergeWithDefaults(user?.notificationPreferences).email.digest;
    } catch {
      const prefs = await this.get(userId);
      return prefs.email.digest;
    }
  }

  /**
   * Variante typée Prisma — utilisée par DigestService.
   */
  async getDigestFrequencyTyped(
    userId: string,
  ): Promise<PrismaDigestFrequency> {
    return toPrismaFrequency(await this.getDigestFrequency(userId));
  }

  private mergeWithDefaults(raw: unknown): NotificationPreferences {
    const d = DEFAULT_NOTIFICATION_PREFERENCES;
    if (!raw || typeof raw !== "object")
      return {
        email: { ...d.email },
        inApp: { ...d.inApp },
        push: { ...d.push },
      };
    // Prisma.JsonValue dynamique : on copie les sous-objets quand présents.
    const obj = raw as Partial<NotificationPreferences>;
    return {
      email: { ...d.email, ...(obj.email || {}) },
      inApp: { ...d.inApp, ...(obj.inApp || {}) },
      push: { ...d.push, ...(obj.push || {}) },
    };
  }
}
