import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type NotificationChannel = "email" | "inApp" | "push";
export type NotificationCategory =
  | "tickets"
  | "documents"
  | "incidents"
  | "mentions";

export type DigestFrequency = "off" | "daily" | "weekly";

export interface EmailChannelPrefs {
  tickets: boolean;
  documents: boolean;
  incidents: boolean;
  mentions: boolean;
  digest: DigestFrequency;
}

export interface InAppChannelPrefs {
  tickets: boolean;
  documents: boolean;
  incidents: boolean;
  mentions: boolean;
}

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
 * - In-app + email: all categories ON
 * - Push: mentions + incidents only (conservative, less noisy)
 * - Digest email: daily
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email: {
    tickets: true,
    documents: true,
    incidents: true,
    mentions: true,
    digest: "daily",
  },
  inApp: {
    tickets: true,
    documents: true,
    incidents: true,
    mentions: true,
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
   */
  async update(
    userId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.get(userId);
    const next: NotificationPreferences = {
      email: { ...current.email, ...(patch.email || {}) },
      inApp: { ...current.inApp, ...(patch.inApp || {}) },
      push: { ...current.push, ...(patch.push || {}) },
    };

    // Normalise digest value
    if (
      next.email.digest !== "off" &&
      next.email.digest !== "daily" &&
      next.email.digest !== "weekly"
    ) {
      next.email.digest = "daily";
    }

    await this.prisma.user.update({
      where: { id: userId },
      // Prisma.InputJsonValue : sérialisation directe des préférences typées.
      data: {
        notificationPreferences: next as unknown as Prisma.InputJsonValue,
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
      if (!raw) return true; // no prefs yet → default-allow (backward compat)

      const prefs = this.mergeWithDefaults(raw);
      if (channel === "push") {
        if (category === "documents") return false; // documents never in push matrix
        // PushChannelPrefs has all keys except 'documents' — typed indexing.
        return Boolean(
          (prefs.push as Record<NotificationCategory, boolean>)[category],
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
   */
  async getDigestFrequency(userId: string): Promise<DigestFrequency> {
    const prefs = await this.get(userId);
    return prefs.email.digest;
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
