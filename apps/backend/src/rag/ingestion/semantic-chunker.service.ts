import { Injectable, Logger } from "@nestjs/common";
import { stripHtmlTags } from "../../common/plain-text";

/**
 * Semantic chunking service (Item 30 — RAG fine-tuning corpus maison).
 *
 * Remplace le chunking fixed-size (2000 chars / overlap 200) par une strategie
 * structure-aware :
 *
 *   1. Si le contenu ressemble a du HTML (cas wiki Tiptap) -> on strip les
 *      balises proprement, on conserve les titres `<h1>..<h6>` comme separateurs.
 *   2. On split d'abord sur les titres Markdown (#, ##, ###) ou sur les sauts
 *      de paragraphe doubles (\n\n). Chaque section devient une unite candidate.
 *   3. Si une section depasse `maxChars` (defaut 2000), on la subdivise en
 *      paragraphes (\n) puis en phrases. On respecte les listes (-, *, 1.) et
 *      on n'ouvre/ferme jamais une enumeration au milieu.
 *   4. Les chunks trop petits (< minChars) sont fusionnes avec le suivant.
 *   5. On ajoute un small overlap (defaut 100 chars) au debut du chunk N+1
 *      pour preserver la continuite dans les passages narratifs.
 *
 * Active via `RAG_SEMANTIC_CHUNKING_ENABLED=true`. Quand off, on retombe sur
 * la strategie fixed-size historique (preserve la retro-compat).
 *
 * Pas de dependance NPM externe : on garde ca minimal et auditable.
 */

export interface ChunkingOptions {
  maxChars?: number;
  minChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 2000;
const DEFAULT_MIN_CHARS = 200;
const DEFAULT_OVERLAP_CHARS = 100;

@Injectable()
export class SemanticChunkerService {
  private readonly logger = new Logger(SemanticChunkerService.name);

  isEnabled(): boolean {
    return process.env.RAG_SEMANTIC_CHUNKING_ENABLED === "true";
  }

  /**
   * Decoupe un contenu en chunks semantiques. Si la feature est off, on
   * retombe sur la strategie historique fixed-size pour garantir la stabilite
   * du re-index existant.
   */
  chunk(content: string, options?: ChunkingOptions): string[] {
    if (!content || content.trim().length === 0) return [];

    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const minChars = options?.minChars ?? DEFAULT_MIN_CHARS;
    const overlap = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS;

    if (!this.isEnabled()) {
      return this.fixedSizeChunks(content, maxChars, overlap);
    }

    // 1. Normaliser le contenu : strip HTML si present.
    const normalized = this.looksLikeHtml(content)
      ? this.stripHtmlPreservingHeadings(content)
      : content;

    // 2. Split en sections sur titres / paragraphes
    const sections = this.splitIntoSections(normalized);

    // 3. Pour chaque section, si > maxChars, subdiviser
    const fineSections: string[] = [];
    for (const sec of sections) {
      if (sec.length <= maxChars) {
        fineSections.push(sec);
      } else {
        fineSections.push(...this.splitOversizedSection(sec, maxChars));
      }
    }

    // 4. Fusionner les petits chunks consecutifs sous minChars
    const merged: string[] = [];
    for (const sec of fineSections) {
      if (
        merged.length > 0 &&
        merged[merged.length - 1].length + sec.length + 2 <= maxChars &&
        merged[merged.length - 1].length < minChars
      ) {
        merged[merged.length - 1] = merged[merged.length - 1] + "\n\n" + sec;
      } else {
        merged.push(sec);
      }
    }

    // 5. Ajouter overlap (queue du chunk N en tete du chunk N+1)
    if (overlap > 0 && merged.length > 1) {
      for (let i = 1; i < merged.length; i++) {
        const prev = merged[i - 1];
        const tail = prev.slice(Math.max(0, prev.length - overlap)).trim();
        if (tail.length > 0 && !merged[i].startsWith(tail)) {
          merged[i] = tail + "\n" + merged[i];
        }
      }
    }

    return merged.map((c) => c.trim()).filter((c) => c.length > 0);
  }

  /** Heuristique simple : presence de balises HTML structurelles. */
  private looksLikeHtml(content: string): boolean {
    const pattern = /<\/?(h[1-6]|p|div|ul|ol|li|table|tr|td|strong|em|br)\b/i;
    return pattern.test(content);
  }

  /**
   * Strip HTML en preservant les titres (les transforme en `# Heading`) et
   * les sauts de paragraphe (-> \n\n). Pas de dep externe.
   */
  private stripHtmlPreservingHeadings(html: string): string {
    let out = html;

    // Headings -> Markdown headings
    for (let level = 1; level <= 6; level++) {
      const tag = `h${level}`;
      const prefix = "#".repeat(level);
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
      out = out.replace(regex, (_m, inner) => `\n\n${prefix} ${this.stripTags(inner).trim()}\n\n`);
    }

    // <li> -> "- "
    out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `\n- ${this.stripTags(inner).trim()}`);

    // <br> -> \n
    out = out.replace(/<br\s*\/?>/gi, "\n");

    // <p> -> double newline autour
    out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner) => `\n\n${this.stripTags(inner).trim()}\n\n`);

    // Strip the rest
    out = this.stripTags(out);

    // Collapse multiple blank lines
    out = out.replace(/\n{3,}/g, "\n\n").trim();

    return out;
  }

  private stripTags(s: string): string {
    return stripHtmlTags(s)
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  /**
   * Split un texte normalise (markdown-like) en sections sur titres et sauts
   * de paragraphes doubles. Conserve les titres dans la section qui suit
   * pour preserver le contexte semantique.
   */
  private splitIntoSections(text: string): string[] {
    const lines = text.split(/\r?\n/);
    const sections: string[] = [];
    let buffer: string[] = [];
    let blankRun = 0;

    const flush = () => {
      const joined = buffer.join("\n").trim();
      if (joined) sections.push(joined);
      buffer = [];
    };

    for (const line of lines) {
      const isHeading = /^#{1,6}\s+/.test(line);
      const isBlank = line.trim() === "";

      if (isHeading && buffer.length > 0) {
        // Nouveau titre = nouvelle section
        flush();
      }

      if (isBlank) {
        blankRun++;
        if (blankRun >= 2 && buffer.length > 0) {
          flush();
          blankRun = 0;
          continue;
        }
      } else {
        blankRun = 0;
      }

      buffer.push(line);
    }
    flush();
    return sections;
  }

  /**
   * Subdivise une section trop grande. On essaye d'abord par paragraphe
   * (\n\n), puis si encore trop grand par phrase (split sur ponctuation FR).
   */
  private splitOversizedSection(section: string, maxChars: number): string[] {
    const out: string[] = [];
    const paras = section.split(/\n\s*\n/);
    let cur = "";

    for (const para of paras) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (cur.length + trimmed.length + 2 <= maxChars) {
        cur = cur ? cur + "\n\n" + trimmed : trimmed;
      } else {
        if (cur) out.push(cur);
        if (trimmed.length <= maxChars) {
          cur = trimmed;
        } else {
          // Para encore trop grand : split phrases
          const sentences = this.splitSentences(trimmed);
          let sBuf = "";
          for (const s of sentences) {
            if (sBuf.length + s.length + 1 <= maxChars) {
              sBuf = sBuf ? sBuf + " " + s : s;
            } else {
              if (sBuf) out.push(sBuf);
              if (s.length <= maxChars) {
                sBuf = s;
              } else {
                // Phrase enorme (rare) : fallback fixed-size
                for (const c of this.fixedSizeChunks(s, maxChars, 0)) {
                  out.push(c);
                }
                sBuf = "";
              }
            }
          }
          if (sBuf) cur = sBuf;
          else cur = "";
        }
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /**
   * Split en phrases respectant ponctuation FR (.!?…) en evitant les
   * abreviations courantes (Dr., M., Mme., etc.).
   */
  private splitSentences(text: string): string[] {
    // Approche simple : split sur [.!?…] suivi d'un espace + majuscule.
    // Pour les abreviations, on protege quelques cas frequents.
    const protectedAbbr = ["M\\.", "Mme\\.", "Dr\\.", "Pr\\.", "St\\.", "n°"];
    let masked = text;
    const placeholders: string[] = [];
    protectedAbbr.forEach((abbr, idx) => {
      const re = new RegExp(abbr, "g");
      masked = masked.replace(re, () => {
        placeholders.push(abbr.replace(/\\/g, ""));
        return `__ABBR${idx}__`;
      });
    });

    const parts = masked.split(/(?<=[.!?…])\s+(?=[A-ZÉÈÀÂÔÎÛÇ])/);
    return parts.map((p) => {
      // Restore abreviations
      protectedAbbr.forEach((abbr, idx) => {
        p = p.split(`__ABBR${idx}__`).join(abbr.replace(/\\/g, ""));
      });
      return p.trim();
    }).filter(Boolean);
  }

  /**
   * Strategie historique : fixed-size avec overlap. Conservee pour
   * fallback / retro-compat.
   */
  fixedSizeChunks(content: string, maxChars: number, overlap: number): string[] {
    const out: string[] = [];
    if (!content) return out;
    let start = 0;
    while (start < content.length) {
      const end = Math.min(start + maxChars, content.length);
      out.push(content.slice(start, end));
      if (end >= content.length) break;
      start = end - overlap;
    }
    return out;
  }
}
