"use client";

/**
 * <SearchFilters />
 * =================
 *
 * Barre de filtres horizontaux : modules (wiki/docs/news/tickets/runbooks),
 * sort (pertinence, plus recent, plus ancien). Les facettes (categories,
 * classifications, statuses) sont rendues separement par <FacetSidebar />
 * en colonne laterale.
 *
 * A11y :
 *  - role="radiogroup" / aria-checked sur chaque pill
 *  - focus-visible:ring-2 ring-seal-navy
 */

import React from "react";
import { ChevronDown, Filter } from "lucide-react";
import { Card, CardContent } from "@omnitech/ui";
import { useTranslation } from "@/lib/i18n";
import {
  ALL_MODULES,
  MODULE_LABELS,
  type ModuleKey,
  type SortKey,
} from "./types";

interface SearchFiltersProps {
  modules: ModuleKey[];
  setModules: (m: ModuleKey[]) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  showAdvanced: boolean;
  setShowAdvanced: (b: boolean) => void;
  /** Optionnel : nombre actuel de filtres avancees actifs (categories+classifications+statuses) pour afficher un compteur. */
  activeFacetCount?: number;
}

export function SearchFilters({
  modules,
  setModules,
  sort,
  setSort,
  showAdvanced,
  setShowAdvanced,
  activeFacetCount = 0,
}: SearchFiltersProps): React.ReactElement {
  const { t } = useTranslation();

  function toggleModule(m: ModuleKey) {
    if (modules.includes(m)) {
      // Au moins un module doit rester actif. Si l'utilisateur deselectionne
      // le dernier, on bascule en "tous" (modules vide).
      const next = modules.filter((x) => x !== m);
      setModules(next);
    } else {
      setModules([...modules, m]);
    }
  }

  function selectAllModules() {
    setModules([]);
  }

  const allSelected = modules.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {/* Filtre "Tout" */}
        <button
          type="button"
          onClick={selectAllModules}
          aria-pressed={allSelected}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
            allSelected
              ? "bg-seal-navy text-white dark:bg-seal-navy/90"
              : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
          }`}
        >
          {t("search.type.all")}
        </button>

        {/* Modules : pill multi-selection */}
        {ALL_MODULES.map((m) => {
          const active = modules.includes(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggleModule(m)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
                active
                  ? "bg-primary text-white shadow-sm"
                  : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
              }`}
            >
              {MODULE_LABELS[m]}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {/* Toggle advanced facets */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
            aria-label={
              showAdvanced ? "Masquer les filtres avances" : "Afficher les filtres avances"
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
              showAdvanced
                ? "border-seal-navy bg-seal-navy/5 dark:border-slate-400 dark:bg-slate-700 text-seal-navy dark:text-white"
                : "border-gray-200 dark:border-slate-600 text-seal-gray-500 dark:text-slate-400 hover:border-gray-300"
            }`}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filtres</span>
            {activeFacetCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold">
                {activeFacetCount}
              </span>
            )}
            <ChevronDown
              className={`h-3 w-3 transition ${showAdvanced ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Sort row */}
      {showAdvanced && (
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p
                id="sort-label"
                className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400"
              >
                {t("search.filter.sort")} :
              </p>
              <div
                className="flex gap-1.5 flex-wrap"
                role="radiogroup"
                aria-labelledby="sort-label"
              >
                {(
                  [
                    { value: "relevance", label: "Pertinence" },
                    { value: "newest", label: "Plus récent" },
                    { value: "oldest", label: "Plus ancien" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSort(opt.value)}
                    role="radio"
                    aria-checked={sort === opt.value}
                    className={`px-2.5 py-1 rounded text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
                      sort === opt.value
                        ? "bg-seal-navy text-white dark:bg-slate-600"
                        : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
