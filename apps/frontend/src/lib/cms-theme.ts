/**
 * Theming CSS via CMS — résolution du bloc `theme.tokens` côté serveur et
 * génération du CSS de surcharge à injecter dans le `<head>`.
 *
 * Modèle :
 *  - Un bloc CMS `theme.tokens` (data JSON) décrit les overrides admin pour
 *    chaque token de design system (couleurs SEAL, fontes, rayons).
 *  - Chaque champ override la CSS variable correspondante dans `:root`.
 *  - Champ absent / vide / invalide → la valeur de `globals.css` reste utilisée
 *    (zéro régression si bloc absent ou mal formé).
 *  - Sécurité : seules les valeurs validées par regex stricte sont injectées.
 *    Pas d'injection CSS arbitraire — un admin ne peut PAS pousser du CSS qui
 *    modifie autre chose que la liste blanche de variables ci-dessous.
 */

import "server-only";

import { getContentBlocks, getBlockData } from "./cms";

// ---------------------------------------------------------------------------
// Schéma de données — mapping CMS field → CSS variable
// ---------------------------------------------------------------------------

/**
 * Table de correspondance `champ JSON → variable CSS`. C'est la **whitelist**
 * de ce qu'un admin peut surcharger via le bloc CMS — toute autre clé est
 * silencieusement ignorée par le normalizer.
 */
const COLOR_TOKEN_MAP = {
  sealOrange: "--seal-orange",
  sealOrangeLight: "--seal-orange-light",
  sealBlue: "--seal-blue",
  sealGreen: "--seal-green",
  sealBordeaux: "--seal-bordeaux",
  sealNavy: "--seal-navy",
  sealTaupe: "--seal-taupe",
  primary: "--color-primary",
  primaryDark: "--color-primary-dark",
} as const;

const FONT_TOKEN_MAP = {
  body: "--font-body",
  display: "--font-display",
} as const;

const RADIUS_TOKEN_MAP = {
  card: "--radius-card",
  button: "--radius-btn",
  input: "--seal-radius",
} as const;

export type ColorTokenKey = keyof typeof COLOR_TOKEN_MAP;
export type FontTokenKey = keyof typeof FONT_TOKEN_MAP;
export type RadiusTokenKey = keyof typeof RADIUS_TOKEN_MAP;

export interface ThemeTokens {
  colors: Partial<Record<ColorTokenKey, string>>;
  fonts: Partial<Record<FontTokenKey, string>>;
  radii: Partial<Record<RadiusTokenKey, string>>;
}

// ---------------------------------------------------------------------------
// Validation — empêche l'injection CSS arbitraire
// ---------------------------------------------------------------------------

/** Hex 3, 4, 6 ou 8 chiffres (#RGB, #RGBA, #RRGGBB, #RRGGBBAA). */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** `12px`, `0.5rem`, `1em`. Rejette les expressions calc(), var(), etc. */
const LENGTH_RE = /^\d+(?:\.\d+)?(?:px|rem|em)$/;

/**
 * Stack de fontes — autorise les noms de familles, virgules, guillemets,
 * espaces, tirets et chiffres. Bloque tout caractère qui pourrait casser le
 * `<style>` injecté (`</style>`, `{`, `;`, `\n` etc.).
 *
 * Exemples valides :
 *   `"Century Gothic", "Nunito", sans-serif`
 *   `Inter, system-ui, -apple-system, sans-serif`
 */
const FONT_STACK_RE = /^["'a-zA-Z0-9 ,\-_]+$/;

function validColor(v: unknown): v is string {
  return typeof v === "string" && HEX_COLOR_RE.test(v);
}
function validLength(v: unknown): v is string {
  return typeof v === "string" && LENGTH_RE.test(v);
}
function validFontStack(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= 200 &&
    FONT_STACK_RE.test(v)
  );
}

// ---------------------------------------------------------------------------
// Normalizer — accepte uniquement les clés whitelistées + valeurs valides
// ---------------------------------------------------------------------------

export function normalizeThemeTokens(raw: unknown): ThemeTokens {
  const out: ThemeTokens = { colors: {}, fonts: {}, radii: {} };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;

  if (o.colors && typeof o.colors === "object") {
    const c = o.colors as Record<string, unknown>;
    for (const key of Object.keys(COLOR_TOKEN_MAP) as ColorTokenKey[]) {
      const v = c[key];
      if (validColor(v)) out.colors[key] = v;
    }
  }
  if (o.fonts && typeof o.fonts === "object") {
    const f = o.fonts as Record<string, unknown>;
    for (const key of Object.keys(FONT_TOKEN_MAP) as FontTokenKey[]) {
      const v = f[key];
      if (validFontStack(v)) out.fonts[key] = v;
    }
  }
  if (o.radii && typeof o.radii === "object") {
    const r = o.radii as Record<string, unknown>;
    for (const key of Object.keys(RADIUS_TOKEN_MAP) as RadiusTokenKey[]) {
      const v = r[key];
      if (validLength(v)) out.radii[key] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Génération du CSS de surcharge
// ---------------------------------------------------------------------------

/**
 * Produit la string CSS à injecter dans un `<style>` du `<head>`. Vide si
 * aucun override valide (no-op côté HTML).
 */
export function buildThemeCss(tokens: ThemeTokens): string {
  const lines: string[] = [];
  for (const key of Object.keys(COLOR_TOKEN_MAP) as ColorTokenKey[]) {
    const v = tokens.colors[key];
    if (v) lines.push(`${COLOR_TOKEN_MAP[key]}: ${v};`);
  }
  for (const key of Object.keys(FONT_TOKEN_MAP) as FontTokenKey[]) {
    const v = tokens.fonts[key];
    if (v) lines.push(`${FONT_TOKEN_MAP[key]}: ${v};`);
  }
  for (const key of Object.keys(RADIUS_TOKEN_MAP) as RadiusTokenKey[]) {
    const v = tokens.radii[key];
    if (v) lines.push(`${RADIUS_TOKEN_MAP[key]}: ${v};`);
  }
  if (lines.length === 0) return "";
  return `:root{${lines.join("")}}`;
}

/**
 * Fetch + normalize + render. Appelé par le `RootLayout`.
 * Retourne `""` si pas d'overrides (cas standard tant qu'aucun admin n'a
 * touché au bloc).
 */
export async function getThemeCss(): Promise<string> {
  try {
    const blocks = await getContentBlocks(["theme.tokens"], "fr");
    const raw = getBlockData<unknown>(blocks, "theme.tokens", null);
    return buildThemeCss(normalizeThemeTokens(raw));
  } catch {
    return "";
  }
}

export { COLOR_TOKEN_MAP, FONT_TOKEN_MAP, RADIUS_TOKEN_MAP };
