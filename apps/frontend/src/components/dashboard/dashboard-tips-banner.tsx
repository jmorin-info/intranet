"use client";

/**
 * Daily security tips — source + sélecteur quotidien + hook CMS-aware.
 *
 * Le tableau `FALLBACK_DAILY_TIPS` reste hardcodé : il sert de filet en cas
 * d'erreur réseau ou si l'admin a vidé le bloc CMS `dashboard.daily_tips`.
 * Le hook `useDailyTip` interroge ce bloc côté client après hydratation et
 * remplace la liste si une version éditoriale est publiée.
 *
 * Index = floor(now / 86400000) % length → tous les utilisateurs voient le
 * même tip un jour UTC donné.
 */

import { useEffect, useState } from "react";

export const FALLBACK_DAILY_TIPS = [
  "Vérifiez l'expéditeur réel d'un e-mail en survolant son nom : un domaine inconnu est suspect.",
  "Un e-mail urgent exigeant une action immédiate est souvent un signe de tentative de phishing.",
  "Ne cliquez jamais sur un lien raccourci reçu par e-mail sans l'avoir prévisualisé au préalable.",
  "Les pièces jointes inattendues (.zip, .xls, .html) doivent être signalées au support IT avant ouverture.",
  "Une demande de virement par e-mail hors process habituel impose une vérification téléphonique directe.",
  "Un mot de passe fort comporte au moins 14 caractères mêlant majuscules, chiffres et symboles.",
  "Activez l'authentification à deux facteurs sur tous vos comptes professionnels et personnels.",
  "Ne réutilisez jamais le même mot de passe sur plusieurs services. Utilisez un gestionnaire.",
  "Changez immédiatement un mot de passe si vous suspectez qu'il a été compromis.",
  "Préférez les phrases secrètes longues aux mots de passe complexes difficiles à mémoriser.",
  "Ne stockez aucune donnée personnelle sensible sur des clés USB non chiffrées.",
  "Les données RH et client sont classées Confidentiel : ne les diffusez pas hors des canaux autorisés.",
  "Pensez à verrouiller votre session (Windows + L) dès que vous quittez votre poste.",
  "Vérifiez les permissions des applications mobiles avant de leur accorder l'accès à vos contacts ou photos.",
  "Connectez-vous toujours au VPN OMNITECH avant d'accéder aux ressources internes en télétravail.",
  "Évitez les Wi-Fi publics non chiffrés pour toute activité professionnelle, même avec VPN.",
  "Gardez votre système d'exploitation et votre navigateur à jour en télétravail comme au bureau.",
  "Chiffrez votre smartphone et activez son verrouillage biométrique ou par code à 6 chiffres minimum.",
  "Ne connectez jamais un appareil personnel non approuvé au réseau interne OMNITECH.",
  "En déplacement, utilisez un filtre de confidentialité pour éviter la lecture d'écran dans les transports.",
  "Suivez la règle 3-2-1 : 3 copies, 2 supports différents, 1 copie hors site.",
  "Testez régulièrement la restauration de vos sauvegardes : une sauvegarde non testée n'en est pas une.",
  "Les documents critiques doivent être stockés sur les serveurs OMNITECH, pas sur le disque local.",
  "Ne publiez jamais de photo de votre badge ou de votre poste de travail sur les réseaux sociaux.",
  "Évitez de divulguer publiquement votre position exacte ou vos déplacements professionnels.",
  "Vérifiez les paramètres de confidentialité de vos comptes LinkedIn et Facebook au moins une fois par an.",
  "Toute donnée personnelle collectée doit avoir une finalité claire et une durée de conservation définie.",
  "La documentation ISO 27001 est accessible dans la base documentaire de l'intranet.",
  "Signalez toute violation de données personnelles au DPO dans les meilleurs délais (72h max RGPD).",
  "En cas d'incident de sécurité, contactez immédiatement le RSSI Julien MORIN via un ticket prioritaire.",
  "Ne tentez jamais de résoudre seul un incident cyber : la remontée immédiate limite la propagation.",
  "Signalez tout comportement anormal de votre poste (lenteur, pop-ups, fichiers inconnus) au support IT.",
  "Rangez votre bureau en fin de journée : aucun document sensible ne doit rester visible (clean desk).",
  "Vérifiez l'identité de tout visiteur inconnu dans les locaux et accompagnez-le jusqu'à son interlocuteur.",
  "Supprimez les documents imprimés oubliés sur l'imprimante partagée et utilisez l'impression sécurisée.",
  "Avant de transférer un fichier par e-mail, vérifiez sa classification : Confidentiel exige un canal chiffré.",
  "Mettez à jour vos logiciels dès qu'une notification apparaît : les correctifs corrigent des failles connues.",
  "Ne branchez jamais une clé USB trouvée dans les locaux : signalez-la au support IT sans l'ouvrir.",
  "Méfiez-vous des QR codes non sollicités collés sur du matériel ou reçus par e-mail (quishing).",
  "Après un incident, participez au retour d'expérience (REX) pour améliorer les procédures collectives.",
  "En télétravail, verrouillez votre poste même chez vous si d'autres personnes partagent votre espace.",
] as const;

/**
 * Alias rétro-compatible (anciens imports). À supprimer dès qu'aucun appelant
 * ne lit plus la liste hardcodée directement — le hook `useDailyTip` est la
 * source de vérité.
 *
 * @deprecated Utiliser `useDailyTip()` qui interroge le CMS avec fallback.
 */
export const DAILY_TIPS = FALLBACK_DAILY_TIPS;

/** Sélecteur pur : index quotidien sur un tableau de tips fourni. */
export function pickDailyTip(tips: readonly string[]): string {
  if (tips.length === 0) return "";
  const idx = Math.floor(Date.now() / 86400000) % tips.length;
  return tips[idx]!;
}

/**
 * Renvoie le tip du jour à partir de la liste hardcodée.
 * @deprecated Utiliser `useDailyTip()` pour bénéficier du CMS.
 */
export function getDailyTip(): string {
  return pickDailyTip(FALLBACK_DAILY_TIPS);
}

/**
 * Hook React : tip du jour, CMS-aware. Affiche d'abord le fallback (rendu
 * synchrone, pas de flash), puis substitue la version CMS dès la réponse du
 * backend. En cas d'erreur ou si le bloc est absent, conserve le fallback.
 *
 * Le tip est recalculé à chaque rendu — Date.now() suffit pour la rotation
 * journalière (granularité 24h, pas besoin de re-render forcé).
 */
export function useDailyTip(): string {
  const [tips, setTips] = useState<readonly string[]>(FALLBACK_DAILY_TIPS);

  useEffect(() => {
    let cancelled = false;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(
      /\/api\/?$/,
      "/api/v1",
    );
    if (!apiBase) return;
    const url = `${apiBase}/content/blocks?keys=dashboard.daily_tips&locale=fr`;

    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: unknown) => {
        if (cancelled || !payload || typeof payload !== "object") return;
        const block = (payload as Record<string, unknown>)[
          "dashboard.daily_tips"
        ] as { data?: unknown } | undefined;
        if (!block || !Array.isArray(block.data)) return;
        const sanitized = block.data.filter(
          (s): s is string => typeof s === "string" && s.length > 0,
        );
        if (sanitized.length > 0) setTips(sanitized);
      })
      .catch(() => {
        /* silent — fallback affiché */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return pickDailyTip(tips);
}
