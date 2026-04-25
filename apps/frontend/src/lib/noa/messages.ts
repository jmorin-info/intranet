/**
 * Catalogue de messages pour la persona "Noa" (mode humour cadré).
 *
 * Persona : stagiaire IA OMNITECH sarcastique, second-degré bureau, brillante
 * mais blasée. Ton « IT Crowd rencontre Phoebe Buffay ».
 *
 * Cadrage strict — RELIRE AVANT D'AJOUTER UNE LIGNE :
 *  - Pas d'insulte, pas de vulgarité, pas de discrimination, pas de politique.
 *  - Pas d'argot lourd, pas de moqueries personnelles.
 *  - Lisible en réunion d'équipe (pro-friendly).
 *  - Franc, désinvolte, légèrement cynique. « Trash limite drôle » mais pas
 *    insultant : on rigole de soi-même et du contexte, pas de l'utilisateur.
 *  - Aucune référence à des personnes réelles (clients, collègues, etc.).
 *
 * Ce module est *purement statique* (pas d'I/O, pas de logger). Le helper
 * `noa()` (cf. `./index.ts`) en consomme les entrées via un random pondéré.
 *
 * Catégories :
 *  - zod     → erreurs de validation de formulaire (jamais sécurité)
 *  - loading → loaders et empty states (jamais auth/MFA)
 *  - success → toasts succès (jamais sur destruction critique)
 *
 * Volume : ~60 entrées (25 + 15 + 20).
 */

export type NoaCategory = 'zod' | 'loading' | 'success';

export interface NoaMessage {
  id: string;
  category: NoaCategory;
  text: string;
  /** Pondération relative (par défaut 1). Plus haut = pioché plus souvent. */
  weight?: number;
}

// ---------------------------------------------------------------------------
// ZOD — erreurs de validation (~25 messages)
// ---------------------------------------------------------------------------
// Génériques. Le helper substitue indépendamment du libellé technique d'origine
// (ex: "Required", "Email invalide", "Min 12 caractères"). La perte d'info est
// volontaire : Noa joue le rôle d'un canal humoristique, pas d'un validateur.
const zodMessages: NoaMessage[] = [
  { id: 'zod.required.01', category: 'zod', text: "Bah voyons, tu remplis ce champ ou je le remplis à ta place ?" },
  { id: 'zod.required.02', category: 'zod', text: "Champ vide. Comme ma motivation un lundi 8h." },
  { id: 'zod.required.03', category: 'zod', text: "Je vais pas deviner, faut le taper." },
  { id: 'zod.required.04', category: 'zod', text: "On dirait qu'il manque un truc. Ah oui, la valeur." },
  { id: 'zod.required.05', category: 'zod', text: "Ce champ ne se remplira pas tout seul. J'ai testé." },
  { id: 'zod.email.01', category: 'zod', text: "Email valide stp, on n'est pas chez les pirates." },
  { id: 'zod.email.02', category: 'zod', text: "Ça ressemble pas vraiment à une adresse mail. Réessaie." },
  { id: 'zod.email.03', category: 'zod', text: "@ et un point quelque part, c'est pas la lune." },
  { id: 'zod.password.01', category: 'zod', text: "Ce mot de passe sent le 'azerty123' à plein nez. Tu peux mieux." },
  { id: 'zod.password.02', category: 'zod', text: "12 caractères minimum. Ton chat compte pas comme caractère spécial." },
  { id: 'zod.password.03', category: 'zod', text: "Mets-y un peu de cœur, et surtout une majuscule." },
  { id: 'zod.password.04', category: 'zod', text: "On veut du costaud. Là c'est plus du papier mâché." },
  { id: 'zod.short.01', category: 'zod', text: "Trop court. Promis je lis tout, donc tu peux développer." },
  { id: 'zod.short.02', category: 'zod', text: "Encore quelques caractères et on y est." },
  { id: 'zod.long.01', category: 'zod', text: "Là c'est trop long. Personne lira jusqu'au bout. Pas même moi." },
  { id: 'zod.long.02', category: 'zod', text: "C'est un formulaire, pas un roman. Raccourcis." },
  { id: 'zod.format.01', category: 'zod', text: "Le format est un peu fantaisiste. Tente plus classique." },
  { id: 'zod.format.02', category: 'zod', text: "Ça marche pas comme ça. Re-vérifie le format stp." },
  { id: 'zod.format.03', category: 'zod', text: "Format invalide. Ne me demande pas pourquoi, demande au backend." },
  { id: 'zod.match.01', category: 'zod', text: "Les deux champs ne correspondent pas. Je note pour le rapport." },
  { id: 'zod.match.02', category: 'zod', text: "Confirmation différente. Copier-coller, c'est l'ami." },
  { id: 'zod.number.01', category: 'zod', text: "Un nombre, pas un haïku." },
  { id: 'zod.number.02', category: 'zod', text: "Chiffres uniquement. Les lettres, c'est pour les lettres d'amour." },
  { id: 'zod.url.01', category: 'zod', text: "C'est censé être une URL. https://, tout ça." },
  { id: 'zod.generic.01', category: 'zod', text: "Mhh non. Re-regarde ce champ avec un œil neuf." },
];

// ---------------------------------------------------------------------------
// LOADING — chargements et empty states (~15 messages)
// ---------------------------------------------------------------------------
const loadingMessages: NoaMessage[] = [
  { id: 'loading.coffee.01', category: 'loading', text: "Noa cherche... elle a bu trop de café." },
  { id: 'loading.diva.01', category: 'loading', text: "Patience, je négocie avec le serveur. Il fait sa diva." },
  { id: 'loading.empty.cdi', category: 'loading', text: "Aucun résultat. Comme mon CDI." },
  { id: 'loading.empty.01', category: 'loading', text: "Rien à afficher. Je vais me chercher un café." },
  { id: 'loading.empty.02', category: 'loading', text: "Vide. Plus vide qu'un open-space en août." },
  { id: 'loading.spin.01', category: 'loading', text: "Ça mouline. Je promets que c'est presque fini." },
  { id: 'loading.spin.02', category: 'loading', text: "Chargement. Le serveur a la flemme aujourd'hui." },
  { id: 'loading.spin.03', category: 'loading', text: "Une seconde, je relance la machine à café... pardon, le backend." },
  { id: 'loading.spin.04', category: 'loading', text: "Ça vient, ça vient. Comme la fin de journée." },
  { id: 'loading.spin.05', category: 'loading', text: "Je télécharge les données. Et ma motivation, accessoirement." },
  { id: 'loading.empty.03', category: 'loading', text: "Aucun élément trouvé. Ni vu ni connu." },
  { id: 'loading.empty.04', category: 'loading', text: "Liste vide. Tu peux remplir, c'est cadeau." },
  { id: 'loading.spin.06', category: 'loading', text: "Encore deux secondes, j'imprime mentalement les résultats." },
  { id: 'loading.spin.07', category: 'loading', text: "Je fouille les archives. Y'a de la poussière." },
  { id: 'loading.empty.05', category: 'loading', text: "Rien ici. Profite du calme avant la tempête." },
];

// ---------------------------------------------------------------------------
// SUCCESS — toasts succès (~20 messages)
// ---------------------------------------------------------------------------
const successMessages: NoaMessage[] = [
  { id: 'success.saved.01', category: 'success', text: "Bim. Sauvegardé. Et sans rien péter." },
  { id: 'success.saved.02', category: 'success', text: "C'est dans la boîte. Littéralement." },
  { id: 'success.saved.03', category: 'success', text: "Validé. Je te laisse t'auto-féliciter." },
  { id: 'success.saved.04', category: 'success', text: "Enregistré. Le serveur dit merci." },
  { id: 'success.saved.05', category: 'success', text: "Voilà, c'est fait. Pas si compliqué finalement." },
  { id: 'success.saved.06', category: 'success', text: "Top. On passe au point suivant ?" },
  { id: 'success.saved.07', category: 'success', text: "Mission accomplie. Tu peux respirer." },
  { id: 'success.saved.08', category: 'success', text: "OK. C'est noté, daté, signé." },
  { id: 'success.saved.09', category: 'success', text: "Sauvegardé. Aucune VM n'a été harcelée pendant l'opération." },
  { id: 'success.saved.10', category: 'success', text: "Yep. Tout est en place." },
  { id: 'success.saved.11', category: 'success', text: "Bien joué. J'ajoute ça à ton dossier (le bon)." },
  { id: 'success.saved.12', category: 'success', text: "Validé sans broncher. Rare et précieux." },
  { id: 'success.saved.13', category: 'success', text: "C'est good. Continue comme ça." },
  { id: 'success.saved.14', category: 'success', text: "Sauvegardé. Maintenant tu peux fermer 14 onglets." },
  { id: 'success.saved.15', category: 'success', text: "Enregistré. Le café que je m'apprête à boire est pour toi." },
  { id: 'success.saved.16', category: 'success', text: "Done. La prochaine étape t'attend." },
  { id: 'success.saved.17', category: 'success', text: "Validé. Aucun ticket n'a été créé pour cette action." },
  { id: 'success.saved.18', category: 'success', text: "Parfait. On range, on rentre." },
  { id: 'success.saved.19', category: 'success', text: "Bien reçu. C'est plié." },
  { id: 'success.saved.20', category: 'success', text: "Top, sauvegardé. RAS, rien à signaler." },
];

export const noaMessages: ReadonlyArray<NoaMessage> = [
  ...zodMessages,
  ...loadingMessages,
  ...successMessages,
];

export const noaMessagesByCategory: Readonly<Record<NoaCategory, ReadonlyArray<NoaMessage>>> = {
  zod: zodMessages,
  loading: loadingMessages,
  success: successMessages,
};
