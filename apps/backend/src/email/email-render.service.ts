import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import sanitizeHtml from "sanitize-html";
import { stripHtmlTags } from "../common/plain-text";

/**
 * Wave G — Email Render Service.
 *
 * Compile des templates MJML enrichis (layout + sections) en HTML inliné
 * compatible Outlook 2016+, Gmail, Apple Mail et iOS Mail. Génère également
 * un fallback texte plain via html-to-text et résout le sujet via la
 * convention `<!-- subject: ... -->` au début du template.
 *
 * Conventions :
 *   - Les templates vivent dans `src/email/templates/<name>.mjml`
 *   - Variables substituées via `{{ variable }}` (mustache-like, pas
 *     d'évaluation de code)
 *   - Inclusions de partials via `{{> partial }}` (résolu depuis
 *     `templates/partials/<name>.mjml`)
 *   - Le sujet par locale est extrait des balises HTML
 *     `<!-- subject:fr ... -->` / `<!-- subject:en ... -->`
 *   - Le layout `_layout.mjml` enveloppe automatiquement chaque template
 *     via `{{> _layout }}`. Un template peut désactiver le wrapping
 *     en mettant `<!-- standalone -->` en première ligne.
 *
 * Charte SEAL : couleurs PANTONE officielles
 *   - Navy   #004469 (header, titres principaux)
 *   - Blue   #296DC1 (CTAs secondaires, liens)
 *   - Bordeaux #892034 (alertes sécurité, urgent)
 *   - Orange #F9964A (CTAs primaires, badges)
 */

export type EmailLocale = "fr" | "en";

export interface RenderedEmail {
  /** HTML complet inliné, prêt à être envoyé */
  html: string;
  /** Fallback texte plain (généré via html-to-text) */
  text: string;
  /** Sujet de l'email pour la locale demandée */
  subject: string;
}

export interface RenderOptions {
  /** Locale du template (défaut : fr) */
  locale?: EmailLocale;
  /** Sujet override (priorité sur le sujet du template) */
  subjectOverride?: string;
}

/** Couleurs SEAL exposées aux templates via {{ colors.* }} */
export const SEAL_COLORS = {
  navy: "#004469",
  blue: "#296DC1",
  bordeaux: "#892034",
  orange: "#F9964A",
  green: "#006233",
  red: "#dc2626",
  lightGray: "#f4f5f7",
  mediumGray: "#9ca3af",
  darkGray: "#374151",
  white: "#ffffff",
} as const;

@Injectable()
export class EmailRenderService {
  private readonly logger = new Logger(EmailRenderService.name);
  private readonly templatesDir: string;
  /** Cache simple template → contenu raw (clé filename) */
  private readonly templateCache = new Map<string, string>();

  constructor() {
    this.templatesDir = path.join(__dirname, "templates");
  }

  /**
   * Liste les templates disponibles (sans extension .mjml ni partials).
   */
  listTemplates(): string[] {
    if (!fs.existsSync(this.templatesDir)) return [];
    return fs
      .readdirSync(this.templatesDir)
      .filter((f) => f.endsWith(".mjml") && !f.startsWith("_"))
      .map((f) => f.replace(/\.mjml$/, ""))
      .sort();
  }

  /**
   * Rend un template MJML en HTML inliné + texte plain.
   *
   * Si MJML n'est pas installé (env minimal), retombe sur un wrapper
   * HTML basique qui interprète quand même les variables — utile pour
   * l'environnement de tests sans la dépendance.
   */
  async render(
    template: string,
    vars: Record<string, any> = {},
    options: RenderOptions = {},
  ): Promise<RenderedEmail> {
    const locale = options.locale ?? "fr";
    const raw = this.loadTemplate(template);

    // 1. Extraire les sujets multi-locale
    const subjects = this.extractSubjects(raw);
    const subject =
      options.subjectOverride ??
      subjects[locale] ??
      subjects.fr ??
      subjects.en ??
      "OMNITECH Security";

    // 2. Détecter le mode standalone
    const standalone = /<!--\s*standalone\s*-->/i.test(raw);

    // 3. Wrap dans le layout si nécessaire.
    //    On utilise un regex tolérant aux espaces pour {{> content }} afin
    //    de ne pas être pénalisé par un éventuel formatage différent.
    let body = this.stripMetadata(raw);
    if (!standalone && template !== "_layout") {
      const layout = this.loadTemplate("_layout");
      body = layout.replace(/\{\{>\s*content\s*\}\}/g, body);
      body = this.stripMetadata(body);
    }

    // 4. Résoudre les partials récursivement (max 8 passes)
    body = this.resolvePartials(body, 8);

    // 5. Substituer les variables (avec couleurs SEAL exposées)
    // POL_015 §7.1 : quand un template embarque `documentClassification` (raw
    // enum DB), on derive automatiquement `classificationLevel` (1..4) +
    // `classificationLabel` (« Niveau X — Libelle ») pour les utiliser dans
    // les sujets et les corps sans dupliquer le mapping a chaque appelant.
    const rawClass = (vars as Record<string, unknown>)?.documentClassification;
    const derived: Record<string, unknown> = {};
    if (typeof rawClass === 'string') {
      const map: Record<string, { level: number; label: string }> = {
        SECRET: { level: 1, label: 'Niveau 1 — Très sensible' },
        CONFIDENTIEL: { level: 2, label: 'Niveau 2 — Sensible' },
        INTERNE: { level: 3, label: 'Niveau 3 — Restreint' },
        PUBLIC: { level: 4, label: 'Niveau 4 — Public' },
      };
      const entry = map[rawClass.toUpperCase()] || map.INTERNE;
      derived.classificationLevel = entry.level;
      derived.classificationLabel = entry.label;
    }
    const allVars = {
      colors: SEAL_COLORS,
      locale,
      currentYear: new Date().getFullYear(),
      ...derived,
      ...vars,
    };
    const mjmlContent = this.substituteVars(body, allVars);

    // 6. Compiler MJML → HTML
    const html = await this.compileMjml(mjmlContent);

    // 7. Générer fallback text
    const text = await this.htmlToText(html);

    return { html, text, subject: this.substituteVars(subject, allVars) };
  }

  /**
   * Helper exposé pour la page admin : renvoie un échantillon HTML preview
   * sans envoyer d'email (et avec données fictives par défaut si non fourni).
   */
  async preview(
    template: string,
    locale: EmailLocale = "fr",
    customVars?: Record<string, any>,
  ): Promise<RenderedEmail> {
    const sampleVars = this.getSampleVars(template);
    return this.render(
      template,
      { ...sampleVars, ...(customVars || {}) },
      { locale },
    );
  }

  /**
   * Données fictives par template (pour preview admin et tests).
   * Centralisé ici pour ne pas disperser les sample data.
   */
  getSampleVars(template: string): Record<string, any> {
    const base = {
      firstName: "Alice",
      lastName: "Martin",
      appUrl: "https://intranet.omnitech-security.fr",
      preferencesUrl:
        "https://intranet.omnitech-security.fr/profile/preferences",
    };
    switch (template) {
      case "digest":
        return {
          ...base,
          period: "quotidien",
          totalCount: 7,
          modules: [
            {
              key: "tickets",
              label: "Tickets",
              color: SEAL_COLORS.orange,
              items: [
                {
                  title: "Ticket #142 assigné",
                  body: "Demande de réinitialisation MDP",
                  url: "#",
                  time: "10:24",
                },
              ],
            },
            {
              key: "documents",
              label: "Documents",
              color: SEAL_COLORS.blue,
              items: [
                {
                  title: "Politique RH publiée",
                  body: "Nouvelle version 2.4 disponible",
                  url: "#",
                  time: "09:15",
                },
              ],
            },
          ],
        };
      case "ticket-assigned":
        return {
          ...base,
          ticketId: "142",
          ticketTitle: "Demande de réinitialisation mot de passe",
          ticketPriority: "Haute",
          ticketCategory: "Compte utilisateur",
          ticketUrl: `${base.appUrl}/helpdesk/tickets/142`,
          assignerName: "Bob Dupont",
        };
      case "ticket-resolved":
        return {
          ...base,
          ticketId: "142",
          ticketTitle: "Demande de réinitialisation mot de passe",
          resolverName: "Charlie IT",
          resolutionSummary:
            "Le mot de passe a été réinitialisé et envoyé par SMS.",
          ticketUrl: `${base.appUrl}/helpdesk/tickets/142`,
        };
      case "ticket-comment":
        return {
          ...base,
          ticketId: "142",
          ticketTitle: "Demande de réinitialisation mot de passe",
          commentAuthor: "Bob Dupont",
          commentExcerpt:
            "Pouvez-vous confirmer que vous avez bien reçu le SMS de réinitialisation ?",
          ticketUrl: `${base.appUrl}/helpdesk/tickets/142`,
        };
      case "mention":
        return {
          ...base,
          authorName: "Bob Dupont",
          contextTitle: "Wiki — Procédure d'astreinte RSSI",
          excerpt:
            "@alice peux-tu valider la section sur l'escalade vers le SOC ?",
          contextUrl: `${base.appUrl}/wiki/proc-astreinte-rssi`,
        };
      case "document-to-sign":
        return {
          ...base,
          documentTitle: "Charte informatique 2026",
          documentClassification: "INTERNE",
          deadline: "15 mai 2026",
          requesterName: "Service RH",
          documentUrl: `${base.appUrl}/signatures/abc123`,
        };
      case "document-approval-request":
        return {
          ...base,
          documentTitle: "Politique de mots de passe v3.1",
          documentClassification: "INTERNE",
          requesterName: "Charlie IT",
          deadline: "30 avril 2026",
          documentUrl: `${base.appUrl}/documents/xyz789/approval`,
        };
      case "security-alert":
        return {
          ...base,
          alertSeverity: "Critique",
          alertTitle: "Tentative de connexion suspecte détectée",
          alertSummary:
            "5 échecs successifs depuis l'IP 203.0.113.42 sur le compte alice@omnitech-security.fr en moins de 60 secondes.",
          detectionTime: "28 avril 2026 — 14:32",
          alertUrl: `${base.appUrl}/admin/security/alerts/42`,
        };
      case "mfa-enforced":
        return {
          ...base,
          enforcementDate: "5 mai 2026",
          mfaSetupUrl: `${base.appUrl}/profile/security/mfa`,
        };
      case "welcome":
        return {
          ...base,
          temporaryPassword: "Bienv3nue!2026",
          firstLoginUrl: `${base.appUrl}/login`,
          managerName: "Bob Dupont",
        };
      case "password-reset":
        return {
          ...base,
          resetUrl: `${base.appUrl}/auth/reset-password?token=abc123def456`,
          requestIp: "192.0.2.10",
          requestTime: "28 avril 2026 — 09:12",
          expirationMinutes: 30,
        };
      case "calendar-sync-failed":
        return {
          ...base,
          calendarProvider: "Google Calendar",
          errorReason: "Token OAuth expiré",
          lastSuccessTime: "27 avril 2026 — 23:45",
          retryUrl: `${base.appUrl}/profile/integrations`,
        };
      default:
        return base;
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Internals
  // ──────────────────────────────────────────────────────────────

  private loadTemplate(name: string): string {
    if (this.templateCache.has(name)) return this.templateCache.get(name)!;
    const filename = `${name}.mjml`;
    const candidates = [
      path.join(this.templatesDir, filename),
      path.join(this.templatesDir, "partials", filename),
    ];
    for (const fullPath of candidates) {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8");
        this.templateCache.set(name, content);
        return content;
      }
    }
    throw new Error(`Email template not found: ${name}`);
  }

  /**
   * Extrait les sujets multi-locale du template.
   * Format attendu (n'importe où dans le fichier, plusieurs fois autorisés) :
   *   <!-- subject:fr Titre français -->
   *   <!-- subject:en English title -->
   */
  private extractSubjects(raw: string): Record<string, string> {
    const subjects: Record<string, string> = {};
    const regex = /<!--\s*subject:(\w+)\s+([\s\S]*?)\s*-->/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      subjects[match[1]] = match[2].trim();
    }
    return subjects;
  }

  /** Retire les métadonnées (subject, standalone) du contenu rendu. */
  private stripMetadata(raw: string): string {
    return raw
      .replace(/<!--\s*subject:\w+[\s\S]*?-->/g, "")
      .replace(/<!--\s*standalone\s*-->/g, "");
  }

  /** Résout récursivement les `{{> partial }}` jusqu'à `maxPasses`. */
  private resolvePartials(content: string, maxPasses: number): string {
    let current = content;
    for (let i = 0; i < maxPasses; i++) {
      const regex = /\{\{>\s*([\w_-]+)\s*\}\}/g;
      if (!regex.test(current)) break;
      regex.lastIndex = 0;
      current = current.replace(regex, (_match, name) => {
        try {
          return this.stripMetadata(this.loadTemplate(name));
        } catch {
          this.logger.warn(`Partial not found: ${name}`);
          return "";
        }
      });
    }
    return current;
  }

  /**
   * Substitution variables mustache-like.
   * Support :
   *   - `{{ var }}` simple (HTML-escapé)
   *   - `{{{ var }}}` simple (sans échappement, raw)
   *   - `{{ obj.path.deep }}` accès imbriqué
   *   - `{{#if var}} ... {{else}} ... {{/if}}`
   *   - `{{#each items}} ... {{/each}}` avec `{{ this }}` ou
   *     `{{ this.field }}` à l'intérieur (supporte nesting via parser
   *     manuel à compteur — un simple regex non-greedy serait cassé sur
   *     les blocs each imbriqués).
   *
   * Volontairement minimaliste (pas d'évaluation arbitraire).
   */
  private substituteVars(content: string, vars: Record<string, any>): string {
    // 1. each blocks (parser balancé pour supporter le nesting)
    let out = this.expandBlocks(content, "each", (path, inner) => {
      const list = this.resolvePath(vars, path);
      if (!Array.isArray(list)) return "";
      return list
        .map((item) =>
          this.substituteVars(inner, { ...vars, this: item, item }),
        )
        .join("");
    });

    // 2. if blocks (parser balancé). On gère un éventuel {{else}} comme
    //    séparateur top-level dans le bloc.
    out = this.expandBlocks(out, "if", (path, inner) => {
      const value = this.resolvePath(vars, path);
      const truthy = Array.isArray(value)
        ? value.length > 0
        : Boolean(value);
      const elseSplit = this.splitOnTopLevelElse(inner);
      const branch = truthy ? elseSplit.ifBranch : elseSplit.elseBranch;
      return this.substituteVars(branch, vars);
    });

    // 3. simple {{ var }} substitution (échappement HTML par défaut, sauf {{{var}}})
    out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_match, varPath) => {
      const value = this.resolvePath(vars, varPath);
      return value === undefined || value === null ? "" : String(value);
    });
    out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, varPath) => {
      const value = this.resolvePath(vars, varPath);
      if (value === undefined || value === null) return "";
      return this.escapeHtml(String(value));
    });

    return out;
  }

  /**
   * Parse les blocs `{{#tag X}} ... {{/tag}}` en tenant compte du
   * nesting. Pour chaque bloc top-level trouvé, appelle `expand(path, inner)`
   * et substitue le bloc complet par le résultat.
   */
  private expandBlocks(
    content: string,
    tag: string,
    expand: (path: string, inner: string) => string,
  ): string {
    const openRegex = new RegExp(`\\{\\{#${tag}\\s+([\\w.]+)\\s*\\}\\}`);
    const closeStr = `{{/${tag}}}`;
    let out = "";
    let cursor = 0;

    while (cursor < content.length) {
      const remaining = content.slice(cursor);
      const openMatch = openRegex.exec(remaining);
      if (!openMatch) {
        out += remaining;
        break;
      }
      // Texte avant l'ouverture
      out += remaining.slice(0, openMatch.index);
      const blockStart = cursor + openMatch.index;
      const innerStart = blockStart + openMatch[0].length;

      // Trouver la fermeture appairée en gérant le nesting
      let depth = 1;
      let scan = innerStart;
      const openTagRegex = new RegExp(`\\{\\{#${tag}[\\s\\}]`, "g");
      while (depth > 0 && scan < content.length) {
        const nextClose = content.indexOf(closeStr, scan);
        if (nextClose === -1) {
          // Pas de fermeture trouvée → on émet le reste tel quel
          out += content.slice(blockStart);
          return out;
        }
        // Compter les ouvertures entre scan et nextClose
        const between = content.slice(scan, nextClose);
        openTagRegex.lastIndex = 0;
        const opens = (between.match(openTagRegex) || []).length;
        depth += opens;
        depth -= 1; // une fermeture trouvée
        if (depth === 0) {
          const inner = content.slice(innerStart, nextClose);
          out += expand(openMatch[1], inner);
          cursor = nextClose + closeStr.length;
          break;
        } else {
          scan = nextClose + closeStr.length;
        }
      }
      if (depth > 0) break;
    }
    return out;
  }

  /**
   * Sépare `inner` sur le `{{else}}` top-level (en ignorant ceux nichés
   * dans des `{{#if}}`/`{{#each}}` imbriqués).
   */
  private splitOnTopLevelElse(inner: string): {
    ifBranch: string;
    elseBranch: string;
  } {
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner.startsWith("{{#if", i) || inner.startsWith("{{#each", i)) {
        depth++;
        i += 4;
        continue;
      }
      if (inner.startsWith("{{/if}}", i) || inner.startsWith("{{/each}}", i)) {
        depth--;
        i += 6;
        continue;
      }
      if (depth === 0 && inner.startsWith("{{else}}", i)) {
        return {
          ifBranch: inner.slice(0, i),
          elseBranch: inner.slice(i + "{{else}}".length),
        };
      }
    }
    return { ifBranch: inner, elseBranch: "" };
  }

  private resolvePath(obj: any, path: string): any {
    const parts = path.split(".");
    let cur = obj;
    for (const part of parts) {
      if (cur == null) return undefined;
      cur = cur[part];
    }
    return cur;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Compile MJML → HTML. Si le module `mjml` n'est pas dispo (test env
   * minimal), retombe sur un passe-plat qui retire les balises mjml
   * superficielles afin que les tests d'intégration puissent quand même
   * vérifier le contenu textuel.
   */
  private async compileMjml(mjmlSource: string): Promise<string> {
    try {
      // Import dynamique : si mjml absent → fallback graceful.
      // MJML 5.x est async, MJML 4.x est sync — on supporte les deux.
      const mjmlModule = await import("mjml");
      const mjml = (mjmlModule as any).default || mjmlModule;
      const raw = mjml(mjmlSource, {
        keepComments: false,
        validationLevel: "soft",
      });
      const result =
        raw && typeof (raw as any).then === "function" ? await raw : raw;
      if (result?.errors && result.errors.length > 0) {
        for (const err of result.errors) {
          this.logger.warn(`MJML warning: ${err.formattedMessage || err}`);
        }
      }
      return result?.html || this.fallbackMjmlToHtml(mjmlSource);
    } catch (err) {
      this.logger.warn(
        `MJML compilation fallback (lib unavailable): ${
          err instanceof Error ? err.message : err
        }`,
      );
      // Fallback : retire balises mjml et conserve le HTML brut.
      return this.fallbackMjmlToHtml(mjmlSource);
    }
  }

  /**
   * Fallback minimal MJML→HTML (sans lib). N'est PAS production-ready :
   * c'est juste pour ne pas casser les tests si mjml n'est pas installé.
   */
  private fallbackMjmlToHtml(mjmlSource: string): string {
    let html = mjmlSource;
    // Convertir balises mjml en équivalents HTML basiques
    html = html.replace(/<\/?mjml[^>]*>/g, "");
    html = html.replace(/<\/?mj-head[^>]*>/g, "");
    html = html.replace(/<\/?mj-body[^>]*>/g, '<div style="font-family:sans-serif;">');
    html = html.replace(/<\/mj-body>/g, "</div>");
    html = html.replace(/<\/?mj-section[^>]*>/g, "<div>");
    html = html.replace(/<\/mj-section>/g, "</div>");
    html = html.replace(/<\/?mj-column[^>]*>/g, "<div>");
    html = html.replace(/<\/mj-column>/g, "</div>");
    html = html.replace(/<\/?mj-text[^>]*>/g, "<p>");
    html = html.replace(/<\/mj-text>/g, "</p>");
    html = html.replace(
      /<mj-button[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/mj-button>/g,
      '<a href="$1" style="display:inline-block;padding:12px 24px;background:#F9964A;color:#fff;text-decoration:none;border-radius:6px;">$2</a>',
    );
    html = html.replace(/<\/?mj-divider[^>]*>/g, "<hr/>");
    html = html.replace(/<\/?mj-spacer[^>]*\/?>/g, '<div style="height:16px;"></div>');
    html = html.replace(/<mj-image[^>]*src="([^"]+)"[^>]*\/?>/g, '<img src="$1" alt=""/>');
    html = html.replace(/<mj-raw>([\s\S]*?)<\/mj-raw>/g, "$1");
    html = html.replace(/<mj-attributes>[\s\S]*?<\/mj-attributes>/g, "");
    html = html.replace(/<mj-style>([\s\S]*?)<\/mj-style>/g, "<style>$1</style>");
    html = html.replace(/<mj-title>([\s\S]*?)<\/mj-title>/g, "<title>$1</title>");
    html = html.replace(/<mj-preview>([\s\S]*?)<\/mj-preview>/g, "");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>${html}</body></html>`;
  }

  /** Convertit HTML → texte plain via html-to-text (avec fallback). */
  private async htmlToText(html: string): Promise<string> {
    try {
      const mod = await import("html-to-text");
      const convert = (mod as any).convert || (mod as any).default?.convert;
      return convert(html, {
        wordwrap: 80,
        selectors: [
          { selector: "img", format: "skip" },
          { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
        ],
      });
    } catch {
      // Keep the fallback inert too; regex tag filters can reconstruct markup.
      const sanitized = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
      return stripHtmlTags(sanitized, true)
        .replace(/\s+/g, " ")
        .trim();
    }
  }
}
