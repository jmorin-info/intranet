/**
 * Sanitize basique du highlight HTML retourne par Meilisearch.
 *
 * Meili pre-encode les entites quand on configure highlightPreTag/PostTag,
 * mais on prefere ne pas faire confiance et reparcourir : on accepte UNIQUEMENT
 * les balises <mark>...</mark> et on echappe absolument tout le reste.
 *
 * Approche :
 *  1. remplace `<mark>` et `</mark>` par des marqueurs uniques (uniques au sens
 *     ou ils ne peuvent pas apparaitre dans du contenu Meili : `__OMNI_MARK_*__`)
 *  2. echappe tout le HTML restant (>, <, &, ", ')
 *  3. remplace les marqueurs par les vraies balises <mark> avec classes Tailwind
 *
 * Pas de DOMPurify pour eviter une dep cliente. Le scope des chaines est
 * connu (Meili-only) : si Meili etait compromis, le risque XSS serait deja
 * present sur le titre/contenu source.
 */

const OPEN_MARKER = "__OMNI_MARK_OPEN__";
const CLOSE_MARKER = "__OMNI_MARK_CLOSE__";
const MARK_OPEN_HTML =
  '<mark class="bg-amber-200/80 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100 rounded-sm px-0.5">';
const MARK_CLOSE_HTML = "</mark>";

export function sanitizeHighlight(html: string): string {
  if (!html) return "";

  const withMarkers = html
    .replace(/<mark>/g, OPEN_MARKER)
    .replace(/<\/mark>/g, CLOSE_MARKER);

  const escaped = withMarkers
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return escaped
    .replace(new RegExp(OPEN_MARKER, "g"), MARK_OPEN_HTML)
    .replace(new RegExp(CLOSE_MARKER, "g"), MARK_CLOSE_HTML);
}
