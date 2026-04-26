'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Depuis la migration cookie httpOnly (ANSSI A.5.34), le JWT n'est plus
    // lisible côté JS pour pré-décoder son `exp`. On envoie systématiquement
    // l'utilisateur vers /dashboard ; AuthProvider (fetchMe) tranchera et
    // redirigera vers /login si la session est invalide.
    // Optimisation possible : tester un cookie d'indicateur de session
    // (non sensible, lisible JS) si on veut éviter le flash dashboard→login
    // pour les utilisateurs déconnectés. Pas implémenté pour l'instant.
    router.replace('/dashboard');
  }, [router]);

  // Pas de splash ici — la page de destination (AuthProvider ou /welcome)
  // affichera son propre loader. Évite le "doublon" de présentation.
  return <div className="h-screen bg-[#004469]" />;
}
