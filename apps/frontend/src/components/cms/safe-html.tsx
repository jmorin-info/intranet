"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

interface Props {
  /** HTML déjà sanitisé côté backend (sanitize-html whitelist OMNITECH). */
  html: string;
  className?: string;
}

/**
 * Rend du HTML CMS provenant du backend. Le contenu est déjà nettoyé côté
 * serveur par `sanitizeRichText` (whitelist 27 tags, strip scripts/iframes/
 * event handlers / URIs dangereuses). Cette couche client ajoute un passage
 * `DOMPurify.sanitize()` en defense-in-depth (cf. `docs/cms/architecture.md`
 * § 5.3) — utile pour neutraliser d'éventuelles mutations XSS introduites
 * entre la sortie backend et l'arrivée DOM.
 *
 * À utiliser pour TOUT rendu CMS au lieu de `dangerouslySetInnerHTML` direct.
 */
export function SafeHtml({ html, className }: Props) {
  const safe = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["id"],
        ADD_TAGS: ["pre", "code"],
      }),
    [html],
  );
  return (
    <div
      className={className}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
