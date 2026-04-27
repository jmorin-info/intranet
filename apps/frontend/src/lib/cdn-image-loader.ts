/**
 * Item 32 — CDN Image Loader (Bunny.net / Cloudflare).
 *
 * Loader custom branché sur Next/Image via `images.loader: 'custom'` +
 * `images.loaderFile: './src/lib/cdn-image-loader.ts'` (cf. next.config.js).
 *
 * Comportement :
 *   - Si `src` est ABSOLU (https://…) ET ne pointe pas vers le CDN :
 *     on retourne `src` tel quel (les avatars LDAP, les images externes
 *     déjà optimisées, etc. ne doivent pas être réécrits).
 *   - Si `src` est RELATIF (ex: `/avatars/foo.png`) ET CDN configuré :
 *     on préfixe par `NEXT_PUBLIC_CDN_URL` et on ajoute les query params
 *     d'optimisation Bunny (`width`, `quality`, `format=auto`).
 *   - En l'absence de `NEXT_PUBLIC_CDN_URL`, on retourne `src` tel quel
 *     (Next/Image proxy par défaut sur l'origine).
 *
 * Bunny.net Pull Zone — Image Optimizer (payant, ~ $9.5/mo) :
 *   https://docs.bunny.net/docs/stream-image-optimizer
 *
 * Cloudflare Image Resizing (alternative) — query params différents
 *   (`/cdn-cgi/image/width=…/<src>`). Pour basculer, swap la fonction
 *   `buildBunnyUrl` par `buildCloudflareUrl` selon `CDN_PROVIDER`.
 */

export interface CdnImageLoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

const CDN_URL = (
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CDN_URL : ""
) ?? "";

function isAbsoluteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

function buildBunnyUrl(args: CdnImageLoaderArgs, cdnBase: string): string {
  // Si le src est déjà absolu et pointe sur le CDN, on garde son origin
  // pour éviter le double-préfixe. Sinon on préfixe par cdnBase.
  let url: URL;
  try {
    url = isAbsoluteUrl(args.src)
      ? new URL(args.src)
      : new URL(args.src, cdnBase);
  } catch {
    // src malformé (ex: data: ou blob:) — on retourne tel quel.
    return args.src;
  }

  // Bunny Pull Zone Image Optimizer
  url.searchParams.set("width", String(args.width));
  url.searchParams.set("quality", String(args.quality ?? 75));
  // `format=auto` → Bunny sert WebP / AVIF si le navigateur l'accepte.
  if (!url.searchParams.has("format")) {
    url.searchParams.set("format", "auto");
  }
  return url.toString();
}

/**
 * Loader Next/Image. Signature imposée par Next 15 :
 *   (props: { src: string; width: number; quality?: number }) => string
 *
 * Note : Next ajoute déjà la query `q={quality}` au src côté client, on
 * laisse passer mais Bunny ignore les params inconnus.
 */
export default function cdnImageLoader(args: CdnImageLoaderArgs): string {
  const { src } = args;

  // Pas de CDN configuré (dev / build sans CDN) → fallback sur l'origine.
  if (!CDN_URL) {
    return src;
  }

  // Image absolue qui ne passe PAS par le CDN (ex: avatar Vaultwarden,
  // image OpenGraph d'une source externe) → on retourne sans modification.
  if (isAbsoluteUrl(src)) {
    let cdnHost = "";
    try {
      cdnHost = new URL(CDN_URL).hostname;
    } catch {
      cdnHost = "";
    }
    let srcHost = "";
    try {
      srcHost = new URL(src).hostname;
    } catch {
      srcHost = "";
    }
    if (cdnHost && srcHost && cdnHost !== srcHost) {
      return src;
    }
  }

  return buildBunnyUrl(args, CDN_URL);
}
