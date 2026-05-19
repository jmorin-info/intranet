"use client";

import { useEffect, useState } from "react";
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
 * **SSR-safe** : `dompurify` n'expose pas `.sanitize` côté Node (pas de DOM
 * sans jsdom). On rend d'abord le HTML brut (déjà sanitisé backend), puis on
 * substitue par la version DOMPurify une fois hydraté. Comme le backend
 * produit déjà du HTML conforme à la whitelist, le résultat est identique →
 * pas de divergence visible, mais on supprime le warning d'hydratation au
 * cas où DOMPurify normaliserait certains attributs côté client.
 */
export function SafeHtml({ html, className }: Props) {
  const [safe, setSafe] = useState<string>(html);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof DOMPurify.sanitize !== "function") return;
    setSafe(
      DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["id"],
        ADD_TAGS: ["pre", "code"],
      }),
    );
  }, [html]);

  return (
    <div
      className={className}
      suppressHydrationWarning
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
