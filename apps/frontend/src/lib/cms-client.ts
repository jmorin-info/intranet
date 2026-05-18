"use client";

/**
 * Helpers CMS côté Client — pour les Client Components qui ne peuvent pas
 * importer `lib/cms.ts` (marqué `server-only`).
 *
 * Pattern : `useCmsBlocks([...keys], locale?)` retourne d'abord un map vide
 * (rendu synchrone → fallbacks hardcodés visibles immédiatement) puis le
 * remplit après hydratation en interrogeant le backend public
 * `/api/v1/content/blocks?keys=...&locale=...`. Le caller combine avec
 * `getBlockText` / `getBlockData` de `cms-shared.ts`.
 *
 * En cas d'erreur réseau ou de 5xx, on garde le map vide → fallback hardcodé.
 * Pas de retry agressif : ces pages doivent rester utilisables hors-ligne.
 */

import { useEffect, useState } from "react";

import type { ContentBlocksMap } from "./cms-shared";

export type { ContentBlocksMap } from "./cms-shared";
export { getBlockText, getBlockData } from "./cms-shared";

function resolveApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "").replace(
    /\/api\/?$/,
    "/api/v1",
  );
}

/**
 * Hook React : interroge l'endpoint public `/content/blocks` et expose le
 * `ContentBlocksMap` correspondant. Tant que la requête n'a pas répondu, le
 * map est vide — le caller doit donc systématiquement fournir des fallbacks.
 *
 * Les `keys` sont triées en interne (stabilité de la chaîne URL + éviter
 * les refetch si l'ordre change).
 */
export function useCmsBlocks(keys: string[], locale = "fr"): ContentBlocksMap {
  const [blocks, setBlocks] = useState<ContentBlocksMap>({});

  // Sérialisation stable pour la dep — évite les re-fetch si le caller
  // recompose le tableau à chaque rendu.
  const keysSerialized = [...keys].sort().join(",");

  useEffect(() => {
    if (!keysSerialized) return;
    const apiBase = resolveApiBase();
    if (!apiBase) return;

    let cancelled = false;
    const url = `${apiBase}/content/blocks?keys=${encodeURIComponent(keysSerialized)}&locale=${encodeURIComponent(locale)}`;

    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: unknown) => {
        if (cancelled || !payload || typeof payload !== "object") return;
        setBlocks(payload as ContentBlocksMap);
      })
      .catch(() => {
        /* silent — fallback hardcodé affiché */
      });

    return () => {
      cancelled = true;
    };
  }, [keysSerialized, locale]);

  return blocks;
}
