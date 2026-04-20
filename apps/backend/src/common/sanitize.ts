/**
 * HTML/XSS sanitization utilities (ISO 27001 A.8.28 — secure coding).
 *
 * Two flavours :
 *  - `sanitizePlainText` strips all HTML tags (for titles, slugs, refs…)
 *  - `sanitizeRichText`  preserves a whitelist of safe tags + attributes
 *    (for wiki content, news body, ticket comments, runbook content, etc.)
 *
 * Rich-text uses the mature `sanitize-html` library with an OMNITECH
 * whitelist tuned for Markdown-style formatting including `<code>` and
 * `<pre>` for inline code snippets (fix 2026-04-20 : auparavant
 * sanitizeRichText strippait tous les tags, les `<code>` disparaissaient
 * à la sauvegarde des contenus wiki/news/tickets).
 */

import sanitizeHtml from 'sanitize-html';

/** Strip all HTML tags from a string. */
function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/** Remove javascript:, data:, vbscript: URI schemes (case-insensitive, ignoring whitespace). */
function stripDangerousUris(input: string): string {
  return input.replace(/\b(javascript|vbscript|data)\s*:/gi, '');
}

/** Remove inline event handlers (onclick=, onerror=, onload=, …). */
function stripEventHandlers(input: string): string {
  return input.replace(/\bon\w+\s*=/gi, '');
}

/**
 * Sanitize plain-text fields (no HTML expected).
 * Strips all tags, dangerous URIs and event handlers.
 */
export function sanitizePlainText(input: string | null | undefined): string {
  if (!input) return '';
  let out = input.trim();
  out = stripTags(out);
  out = stripDangerousUris(out);
  out = stripEventHandlers(out);
  return out;
}

/**
 * Whitelist utilisée par sanitize-html pour le contenu rich-text.
 * Couvre les besoins wiki/news/tickets/runbooks :
 *  - formatting : strong, em, u, s, mark
 *  - structure : p, br, hr, div, span, blockquote
 *  - listes : ul, ol, li
 *  - titres : h1-h6
 *  - code : code, pre (inline + bloc avec syntax highlighting)
 *  - liens : a (href http/https seulement)
 *  - images : img (src http/https/data seulement)
 *  - tables : table, thead, tbody, tr, td, th
 */
const RICH_TEXT_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sup', 'sub',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote',
    'code', 'pre',
    'a',
    'img',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'], // ex: language-javascript pour syntax highlight
    pre: ['class'],
    span: ['class'],
    div: ['class'],
    th: ['align', 'colspan', 'rowspan'],
    td: ['align', 'colspan', 'rowspan'],
    '*': ['data-*'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  allowProtocolRelative: false,
  // Transforme les liens externes pour sécurité
  transformTags: {
    a: (tagName, attribs) => {
      const safeAttribs: Record<string, string> = { ...attribs };
      if (safeAttribs.target === '_blank' || safeAttribs.href?.startsWith('http')) {
        safeAttribs.target = '_blank';
        safeAttribs.rel = 'noopener noreferrer';
      }
      return { tagName, attribs: safeAttribs };
    },
  },
  // Pas d'iframe, pas de form, pas de script/style même si whitelist-able
  disallowedTagsMode: 'discard',
};

/**
 * Sanitize rich-text HTML : préserve la whitelist de tags safe + attributs,
 * neutralise XSS, strip scripts/event handlers/URIs dangereuses.
 *
 * Bug fix 2026-04-20 : jusqu'à cette version, la fonction alias-ait
 * sanitizePlainText → tous les tags HTML étaient effacés, y compris les
 * `<code>` saisis dans l'éditeur WYSIWYG. Désormais `<code>`, `<pre>`,
 * `<strong>`, etc. sont préservés.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return '';
  return sanitizeHtml(input, RICH_TEXT_OPTS);
}
