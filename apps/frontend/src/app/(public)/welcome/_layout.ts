/**
 * Layout configurable de /welcome (PR-14).
 *
 * Définit l'ordre d'affichage des sections **optionnelles** (banner / media /
 * testimonials) autour du `<WelcomeClient>` historique. Les sections du
 * client (hero / steps / services / FAQ) ne sont **pas** réordonnables sans
 * refactor profond du composant Client de 2025 lignes.
 *
 * Modèle :
 *   - `topSections`    : sections affichées **avant** WelcomeClient.
 *   - `bottomSections` : sections affichées **après**.
 *   - Une section listée dans aucun des 2 → non affichée.
 *   - Bloc CMS absent / mal formé → ordre par défaut (banner top, media puis
 *     testimonials bottom).
 */

export type OptionalSection = "banner" | "media" | "testimonials";

const SECTION_KEYS: Record<OptionalSection, true> = {
  banner: true,
  media: true,
  testimonials: true,
};

export interface WelcomeLayout {
  topSections: OptionalSection[];
  bottomSections: OptionalSection[];
}

export const DEFAULT_LAYOUT: WelcomeLayout = {
  topSections: ["banner"],
  bottomSections: ["media", "testimonials"],
};

function normalizeSectionList(raw: unknown): OptionalSection[] {
  if (!Array.isArray(raw)) return [];
  const out: OptionalSection[] = [];
  const seen = new Set<OptionalSection>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!(item in SECTION_KEYS)) continue;
    const key = item as OptionalSection;
    if (seen.has(key)) continue; // pas de doublon
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function normalizeWelcomeLayout(raw: unknown): WelcomeLayout {
  if (!raw || typeof raw !== "object") return DEFAULT_LAYOUT;
  const o = raw as Record<string, unknown>;
  const top = normalizeSectionList(o.topSections);
  const bottom = normalizeSectionList(o.bottomSections);
  // Si les deux sont vides → bloc vide ou tout déactivé → on retourne le
  // layout par défaut pour préserver l'expérience actuelle (pas de "page
  // vide" suite à un mauvais format admin).
  if (top.length === 0 && bottom.length === 0) return DEFAULT_LAYOUT;
  return { topSections: top, bottomSections: bottom };
}
