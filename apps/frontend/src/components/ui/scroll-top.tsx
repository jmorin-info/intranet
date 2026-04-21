'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Bouton global "revenir en haut" : apparait en fade-in dès que l'utilisateur
 * a scrollé plus de 300px. Positionné au-dessus du chatbot FAB (qui est à
 * bottom-20/bottom-6 right-4/right-6) pour ne pas être masqué par celui-ci.
 *
 * Mobile : bottom-40 (160px) → au-dessus du FAB chatbot (bottom-20 = 80px)
 *          et de la bottom nav (64px).
 * Desktop : bottom-24 (96px) → au-dessus du FAB chatbot (bottom-6 = 24px).
 */
export function ScrollTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 300);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Revenir en haut de la page"
      className={`fixed bottom-40 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#F9964A] text-white shadow-lg transition-all duration-300 hover:bg-[#e67d1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9964A] focus-visible:ring-offset-2 lg:bottom-24 lg:right-6 ${
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
