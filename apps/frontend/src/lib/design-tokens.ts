/**
 * Design Tokens OMNITECH
 * ======================
 *
 * Source de vérité des constantes de design pour l'intranet OMNITECH.
 *
 * NOTE IMPORTANTE :
 *   La source de vérité PRINCIPALE pour l'habillage reste la config Tailwind
 *   (classes utilitaires + variables CSS déclarées dans globals.css).
 *   Ces tokens TypeScript servent uniquement à la composition DYNAMIQUE
 *   (styles inline, classes conditionnelles, mapping de variantes, etc.)
 *   lorsqu'on ne peut pas écrire une classe Tailwind statique.
 *
 * Charte graphique : SEAL / OMNITECH SECURITY
 *   - Navy officiel      : #F68D2E
 *   - Orange PANTONE 715 : #F68D2E (ou #F9964A selon impression)
 *   - Taupe              : #837274
 *   - Crème surface      : #F5F2EC
 */

/* ------------------------------------------------------------------ */
/*  Couleurs                                                           */
/* ------------------------------------------------------------------ */

/**
 * Couleurs de marque OMNITECH.
 * Ces valeurs DOIVENT rester alignées avec `globals.css` (--color-*, --seal-*).
 */
export const brandColors = {
  navy: "#F68D2E",
  navyDark: "#00324f",
  navyLight: "#1a5a80",
  orange: "#F68D2E",
  orangeBright: "#F9964A", // PANTONE 715C (print)
  orangeLight: "#FFCC99",
  taupe: "#837274",
  cream: "#F5F2EC",
} as const;

/**
 * Couleurs de surface (backgrounds).
 * Deux jeux : light / dark — à utiliser quand on ne peut pas écrire
 * une classe Tailwind statique.
 */
export const surfaceColors = {
  light: {
    base: "#F5F2EC", // crème (fond global clair)
    raised: "#FFFFFF",
    sunken: "#ECE8E0",
    overlay: "rgba(0, 0, 0, 0.5)",
    border: "#E4DFD4",
  },
  dark: {
    base: "#0F1419",
    raised: "#1A2129",
    sunken: "#0A0D11",
    overlay: "rgba(0, 0, 0, 0.7)",
    border: "#2A3540",
  },
} as const;

/**
 * Couleurs de texte.
 */
export const textColors = {
  light: {
    primary: "#0F1419",
    secondary: "#454955",
    muted: "#837274",
    onBrand: "#FFFFFF",
    link: "#F68D2E",
  },
  dark: {
    primary: "#F5F2EC",
    secondary: "#D8D4CC",
    muted: "#8F94A4",
    onBrand: "#FFFFFF",
    link: "#F68D2E",
  },
} as const;

/**
 * Couleurs sémantiques (feedback utilisateur).
 * Chaque ton a 3 nuances : bg (fond discret), fg (texte), border.
 */
export const semanticColors = {
  ok: {
    bg: "#E7F5EC",
    fg: "#006233",
    border: "#9FD3AF",
    bgDark: "rgba(0, 98, 51, 0.18)",
    fgDark: "#5FCB85",
    borderDark: "#006233",
  },
  warn: {
    bg: "#FEF0DA",
    fg: "#C68200",
    border: "#F9CC7B",
    bgDark: "rgba(198, 130, 0, 0.18)",
    fgDark: "#F9B740",
    borderDark: "#C68200",
  },
  error: {
    bg: "#FCE8EC",
    fg: "#892034",
    border: "#E5A4AE",
    bgDark: "rgba(204, 0, 0, 0.18)",
    fgDark: "#F26B7A",
    borderDark: "#892034",
  },
  info: {
    bg: "#E6EEF8",
    fg: "#296DC1",
    border: "#A6C1E5",
    bgDark: "rgba(41, 109, 193, 0.18)",
    fgDark: "#6FA8E8",
    borderDark: "#296DC1",
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Spacings / Radius / Shadows / Z-index                              */
/* ------------------------------------------------------------------ */

/** Spacings (px) — aligné sur l'échelle Tailwind : 4 / 8 / 16 / 24 / 40 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

/** Rayons d'arrondi (px) */
export const radius = {
  sm: 4,
  md: 6, // = --seal-radius
  lg: 12,
  full: 9999,
} as const;

/** Ombres portées — élévation Apple-like */
export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 2px 8px -1px rgba(0, 0, 0, 0.08), 0 1px 3px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
  elevated:
    "0 25px 50px -12px rgba(0, 68, 105, 0.25), 0 8px 16px -4px rgba(0, 0, 0, 0.1)",
} as const;

/**
 * Z-index layers — ordre strict du plus bas au plus haut.
 * À utiliser pour éviter les guerres de z-index.
 */
export const zIndex = {
  base: 0,
  dropdown: 1000,
  overlay: 1100,
  modal: 1200,
  toast: 1300,
  tooltip: 1400,
} as const;

/* ------------------------------------------------------------------ */
/*  Tons sémantiques (variantes composables)                           */
/* ------------------------------------------------------------------ */

/**
 * Ton sémantique utilisé partout dans le DS pour unifier les variantes
 * (Badge, Alert, EmptyState, Toolbar chip, etc.).
 */
export type Tone = "default" | "success" | "warning" | "danger" | "info";

/**
 * Mapping Tone → classes Tailwind pour le background.
 * Dark mode inclus.
 */
export const toneToBg: Record<Tone, string> = {
  default: "bg-neutral-100 dark:bg-neutral-800",
  success: "bg-emerald-50 dark:bg-emerald-950/40",
  warning: "bg-amber-50 dark:bg-amber-950/40",
  danger: "bg-rose-50 dark:bg-rose-950/40",
  info: "bg-sky-50 dark:bg-sky-950/40",
};

/** Mapping Tone → classes Tailwind pour la bordure. */
export const toneToBorder: Record<Tone, string> = {
  default: "border-neutral-200 dark:border-neutral-700",
  success: "border-emerald-200 dark:border-emerald-800",
  warning: "border-amber-200 dark:border-amber-800",
  danger: "border-rose-200 dark:border-rose-800",
  info: "border-sky-200 dark:border-sky-800",
};

/** Mapping Tone → classes Tailwind pour le texte. */
export const toneToText: Record<Tone, string> = {
  default: "text-neutral-800 dark:text-neutral-100",
  success: "text-emerald-800 dark:text-emerald-200",
  warning: "text-amber-800 dark:text-amber-200",
  danger: "text-rose-800 dark:text-rose-200",
  info: "text-sky-800 dark:text-sky-200",
};

/**
 * Mapping complet en une seule lecture (utile pour composer rapidement
 * un bloc : `${toneClasses(tone).bg} ${toneClasses(tone).border} ...`).
 */
export function toneClasses(tone: Tone): {
  bg: string;
  border: string;
  text: string;
} {
  return {
    bg: toneToBg[tone],
    border: toneToBorder[tone],
    text: toneToText[tone],
  };
}

/* ------------------------------------------------------------------ */
/*  Export groupé                                                      */
/* ------------------------------------------------------------------ */

export const designTokens = {
  brandColors,
  surfaceColors,
  textColors,
  semanticColors,
  spacing,
  radius,
  shadows,
  zIndex,
} as const;

export type DesignTokens = typeof designTokens;
