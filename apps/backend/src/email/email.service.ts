import { Injectable, Logger, Optional } from "@nestjs/common";
import { EmailRenderService, EmailLocale } from "./email-render.service";

/**
 * Wave G — Email Service.
 *
 * Service unifi&eacute; pour l'envoi de notifications mail bas&eacute; sur les templates
 * MJML d&eacute;finis dans `src/email/templates/`. Concentre :
 *   - r&eacute;solution du template (via EmailRenderService)
 *   - envoi SMTP (nodemailer) avec retry exponentiel
 *   - logging structur&eacute; JSON (sans PII complet, RGPD-friendly)
 *   - hook BullMQ optionnel (si une queue 'email' est inject&eacute;e)
 *
 * NB : ce service ne remplace pas `NotificationsService.sendEmailNotification`
 * historique (qui utilise des templates HTML inline) ; il offre une voie
 * progressive pour migrer chaque type de notification vers MJML sans casser
 * l'existant. Voir `docs/architecture/EMAIL_TEMPLATES.md`.
 */

export interface SendEmailOptions {
  /** Pi&egrave;ces jointes nodemailer (rare en notification) */
  attachments?: Array<{ filename: string; content: Buffer | string }>;
  /** Locale du template (fr|en) */
  locale?: EmailLocale;
  /** Sujet override (sinon extrait du template) */
  subject?: string;
  /** Si true, le retry est d&eacute;sactiv&eacute; (utile pour les test sends admin) */
  noRetry?: boolean;
  /** Tag pour le logging structur&eacute; (ex : "digest", "ticket", "security") */
  category?: string;
  /** Op&eacute;ration ID pour corr&eacute;lation logs (optionnel) */
  correlationId?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  attempts: number;
  durationMs: number;
  error?: string;
  /** Log structur&eacute; JSON-friendly (sera &eacute;crit dans logger.log) */
  log: Record<string, unknown>;
}

/** Backoff exponentiel : 1s, 3s, 9s par d&eacute;faut */
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000, 9000];

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly renderService: EmailRenderService,
    @Optional() private readonly emailQueue?: any,
  ) {}

  /**
   * Envoie une notification mail bas&eacute;e sur un template MJML.
   *
   * Si une queue BullMQ est inject&eacute;e, l'envoi est d&eacute;l&eacute;gu&eacute; via la queue
   * (jobName: "send-template", data: { to, template, vars, options }).
   * Sinon envoi synchrone direct.
   */
  async sendNotification(
    to: string,
    template: string,
    vars: Record<string, any> = {},
    options: SendEmailOptions = {},
  ): Promise<EmailSendResult> {
    if (this.emailQueue && !options.noRetry) {
      try {
        await this.emailQueue.add(
          "send-template",
          { to, template, vars, options },
          {
            attempts: 4,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
        this.logStructured({
          event: "email.queued",
          template,
          category: options.category,
          toDomain: this.extractDomain(to),
          correlationId: options.correlationId,
        });
        return {
          success: true,
          attempts: 0,
          durationMs: 0,
          log: { queued: true, template },
        };
      } catch (err) {
        this.logger.warn(
          `Queue add failed, falling back to direct send: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return this.sendDirect(to, template, vars, options);
  }

  /**
   * Envoi direct (synchrone) avec retry int&eacute;gr&eacute;.
   * Expos&eacute; pour les workers BullMQ et les tests admin.
   */
  async sendDirect(
    to: string,
    template: string,
    vars: Record<string, any> = {},
    options: SendEmailOptions = {},
  ): Promise<EmailSendResult> {
    const start = Date.now();
    const correlationId = options.correlationId || this.genCorrelationId();
    // En mode noRetry on ne lance qu'une seule tentative (zéro délai).
    const retryDelays = options.noRetry ? [] : DEFAULT_RETRY_DELAYS_MS;
    let lastError: Error | undefined;

    // 1. Render template
    let rendered;
    try {
      rendered = await this.renderService.render(template, vars, {
        locale: options.locale,
        subjectOverride: options.subject,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logStructured({
        event: "email.render_failed",
        template,
        toDomain: this.extractDomain(to),
        correlationId,
        error: msg,
      });
      return {
        success: false,
        attempts: 0,
        durationMs: Date.now() - start,
        error: msg,
        log: { event: "render_failed", template, error: msg },
      };
    }

    // 2. Tenter l'envoi avec retry
    for (let attempt = 1; attempt <= retryDelays.length + 1; attempt++) {
      try {
        const messageId = await this.sendViaSmtp(to, rendered, options);
        const durationMs = Date.now() - start;
        const log = {
          event: "email.sent",
          template,
          category: options.category,
          toDomain: this.extractDomain(to),
          correlationId,
          attempt,
          messageId,
          durationMs,
          locale: options.locale ?? "fr",
        };
        this.logStructured(log);
        return {
          success: true,
          messageId,
          attempts: attempt,
          durationMs,
          log,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logStructured({
          event: "email.send_attempt_failed",
          template,
          category: options.category,
          toDomain: this.extractDomain(to),
          correlationId,
          attempt,
          error: lastError.message,
        });
        if (attempt <= retryDelays.length) {
          await this.delay(retryDelays[attempt - 1]);
        }
      }
    }

    const durationMs = Date.now() - start;
    const failLog = {
      event: "email.send_failed",
      template,
      category: options.category,
      toDomain: this.extractDomain(to),
      correlationId,
      attempts: retryDelays.length + 1,
      error: lastError?.message,
      durationMs,
    };
    this.logStructured(failLog);
    return {
      success: false,
      attempts: retryDelays.length + 1,
      durationMs,
      error: lastError?.message,
      log: failLog,
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  Internals
  // ──────────────────────────────────────────────────────────────

  /**
   * Envoi SMTP via nodemailer. Si SMTP n'est pas configur&eacute; (env de dev),
   * l&egrave;ve une erreur `no_smtp_configured` (le caller r&eacute;cup&egrave;re success:false
   * mais ne devrait pas faire planter l'app).
   */
  private async sendViaSmtp(
    to: string,
    rendered: { html: string; text: string; subject: string },
    options: SendEmailOptions,
  ): Promise<string> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    if (!smtpHost || smtpHost === "localhost") {
      throw new Error("no_smtp_configured");
    }

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@omnitech-security.fr",
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments: options.attachments,
      headers: {
        "X-OMNITECH-Category": options.category || "notification",
      },
    });

    return info.messageId;
  }

  /**
   * Anonymise l'adresse mail pour les logs : on garde uniquement le domaine
   * (ex : "alice@omnitech-security.fr" → "omnitech-security.fr") afin de
   * permettre l'analyse aggregate sans exposer l'identit&eacute; personnelle (RGPD).
   */
  private extractDomain(email: string): string {
    const at = email.indexOf("@");
    return at < 0 ? "unknown" : email.slice(at + 1).toLowerCase();
  }

  private genCorrelationId(): string {
    return `email-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Log structur&eacute; JSON (sera pris en charge par pino en prod). */
  private logStructured(payload: Record<string, unknown>): void {
    try {
      this.logger.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
    } catch {
      this.logger.log(`email-event ${payload.event}`);
    }
  }
}
