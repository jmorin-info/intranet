/**
 * Helpers purs sur les blocs CMS — utilisables côté Server **et** Client.
 *
 * Séparé de `lib/cms.ts` qui est marqué `server-only` (à cause de
 * `unstable_cache` + accès direct au backend). Les Client Components peuvent
 * importer ce module pour résoudre les blocs déjà fetchés et passés en
 * props depuis un Server Component parent.
 */

export type ContentBlock = {
  key: string;
  locale: string;
  title: string | null;
  body: string;
  data: unknown;
  updatedAt: string;
};

export type ContentBlocksMap = Record<string, ContentBlock>;

/**
 * Retourne le `body` (texte court) d'un bloc, ou la valeur de secours si le
 * bloc est absent / vide.
 */
export function getBlockText(
  blocks: ContentBlocksMap,
  key: string,
  fallback: string,
): string {
  const body = blocks[key]?.body;
  if (typeof body === "string" && body.length > 0) return body;
  return fallback;
}

/**
 * Retourne le payload `data` (JSON structuré) d'un bloc, typé selon `T`.
 * Si le bloc est absent ou son `data` est null/undefined, renvoie `fallback`.
 *
 * Pas de validation runtime ici : le DTO côté backend est la source de vérité
 * pour la forme. Si un admin pousse un payload mal formé, il sera filtré au
 * niveau de l'API admin (cf. `CreateContentBlockDto`).
 */
export function getBlockData<T>(
  blocks: ContentBlocksMap,
  key: string,
  fallback: T,
): T {
  const data = blocks[key]?.data;
  if (data === null || data === undefined) return fallback;
  return data as T;
}
