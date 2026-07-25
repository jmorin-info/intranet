import { Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Notification } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  NotificationPreferencesService,
  type DigestFrequency as JsonDigestFrequency,
} from "./notification-preferences.service";

/**
 * Forme acceptée en entrée des helpers internes : on tolère à la fois la valeur
 * legacy JSON ("off"|"daily"|"weekly") et l'enum Prisma ("NONE"|"DAILY"|"WEEKLY").
 * `sendUserDigest` est en effet appelé soit par le cron (qui passe l'enum), soit
 * potentiellement par un endpoint admin (qui pourrait passer la legacy).
 */
type DigestFrequencyInput = JsonDigestFrequency | "NONE" | "DAILY" | "WEEKLY";

/**
 * Module bucket: regroupement des notifications dans le digest email.
 * Mappe `Notification.resourceType` (libre) ou `type` (enum) vers une famille
 * lisible côté utilisateur final.
 */
export type DigestModule =
  | "documents"
  | "tickets"
  | "wiki"
  | "news"
  | "incidents"
  | "signatures"
  | "mentions"
  | "veille"
  | "other";

/** Charte graphique SEAL — couleurs PANTONE officielles */
const COLORS = {
  orange: "#F9964A",
  blue: "#296DC1",
  green: "#006233",
  bordeaux: "#892034",
  darkBlue: "#004469",
  red: "#dc2626",
  lightGray: "#f4f5f7",
  white: "#ffffff",
} as const;

/** Mapping module → couleur SEAL. Utilisé pour les puces dans l'email. */
const MODULE_COLORS: Record<DigestModule, string> = {
  documents: COLORS.blue,
  tickets: COLORS.orange,
  wiki: COLORS.darkBlue,
  news: COLORS.green,
  incidents: COLORS.bordeaux,
  signatures: COLORS.blue,
  mentions: COLORS.orange,
  veille: COLORS.bordeaux,
  other: "#6b7280",
};

const MODULE_LABELS: Record<DigestModule, string> = {
  documents: "Documents",
  tickets: "Tickets",
  wiki: "Wiki",
  news: "Actualités",
  incidents: "Incidents",
  signatures: "Signatures",
  mentions: "Mentions",
  veille: "Veille cyber",
  other: "Autres",
};

/** Ordre d'affichage des sections dans le digest. */
const MODULE_ORDER: DigestModule[] = [
  "incidents",
  "veille",
  "signatures",
  "documents",
  "tickets",
  "wiki",
  "news",
  "mentions",
  "other",
];

/**
 * Mappe un Notification (type + resourceType) sur un bucket module.
 * - Priorité au resourceType s'il match wiki/news (modules sans NotificationType dédié).
 * - Sinon dispatch via le préfixe du type d'enum.
 */
export function moduleFromNotification(notif: {
  type: string;
  resourceType?: string | null;
}): DigestModule {
  const rt = (notif.resourceType || "").toUpperCase();
  if (rt === "WIKI" || rt === "WIKIPAGE") return "wiki";
  if (rt === "NEWS" || rt === "NEWSPOST") return "news";
  // Veille cyber : via le resourceType (couvre aussi les notifs legacy
  // DOC_PUBLISHED émises avant les types VEILLE_*) ou le type dédié.
  if (rt === "VEILLEITEM" || rt === "VEILLEBULLETIN") return "veille";

  const t = String(notif.type).toUpperCase();
  if (t.startsWith("VEILLE_")) return "veille";
  if (t.startsWith("INCIDENT_")) return "incidents";
  if (t.startsWith("SIGNATURE_")) return "signatures";
  if (t === "MENTION" || t.endsWith("_MENTION")) return "mentions";
  if (t.startsWith("DOC_") || t === "ACK_REQUIRED" || t === "REVIEW_OVERDUE")
    return "documents";
  if (t.startsWith("TICKET_")) return "tickets";
  if (t === "NEWS_POSTED") return "news";
  return "other";
}

/**
 * Groupe une liste de notifications par module, en conservant l'ordre interne
 * (les plus récentes en premier — l'appelant doit déjà avoir trié desc).
 */
export function groupByModule(
  notifs: Array<Pick<Notification, "type" | "resourceType"> & Notification>,
): Record<DigestModule, Notification[]> {
  const groups: Record<DigestModule, Notification[]> = {
    incidents: [],
    veille: [],
    signatures: [],
    documents: [],
    tickets: [],
    wiki: [],
    news: [],
    mentions: [],
    other: [],
  };
  for (const n of notifs) {
    const bucket = moduleFromNotification(n);
    groups[bucket].push(n);
  }
  return groups;
}

/**
 * Service dédié à l'envoi des digests email (item 13 de la roadmap Vague A v1.1).
 *
 * Architecture :
 *   - Daily : tous les jours à 8h locale, agrège les notifications non-lues
 *     des dernières 24h pour les users opt-in DAILY.
 *   - Weekly : le lundi à 8h, agrège les 7 derniers jours pour les opt-in WEEKLY.
 *   - Skip silencieux si l'utilisateur a opt-out (digestFrequency=NONE), si
 *     l'utilisateur n'a aucune notification non-lue dans la fenêtre, ou si
 *     SMTP n'est pas configuré.
 *
 * La source de vérité de la fréquence est `User.digestFrequency` (enum Postgres
 * typé, ajouté par la migration 20260427_notification_digest_frequency). Le JSON
 * `notificationPreferences.email.digest` est conservé pour rétrocompat de
 * l'API et synchronisé par `NotificationPreferencesService` à chaque update.
 *
 * Logs structurés : chaque envoi log `{userId, frequency, notificationsCount, sentAt}`
 * pour audit ISO 27001 (A.5.36 monitoring).
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly preferencesService?: NotificationPreferencesService,
  ) {}

  /**
   * Cron principal : tous les jours à 08:00 (timezone serveur).
   * - Tous les jours → traite les opt-in DAILY (fenêtre 24h).
   * - Le lundi uniquement → traite aussi les opt-in WEEKLY (fenêtre 7 jours).
   *
   * Note sur la frequency cron : "0 8 * * *" déclenche tous les jours à 8h
   * (incluant week-end). Le précédent code utilisait "0 8 * * 1-5" qui sautait
   * sam/dim — corrigé conformément à la spec Vague A v1.1.
   */
  @Cron("0 8 * * *")
  async handleDigestCron(): Promise<{ daily: number; weekly: number }> {
    const startedAt = new Date();
    const today = new Date(startedAt);
    const isMonday = today.getDay() === 1;

    this.logger.log(
      `digest cron started (isMonday=${isMonday}, ts=${startedAt.toISOString()})`,
    );

    let daily = 0;
    let weekly = 0;
    try {
      daily = await this.runFrequency("DAILY");
      if (isMonday) {
        weekly = await this.runFrequency("WEEKLY");
      }
    } catch (err) {
      this.logger.error(
        `digest cron failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const durationMs = Date.now() - startedAt.getTime();
    this.logger.log(
      `digest cron completed (daily=${daily}, weekly=${weekly}, durationMs=${durationMs})`,
    );

    return { daily, weekly };
  }

  /**
   * Boucle d'envoi pour une fréquence donnée. Utilisée par le cron + tests.
   * Retourne le nombre de digests effectivement envoyés.
   */
  async runFrequency(frequency: "DAILY" | "WEEKLY"): Promise<number> {
    const windowMs =
      frequency === "WEEKLY" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);

    // Cible : users actifs, opt-in à cette fréquence, ayant ≥ 1 notif non-lue
    // dans la fenêtre. La sélection passe par la colonne typée
    // `digestFrequency` (indexée) et non plus par le scan JSON.
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        digestFrequency: frequency,
        notifications: {
          some: { isRead: false, createdAt: { gte: since } },
        },
      },
      select: { id: true },
    });

    let sent = 0;
    let skipped = 0;
    for (const u of users) {
      try {
        const ok = await this.sendUserDigest(u.id, frequency, since);
        if (ok) sent++;
        else skipped++;
      } catch (err) {
        this.logger.warn(
          `digest send failed userId=${u.id} frequency=${frequency}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(
      `digest frequency=${frequency} candidates=${users.length} sent=${sent} skipped=${skipped}`,
    );
    return sent;
  }

  /**
   * Envoie le digest pour un user donné dans la fenêtre [since, now].
   * Retourne true si l'email a été envoyé, false en cas de skip (0 notifs,
   * SMTP désactivé, opt-out, etc.).
   */
  async sendUserDigest(
    userId: string,
    frequency: DigestFrequencyInput,
    since: Date,
  ): Promise<boolean> {
    // (a) Garde-fou : double-vérifier la fréquence côté user.
    // Le cron filtre déjà via where.digestFrequency, mais sendUserDigest peut
    // être appelé directement (admin trigger, tests). Si l'utilisateur a opté
    // pour NONE, on skip systématiquement.
    const freqUpper = String(frequency).toUpperCase();
    if (freqUpper === "NONE" || freqUpper === "OFF") {
      this.logSkip(userId, frequency, 0, "opt-out");
      return false;
    }

    // (b) SMTP gate
    const smtpEnabled = await this.prisma.appConfig.findFirst({
      where: { key: "smtp.enabled" },
    });
    if (smtpEnabled?.value === "false") {
      this.logSkip(userId, frequency, 0, "smtp-disabled");
      return false;
    }
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    if (!smtpHost || smtpHost === "localhost") {
      this.logSkip(userId, frequency, 0, "smtp-not-configured");
      return false;
    }

    // (c) User lookup
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user) {
      this.logSkip(userId, frequency, 0, "user-not-found");
      return false;
    }

    // (d) Aggrégation : on prend les 50 dernières non-lues + le total exact
    // (utilisé pour le "+ N autres" en bas de digest).
    const [unreadNotifs, totalUnread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, isRead: false, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false, createdAt: { gte: since } },
      }),
    ]);

    if (totalUnread === 0) {
      this.logSkip(userId, frequency, 0, "no-unread");
      return false;
    }

    const grouped = groupByModule(unreadNotifs);
    const html = this.renderDigestHtml({
      firstName: user.firstName,
      frequency,
      grouped,
      totalUnread,
      shownCount: unreadNotifs.length,
    });

    const isWeekly = String(frequency).toUpperCase() === "WEEKLY";
    const subjectPrefix = isWeekly ? "hebdomadaire" : "quotidien";
    const subject = `[OMNITECH] Résumé ${subjectPrefix} : ${totalUnread} notification${totalUnread > 1 ? "s" : ""} non lue${totalUnread > 1 ? "s" : ""}`;

    // (e) Send via nodemailer (lazy import comme dans NotificationsService)
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@omnitech-security.fr",
      to: user.email,
      subject,
      html,
    });

    // (f) Log structuré pour audit (ISO 27001 A.5.36)
    this.logger.log(
      JSON.stringify({
        event: "digest.sent",
        userId,
        frequency,
        notificationsCount: totalUnread,
        modules: Object.fromEntries(
          (Object.keys(grouped) as DigestModule[]).map((m) => [
            m,
            grouped[m].length,
          ]),
        ),
        sentAt: new Date().toISOString(),
      }),
    );

    return true;
  }

  /** Log structuré JSON pour les digests skippés (audit). */
  private logSkip(
    userId: string,
    frequency: DigestFrequencyInput,
    notificationsCount: number,
    reason: string,
  ): void {
    this.logger.debug(
      JSON.stringify({
        event: "digest.skipped",
        userId,
        frequency,
        notificationsCount,
        reason,
        sentAt: new Date().toISOString(),
      }),
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  HTML rendering
  // ──────────────────────────────────────────────────────────────

  /** Construit le HTML de l'email digest, groupé par module SEAL. */
  renderDigestHtml(params: {
    firstName: string;
    frequency: DigestFrequencyInput;
    grouped: Record<DigestModule, Notification[]>;
    totalUnread: number;
    shownCount: number;
  }): string {
    const { firstName, frequency, grouped, totalUnread, shownCount } = params;
    const isWeekly = String(frequency).toUpperCase() === "WEEKLY";
    const appUrl = process.env.APP_URL || "http://localhost:3001";

    const sections = MODULE_ORDER.filter(
      (m) => (grouped[m] || []).length > 0,
    ).map((m) => this.renderModuleSection(m, grouped[m], appUrl));

    const periodLabel = isWeekly
      ? "des 7 derniers jours"
      : "des dernières 24 heures";

    const moreText =
      totalUnread > shownCount
        ? `<p style="text-align:center;color:#6b7280;font-size:12px;margin:16px 0 0;">... et ${totalUnread - shownCount} autre(s) notification(s) non lue(s).</p>`
        : "";

    const contentHtml = `
      <h2 style="color:${COLORS.darkBlue};font-size:20px;margin:0 0 8px;">
        Résumé ${isWeekly ? "hebdomadaire" : "quotidien"}
      </h2>
      <p style="color:#555;font-size:14px;margin:0 0 24px;">
        Vous avez <strong>${totalUnread}</strong> notification${totalUnread > 1 ? "s" : ""} non lue${totalUnread > 1 ? "s" : ""} ${periodLabel}.
      </p>
      ${sections.join("")}
      ${moreText}
      ${this.renderActionButton(
        "Voir toutes mes notifications",
        `${appUrl}/notifications`,
        COLORS.blue,
      )}
    `;

    return this.wrapInBaseTemplate(contentHtml, appUrl, firstName);
  }

  private renderModuleSection(
    module: DigestModule,
    notifs: Notification[],
    appUrl: string,
  ): string {
    const color = MODULE_COLORS[module];
    const label = MODULE_LABELS[module];

    const rows = notifs
      .slice(0, 10)
      .map((n) => {
        // Les ressources veille n'ont pas de page de détail dédiée : lien
        // vers le module /veille (le pattern générique donnerait /veilleitems/…).
        const isVeille =
          n.resourceType === "VeilleItem" || n.resourceType === "VeilleBulletin";
        const link = isVeille
          ? `${appUrl}/veille`
          : n.resourceType && n.resourceId
            ? `${appUrl}/${n.resourceType.toLowerCase()}s/${n.resourceId}`
            : `${appUrl}/notifications`;
        const time = new Date(n.createdAt).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;width:8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span></td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
            <a href="${link}" style="color:${COLORS.darkBlue};text-decoration:none;font-size:13px;font-weight:500;">${escapeHtml(n.title)}</a>
            <br><span style="color:#9ca3af;font-size:11px;">${time}</span>
          </td>
        </tr>`;
      })
      .join("");

    const overflow =
      notifs.length > 10
        ? `<tr><td colspan="2" style="padding:6px 12px;color:#9ca3af;font-size:11px;font-style:italic;">+ ${notifs.length - 10} autre(s) dans ${label.toLowerCase()}</td></tr>`
        : "";

    return `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0 6px;border-bottom:2px solid ${color};">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;"></span>
          <strong style="color:${color};font-size:14px;letter-spacing:0.5px;text-transform:uppercase;">${label}</strong>
          <span style="color:#9ca3af;font-size:12px;margin-left:8px;">(${notifs.length})</span>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:24px;">
        ${rows}
        ${overflow}
      </table>
    `;
  }

  private renderActionButton(
    label: string,
    url: string,
    color: string,
  ): string {
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td align="center">
        <a href="${url}" style="display:inline-block;background:${color};color:${COLORS.white};padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;letter-spacing:0.5px;">${label}</a>
      </td></tr>
    </table>`;
  }

  /** Wrapper HTML complet (header + footer SEAL). */
  private wrapInBaseTemplate(
    contentHtml: string,
    appUrl: string,
    firstName: string,
  ): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Century Gothic','Trebuchet MS','Segoe UI',Arial,sans-serif;background:${COLORS.lightGray};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.lightGray};">
    <tr><td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${COLORS.white};border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${COLORS.darkBlue};padding:24px 32px;text-align:center;">
          <img src="${appUrl}/logo-email.png" alt="OMNITECH" width="48" height="48" style="display:block;margin:0 auto 12px;border:0;outline:none;" />
          <h1 style="margin:0;color:white;font-size:22px;font-weight:bold;letter-spacing:1px;">OMNITECH Security</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:2px;">GROUPE SFPI</p>
        </td></tr>
        <tr><td style="height:4px;padding:0;line-height:0;font-size:0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="width:33%;height:4px;background:${COLORS.blue};"></td>
            <td style="width:34%;height:4px;background:${COLORS.orange};"></td>
            <td style="width:33%;height:4px;background:${COLORS.bordeaux};"></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:${COLORS.darkBlue};font-size:14px;margin:0 0 16px;">Bonjour ${escapeHtml(firstName)},</p>
          ${contentHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8f9fa;border-top:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <p style="color:#9ca3af;font-size:11px;margin:0;">
                  OMNITECH Security &mdash; Groupe SFPI<br>
                  Saint-M&eacute;dard-en-Jalles
                </p>
              </td>
              <td align="right" valign="top">
                <a href="${appUrl}/profile" style="color:${COLORS.orange};font-size:11px;text-decoration:none;">G&eacute;rer mes notifications</a>
              </td>
            </tr>
          </table>
          <p style="color:#d1d5db;font-size:10px;margin:12px 0 0;text-align:center;">
            Pour modifier la fr&eacute;quence du digest (quotidien, hebdomadaire, d&eacute;sactiv&eacute;),<br>
            consultez vos pr&eacute;f&eacute;rences dans <a href="${appUrl}/profile" style="color:${COLORS.blue};text-decoration:underline;">votre profil</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }
}

/** Échappement HTML basique (titres). */
function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-export for completeness (used by tests).
export const _internal = {
  groupByModule,
  moduleFromNotification,
  MODULE_ORDER,
  MODULE_LABELS,
  MODULE_COLORS,
};

// Cron expression export for test verification (avoid magic strings drift).
export const DIGEST_CRON_EXPR = CronExpression.EVERY_DAY_AT_8AM;
