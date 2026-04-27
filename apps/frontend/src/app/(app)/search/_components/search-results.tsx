"use client";

/**
 * <SearchResults />
 * =================
 *
 * Rend les resultats de la recherche unifiee Meilisearch, groupes par module
 * (Documents / Wiki / Actualites / Tickets / Runbooks).
 *
 * Specificites :
 *  - Surlignage natif Meilisearch (`_formatted.title` / `_formatted.content`)
 *    avec balises <mark> deja injectees cote serveur. On les rend via
 *    dangerouslySetInnerHTML (le contenu est sanitize en amont par Meili
 *    et nos extracts viennent toujours de champs deja stockes en BDD).
 *  - Fallback <Spotlight /> quand `_formatted` est absent.
 *  - Skeletons pendant le chargement.
 *  - EmptyState quand aucune ressource.
 *
 * Performance : memoize la liste des hits par module pour eviter de re-render
 * tous les cards a chaque keystroke.
 */

import React, { useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  Newspaper,
  PlayCircle,
  Ticket,
} from "lucide-react";
import { Badge, Card, CardContent, EmptyState } from "@omnitech/ui";
import { Spotlight } from "@/components/ui/spotlight";
import { formatRelativeTime } from "@/lib/utils";
import { sanitizeHighlight } from "./sanitize-highlight";
import {
  classificationVariant,
  hitHref,
  type HitType,
  type ModuleKey,
  type UnifiedHit,
  type UnifiedSearchResponse,
} from "./types";

const TYPE_ICON: Record<HitType, React.ElementType> = {
  document: FileText,
  ticket: Ticket,
  wiki: BookOpen,
  news: Newspaper,
  runbook: PlayCircle,
};

const TYPE_ICON_COLOR: Record<HitType, string> = {
  document: "text-seal-navy dark:text-blue-400",
  ticket: "text-violet-500",
  wiki: "text-emerald-500",
  news: "text-blue-500",
  runbook: "text-amber-500",
};

const TYPE_BADGE: Record<
  HitType,
  "navy" | "info" | "primary" | "warning" | "success"
> = {
  document: "navy",
  ticket: "warning",
  wiki: "primary",
  news: "info",
  runbook: "success",
};

const SECTION_LABELS: Record<ModuleKey, string> = {
  documents: "Documents",
  wiki: "Wiki",
  news: "Actualités",
  tickets: "Tickets",
  runbooks: "Runbooks",
};

const INDEX_TO_MODULE: Record<string, ModuleKey> = {
  documents: "documents",
  wiki: "wiki",
  news: "news",
  tickets: "tickets",
  runbooks: "runbooks",
};

interface SearchResultsProps {
  query: string;
  data: UnifiedSearchResponse | null;
  loading: boolean;
}

function SearchResultsImpl({
  query,
  data,
  loading,
}: SearchResultsProps): React.ReactElement {
  const groups = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byIndex)
      .map(([uid, group]) => ({
        moduleKey: INDEX_TO_MODULE[uid] ?? "documents",
        uid,
        hits: group?.hits ?? [],
        total: group?.total ?? 0,
      }))
      .filter((g) => g.hits.length > 0)
      // ordre canonique
      .sort((a, b) => {
        const order: ModuleKey[] = [
          "documents",
          "wiki",
          "news",
          "tickets",
          "runbooks",
        ];
        return order.indexOf(a.moduleKey) - order.indexOf(b.moduleKey);
      });
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        {[1, 2, 3, 4].map((i) => (
          <ResultSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <EmptyState
        type="search"
        title="Aucun résultat"
        description={`Aucun contenu ne correspond à « ${query} ». Essayez des termes plus courts ou vérifiez l'orthographe.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.uid} aria-labelledby={`section-${g.uid}`}>
          <h2
            id={`section-${g.uid}`}
            className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2"
          >
            {React.createElement(
              TYPE_ICON[g.hits[0]?.type as HitType] ?? FileText,
              {
                className: `h-4 w-4 ${
                  TYPE_ICON_COLOR[g.hits[0]?.type as HitType] ?? "text-primary"
                }`,
              },
            )}
            {SECTION_LABELS[g.moduleKey]} ({g.total})
          </h2>
          <ul className="space-y-2">
            {g.hits.map((hit) => (
              <li key={hit.id}>
                <ResultCard hit={hit} query={query} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// React.memo : SearchResults reçoit des props stables (data, query, loading).
// Le parent SearchPage re-render à chaque keystroke (debounced à 300ms côté
// fetch, mais l'état local query change instantanément). Sans memo, toute
// la liste de cartes (parfois 50+ hits) se re-render à chaque caractère
// même si data n'a pas bougé.
export const SearchResults = React.memo(
  SearchResultsImpl,
  (prev, next) =>
    prev.query === next.query &&
    prev.data === next.data &&
    prev.loading === next.loading,
);

interface ResultCardProps {
  hit: UnifiedHit;
  query: string;
}

function ResultCard({ hit, query }: ResultCardProps): React.ReactElement {
  const Icon = TYPE_ICON[hit.type] ?? FileText;
  const iconColor = TYPE_ICON_COLOR[hit.type] ?? "text-primary";
  const badgeVariant = TYPE_BADGE[hit.type] ?? "navy";

  // Highlight : Meili nous renvoie `_formatted.title` avec des <mark>...</mark>
  // si on a configure highlightPreTag/PostTag. Sinon, fallback Spotlight.
  const formatted = hit._formatted ?? {};
  const titleHtml = typeof formatted.title === "string" ? formatted.title : null;
  const contentHtml =
    typeof formatted.content === "string" ? formatted.content : null;

  // Date d'affichage
  const date = hit.date;

  return (
    <Link href={hitHref(hit)} className="stagger-item block">
      <Card hoverable>
        <CardContent className="py-3 flex items-center gap-3">
          <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              {titleHtml ? (
                <span
                  // Meilisearch encode les caracteres speciaux ; on rend le HTML
                  // mais notre contenu indexe est lui-meme issu de Prisma sans
                  // HTML brut (titres). Les <mark> sont stables.
                  dangerouslySetInnerHTML={{ __html: sanitizeHighlight(titleHtml) }}
                />
              ) : (
                <Spotlight text={hit.title} query={query} />
              )}
            </p>
            {hit.reference && (
              <p className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-400">
                {hit.reference}
              </p>
            )}
            {(contentHtml || hit.content) && (
              <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                {contentHtml ? (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHighlight(contentHtml.slice(0, 240)),
                    }}
                  />
                ) : (
                  <Spotlight
                    text={(hit.content ?? "").slice(0, 240)}
                    query={query}
                  />
                )}
              </p>
            )}
            {hit.tags && hit.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {hit.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[9px] text-seal-gray-500 dark:text-slate-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2 flex-shrink-0">
            {date && (
              <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 whitespace-nowrap">
                {formatRelativeTime(date)}
              </span>
            )}
            {hit.classification && (
              <Badge variant={classificationVariant(hit.classification)}>
                {hit.classification}
              </Badge>
            )}
            {hit.status && (
              <Badge variant={hit.status === "CLOSED" ? "info" : "warning"}>
                {hit.status}
              </Badge>
            )}
            <Badge variant={badgeVariant}>{labelForType(hit.type)}</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function labelForType(t: HitType): string {
  switch (t) {
    case "document":
      return "Document";
    case "ticket":
      return "Ticket";
    case "wiki":
      return "Wiki";
    case "news":
      return "Actualité";
    case "runbook":
      return "Runbook";
  }
}

function ResultSkeleton() {
  return (
    <div className="shimmer rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex items-center gap-3">
      <div className="h-5 w-5 rounded bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-slate-700" />
      </div>
      <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
    </div>
  );
}

