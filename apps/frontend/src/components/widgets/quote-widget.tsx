'use client';

import React, { useMemo } from 'react';
import { Quote, ShieldCheck } from 'lucide-react';

const QUOTES = [
  { text: "La sécurité n'est pas un produit, mais un processus.", author: "Bruce Schneier" },
  { text: "Le maillon le plus faible de la chaîne de sécurité est l'élément humain.", author: "Kevin Mitnick" },
  { text: "Il y a deux types d'entreprises : celles qui ont été piratées et celles qui ne le savent pas encore.", author: "John Chambers" },
  { text: "La confiance est bonne, le contrôle est meilleur.", author: "Proverbe de sécurité" },
  { text: "La meilleure défense est une défense en profondeur.", author: "Principe ISO 27001" },
  { text: "Les données sont le nouveau pétrole. La sécurité est la nouvelle écologie.", author: "Clive Humby" },
  { text: "Chaque employé est un pare-feu humain.", author: "OMNITECH Security" },
  { text: "Un incident non signalé est un incident non géré.", author: "RSSI" },
  { text: "La conformité n'est pas la sécurité, mais la sécurité inclut la conformité.", author: "Axiome SMSI" },
  { text: "Sécuriser, c'est anticiper.", author: "OMNITECH Security" },
  { text: "Le seul système vraiment sécurisé est celui qui est éteint.", author: "Gene Spafford" },
  { text: "La confiance se gagne en gouttes et se perd en litres.", author: "Jean-Paul Sartre" },
  { text: "La complexité est l'ennemie de la sécurité.", author: "Bruce Schneier" },
  { text: "Un système est aussi fort que son maillon le plus faible.", author: "Proverbe" },
  { text: "L'excellence n'est pas un acte, c'est une habitude.", author: "Aristote" },
  { text: "La vigilance est le prix de la liberté.", author: "Thomas Jefferson" },
  { text: "L'information, c'est le pouvoir. Mais comme tout pouvoir, il y a ceux qui veulent le garder pour eux.", author: "Aaron Swartz" },
  { text: "Mieux vaut prévenir que guérir.", author: "Proverbe" },
  { text: "Il n'y a pas de vent favorable pour celui qui ne sait pas où il va.", author: "Sénèque" },
  { text: "Les entreprises dépensent des millions en pare-feu et chiffrement, et gaspillent leur argent parce qu'aucune de ces mesures ne couvre le maillon le plus faible : les gens.", author: "Kevin Mitnick" },
  { text: "Si vous pensez que la technologie peut résoudre vos problèmes de sécurité, alors vous ne comprenez ni les problèmes ni la technologie.", author: "Bruce Schneier" },
  { text: "Connais ton ennemi et connais-toi toi-même ; en cent batailles tu ne seras jamais en danger.", author: "Sun Tzu — appliqué à la cybersécurité" },
  { text: "L'art suprême de la guerre est de soumettre l'ennemi sans combattre. En cyber, c'est la prévention.", author: "Sun Tzu — appliqué à la cybersécurité" },
  { text: "La sécurité numérique est l'affaire de tous, pas seulement des experts.", author: "ANSSI" },
  { text: "Un mot de passe, c'est comme une brosse à dents : on ne le partage pas et on le change régulièrement.", author: "ANSSI" },
  { text: "La cybersécurité n'est plus une option : c'est une condition de survie pour toute organisation.", author: "Guillaume Poupard, ex-directeur ANSSI" },
  { text: "Celui qui n'a pas de stratégie et sous-estime l'adversaire sera inévitablement capturé.", author: "Sun Tzu — appliqué à la cybersécurité" },
  { text: "J'ai cracké des systèmes non pas parce que la technologie était faible, mais parce que les gens étaient confiants.", author: "Kevin Mitnick" },
  { text: "Le management, c'est l'art de prendre des décisions à partir d'informations insuffisantes.", author: "Roy Rowan" },
];

export function QuoteWidget() {
  const quote = useMemo(() => {
    const today = new Date();
    const index = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % QUOTES.length;
    return QUOTES[index];
  }, []);

  return (
    <div className="flex gap-3 items-start rounded-lg bg-primary/5 dark:bg-primary/10 p-3">
      <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
        <ShieldCheck className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 dark:text-primary/80 mb-1">Citation du jour</p>
        <p className="text-sm text-seal-navy dark:text-white italic leading-relaxed">&ldquo;{quote?.text}&rdquo;</p>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1.5">— {quote?.author}</p>
      </div>
    </div>
  );
}
