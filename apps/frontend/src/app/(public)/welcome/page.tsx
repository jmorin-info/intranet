/**
 * Page Welcome (publique) — Server Component.
 *
 * Pré-fetch des blocs CMS côté serveur via `getContentBlocks` (cf.
 * `apps/frontend/src/lib/cms.ts`), puis délégation du rendu au Client
 * Component `WelcomeClient`. Les sections hero / steps / services / FAQ
 * sont alimentées par les blocs ; un fallback hardcodé prend le relais si
 * la DB n'est pas peuplée (ou si un bloc est en DRAFT), ce qui rend la
 * transition sûre.
 *
 * Sections additionnelles optionnelles (PR-13) :
 *  - `welcome.banner`       — bandeau d'annonce
 *  - `welcome.testimonials` — section témoignages utilisateurs
 *  - `welcome.media`        — section image/vidéo de présentation
 *
 * Layout configurable (PR-14) :
 *  - `welcome.layout` (object) — { topSections, bottomSections } détermine
 *    l'ordre d'affichage des sections optionnelles autour du WelcomeClient.
 *  - Bloc absent → ordre par défaut (banner top, media+testimonials bottom).
 *
 * Cache : `unstable_cache` (tag `cms`, TTL 300 s) — invalidation via le
 * endpoint POST `/api/cms/revalidate` (secret partagé).
 */
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";

import WelcomeClient from "./welcome-client";
import { getContentBlocks, getBlockData } from "@/lib/cms";
import {
  WelcomeBannerSection,
  WelcomeMediaSection,
  WelcomeTestimonialsSection,
} from "./_sections";
import { normalizeWelcomeLayout, type OptionalSection } from "./_layout";

const WELCOME_BLOCK_KEYS = [
  "welcome.hero.title",
  "welcome.hero.subtitle",
  "welcome.hero.cta",
  "welcome.steps",
  "welcome.services",
  "welcome.faq",
  // PR-13 — sections optionnelles
  "welcome.banner",
  "welcome.testimonials",
  "welcome.media",
  // PR-14 — layout
  "welcome.layout",
];

/**
 * Resout la locale pour le pre-fetch des blocs CMS cote serveur.
 * Priorite :
 *   1. Cookie `NEXT_LOCALE` (utilisateurs deja venus / connectes)
 *   2. Header `Accept-Language` du navigateur (premier visiteur)
 *   3. Fallback `fr` (locale par defaut du seed-cms)
 * Seules les locales supportees (`fr`, `en`) sont retournees ; sinon `fr`.
 */
async function resolveWelcomeLocale(): Promise<"fr" | "en"> {
  const SUPPORTED = ["fr", "en"] as const;
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale && (SUPPORTED as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as "fr" | "en";
  }
  const headersList = await headers();
  const accept = headersList.get("accept-language") || "";
  // Parse minimaliste : prend la 1ere langue, ignore les q-values.
  const primary = accept.split(",")[0]?.trim().toLowerCase().split("-")[0];
  if (primary === "en") return "en";
  return "fr";
}

export default async function WelcomePage() {
  const locale = await resolveWelcomeLocale();
  const blocks = await getContentBlocks(WELCOME_BLOCK_KEYS, locale);

  const layout = normalizeWelcomeLayout(
    getBlockData<unknown>(blocks, "welcome.layout", null),
  );

  const sectionRenderers: Record<OptionalSection, ReactNode> = {
    banner: <WelcomeBannerSection key="banner" blocks={blocks} />,
    media: <WelcomeMediaSection key="media" blocks={blocks} />,
    testimonials: (
      <WelcomeTestimonialsSection key="testimonials" blocks={blocks} />
    ),
  };

  return (
    <>
      {layout.topSections.map((k) => sectionRenderers[k])}
      <WelcomeClient blocks={blocks} />
      {layout.bottomSections.map((k) => sectionRenderers[k])}
    </>
  );
}
