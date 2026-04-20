'use client';

/**
 * AiSearchTrigger
 * ---------------
 * Composant "invisible" qui :
 *  - installe un listener global Ctrl+K (Cmd+K sur macOS) pour ouvrir la modale RAG
 *  - monte <AiSearchModal/> et gère son état d'ouverture
 *
 * NOTE IMPORTANTE pour l'intégrateur :
 *  - Ctrl+K est déjà utilisé par <QuickNav/> (recherche rapide classique).
 *    Ici on utilise Ctrl+Shift+K pour éviter le conflit. Ajuster si besoin.
 *  - À monter dans <AuthProvider/> (non modifié dans cette tâche) OU dans le
 *    layout racine (`app/layout.tsx`) à l'intérieur des consumers authentifiés.
 *
 * Exemple d'intégration dans AuthProvider :
 *   import { AiSearchTrigger } from '@/components/layout/ai-search-trigger';
 *   return (
 *     <AuthContext.Provider value={ctx}>
 *       {children}
 *       <AiSearchTrigger />
 *     </AuthContext.Provider>
 *   );
 */

import React, { useEffect, useState } from 'react';
import { AiSearchModal } from '@/components/ui/ai-search-modal';

export function AiSearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+K (ou Cmd+Shift+K) — évite le conflit avec QuickNav (Ctrl+K)
      const isCombo =
        (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k');
      if (isCombo) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    // Allow other components (e.g., command palette) to open the AI search modal
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('open-ai-search', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-ai-search', openHandler);
    };
  }, []);

  return <AiSearchModal open={open} onClose={() => setOpen(false)} />;
}
