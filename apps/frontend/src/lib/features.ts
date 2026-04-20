/**
 * Feature flags — source unique pour désactiver l'UI des modules
 * dont le backend est encore stub ou incomplet.
 *
 * Règle d'or: aucun lien visible dans la nav ne doit mener à une page vide.
 * Passer un flag à `true` une fois que le backend correspondant est câblé.
 */
export const features: Record<
  'ai' | 'officeEditor' | 'onboardingAdmin' | 'scanner' | 'helpdeskKbAdmin',
  boolean
> = {
  /**
   * Module AI (analyze-ticket, recommendations, search, ux-insights).
   * Le backend `/ai/*` est entièrement opérationnel en mode local (TF-IDF,
   * pas d'appel LLM). Activé pour que `HelpdeskChat` puisse fallback sur
   * `/ai/search` quand la KB statique ne trouve rien.
   */
  ai: true,
  /** OnlyOffice / LibreOffice editor session management. */
  officeEditor: false,
  /** Onboarding admin (modèle Prisma existe, controller manquant). */
  onboardingAdmin: false,
  /** Scanner de vulnérabilités (pas d'endpoints exposés). */
  scanner: false,
  /** Helpdesk KB admin CRUD (seed hardcodé actuellement). */
  helpdeskKbAdmin: false,
};

export type FeatureKey = keyof typeof features;

export function isFeatureEnabled(key: FeatureKey): boolean {
  return features[key] === true;
}
