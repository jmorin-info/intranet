import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/**
 * Server-side configuration loaded once per request by next-intl.
 *
 * Lookup order (sans préfixe URL) :
 *   1. Cookie `NEXT_LOCALE` (posé au login + au changement via dropdown)
 *   2. Header `Accept-Language` (négocié, prend la première variante 'fr' / 'en')
 *   3. Fallback `defaultLocale` (= 'fr')
 *
 * IMPORTANT — pas de fetch DB ici (perf : appelé sur chaque RSC). La
 * préférence user vit dans le cookie, hydratée au login par /auth/login
 * et /auth/me (cf. apps/frontend/src/components/layout/auth-provider.tsx).
 */
async function negotiateLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  const headerStore = await headers();
  const accept = headerStore.get("accept-language") ?? "";
  // Naive parse : on prend la première variante reconnue.
  const parts = accept
    .split(",")
    .map((p) => (p.split(";")[0] ?? "").trim().toLowerCase())
    .filter(Boolean);
  for (const p of parts) {
    const tag = p.split("-")[0] ?? "";
    if (isLocale(tag)) return tag;
  }
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await negotiateLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    timeZone: "Europe/Paris",
    now: new Date(),
  };
});
