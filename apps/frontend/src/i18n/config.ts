/**
 * next-intl configuration — single source of truth for supported locales.
 *
 * URLs ne sont PAS préfixées par locale (`localePrefix: 'never'` côté
 * routing/middleware). La langue est détectée via :
 *   1. Préférence user persistée (cookie `NEXT_LOCALE` posé après login ou via dropdown)
 *   2. Header `Accept-Language` (négociation HTTP)
 *   3. Fallback `defaultLocale`
 *
 * NOTE — coexistence avec `apps/frontend/src/lib/i18n.ts` (système legacy
 * basé sur le store zustand) : le legacy reste utilisé par ~109 fichiers
 * existants ; next-intl est introduit en parallèle pour les 8 zones cibles
 * (cf. mission Phase 2). Migration progressive.
 */
export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";

/** Cookie utilisé par next-intl pour persister la préférence client-side. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (locales as readonly string[]).includes(value)
  );
}
