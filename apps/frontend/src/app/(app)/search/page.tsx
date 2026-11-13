"use client";

/**
 * Page de recherche unifiee — Meilisearch + facettes + RBAC.
 *
 * Vague A post-launch v1.1 : fusion de l'ancienne `/search` (Postgres FTS, 1476 lignes)
 * et de l'orpheline `/search/v2` (Meili minimaliste, 213 lignes). Tout passe
 * desormais par `/search/unified` (Meilisearch + RBAC post-query).
 *
 * Architecture :
 *  - <SearchFilters />          : pills modules + sort
 *  - <FacetSidebar />            : facettes Meili (categorie, classification, statut)
 *  - <SavedSearchesDropdown />   : sauvegardes localStorage v2
 *  - <SearchQuickActions />      : actions inline (creer doc/ticket...)
 *  - <SearchEmptyState />        : popular + recent
 *  - <SearchResults />           : rendu Meili groupe par module
 *  - <AiSmartResults />          : mode IA (`/ai/search`) — feature flag
 *
 * UX :
 *  - Debounce 300ms sur la query
 *  - Compteur de latence : "X resultats en Yms (Meili Zms)" pour rendre la perf visible
 *  - "/" focuse l'input (raccourci clavier global)
 *  - SmartFilterBar (NL "cette semaine, critiques") en filtre post-resultats
 *
 * Performance : le rendu d'une SearchResults memoizee + facettes recues
 * dans la meme reponse (pas de double round-trip) tient sous 200ms en typique.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Search, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { features } from "@/lib/features";
import { useDebounce } from "@/hooks/use-debounce";
import { useTranslation } from "@/lib/i18n";
import { SearchInput } from "@omnitech/ui";
import { PageHeader } from "@/components/layout/page-header";
import { SmartFilterBar } from "@/components/ui/smart-filter-bar";
import type { SmartFilter } from "@/lib/smart-filter";
import { periodToRange } from "@/lib/smart-filter";

import { SearchFilters } from "./_components/search-filters";
import { FacetSidebar } from "./_components/facet-sidebar";
import { SearchResults } from "./_components/search-results";
import { SearchQuickActions } from "./_components/search-quick-actions";
import { SearchEmptyState } from "./_components/search-empty-state";
import { SavedSearchesDropdown } from "./_components/saved-searches-dropdown";
import { AiSmartResults } from "./_components/ai-smart-results";
import {
  ALL_MODULES,
  MODULE_LABELS,
  type ModuleKey,
  type SortKey,
  type UnifiedHit,
  type UnifiedSearchResponse,
} from "./_components/types";

const RECENT_KEY = "omnitech_recent_searches";

export default function SearchPage(): React.ReactElement {
  const { t } = useTranslation();

  // --- State -----------------------------------------------------------
  const [query, setQuery] = useState("");
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [data, setData] = useState<UnifiedSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tookMs, setTookMs] = useState(0);
  const [meiliMs, setMeiliMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [smartMode, setSmartMode] = useState(false);
  const [aiResults, setAiResults] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [smartFilter, setSmartFilter] = useState<SmartFilter | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // --- Effects ---------------------------------------------------------

  // Raccourci clavier "/" pour focus
  useEffect(() => {
    function onSlash(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onSlash);
    return () => document.removeEventListener("keydown", onSlash);
  }, []);

  // Recent searches
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch {
      /* corrupt JSON */
    }
  }, []);

  const saveRecent = useCallback((term: string) => {
    if (!term.trim()) return;
    setRecentSearches((prev) => {
      const updated = [term, ...prev.filter((s) => s !== term)].slice(0, 10);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch {
        /* quota */
      }
      return updated;
    });
  }, []);

  // SmartFilter handler
  const handleSmartFilter = useCallback((filter: SmartFilter) => {
    setSmartFilter(filter);
  }, []);

  // --- Search call -----------------------------------------------------

  const performSearch = useCallback(async (signal: AbortSignal) => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const sortParam =
        sort === "newest"
          ? ["date:desc"]
          : sort === "oldest"
            ? ["date:asc"]
            : undefined;
      const params: Record<string, string> = {
        q: debouncedQuery,
        limit: "20",
        page: "1",
      };
      if (modules.length) params.modules = modules.join(",");
      if (categories.length) params.categories = categories.join(",");
      if (classifications.length)
        params.classifications = classifications.join(",");
      if (statuses.length) params.statuses = statuses.join(",");
      if (sortParam) params.sort = sortParam.join(",");
      const { data: resp } = await api.get<UnifiedSearchResponse>(
        "/search/unified",
        { params, signal },
      );
      if (signal.aborted) return;
      setData(resp);
      setTookMs(Math.round(performance.now() - start));
      setMeiliMs(resp.processingTimeMs ?? 0);
      saveRecent(debouncedQuery);
    } catch (err: any) {
      if (signal.aborted) return;
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Erreur de recherche — Meilisearch indisponible.",
      );
      setData(null);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [
    debouncedQuery,
    modules,
    categories,
    classifications,
    statuses,
    sort,
    saveRecent,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    if (!smartMode) void performSearch(controller.signal);
    else setLoading(false);
    return () => controller.abort();
  }, [performSearch, smartMode]);

  // AI smart search — feature flag
  useEffect(() => {
    if (!smartMode || !debouncedQuery || debouncedQuery.length < 2) {
      setAiResults(null);
      setAiLoading(false);
      return;
    }
    const controller = new AbortController();
    setAiLoading(true);
    setAiResults(null);
    api
      .get("/ai/search", { params: { q: debouncedQuery }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setAiResults(data);
        saveRecent(debouncedQuery);
      })
      .catch(() => { if (!controller.signal.aborted) setAiResults(null); })
      .finally(() => { if (!controller.signal.aborted) setAiLoading(false); });
    return () => controller.abort();
  }, [debouncedQuery, smartMode, saveRecent]);

  // --- Derived ---------------------------------------------------------

  // Filtre post-Meili par periode (smart-filter) pour ne pas relancer la
  // recherche serveur a chaque changement de chip NL.
  const periodRange = useMemo(
    () => (smartFilter?.period ? periodToRange(smartFilter.period) : null),
    [smartFilter?.period],
  );

  const filteredData = useMemo<UnifiedSearchResponse | null>(() => {
    if (!data || !periodRange) return data;
    const matches = (h: UnifiedHit) => {
      if (!h.date) return true;
      return h.date >= periodRange.from && h.date < periodRange.to;
    };
    const newByIndex: typeof data.byIndex = {};
    let total = 0;
    for (const [k, v] of Object.entries(data.byIndex)) {
      if (!v) continue;
      const filtered = v.hits.filter(matches);
      newByIndex[k] = { ...v, hits: filtered, total: filtered.length };
      total += filtered.length;
    }
    return { ...data, byIndex: newByIndex, hits: data.hits.filter(matches), total };
  }, [data, periodRange]);

  const activeFacetCount =
    categories.length + classifications.length + statuses.length;

  // Header counts par module — pour la pill display "X documents · Y wiki..."
  const counts = useMemo(() => {
    if (!filteredData) return null;
    const out: Partial<Record<ModuleKey, number>> = {};
    for (const k of ALL_MODULES) {
      out[k] = filteredData.byIndex[k]?.total ?? 0;
    }
    return out;
  }, [filteredData]);

  // --- Handlers --------------------------------------------------------

  function clearAll() {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* ignore */
    }
  }

  function applySaved(saved: {
    query: string;
    modules: ModuleKey[];
    categories: string[];
    classifications: string[];
    statuses: string[];
    sort: SortKey;
  }) {
    setQuery(saved.query);
    setModules(saved.modules);
    setCategories(saved.categories);
    setClassifications(saved.classifications);
    setStatuses(saved.statuses);
    setSort(saved.sort);
  }

  // --- Render ----------------------------------------------------------

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("search.title")}
        subtitle={t("search.subtitle")}
        icon={Search}
        hub="monEspace"
      />

      {/* Search input + actions */}
      <div className="flex gap-2 sm:gap-3 flex-wrap sm:flex-nowrap items-center">
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={setQuery}
          aria-label="Rechercher dans tout l’intranet"
          placeholder={t("search.placeholder")}
          className="flex-1 min-w-[200px]"
          autoFocus
        />
        {features.ai && (
          <button
            type="button"
            onClick={() => setSmartMode(!smartMode)}
            aria-label={
              smartMode
                ? "Désactiver la recherche intelligente"
                : "Activer la recherche intelligente"
            }
            aria-pressed={smartMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
              smartMode
                ? "border-primary bg-primary/10 text-primary dark:bg-primary/20 shadow-sm shadow-primary/10"
                : "border-gray-200 dark:border-slate-600 text-seal-gray-500 hover:border-gray-300 dark:hover:border-slate-500"
            }`}
            title={
              smartMode
                ? "Recherche intelligente active"
                : "Activer la recherche intelligente"
            }
          >
            <Sparkles
              className={`h-4 w-4 ${smartMode ? "animate-pulse" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {smartMode ? "Recherche intelligente" : "Recherche standard"}
            </span>
          </button>
        )}
        <SavedSearchesDropdown
          currentQuery={query}
          currentState={{
            modules,
            categories,
            classifications,
            statuses,
            sort,
          }}
          onApply={applySaved}
        />
      </div>

      {/* Filters bar (modules + sort toggle) — masque en mode IA */}
      {!smartMode && (
        <SearchFilters
          modules={modules}
          setModules={setModules}
          sort={sort}
          setSort={setSort}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          activeFacetCount={activeFacetCount}
        />
      )}

      {/* SmartFilterBar (NL filter on top of results) */}
      {!smartMode && (
        <SmartFilterBar
          placeholder="Filtrer : « mes documents cette semaine », « tickets ouverts critiques »..."
          onFilter={handleSmartFilter}
          className="mb-2"
        />
      )}

      {/* Quick Actions inline */}
      <SearchQuickActions query={debouncedQuery} />

      {/* Layout : facets sidebar + main content */}
      {smartMode ? (
        debouncedQuery.length >= 2 ? (
          <AiSmartResults
            query={debouncedQuery}
            data={aiResults}
            loading={aiLoading}
            onSuggestionClick={(s) => setQuery(s)}
          />
        ) : (
          <SearchEmptyState
            onSelect={(t) => setQuery(t)}
            recentSearches={recentSearches}
            onClearRecent={clearAll}
          />
        )
      ) : !debouncedQuery ? (
        <SearchEmptyState
          onSelect={(t) => setQuery(t)}
          recentSearches={recentSearches}
          onClearRecent={clearAll}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
          {/* Sidebar facets — only when there is data */}
          {filteredData && filteredData.total > 0 ? (
            <FacetSidebar
              facets={filteredData.facetDistribution}
              selectedCategories={categories}
              selectedClassifications={classifications}
              selectedStatuses={statuses}
              onCategoriesChange={setCategories}
              onClassificationsChange={setClassifications}
              onStatusesChange={setStatuses}
            />
          ) : (
            <div aria-hidden="true" />
          )}

          {/* Main results column */}
          <div className="space-y-4 min-w-0">
            {/* Stats bar */}
            {filteredData && filteredData.total > 0 && counts && (
              <div className="flex flex-wrap gap-3 text-xs text-seal-gray-500 dark:text-slate-400 px-1">
                {ALL_MODULES.filter((m) => (counts[m] ?? 0) > 0).map((m) => (
                  <span key={m}>
                    {counts[m]} {MODULE_LABELS[m].toLowerCase()}
                  </span>
                ))}
                <span className="ml-auto inline-flex items-center gap-1">
                  <span className="font-semibold text-seal-navy dark:text-white">
                    {filteredData.total} résultats
                  </span>
                  <span>en {tookMs}ms</span>
                  {meiliMs > 0 && (
                    <span
                      title="Latence Meilisearch (server)"
                      className="text-emerald-600 dark:text-emerald-400 font-mono"
                    >
                      (Meili {meiliMs}ms)
                    </span>
                  )}
                </span>
              </div>
            )}

            {error && !loading && (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            <SearchResults
              query={debouncedQuery}
              data={filteredData}
              loading={loading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
