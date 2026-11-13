/**
 * Migration des recherches sauvegardees v1 → v2.
 *
 * v1 (search Postgres FTS) :
 *   {
 *     id: string,
 *     name: string,
 *     query: string,
 *     type: "all" | "documents" | ...,
 *     dateRange: "all" | "week" | ...,
 *     classification: "all" | "PUBLIC" | "INTERNE" | ...,
 *     sortBy: "relevance" | "newest" | "oldest"
 *   }
 *
 * v2 (search Meilisearch unifie) :
 *   {
 *     id, name, query, modules: ModuleKey[], categories[], classifications[],
 *     statuses[], sort, createdAt
 *   }
 *
 * La fonction est defensive : un JSON corrompu ou un schema partiellement
 * present produit une liste vide ou des entrees neutres (pas d'erreur thrown).
 */

import type { ModuleKey, SavedSearch, SortKey } from "./types";

const TYPE_TO_MODULES: Record<string, ModuleKey[]> = {
  all: [],
  documents: ["documents"],
  wiki: ["wiki"],
  news: ["news"],
  tickets: ["tickets"],
  runbooks: ["runbooks"],
};

interface LegacySaved {
  id?: string;
  name?: string;
  query?: string;
  type?: string;
  dateRange?: string;
  classification?: string;
  sortBy?: string;
  createdAt?: string;
}

export function migrateLegacySearches(rawJson: string): SavedSearch[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: SavedSearch[] = [];
  for (const item of parsed as LegacySaved[]) {
    if (!item || typeof item.query !== "string") continue;

    const modules = item.type ? (TYPE_TO_MODULES[item.type] ?? []) : [];
    const classifications =
      item.classification && item.classification !== "all"
        ? [String(item.classification ?? "").toUpperCase()]
        : [];

    const sort: SortKey =
      item.sortBy === "newest" || item.sortBy === "oldest" ? (item.sortBy as SortKey) : "relevance";

    out.push({
      id:
        typeof item.id === "string"
          ? item.id
          : `migrated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: typeof item.name === "string" && item.name.trim() ? item.name : item.query.slice(0, 32),
      query: item.query,
      modules,
      // dateRange n'a pas d'equivalent direct en facette Meili — abandonne, on
      // recommande l'usage de la SmartFilterBar qui restera "cette semaine"...
      categories: [],
      classifications,
      statuses: [],
      sort,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    });
  }
  return out;
}
