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
  'bg-[#F9964A] text-[#004469] shadow-xl ring-4 ring-[#F9964A]/30 ' +
  'transition-transform duration-150 focus:outline-none';

interface SkipLinkProps {
  href: string;
  children: React.ReactNode;
}

function SkipLink({ href, children }: SkipLinkProps) {
  return (
    <a href={href} className={SKIP_LINK_STYLES} onClick={(event) => {
      const target = document.getElementById(href.slice(1));
      if (!target) return;
      event.preventDefault();
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    }}>
      {children}
    </a>
  );
}

/**
 * Rend la liste des skip-links en tout début de body.
 * Doit être placé AVANT tout autre contenu tabable.
 */
export function SkipLinks() {
  // Détecte à chaque changement de route si `#page-actions` existe côté DOM
  // afin d'afficher (ou pas) le skip-link "Aller aux actions".
  const [hasActions, setHasActions] = React.useState(false);
  const [hasFooter, setHasFooter] = React.useState(false);

  useEffect(() => {
    const check = () => {
      setHasActions(!!document.getElementById('page-actions'));
      setHasFooter(!!document.getElementById('main-footer'));
    };
    check();
    // MutationObserver : certaines pages rendent leur header après un fetch
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  // Raccourcis Alt+S (contenu) / Alt+A (actions) : saute au focus
  useEffect(() => {
    function handleAltKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 's' && key !== 'a') return;
      // Ne pas déclencher dans un champ de saisie
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
      }
      const targetId = key === 's' ? 'main-content' : 'page-actions';
      const el = document.getElementById(targetId);
      if (el) {
        e.preventDefault();
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: false });
        el.scrollIntoView({ block: 'start' });
      }
    }
    window.addEventListener('keydown', handleAltKey);
    return () => window.removeEventListener('keydown', handleAltKey);
  }, []);

  return (
    <nav
      aria-label="Liens d'évitement"
      className="skip-links"
    >
      <SkipLink href="#main-content">Aller au contenu principal</SkipLink>
      {hasActions && <SkipLink href="#page-actions">Aller aux actions</SkipLink>}
      <SkipLink href="#main-nav">Aller à la navigation</SkipLink>
      {hasFooter && <SkipLink href="#main-footer">Aller au pied de page</SkipLink>}
    </nav>
  );
}
