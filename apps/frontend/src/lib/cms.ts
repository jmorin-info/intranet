/**
 * CMS helper — fetch des blocs de contenu (Server Component uniquement).
 *
 * Architecture cf. `docs/cms/architecture.md` § 7-8 :
 * - Endpoint backend : `GET /api/v1/content/blocks?keys=k1,k2&locale=fr`
 *   → exposé en `@Public()` pour la page Welcome qui doit charger sans auth.
 * - Cache côté Next.js via `unstable_cache` (tag `cms`, TTL 300 s).
 * - Invalidation explicite : `POST /api/cms/revalidate` (cf. route ad hoc).
 *
 * Ce module n'est PAS destiné à être importé depuis un Client Component :
 * `unstable_cache` et le fetch direct vers le backend depuis Node n'ont pas
 * de sens côté browser. Pour exposer les blocs à du code client, passe-les en
 * props depuis un Server Component parent. Les helpers purs (`getBlockText`,
 * `getBlockData`) sont eux ré-exportés depuis `cms-shared` et utilisables
 * des deux côtés.
 */
import "server-only";
import { unstable_cache } from "next/cache";

import type { ContentBlocksMap } from "./cms-shared";

export type { ContentBlock, ContentBlocksMap } from "./cms-shared";
export { getBlockText, getBlockData } from "./cms-shared";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
).replace(/\/api\/?$/, "/api/v1");

/**
 * Fetch un lot de blocs CMS PUBLISHED côté serveur. Les blocs en DRAFT ou
 * absents sont simplement omis du résultat (le caller doit fournir des
 * fallbacks hardcodés).
 *
 * Le résultat est mis en cache 5 min via `unstable_cache`, indexé par
 * (locale + clés triées). À invalider via `revalidateTag('cms')`.
 */
export async function getContentBlocks(
  keys: string[],
  locale = "fr",
): Promise<ContentBlocksMap> {
  if (keys.length === 0) return {};
  const sortedKeys = [...keys].sort();
  const cacheKey = `cms:blocks:${locale}:${sortedKeys.join(",")}`;

  const cached = unstable_cache(
    async () => fetchBlocksRaw(sortedKeys, locale),
    [cacheKey],
    { revalidate: 300, tags: ["cms"] },
  );

  try {
    return await cached();
  } catch (err) {
    // En cas d'erreur réseau / 5xx, on retourne un map vide : la page rendra
    // les fallbacks hardcodés plutôt que de planter. Log discret côté serveur.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[cms] getContentBlocks failed, falling back:", err);
    }
    return {};
  }
}

async function fetchBlocksRaw(
  keys: string[],
  locale: string,
): Promise<ContentBlocksMap> {
  const qs = new URLSearchParams({
    keys: keys.join(","),
    locale,
  });
  const url = `${API_BASE}/content/blocks?${qs.toString()}`;
  const res = await fetch(url, {
    // unstable_cache gère la mémoïsation au niveau supérieur ; ici on demande
    // à Next.js de ne pas cacher en plus côté fetch (sinon double layer).
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`CMS fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ContentBlocksMap;
}
