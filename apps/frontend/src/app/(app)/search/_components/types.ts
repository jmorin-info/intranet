/**
 * Types partages entre les sous-composants de la page Recherche unifiee.
 *
 * Backend canonique : `GET /search/unified` (Meilisearch + RBAC post-query).
 * Schema aligne sur `MeiliSearchResponse` du `meilisearch.service.ts`.
 */

export type ModuleKey = "documents" | "wiki" | "news" | "tickets" | "runbooks";
export type HitType = "document" | "wiki" | "news" | "ticket" | "runbook";
export type SortKey = "relevance" | "newest" | "oldest";

export interface UnifiedHit {
  id: string;
  title: string;
  content?: string;
  type: HitType;
  url?: string;
  reference?: string | null;
  slug?: string | null;
  category?: string | null;
  classification?: string | null;
  status?: string | null;
  date?: string | null;
  authorId?: string | null;
  tags?: string[];
  /** Versions HTML <mark>...</mark> retournees par Meilisearch. */
  _formatted?: {
    title?: string;
    content?: string;
    [key: string]: unknown;
  };
}

export interface IndexGroup {
  hits: UnifiedHit[];
  total: number;
  facetDistribution?: FacetDistribution;
  processingTimeMs?: number;
}

export interface FacetDistribution {
  /** ex. { ISO: 12, SECURITY: 8 } */
  [field: string]: Record<string, number>;
}

export interface UnifiedSearchResponse {
  query: string;
  hits: UnifiedHit[];
  byIndex: Partial<Record<string, IndexGroup>>;
  facetDistribution: FacetDistribution;
  total: number;
  page: number;
  limit: number;
  /** Latence Meilisearch (somme inter-index). */
  processingTimeMs: number;
  /** Latence end-to-end (incl. RBAC + reseau). */
  tookMs: number;
}

export interface SavedSearch {
  id: string;
  /** Nom donne par l'utilisateur. */
  name: string;
  query: string;
  modules: ModuleKey[];
  categories: string[];
  classifications: string[];
  statuses: string[];
  sort: SortKey;
  createdAt: string;
}

export interface SearchFiltersState {
  modules: ModuleKey[];
  categories: string[];
  classifications: string[];
  statuses: string[];
  sort: SortKey;
}

export const ALL_MODULES: ModuleKey[] = [
  "documents",
  "wiki",
  "news",
  "tickets",
  "runbooks",
];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  documents: "Documents",
  wiki: "Wiki",
  news: "Actualités",
  tickets: "Tickets",
  runbooks: "Runbooks",
};

/** Champ Meili `type` -> route URL frontend pour les hits. */
export function hitHref(hit: UnifiedHit): string {
  if (hit.url) return hit.url;
  switch (hit.type) {
    case "document":
      return `/documents/${stripPrefix(hit.id)}`;
    case "ticket":
      return `/tickets/${stripPrefix(hit.id)}`;
    case "wiki":
      return `/wiki/${hit.slug ?? stripPrefix(hit.id)}`;
    case "news":
      return `/news/${hit.slug ?? stripPrefix(hit.id)}`;
    default:
      return "#";
  }
}

/** Les ids Meili sont prefixes (`document-xxx`). On retire le prefixe pour la route. */
export function stripPrefix(id: string): string {
  return id.replace(/^(document|ticket|wiki|news|runbook)[-:]/, "");
}

export function classificationVariant(
  c: string | null | undefined,
): "error" | "warning" | "navy" | "success" {
  switch ((c || "").toUpperCase()) {
    case "SECRET":
      return "error";
    case "CONFIDENTIEL":
      return "warning";
    case "INTERNE":
      return "navy";
    default:
      return "success";
  }
}
