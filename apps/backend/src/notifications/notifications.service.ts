import {
  Injectable,
  NotFoundException,
  Logger,
  Optional,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationType } from "@prisma/client";
import { PushNotificationsService } from "../push-notifications/push-notifications.service";
import { SmsService } from "../sms/sms.service";
import { CacheService } from "../common/cache/cache.service";
import {
  NotificationPreferencesService,
  categoryFromType,
} from "./notification-preferences.service";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string;
  /** Extra metadata for rich email templates */
  metadata?: Record<string, any>;
}

// Notification types that justify a browser push (high-signal events only)
const PUSH_WORTHY_TYPES = new Set<string>([
  "SIGNATURE_NEEDED",
  "DOC_APPROVAL_NEEDED",
  "DOC_REVIEW_NEEDED",
  "REVIEW_OVERDUE",
  "ACK_REQUIRED",
  "EXTERNAL_ACCESS_REVIEW",
  "TICKET_CREATED",
  "TICKET_ASSIGNED",
  "TICKET_UPDATED",
  "TICKET_SLA_BREACH",
  "SECURITY_ALERT",
  "ALERT_CRITICAL",
]);

// Types that ALWAYS send email regardless of user preferences
const EMAIL_ALWAYS_SEND_TYPES = new Set<string>([
  "SECURITY_ALERT",
  "ALERT_CRITICAL",
  "INCIDENT_CREATED",
]);

// Types that users can mute via preferences (referenced by upcoming
// preference-aware mailer logic — kept here as the canonical source list).
const _EMAIL_MUTABLE_TYPES = new Set<string>([
  "DOC_PUBLISHED",
  "DOC_APPROVED",
  "DOC_REJECTED",
  "DOC_REVIEW_NEEDED",
  "DOC_APPROVAL_NEEDED",
  "SIGNATURE_NEEDED",
  "REVIEW_OVERDUE",
  "ACK_REQUIRED",
  "NEWS_POSTED",
  "EXTERNAL_ACCESS_REVIEW",
  "TICKET_CREATED",
  "TICKET_ASSIGNED",
  "TICKET_UPDATED",
  "TICKET_SLA_BREACH",
]);

// ── SEAL / OMNITECH PANTONE colors ──
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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private gateway: any = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly pushService?: PushNotificationsService,
    @Optional() private readonly smsService?: SmsService,
    @Optional()
    private readonly preferencesService?: NotificationPreferencesService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  /** Cache key for the unread badge counter (scoped per user). */
  private unreadCountCacheKey(userId: string): string {
    return `notifications:unread-count:${userId}`;
  }

  /** Best-effort cache invalidation when a user's unread count may have changed. */
  private invalidateUnreadCount(userId: string): void {
    if (!this.cache) return;
    void this.cache.del(this.unreadCountCacheKey(userId));
  }

  setGateway(gateway: any) {
    this.gateway = gateway;
  }

  async create(params: CreateNotificationParams) {
    // Resolve category once — null means the type is not user-mutable
    // (e.g. SECURITY_ALERT, ALERT_CRITICAL) and will bypass preferences.
    const category = categoryFromType(params.type as string);
    const typeStr = String(params.type);
    // Always-send types override user preferences entirely.
    const alwaysSend =
      EMAIL_ALWAYS_SEND_TYPES.has(typeStr) || category === null;

    const [inAppEnabled, emailEnabled, pushEnabled] = alwaysSend
      ? [true, true, true]
      : await Promise.all([
          this.preferencesService
            ? this.preferencesService.isChannelEnabled(
                params.userId,
                "inApp",
                typeStr,
              )
            : Promise.resolve(true),
          this.preferencesService
            ? this.preferencesService.isChannelEnabled(
                params.userId,
                "email",
                typeStr,
              )
            : Promise.resolve(true),
          this.preferencesService
            ? this.preferencesService.isChannelEnabled(
                params.userId,
                "push",
                typeStr,
              )
            : Promise.resolve(true),
        ]);

    // ── In-app (DB row + WebSocket) ──
    // If the user has muted in-app for this category, skip the DB row: no bell,
    // no unread count bump. (Backward compat: if no prefs → inAppEnabled=true.)
    let notification: any = null;
    if (inAppEnabled) {
      notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type as NotificationType,
          title: params.title,
          body: params.body || null,
          resourceType: params.resourceType || null,
          resourceId: params.resourceId || null,
        },
      });
      // Invalidate the recipient's badge counter so the next poll reflects
      // the new unread notification immediately.
      this.invalidateUnreadCount(params.userId);

      if (this.gateway) {
        try {
          this.gateway.sendToUser(params.userId, notification);
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(
            `Failed to send WebSocket notification: ${err.message}`,
          );
        }
      }
    } else {
      this.logger.debug(
        `In-app muted for user ${params.userId}, type ${typeStr}`,
      );
    }

    // ── Email (non-blocking) ──
    if (emailEnabled) {
      this.sendEmailNotification(
        params.userId,
        params.title,
        params.body || "",
        params.resourceType,
        params.resourceId,
        typeStr,
        params.metadata,
      ).catch((err) => {
        this.logger.error(`Email error: ${err}`);
      });
    } else {
      this.logger.debug(
        `Email muted for user ${params.userId}, type ${typeStr}`,
      );
    }

    // ── Browser Push (non-blocking) ──
    if (pushEnabled && this.pushService && PUSH_WORTHY_TYPES.has(typeStr)) {
      const url =
        params.resourceType && params.resourceId
          ? `/${params.resourceType.toLowerCase()}s/${params.resourceId}`
          : "/notifications";
      this.pushService
        .sendToUser(params.userId, {
          title: params.title,
          body: params.body || "",
          icon: "/logo-icon.png",
          tag: `notif-${params.type}`,
          url,
          requireInteraction: [
            "SECURITY_ALERT",
            "ALERT_CRITICAL",
            "REVIEW_OVERDUE",
          ].includes(typeStr),
        })
        .catch((err) =>
          this.logger.warn(
            `Push send failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    // SMS fallback pour les alertes critiques uniquement (si OVH SMS activé)
    // Non-bloquant, silencieux en cas d'échec — always sent for critical alerts
    // regardless of preferences (security requirement).
    if (
      this.smsService &&
      this.smsService.isEnabled() &&
      ["SECURITY_ALERT", "ALERT_CRITICAL"].includes(typeStr)
    ) {
      void this.smsService
        .sendCriticalAlert(params.userId, params.title, params.body || "")
        .catch((err) =>
          this.logger.warn(
            `SMS fallback failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    return notification;
  }

  // ──────────────────────────────────────────────────────────────
  //  Email helpers
  // ──────────────────────────────────────────────────────────────

  private async isEmailMutedForUser(
    userId: string,
    notificationType: string,
  ): Promise<boolean> {
    if (EMAIL_ALWAYS_SEND_TYPES.has(notificationType)) return false;
    try {
      const pref = await this.prisma.appConfig.findFirst({
        where: { key: `user.${userId}.email_muted_types` },
      });
      if (!pref?.value) return false;
      const mutedTypes: string[] = JSON.parse(pref.value);
      return mutedTypes.includes(notificationType);
    } catch {
      return false;
    }
  }

  private async sendEmailNotification(
    userId: string,
    title: string,
    body: string,
    resourceType?: string,
    resourceId?: string,
    notificationType?: string,
    metadata?: Record<string, any>,
  ) {
    try {
      // Check if SMTP is disabled in config
      const smtpEnabled = await this.prisma.appConfig.findFirst({
        where: { key: "smtp.enabled" },
      });
      if (smtpEnabled?.value === "false") return;

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || "587");
      if (!smtpHost || smtpHost === "localhost") return;

      // Check user muting preferences
      if (
        notificationType &&
        (await this.isEmailMutedForUser(userId, notificationType))
      ) {
        this.logger.debug(
          `Email muted for user ${userId}, type ${notificationType}`,
        );
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (!user) return;

      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });

      const appUrl = process.env.APP_URL || "http://localhost:3001";
      const actionUrl =
        resourceType && resourceId
          ? `${appUrl}/${resourceType.toLowerCase()}s/${resourceId}`
          : appUrl;

      const isUrgent = [
        "SIGNATURE_NEEDED",
        "DOC_APPROVAL_NEEDED",
        "REVIEW_OVERDUE",
        "EXTERNAL_ACCESS_REVIEW",
        "SECURITY_ALERT",
        "ALERT_CRITICAL",
        "INCIDENT_CREATED",
      ].includes(notificationType || "");
      const isSecurity = [
        "SECURITY_ALERT",
        "ALERT_CRITICAL",
        "INCIDENT_CREATED",
      ].includes(notificationType || "");

      const contentHtml = this.buildTypeSpecificContent(
        notificationType || "",
        title,
        body,
        actionUrl,
        appUrl,
        user.firstName,
        metadata,
      );

      const html = this.wrapInBaseTemplate(
        contentHtml,
        appUrl,
        user.firstName,
        isUrgent,
        isSecurity,
      );

      await transporter.sendMail({
        from: process.env.SMTP_FROM || "noreply@omnitech-security.fr",
        to: user.email,
        subject: `[OMNITECH] ${isSecurity ? "🚨 " : isUrgent ? "⚠ " : ""}${title}`,
        html,
      });

      this.logger.debug(`Email sent to ${user.email}: ${title}`);
    } catch (err) {
      this.logger.warn(
        `Email send failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Base HTML template wrapper
  // ──────────────────────────────────────────────────────────────

  private wrapInBaseTemplate(
    contentHtml: string,
    appUrl: string,
    firstName: string,
    isUrgent: boolean,
    isSecurity: boolean,
  ): string {
    const headerBg = isSecurity ? COLORS.bordeaux : COLORS.darkBlue;

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Century Gothic','Trebuchet MS','Segoe UI',Arial,sans-serif;background:${COLORS.lightGray};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.lightGray};">
    <tr><td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${COLORS.white};border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header with logo -->
        <tr><td style="background:${headerBg};padding:24px 32px;text-align:center;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:12px;">
              <!--[if !mso]><!-->
              <img src="${appUrl}/logo-email.png" alt="OMNITECH" width="48" height="48" style="display:block;margin:0 auto;border:0;outline:none;" />
              <!--<![endif]-->
              <!--[if mso]>
              <img src="${appUrl}/logo-email.png" alt="OMNITECH" width="48" height="48" style="display:block;margin:0 auto;" />
              <![endif]-->
            </td></tr>
            <tr><td align="center">
              <h1 style="margin:0;color:white;font-size:22px;font-weight:bold;letter-spacing:1px;">OMNITECH Security</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:2px;">GROUPE SFPI</p>
            </td></tr>
          </table>
        </td></tr>
        <!-- SEAL gradient band: bleu -> orange -> bordeaux -->
        <tr><td style="height:4px;padding:0;line-height:0;font-size:0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="width:33%;height:4px;background:${COLORS.blue};"></td>
            <td style="width:34%;height:4px;background:${COLORS.orange};"></td>
            <td style="width:33%;height:4px;background:${COLORS.bordeaux};"></td>
          </tr></table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="color:${COLORS.darkBlue};font-size:14px;margin:0 0 16px;">Bonjour ${firstName},</p>
          ${contentHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f8f9fa;border-top:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <p style="color:#9ca3af;font-size:11px;margin:0;">
                  OMNITECH Security &mdash; Groupe SFPI<br>
                  Contr&ocirc;le d'acc&egrave;s &bull; Hypervision SEAL System &bull; Vid&eacute;osurveillance avanc&eacute;e<br>
                  Saint-M&eacute;dard-en-Jalles
                </p>
              </td>
              <td align="right" valign="top">
                <a href="${appUrl}/profile" style="color:${COLORS.orange};font-size:11px;text-decoration:none;">G&eacute;rer mes notifications</a>
              </td>
            </tr>
          </table>
          <p style="color:#d1d5db;font-size:10px;margin:12px 0 0;text-align:center;">
            Cet email a &eacute;t&eacute; envoy&eacute; par l'intranet OMNITECH Security.<br>
            Pour g&eacute;rer vos pr&eacute;f&eacute;rences de notification, consultez <a href="${appUrl}/profile" style="color:${COLORS.blue};text-decoration:underline;">votre profil</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  // ──────────────────────────────────────────────────────────────
  //  Type-specific email content builders
  // ──────────────────────────────────────────────────────────────

  private buildTypeSpecificContent(
    type: string,
    title: string,
    body: string,
    actionUrl: string,
    appUrl: string,
    firstName: string,
    metadata?: Record<string, any>,
  ): string {
    const meta = metadata || {};

    switch (type) {
      case "DOC_REVIEW_NEEDED":
      case "DOC_APPROVAL_NEEDED":
        return this.buildDocReviewEmail(type, title, body, actionUrl, meta);

      case "DOC_REJECTED":
        return this.buildDocRejectedEmail(title, body, actionUrl, meta);

      case "DOC_APPROVED":
      case "DOC_PUBLISHED":
        return this.buildDocApprovedEmail(type, title, body, actionUrl, meta);

      case "TICKET_CREATED":
      case "TICKET_ASSIGNED":
        return this.buildTicketEmail(type, title, body, actionUrl, meta);

      case "SECURITY_ALERT":
      case "ALERT_CRITICAL":
        return this.buildSecurityAlertEmail(title, body, actionUrl, meta);

      case "INCIDENT_CREATED":
        return this.buildIncidentEmail(title, body, actionUrl, meta);

      case "SIGNATURE_NEEDED":
        return this.buildSignatureEmail(title, body, actionUrl, meta);

      case "ACK_REQUIRED":
        return this.buildAckEmail(title, body, actionUrl, meta);

      case "CERTIFICATE_EXPIRING":
        return this.buildCertificateExpiringEmail(
          title,
          body,
          actionUrl,
          appUrl,
          meta,
        );

      case "QUIZ_REMINDER":
        return this.buildQuizReminderEmail(
          title,
          body,
          actionUrl,
          appUrl,
          meta,
        );

      case "WELCOME_NEW_USER":
        return this.buildWelcomeNewUserEmail(
          title,
          body,
          appUrl,
          firstName,
          meta,
        );

      case "DAILY_SUMMARY":
        return this.buildDailySummaryEmail(title, body, appUrl, meta);

      default:
        return this.buildGenericEmail(title, body, actionUrl, type);
    }
  }

  /** Badge helper */
  private badge(label: string, bgColor: string, textColor = "#ffffff"): string {
    return `<span style="display:inline-block;background:${bgColor};color:${textColor};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:bold;letter-spacing:0.5px;">${label}</span>`;
  }

  /** Action button with Outlook-compatible hover via VML fallback */
  private actionButton(
    label: string,
    url: string,
    color: string = COLORS.orange,
  ): string {
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td align="center">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" strokecolor="${color}" fillcolor="${color}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:'Century Gothic','Trebuchet MS','Segoe UI',Arial,sans-serif;font-size:14px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${url}" style="display:inline-block;background:${color};color:${COLORS.white};padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;letter-spacing:0.5px;mso-hide:all;">${label}</a>
        <!--<![endif]-->
      </td></tr>
    </table>`;
  }

  /** Info row for metadata tables */
  private infoRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:6px 12px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #f3f4f6;width:140px;">${label}</td>
      <td style="padding:6px 12px;color:#374151;font-size:13px;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`;
  }

  /** Section separator */
  private sectionSeparator(): string {
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
      <tr>
        <td style="border-bottom:1px solid #e5e7eb;font-size:0;line-height:0;height:1px;">&nbsp;</td>
      </tr>
    </table>`;
  }

  /** Urgent action banner */
  private urgentBanner(text: string): string {
    return `<div style="background:#fef2f2;border-left:4px solid ${COLORS.red};padding:12px 16px;margin-bottom:20px;border-radius:4px;">
      <strong style="color:${COLORS.red};">&#9888; Action requise</strong>
      <p style="color:#991b1b;font-size:13px;margin:4px 0 0;">${text}</p>
    </div>`;
  }

  // ── DOC_REVIEW_NEEDED / DOC_APPROVAL_NEEDED ──

  private buildDocReviewEmail(
    type: string,
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    const isApproval = type === "DOC_APPROVAL_NEEDED";
    const classificationColors: Record<string, string> = {
      PUBLIC: COLORS.green,
      INTERNE: COLORS.blue,
      CONFIDENTIEL: COLORS.orange,
      CONFIDENTIEL_DEFENSE: COLORS.bordeaux,
      SECRET: COLORS.red,
    };
    const classifColor =
      classificationColors[meta.classification] || COLORS.blue;
    const classifBadge = meta.classification
      ? this.badge(meta.classification, classifColor)
      : "";
    const deadlineRow = meta.deadline
      ? this.infoRow("Date limite", meta.deadline)
      : "";

    return `
      ${this.urgentBanner(isApproval ? "Ce document attend votre approbation." : "Ce document attend votre revue dans les meilleurs d&eacute;lais.")}
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.documentTitle ? this.infoRow("Document", meta.documentTitle) : ""}
        ${meta.reference ? this.infoRow("R&eacute;f&eacute;rence", meta.reference) : ""}
        ${meta.classification ? this.infoRow("Classification", classifBadge) : ""}
        ${meta.requester ? this.infoRow("Demandeur", meta.requester) : ""}
        ${deadlineRow}
      </table>
      ${this.actionButton(isApproval ? "Approuver / Rejeter" : "Commencer la revue", actionUrl, COLORS.blue)}`;
  }

  // ── DOC_REJECTED ──

  private buildDocRejectedEmail(
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    const reasons = meta.rejectionReasons as string[] | undefined;
    const reasonsList =
      reasons && reasons.length > 0
        ? `<ul style="margin:8px 0 16px;padding-left:20px;color:#555;font-size:13px;line-height:1.8;">${reasons.map((r: string) => `<li>${r}</li>`).join("")}</ul>`
        : "";

    return `
      <div style="background:#fef2f2;border-left:4px solid ${COLORS.bordeaux};padding:12px 16px;margin-bottom:20px;border-radius:4px;">
        <strong style="color:${COLORS.bordeaux};">Document refus&eacute;</strong>
        <p style="color:#991b1b;font-size:13px;margin:4px 0 0;">Votre document n&eacute;cessite des modifications avant d'&ecirc;tre valid&eacute;.</p>
      </div>
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.documentTitle ? this.infoRow("Document", meta.documentTitle) : ""}
        ${meta.reference ? this.infoRow("R&eacute;f&eacute;rence", meta.reference) : ""}
        ${meta.reviewer ? this.infoRow("R\u00e9viseur", meta.reviewer) : ""}
      </table>
      ${meta.comment ? `<div style="background:#fafafa;border-left:3px solid #d1d5db;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="color:#6b7280;font-size:12px;margin:0 0 4px;font-weight:600;">Commentaire du réviseur :</p><p style="color:#374151;font-size:13px;margin:0;line-height:1.6;">${meta.comment}</p></div>` : ""}
      ${reasons && reasons.length > 0 ? `<p style="color:#6b7280;font-size:12px;margin:0 0 4px;font-weight:600;">Motifs de refus :</p>${reasonsList}` : ""}
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.actionButton("Modifier le document", actionUrl, COLORS.orange)}`;
  }

  // ── DOC_APPROVED / DOC_PUBLISHED ──

  private buildDocApprovedEmail(
    type: string,
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    const isPublished = type === "DOC_PUBLISHED";
    const classificationColors: Record<string, string> = {
      PUBLIC: COLORS.green,
      INTERNE: COLORS.blue,
      CONFIDENTIEL: COLORS.orange,
      CONFIDENTIEL_DEFENSE: COLORS.bordeaux,
      SECRET: COLORS.red,
    };
    const classifColor =
      classificationColors[meta.classification] || COLORS.green;
    const classifBadge = meta.classification
      ? this.badge(meta.classification, classifColor)
      : "";

    return `
      <div style="background:#f0fdf4;border-left:4px solid ${COLORS.green};padding:12px 16px;margin-bottom:20px;border-radius:4px;">
        <strong style="color:${COLORS.green};">${isPublished ? "&#10003; Document publi&eacute;" : "&#10003; Document approuv&eacute;"}</strong>
      </div>
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.documentTitle ? this.infoRow("Document", meta.documentTitle) : ""}
        ${meta.reference ? this.infoRow("R&eacute;f&eacute;rence", meta.reference) : ""}
        ${meta.classification ? this.infoRow("Classification", classifBadge) : ""}
      </table>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.actionButton("Consulter le document", actionUrl, COLORS.green)}`;
  }

  // ── TICKET_CREATED / TICKET_ASSIGNED ──

  private buildTicketEmail(
    type: string,
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    const priorityColors: Record<string, string> = {
      LOW: COLORS.green,
      MEDIUM: COLORS.orange,
      HIGH: COLORS.bordeaux,
      CRITICAL: COLORS.red,
    };
    const prioColor = priorityColors[meta.priority] || COLORS.blue;
    const prioBadge = meta.priority ? this.badge(meta.priority, prioColor) : "";
    const isAssigned = type === "TICKET_ASSIGNED";

    return `
      ${isAssigned ? this.urgentBanner("Un ticket vous a &eacute;t&eacute; assign&eacute;.") : ""}
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.ticketRef ? this.infoRow("R&eacute;f&eacute;rence", `<code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;font-size:12px;">${meta.ticketRef}</code>`) : ""}
        ${meta.priority ? this.infoRow("Priorit&eacute;", prioBadge) : ""}
        ${meta.category ? this.infoRow("Cat&eacute;gorie", meta.category) : ""}
        ${meta.creator ? this.infoRow("Cr&eacute;ateur", meta.creator) : ""}
      </table>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.actionButton("Voir le ticket", actionUrl, COLORS.blue)}`;
  }

  // ── SECURITY_ALERT / ALERT_CRITICAL ──

  private buildSecurityAlertEmail(
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    return `
      <div style="background:#fef2f2;border:2px solid ${COLORS.red};padding:16px 20px;margin-bottom:20px;border-radius:8px;text-align:center;">
        <p style="font-size:28px;margin:0 0 8px;">&#128680;</p>
        <strong style="color:${COLORS.red};font-size:16px;">ALERTE DE S&Eacute;CURIT&Eacute;</strong>
        <p style="color:#991b1b;font-size:13px;margin:8px 0 0;">Cette notification est critique et n&eacute;cessite votre attention imm&eacute;diate.</p>
      </div>
      <h2 style="color:${COLORS.red};font-size:18px;margin:0 0 16px;border-bottom:2px solid ${COLORS.red};padding-bottom:12px;">${title}</h2>
      ${meta.severity ? `<p style="margin:0 0 12px;">${this.badge(meta.severity, meta.severity === "CRITICAL" ? COLORS.red : COLORS.orange)}</p>` : ""}
      <div style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;white-space:pre-line;">${body}</div>
      ${meta.affectedSystems ? `<p style="color:#6b7280;font-size:12px;font-weight:600;margin:0 0 4px;">Syst&egrave;mes affect&eacute;s :</p><p style="color:#374151;font-size:13px;margin:0 0 16px;">${meta.affectedSystems}</p>` : ""}
      ${this.actionButton("Voir l'alerte", actionUrl, COLORS.red)}`;
  }

  // ── INCIDENT_CREATED ──

  private buildIncidentEmail(
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    const severityColors: Record<string, string> = {
      LOW: COLORS.green,
      MEDIUM: COLORS.orange,
      HIGH: COLORS.bordeaux,
      CRITICAL: COLORS.red,
    };
    const sevColor = severityColors[meta.severity] || COLORS.orange;
    const sevBadge = meta.severity ? this.badge(meta.severity, sevColor) : "";

    return `
      <div style="background:#fff7ed;border-left:4px solid ${COLORS.orange};padding:12px 16px;margin-bottom:20px;border-radius:4px;">
        <strong style="color:${COLORS.bordeaux};">&#9888; Nouvel incident signal&eacute;</strong>
      </div>
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.severity ? this.infoRow("S&eacute;v&eacute;rit&eacute;", sevBadge) : ""}
        ${meta.affectedSystems ? this.infoRow("Syst&egrave;mes", meta.affectedSystems) : ""}
      </table>
      <div style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;white-space:pre-line;">${body}</div>
      ${this.actionButton("Voir l'incident", actionUrl, COLORS.bordeaux)}`;
  }

  // ── SIGNATURE_NEEDED ──

  private buildSignatureEmail(
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    return `
      ${this.urgentBanner("Un document attend votre signature.")}
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.documentTitle ? this.infoRow("Document", meta.documentTitle) : ""}
        ${meta.reference ? this.infoRow("R&eacute;f&eacute;rence", meta.reference) : ""}
        ${meta.deadline ? this.infoRow("Date limite", `<strong style="color:${COLORS.red};">${meta.deadline}</strong>`) : ""}
      </table>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${
        meta.docusealUrl
          ? this.actionButton(
              "Signer via DocuSeal",
              meta.docusealUrl,
              COLORS.blue,
            )
          : this.actionButton("Signer le document", actionUrl, COLORS.blue)
      }`;
  }

  // ── ACK_REQUIRED ──

  private buildAckEmail(
    title: string,
    body: string,
    actionUrl: string,
    meta: Record<string, any>,
  ): string {
    return `
      ${this.urgentBanner("Vous devez accuser r&eacute;ception de ce document.")}
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.documentTitle ? this.infoRow("Document", meta.documentTitle) : ""}
        ${meta.reference ? this.infoRow("R&eacute;f&eacute;rence", meta.reference) : ""}
      </table>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.actionButton("Accuser r\u00e9ception", actionUrl, COLORS.green)}`;
  }

  // ── CERTIFICATE_EXPIRING ──

  private buildCertificateExpiringEmail(
    title: string,
    body: string,
    actionUrl: string,
    appUrl: string,
    meta: Record<string, any>,
  ): string {
    const daysLeft = meta.daysLeft ? `${meta.daysLeft} jour(s)` : "";
    const renewUrl = meta.renewUrl || `${appUrl}/formations`;

    return `
      <div style="background:#fff7ed;border-left:4px solid ${COLORS.orange};padding:12px 16px;margin-bottom:20px;border-radius:4px;">
        <strong style="color:${COLORS.orange};">&#9888; Certificat bient&ocirc;t expir&eacute;</strong>
        <p style="color:#92400e;font-size:13px;margin:4px 0 0;">Un de vos certificats arrive &agrave; expiration${daysLeft ? ` dans ${daysLeft}` : ""}.</p>
      </div>
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.formationName ? this.infoRow("Formation", meta.formationName) : ""}
        ${meta.certificateName ? this.infoRow("Certificat", meta.certificateName) : ""}
        ${meta.expirationDate ? this.infoRow("Expiration", `<strong style="color:${COLORS.red};">${meta.expirationDate}</strong>`) : ""}
        ${daysLeft ? this.infoRow("D&eacute;lai", daysLeft) : ""}
      </table>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.sectionSeparator()}
      ${this.actionButton("Renouveler le certificat", renewUrl, COLORS.orange)}`;
  }

  // ── QUIZ_REMINDER ──

  private buildQuizReminderEmail(
    title: string,
    body: string,
    actionUrl: string,
    appUrl: string,
    meta: Record<string, any>,
  ): string {
    const quizUrl = meta.quizUrl || actionUrl || `${appUrl}/quiz`;
    const previousScore =
      meta.previousScore !== undefined && meta.previousScore !== null
        ? `<p style="color:#6b7280;font-size:13px;margin:0 0 16px;">Votre score pr&eacute;c&eacute;dent : <strong style="color:${COLORS.blue};">${meta.previousScore}%</strong></p>`
        : "";

    return `
      <div style="background:#eff6ff;border-left:4px solid ${COLORS.blue};padding:12px 16px;margin-bottom:20px;border-radius:4px;">
        <strong style="color:${COLORS.blue};">&#128221; Rappel &mdash; Quiz s&eacute;curit&eacute;</strong>
        <p style="color:#1e40af;font-size:13px;margin:4px 0 0;">Vous avez un quiz de s&eacute;curit&eacute; en attente.</p>
      </div>
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${meta.quizTitle ? this.infoRow("Quiz", meta.quizTitle) : ""}
        ${meta.deadline ? this.infoRow("Date limite", meta.deadline) : ""}
        ${meta.duration ? this.infoRow("Dur&eacute;e estim&eacute;e", meta.duration) : ""}
      </table>
      ${previousScore}
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.sectionSeparator()}
      ${this.actionButton("Commencer le quiz", quizUrl, COLORS.blue)}`;
  }

  // ── WELCOME_NEW_USER ──

  private buildWelcomeNewUserEmail(
    title: string,
    body: string,
    appUrl: string,
    firstName: string,
    meta: Record<string, any>,
  ): string {
    const wikiUrl = meta.wikiUrl || `${appUrl}/wiki`;
    const profileUrl = meta.profileUrl || `${appUrl}/profile`;
    const helpdeskUrl = meta.helpdeskUrl || `${appUrl}/helpdesk`;

    const linkRow = (label: string, url: string, description: string): string =>
      `<tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">
          <a href="${url}" style="color:${COLORS.blue};font-size:14px;font-weight:600;text-decoration:none;">${label}</a>
          <p style="color:#6b7280;font-size:12px;margin:4px 0 0;">${description}</p>
        </td>
      </tr>`;

    return `
      <div style="background:#f0fdf4;border-left:4px solid ${COLORS.green};padding:12px 16px;margin-bottom:20px;border-radius:4px;">
        <strong style="color:${COLORS.green};">&#127881; Bienvenue chez OMNITECH Security !</strong>
      </div>
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Bonjour ${firstName}, bienvenue dans l'&eacute;quipe ! Voici les liens essentiels pour bien d&eacute;marrer :
      </p>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.sectionSeparator()}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        ${linkRow("Wiki interne", wikiUrl, "Documentation, proc&eacute;dures et guides")}
        ${linkRow("Mon profil", profileUrl, "Compl&eacute;tez vos informations et pr&eacute;f&eacute;rences")}
        ${linkRow("Helpdesk", helpdeskUrl, "Besoin d'aide ? Ouvrez un ticket")}
      </table>
      ${this.actionButton("Acc&eacute;der &agrave; l'intranet", appUrl, COLORS.green)}`;
  }

  // ── DAILY_SUMMARY ──

  private buildDailySummaryEmail(
    title: string,
    body: string,
    appUrl: string,
    meta: Record<string, any>,
  ): string {
    const openTickets = meta.openTickets ?? 0;
    const pendingDocs = meta.pendingDocs ?? 0;
    const activeAlerts = meta.activeAlerts ?? 0;

    const statCell = (value: number, label: string, color: string): string =>
      `<td align="center" style="padding:16px 8px;">
        <p style="font-size:28px;font-weight:bold;color:${color};margin:0;">${value}</p>
        <p style="font-size:11px;color:#6b7280;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">${label}</p>
      </td>`;

    return `
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">Voici votre r&eacute;sum&eacute; du jour :</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;margin-bottom:16px;">
        <tr>
          ${statCell(openTickets, "Tickets ouverts", COLORS.blue)}
          ${statCell(pendingDocs, "Docs en attente", COLORS.orange)}
          ${statCell(activeAlerts, "Alertes actives", activeAlerts > 0 ? COLORS.red : COLORS.green)}
        </tr>
      </table>
      ${body ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">${body}</p>` : ""}
      ${this.sectionSeparator()}
      ${this.actionButton("Voir le tableau de bord", `${appUrl}/dashboard`, COLORS.blue)}`;
  }

  // ── Generic fallback ──

  private buildGenericEmail(
    title: string,
    body: string,
    actionUrl: string,
    type: string,
  ): string {
    const isUrgent = ["REVIEW_OVERDUE", "EXTERNAL_ACCESS_REVIEW"].includes(
      type,
    );
    const actionLabels: Record<string, string> = {
      REVIEW_OVERDUE: "Voir le document",
      NEWS_POSTED: "Lire l'article",
      EXTERNAL_ACCESS_REVIEW: "R&eacute;viser les acc&egrave;s",
    };
    const actionLabel = actionLabels[type] || "Voir dans l'intranet";

    return `
      ${isUrgent ? this.urgentBanner("Cette notification n&eacute;cessite une action de votre part dans les meilleurs d&eacute;lais.") : ""}
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px;">${title}</h2>
      <div style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;white-space:pre-line;">${body}</div>
      ${this.actionButton(actionLabel, actionUrl, isUrgent ? COLORS.red : COLORS.orange)}`;
  }

  // ──────────────────────────────────────────────────────────────
  //  Test email (SUPER_ADMIN only)
  // ──────────────────────────────────────────────────────────────

  async sendTestEmail(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user) {
      return { success: false, message: "User not found" };
    }

    const appUrl = process.env.APP_URL || "http://localhost:3001";
    const contentHtml = this.buildTypeSpecificContent(
      "WELCOME_NEW_USER",
      "Email de test OMNITECH",
      "Ceci est un email de test envoy\u00e9 depuis l'intranet. Si vous le recevez, la configuration SMTP est fonctionnelle.",
      appUrl,
      appUrl,
      user.firstName,
      {
        wikiUrl: `${appUrl}/wiki`,
        profileUrl: `${appUrl}/profile`,
        helpdeskUrl: `${appUrl}/helpdesk`,
      },
    );
    const html = this.wrapInBaseTemplate(
      contentHtml,
      appUrl,
      user.firstName,
      false,
      false,
    );

    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || "587");
      if (!smtpHost || smtpHost === "localhost") {
        return {
          success: false,
          message: "SMTP not configured (SMTP_HOST missing or localhost)",
        };
      }

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
        subject: "[OMNITECH] Email de test",
        html,
      });

      this.logger.log(`Test email sent to ${user.email}`);
      return { success: true, message: `Test email sent to ${user.email}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Test email failed: ${msg}`);
      return { success: false, message: `SMTP error: ${msg}` };
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Daily Digest
  // ──────────────────────────────────────────────────────────────

  @Cron("0 8 * * 1-5")
  async handleDailyDigestCron() {
    this.logger.log("Running daily email digest cron...");
    try {
      const today = new Date();
      const isMonday = today.getDay() === 1;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Find all active users with unread notifications in the window.
      // Weekly digest users are included only on Mondays.
      const usersWithUnread = await this.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          notifications: {
            some: { isRead: false, createdAt: { gte: sevenDaysAgo } },
          },
        },
        select: { id: true },
      });

      let sent = 0;
      let skippedByPref = 0;
      for (const u of usersWithUnread) {
        try {
          // Check digest frequency — 'off' skips, 'weekly' only on Mondays, 'daily' always.
          let freq: "off" | "daily" | "weekly" = "daily";
          if (this.preferencesService) {
            freq = await this.preferencesService.getDigestFrequency(u.id);
          }
          if (freq === "off") {
            skippedByPref++;
            continue;
          }
          if (freq === "weekly" && !isMonday) {
            skippedByPref++;
            continue;
          }

          const windowStart = freq === "weekly" ? sevenDaysAgo : oneDayAgo;
          await this.sendDailyDigest(u.id, windowStart);
          sent++;
        } catch (err) {
          this.logger.warn(
            `Digest failed for ${u.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      this.logger.log(
        `Daily digest sent to ${sent}/${usersWithUnread.length} users (skipped by pref: ${skippedByPref})`,
      );
    } catch (err) {
      this.logger.error(
        `Daily digest cron error: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async sendDailyDigest(userId: string, windowStart?: Date) {
    const smtpEnabled = await this.prisma.appConfig.findFirst({
      where: { key: "smtp.enabled" },
    });
    if (smtpEnabled?.value === "false") return;

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587");
    if (!smtpHost || smtpHost === "localhost") return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user) return;

    const since = windowStart || new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [unreadNotifs, totalUnread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, isRead: false, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false, createdAt: { gte: since } },
      }),
    ]);

    if (totalUnread === 0) return;

    const appUrl = process.env.APP_URL || "http://localhost:3001";

    const notifRows = unreadNotifs
      .map((n) => {
        const link =
          n.resourceType && n.resourceId
            ? `${appUrl}/${n.resourceType.toLowerCase()}s/${n.resourceId}`
            : `${appUrl}/notifications`;
        const typeColors: Record<string, string> = {
          SECURITY_ALERT: COLORS.red,
          ALERT_CRITICAL: COLORS.red,
          INCIDENT_CREATED: COLORS.bordeaux,
          DOC_APPROVAL_NEEDED: COLORS.orange,
          DOC_REVIEW_NEEDED: COLORS.orange,
          SIGNATURE_NEEDED: COLORS.blue,
          TICKET_CREATED: COLORS.blue,
          TICKET_ASSIGNED: COLORS.blue,
        };
        const dotColor = typeColors[n.type] || "#9ca3af";
        const time = new Date(n.createdAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;width:8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};"></span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;"><a href="${link}" style="color:${COLORS.darkBlue};text-decoration:none;font-size:13px;font-weight:500;">${n.title}</a><br><span style="color:#9ca3af;font-size:11px;">${time}</span></td>
      </tr>`;
      })
      .join("");

    const moreText =
      totalUnread > 10
        ? `<p style="text-align:center;color:#6b7280;font-size:12px;margin:12px 0 0;">... et ${totalUnread - 10} autre(s) notification(s)</p>`
        : "";

    const contentHtml = `
      <h2 style="color:${COLORS.darkBlue};font-size:18px;margin:0 0 8px;">R&eacute;sum&eacute; quotidien</h2>
      <p style="color:#555;font-size:14px;margin:0 0 20px;">Vous avez <strong>${totalUnread}</strong> notification${totalUnread > 1 ? "s" : ""} non lue${totalUnread > 1 ? "s" : ""} depuis hier.</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;">
        ${notifRows}
      </table>
      ${moreText}
      ${this.actionButton("Voir toutes mes notifications", `${appUrl}/notifications`, COLORS.blue)}`;

    const html = this.wrapInBaseTemplate(
      contentHtml,
      appUrl,
      user.firstName,
      false,
      false,
    );

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
      subject: `[OMNITECH] Votre r\u00e9sum\u00e9 : ${totalUnread} notification${totalUnread > 1 ? "s" : ""} non lue${totalUnread > 1 ? "s" : ""}`,
      html,
    });

    this.logger.debug(
      `Daily digest sent to ${user.email}: ${totalUnread} unread`,
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Existing CRUD methods
  // ──────────────────────────────────────────────────────────────

  async findByUser(
    userId: string,
    pagination: { page?: number; limit?: number },
  ) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;

    const where = { userId };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    this.invalidateUnreadCount(userId);
    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    this.invalidateUnreadCount(userId);
    return { updated: result.count };
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Cached 30s per-user — invalidated on create/markAsRead/markAllAsRead.
    // The badge is polled by every authenticated tab in the frontend, so
    // this is one of the hottest paths in the app.
    if (!this.cache) {
      return this.prisma.notification.count({
        where: { userId, isRead: false },
      });
    }
    return this.cache.wrap(this.unreadCountCacheKey(userId), 30, () =>
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    );
  }

  /**
   * Send a notification to all users matching criteria (role, department, or all active)
   */
  async broadcast(params: {
    type: NotificationType | string;
    title: string;
    body?: string;
    resourceType?: string;
    resourceId?: string;
    targetRole?: string;
    targetDepartmentId?: string;
    metadata?: Record<string, any>;
  }) {
    const where: any = { isActive: true, deletedAt: null };
    if (params.targetRole) where.role = params.targetRole;
    if (params.targetDepartmentId)
      where.departmentId = params.targetDepartmentId;

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });

    let sent = 0;
    for (const u of users) {
      try {
        await this.create({
          userId: u.id,
          type: params.type,
          title: params.title,
          body: params.body,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          metadata: params.metadata,
        });
        sent++;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Failed to send notification to user ${u.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Broadcast notification: "${params.title}" → ${sent}/${users.length} users`,
    );
    return { sent, total: users.length };
  }
}
