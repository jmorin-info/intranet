"use client";

/**
 * <FacetSidebar />
 * ================
 *
 * Affiche les facettes Meilisearch (categorie, classification, statut)
 * sous forme de checkboxes avec compteur. Les distributions sont calculees
 * cote Meilisearch (`facetDistribution`) et propagees ici.
 *
 * Quand une facette est cochee, le caller met a jour ses listes (categories,
 * classifications, statuses) et relance la recherche : la nouvelle distribution
 * met a jour les compteurs (les facettes restent "live").
 *
 * A11y :
 *  - <fieldset>/<legend> par groupe
 *  - role="group" + aria-label
 *  - keyboard nav natif via <input type="checkbox">
 */

import React from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { FacetDistribution } from "./types";

interface FacetSidebarProps {
  facets: FacetDistribution;
  selectedCategories: string[];
  selectedClassifications: string[];
  selectedStatuses: string[];
  onCategoriesChange: (next: string[]) => void;
  onClassificationsChange: (next: string[]) => void;
  onStatusesChange: (next: string[]) => void;
  /** Affichage compact pour mobile (drawer). */
  compact?: boolean;
}

export function FacetSidebar({
  facets,
  selectedCategories,
  selectedClassifications,
  selectedStatuses,
  onCategoriesChange,
  onClassificationsChange,
  onStatusesChange,
  compact = false,
}: FacetSidebarProps): React.ReactElement | null {
  const hasAnyFacet =
    Object.keys(facets.category ?? {}).length > 0 ||
    Object.keys(facets.classification ?? {}).length > 0 ||
    Object.keys(facets.status ?? {}).length > 0;

  if (!hasAnyFacet) return null;

  const totalActive =
    selectedCategories.length +
    selectedClassifications.length +
    selectedStatuses.length;

  return (
    <aside
      aria-label="Filtres avances par facettes"
      className={`${
        compact ? "" : "sticky top-16"
      } space-y-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
          Affiner
        </h3>
        {totalActive > 0 && (
          <button
            type="button"
            onClick={() => {
              onCategoriesChange([]);
              onClassificationsChange([]);
              onStatusesChange([]);
            }}
            className="text-[11px] text-seal-gray-500 hover:text-red-500 inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" aria-hidden="true" /> Tout effacer
          </button>
        )}
      </div>

      <FacetGroup
        title="Catégorie"
        distribution={facets.category}
        selected={selectedCategories}
        onChange={onCategoriesChange}
      />

      <FacetGroup
        title="Classification"
        distribution={facets.classification}
        selected={selectedClassifications}
        onChange={onClassificationsChange}
      />

      <FacetGroup
        title="Statut"
        distribution={facets.status}
        selected={selectedStatuses}
        onChange={onStatusesChange}
      />
    </aside>
  );
}

interface FacetGroupProps {
  title: string;
  distribution?: Record<string, number>;
  selected: string[];
  onChange: (next: string[]) => void;
}

function FacetGroup({
  title,
  distribution,
  selected,
  onChange,
}: FacetGroupProps): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState(true);

  if (!distribution || Object.keys(distribution).length === 0) return null;

  // Tri par count desc, puis alpha
  const entries = Object.entries(distribution).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <fieldset className="border-t border-gray-100 dark:border-slate-800 pt-3">
      <legend className="sr-only">{title}</legend>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy rounded"
      >
        <span>{title}</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <ul className="mt-2 space-y-1.5 max-h-56 overflow-y-auto" role="group">
          {entries.map(([value, count]) => {
            const checked = selected.includes(value);
            return (
              <li key={value}>
                <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 rounded px-1 py-0.5 transition">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(value)}
                    className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-2 focus:ring-seal-navy focus:ring-offset-0"
                  />
                  <span
                    className={`flex-1 truncate ${
                      checked
                        ? "text-seal-navy dark:text-white font-medium"
                        : "text-seal-gray-500 dark:text-slate-400"
                    }`}
                    title={value}
                  >
                    {value}
                  </span>
                  <span className="text-[10px] text-seal-gray-500/70 dark:text-slate-500 tabular-nums">
                    {count}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
