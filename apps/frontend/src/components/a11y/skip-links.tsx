'use client';

import React, { useEffect } from 'react';

/**
 * Skip-links WCAG 2.1 AA — bloc de liens visible au focus clavier uniquement.
 *
 * Permet aux utilisateurs clavier (notamment sur lecteurs d'écran et aide
 * technique) de sauter directement au contenu principal sans taber à travers
 * la sidebar à chaque page.
 *
 * Targets attendues dans le DOM :
 *   - `#main-content`  → balise <main>
 *   - `#main-nav`      → la sidebar principale (à ajouter)
 *   - `#main-footer`   → optionnel (footer s'il existe)
 *
 * Raccourci clavier supplémentaire : `Alt+S` → focus direct sur #main-content
 * (pattern très répandu en France, utilisé par les sites gouvernementaux).
 */

const SKIP_LINK_STYLES =
  'fixed top-0 left-1/2 -translate-x-1/2 -translate-y-full focus:translate-y-0 ' +
  'z-[10000] inline-flex items-center gap-2 rounded-b-lg px-4 py-2 text-sm font-semibold ' +
  'bg-[#F9964A] text-white shadow-xl ring-4 ring-[#F9964A]/30 ' +
  'transition-transform duration-150 focus:outline-none';

interface SkipLinkProps {
  href: string;
  children: React.ReactNode;
}

function SkipLink({ href, children }: SkipLinkProps) {
  return (
    <a href={href} className={SKIP_LINK_STYLES}>
      {children}
    </a>
  );
}

/**
 * Rend la liste des skip-links en tout début de body.
 * Doit être placé AVANT tout autre contenu tabable.
 */
export function SkipLinks() {
  // Alt+S → saute au contenu principal (focus + scroll)
  useEffect(() => {
    function handleAltS(e: KeyboardEvent) {
      if (!e.altKey || e.key.toLowerCase() !== 's') return;
      // Ne pas déclencher dans un champ de saisie
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
      }
      const main = document.getElementById('main-content');
      if (main) {
        e.preventDefault();
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: false });
        main.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    window.addEventListener('keydown', handleAltS);
    return () => window.removeEventListener('keydown', handleAltS);
  }, []);

  return (
    <nav
      aria-label="Liens d'évitement"
      className="skip-links"
    >
      <SkipLink href="#main-content">Aller au contenu principal</SkipLink>
      <SkipLink href="#main-nav">Aller à la navigation</SkipLink>
      <SkipLink href="#main-footer">Aller au pied de page</SkipLink>
    </nav>
  );
}
