"use client";

/**
 * <SearchEmptyState />
 * ====================
 *
 * Etat affiche quand la query est vide : popular searches + recent searches.
 */

import React from "react";
import { Card, CardContent } from "@omnitech/ui";
import { BookOpen, FileText, Newspaper, Search, Ticket } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const POPULAR_TAGS = [
  "ISO 27001",
  "procédure",
  "politique sécurité",
  "incident",
  "VPN",
  "MFA",
  "sauvegarde",
  "FortiGate",
];

interface Props {
  onSelect: (term: string) => void;
  recentSearches: string[];
  onClearRecent: () => void;
}

export function SearchEmptyState({
  onSelect,
  recentSearches,
  onClearRecent,
}: Props): React.ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
              {t("search.popular")}
            </p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelect(tag)}
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-sm font-medium text-primary hover:bg-primary hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {recentSearches.length > 0 && (
            <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
                {t("search.recent")}
              </p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term, i) => (
                  <button
                    key={`${term}-${i}`}
                    type="button"
                    onClick={() => onSelect(term)}
                    className="px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-sm text-seal-navy dark:text-white hover:bg-primary hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy"
                  >
                    {term}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onClearRecent}
                  className="px-3 py-1 text-xs text-seal-gray-500 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-full"
                >
                  {t("search.clear")}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center py-8 sm:py-12 px-4">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Search className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <p className="text-lg font-semibold text-seal-navy dark:text-white mb-1">
          {t("search.intranet")}
        </p>
        <p className="text-sm text-seal-gray-500 dark:text-slate-400">
          {t("search.minChars")}
        </p>
        <p className="text-xs text-seal-gray-500/60 dark:text-slate-500 mt-2">
          Appuyez sur{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono border border-gray-200 dark:border-slate-700">
            /
          </kbd>{" "}
          pour rechercher
        </p>
        <div className="flex justify-center gap-3 sm:gap-4 mt-4 text-xs text-seal-gray-500 dark:text-slate-500 flex-wrap">
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />{" "}
            {t("search.type.documents")}
          </span>
          <span className="flex items-center gap-1">
            <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />{" "}
            {t("search.type.news")}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Wiki
          </span>
          <span className="flex items-center gap-1">
            <Ticket className="h-3.5 w-3.5" aria-hidden="true" /> Tickets
          </span>
        </div>
      </div>
    </>
  );
}
