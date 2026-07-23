/**
 * Feature flags — source unique pour désactiver l'UI des modules
 * dont le backend est encore stub ou incomplet.
 *
 * Règle d'or: aucun lien visible dans la nav ne doit mener à une page vide.
 * Passer un flag à `true` une fois que le backend correspondant est câblé.
 */
export const features: Record<
  "ai" | "officeEditor" | "onboardingAdmin" | "scanner" | "helpdeskKbAdmin" | "veille",
  boolean
> = {
  /**
   * Module « Veille cyber » (/veille) — désactivé sur demande (2026-07-20).
   * Passer à `true` pour réactiver : la route, les entrées de nav (sidebar,
   * command palette, quick-links, widgets) et les suggestions du copilote
   * réapparaissent automatiquement, elles sont toutes gardées par ce flag.
   */
  veille: false,
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

/**
 * Map route → feature flag. Source UNIQUE de la correspondance entre une URL et
 * le module qui la porte : ajouter une entrée ici masque la route partout où la
 * nav utilise `isRouteEnabled()` (sidebar, command palette, quick-links, hub,
 * widgets). Évite le balayage manuel dispersé (cf. finding revue [7]).
 */
const ROUTE_FEATURE: Array<{ prefix: string; key: FeatureKey }> = [
  { prefix: "/veille", key: "veille" },
];

/**
 * Renvoie false si `href` appartient à un module désactivé par un feature flag.
 * À utiliser dans les filtres de nav : `list.filter((i) => isRouteEnabled(i.href))`.
 */
export function isRouteEnabled(href: string | null | undefined): boolean {
  if (!href) return true; // pas de route (ex. action) → jamais masqué
  for (const { prefix, key } of ROUTE_FEATURE) {
    if (href === prefix || href.startsWith(prefix + "/")) return isFeatureEnabled(key);
  }
  return true;
}
