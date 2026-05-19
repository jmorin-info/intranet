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
 *  - `welcome.banner`       — bandeau d'annonce en tête de page
 *  - `welcome.testimonials` — section témoignages utilisateurs
 *  - `welcome.media`        — section image/vidéo de présentation
 *
 * Chaque section retourne `null` si le bloc est absent → zéro régression
 * si la DB n'est pas peuplée.
 *
 * Cache : `unstable_cache` (tag `cms`, TTL 300 s) — invalidation via le
 * endpoint POST `/api/cms/revalidate` (secret partagé).
 */
import WelcomeClient from "./welcome-client";
import { getContentBlocks } from "@/lib/cms";
import {
  WelcomeBannerSection,
  WelcomeMediaSection,
  WelcomeTestimonialsSection,
} from "./_sections";

const WELCOME_BLOCK_KEYS = [
  "welcome.hero.title",
  "welcome.hero.subtitle",
  "welcome.hero.cta",
  "welcome.steps",
  "welcome.services",
  "welcome.faq",
  // PR-13 additions — optionnels, retombent silencieusement sur null
  "welcome.banner",
  "welcome.testimonials",
  "welcome.media",
];

export default async function WelcomePage() {
  // TODO i18n : tant que la page Welcome n'expose pas le sélecteur de locale
  // côté serveur, on reste sur fr (cohérent avec le seed-cms initial).
  const blocks = await getContentBlocks(WELCOME_BLOCK_KEYS, "fr");
  return (
    <>
      <WelcomeBannerSection blocks={blocks} />
      <WelcomeClient blocks={blocks} />
      <WelcomeMediaSection blocks={blocks} />
      <WelcomeTestimonialsSection blocks={blocks} />
    </>
  );
}
