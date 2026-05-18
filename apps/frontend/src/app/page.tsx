"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Premier visiteur (pas de session précédente sur ce navigateur) → /welcome
    // (landing publique). Visiteur déjà connu → /dashboard ; AuthProvider
    // tranchera et redirigera vers /login si la session a expiré.
    // Le flag `had_session` est posé par /login après un succès et reste
    // jusqu'à un clear navigateur explicite — il indique uniquement « ce
    // navigateur a déjà été authentifié sur l'intranet », pas un état actif.
    const hadSession =
      typeof window !== "undefined" &&
      window.localStorage.getItem("had_session") === "1";
    router.replace(hadSession ? "/dashboard" : "/welcome");
  }, [router]);

  // Pas de splash ici — la page de destination (AuthProvider ou /welcome)
  // affichera son propre loader. Évite le "doublon" de présentation.
  return <div className="h-screen bg-[#F68D2E]" />;
}
