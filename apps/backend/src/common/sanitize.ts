/**
 * Lightweight HTML/XSS sanitization utilities (ISO 27001 A.8.28 — secure coding).
 *
 * Strips all HTML tags and neutralizes javascript: / data: URIs and common
 * event-handler injection patterns from user-supplied strings.
 * Use this on any rich-text field that is stored and later rendered in the browser.
 */

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
 * Sanitize rich-text / Markdown fields where HTML tags are not expected
 * to be stored verbatim (wiki content, news body, etc.).
 * Keeps the text content but removes embedded HTML and XSS vectors.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  return sanitizePlainText(input);
}
