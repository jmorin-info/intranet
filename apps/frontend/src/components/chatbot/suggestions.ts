/**
 * Questions suggérées pour l'état vide du chatbot RAG.
 *
 * On propose 4 à 6 questions adaptées au département de l'utilisateur
 * (Feature 6), avec fallback générique. Les libellés de départements
 * correspondent à ceux utilisés en base (free-form, on matche sur des
 * mots-clés tolérants aux accents/casse).
 */

export interface SuggestedQuestion {
  label: string;
  question: string;
}

const IT: SuggestedQuestion[] = [
  { label: 'Réinitialiser un mot de passe', question: 'Comment réinitialiser le mot de passe d\'un utilisateur AD ?' },
  { label: 'Runbook serveur indisponible', question: 'Quel est le runbook si un serveur de production est indisponible ?' },
  { label: 'Politique MFA', question: 'Quelle est la politique MFA en vigueur chez OMNITECH ?' },
  { label: 'Sauvegardes', question: 'Comment vérifier qu\'une sauvegarde est bien passée ?' },
  { label: 'Procédure escalade', question: 'Quelle est la procédure d\'escalade d\'un incident majeur ?' },
  { label: 'VPN accès', question: 'Comment configurer le VPN pour un nouvel utilisateur ?' },
  { label: 'Patch management', question: 'Quel est le calendrier de patch management mensuel ?' },
];

const RSSI: SuggestedQuestion[] = [
  { label: 'Classification ISO 27001', question: 'Quelle classification ISO 27001 pour un rapport d\'audit interne ?' },
  { label: 'Gestion incidents sécurité', question: 'Quelle est la procédure en cas de fuite de données suspectée ?' },
  { label: 'Revue des accès', question: 'Comment conduire une revue des accès trimestrielle ?' },
  { label: 'PCA / PRA', question: 'Où trouver le plan de continuité d\'activité à jour ?' },
  { label: 'Contrôle A.5.15', question: 'Comment documenter le contrôle A.5.15 (contrôle d\'accès) ?' },
  { label: 'Vulnérabilité critique', question: 'Quelle est la procédure si une CVE critique est publiée sur un de nos systèmes ?' },
  { label: 'Veille CERT-FR', question: 'Comment qualifier une alerte CERT-FR et la prioriser ?' },
];

const RH: SuggestedQuestion[] = [
  { label: 'Congés & télétravail', question: 'Quelle est la politique congés et télétravail actuelle ?' },
  { label: 'Onboarding', question: 'Quelle est la checklist d\'onboarding d\'un nouveau collaborateur ?' },
  { label: 'Note de frais', question: 'Comment soumettre une note de frais ?' },
  { label: 'Entretien annuel', question: 'Quelle est la procédure d\'entretien annuel d\'évaluation ?' },
  { label: 'Charte informatique', question: 'Où trouver la charte informatique signée ?' },
  { label: 'Arrêt maladie', question: 'Que faire en cas d\'arrêt maladie : qui prévenir et sous quel délai ?' },
  { label: 'Plan de formation', question: 'Où consulter le plan de formation annuel ?' },
];

const COMMERCIAL: SuggestedQuestion[] = [
  { label: 'CGV en vigueur', question: 'Quelles sont les CGV OMNITECH en vigueur ?' },
  { label: 'Modèle de proposition', question: 'Où trouver le dernier modèle de proposition commerciale ?' },
  { label: 'Tarifs SEAL', question: 'Quelle est la grille tarifaire SEAL System 2026 ?' },
  { label: 'Process devis', question: 'Quel est le process d\'approbation d\'un devis supérieur à 50k€ ?' },
  { label: 'Références clients', question: 'Quelles sont les principales références clients ?' },
  { label: 'CRM — saisir un lead', question: 'Comment qualifier et saisir un nouveau lead dans le CRM ?' },
  { label: 'NDA modèle', question: 'Où trouver le modèle de NDA validé par le juridique ?' },
];

const PRODUCTION: SuggestedQuestion[] = [
  { label: 'Procédure installation', question: 'Quelle est la procédure d\'installation d\'un site SEAL type ?' },
  { label: 'Maintenance préventive', question: 'Quelle est la fréquence de maintenance préventive recommandée ?' },
  { label: 'Checklist mise en service', question: 'Quelle est la checklist de mise en service d\'un site ?' },
  { label: 'Contact astreinte', question: 'Qui contacter en cas d\'astreinte technique week-end ?' },
  { label: 'Non-conformité', question: 'Comment déclarer une non-conformité constatée sur un site client ?' },
  { label: 'Outillage caisse SAV', question: 'Quel outillage standard dans la caisse SAV terrain ?' },
];

const GENERIC: SuggestedQuestion[] = [
  { label: 'Mot de passe', question: 'Comment réinitialiser mon mot de passe ?' },
  { label: 'Classification document', question: 'Comment classifier un document ISO 27001 ?' },
  { label: 'Créer un ticket', question: 'Comment créer un ticket helpdesk ?' },
  { label: 'Charte informatique', question: 'Où consulter la charte informatique OMNITECH ?' },
  { label: 'Raccourcis clavier', question: 'Quels sont les raccourcis clavier de l\'intranet ?' },
  { label: 'Signaler un incident', question: 'Comment signaler un incident de sécurité ?' },
  { label: 'Activer la MFA', question: 'Comment activer la double authentification sur mon compte ?' },
];

/**
 * Choisit la liste adaptée au département. Matching permissif sur mots-clés.
 */
export function getSuggestionsForDepartment(
  departmentName?: string | null,
): SuggestedQuestion[] {
  if (!departmentName) return GENERIC;
  const d = departmentName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/\b(it|dsi|infra|informatique|systeme|reseau|sre|devops|helpdesk|support)\b/.test(d))
    return IT;
  if (/\b(rssi|securite|cyber|soc|grc|compliance|iso|audit)\b/.test(d))
    return RSSI;
  if (/\b(rh|ressources humaines|hr|paie)\b/.test(d))
    return RH;
  if (/\b(commercial|ventes|sales|avant.?vente)\b/.test(d))
    return COMMERCIAL;
  if (/\b(production|technique|chantier|installation|terrain|bureau d.?etude)\b/.test(d))
    return PRODUCTION;

  return GENERIC;
}

/**
 * Mini tutoriel affiché au clic sur « Que puis-je demander ? »
 * Exposé séparément pour pouvoir être testé / i18n plus tard.
 */
export const TUTORIAL_TIPS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: 'Questions en langage naturel',
    detail: 'Posez votre question comme à un collègue — l\'assistant comprend les formulations libres.',
  },
  {
    title: 'Sources citées',
    detail: 'Chaque réponse s\'appuie sur des documents, wikis, procédures, runbooks ou FAQ. Cliquez sur une citation pour l\'ouvrir.',
  },
  {
    title: 'Filtrage automatique',
    detail: 'Vos habilitations (ISO 27001 A.5.15) sont respectées : vous ne voyez que les sources auxquelles vous avez droit.',
  },
  {
    title: 'Stop et régénération',
    detail: 'Pendant la génération, appuyez sur Échap ou le bouton stop. Vous pouvez régénérer une réponse si elle ne convient pas.',
  },
  {
    title: 'Feedback',
    detail: 'Vos pouces 👍/👎 améliorent la qualité du RAG — n\'hésitez pas à préciser la raison d\'un retour négatif.',
  },
];
