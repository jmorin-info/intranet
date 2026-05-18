import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Endpoint d'invalidation du cache CMS Next.js.
 *
 * Appelé par le backend (ou un opérateur) quand un bloc / une page CMS est
 * publié / dépublié / supprimé, pour forcer le re-fetch côté Next.js.
 *
 * Authentification : secret partagé via header `X-CMS-Revalidate-Secret`,
 * comparé au timing-safe à `process.env.CMS_REVALIDATE_SECRET`.
 *
 * Réponse :
 *   200 → `{ revalidated: true, now }`
 *   401 → secret manquant / invalide
 *   500 → secret non configuré côté serveur (fail-closed)
 */

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CMS_REVALIDATE_SECRET;
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      {
        revalidated: false,
        error: "CMS_REVALIDATE_SECRET not configured (>=16 chars required)",
      },
      { status: 500 },
    );
  }

  const provided = req.headers.get("x-cms-revalidate-secret") ?? "";
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { revalidated: false, error: "Invalid secret" },
      { status: 401 },
    );
  }

  // Tag global : invalide tous les fetchs taggés "cms" (helpers `lib/cms.ts`).
  revalidateTag("cms");
  // Path explicite : la page Welcome est SSG/ISR par défaut, on force son
  // re-rendu au prochain hit.
  revalidatePath("/welcome");

  return NextResponse.json({
    revalidated: true,
    now: Date.now(),
  });
}
