"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { features } from "@/lib/features";
import { useDebounce } from "@/hooks/use-debounce";
import { useTranslation } from "@/lib/i18n";
import {
  Card,
  CardContent,
  Badge,
  SearchInput,
  Select,
  EmptyState,
  Skeleton,
} from "@omnitech/ui";
import {
  FileText,
  Newspaper,
  Search,
  BookOpen,
  Rss,
  ChevronDown,
  Filter,
  Sparkles,
  Ticket,
  Lightbulb,
  Zap,
  FilePlus,
  User,
  Settings,
  HelpCircle,
  PlayCircle,
  AlertTriangle,
  MessageCircle,
  ExternalLink,
  CornerDownRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SmartFilterBar } from "@/components/ui/smart-filter-bar";
import { Spotlight } from "@/components/ui/spotlight";
import { formatRelativeTime } from "@/lib/utils";
import type { SmartFilter } from "@/lib/smart-filter";
import { periodToRange } from "@/lib/smart-filter";

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="bg-primary/20 text-seal-navy dark:text-white px-0.5 rounded"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

interface SearchResult {
  id: string;
  title: string;
  reference?: string;
  slug?: string;
  type: string;
  excerpt?: string;
  classification?: string;
  category?: string;
  status?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Quick Actions (command palette)                                     */
/* ------------------------------------------------------------------ */

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  keywords: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Nouveau document",
    description: "Créer un nouveau document dans la GED",
    href: "/documents/new",
    icon: FilePlus,
    keywords: [
      "nouveau document",
      "creer document",
      "créer document",
      "new doc",
      "ajouter document",
    ],
  },
  {
    label: "Nouveau ticket",
    description: "Ouvrir un ticket de support IT",
    href: "/tickets?create=true",
    icon: Ticket,
    keywords: [
      "nouveau ticket",
      "creer ticket",
      "créer ticket",
      "new ticket",
      "ouvrir ticket",
      "support",
    ],
  },
  {
    label: "Mon profil",
    description: "Voir et modifier mon profil",
    href: "/profile",
    icon: User,
    keywords: ["profil", "profile", "mon profil", "mon compte", "compte"],
  },
  {
    label: "Paramètres",
    description: "Configuration de la plateforme",
    href: "/admin/config",
    icon: Settings,
    keywords: [
      "paramètres",
      "parametres",
      "parametre",
      "config",
      "configuration",
      "settings",
      "réglages",
      "reglages",
    ],
  },
  {
    label: "Aide",
    description: "Accéder à l'assistant IT et au helpdesk",
    href: "/helpdesk",
    icon: HelpCircle,
    keywords: [
      "aide",
      "help",
      "helpdesk",
      "assistance",
      "support",
      "assistant",
    ],
  },
];

function matchQuickActions(query: string): QuickAction[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().trim();
  return QUICK_ACTIONS.filter(
    (action) =>
      action.keywords.some((kw) => kw.includes(q) || q.includes(kw)) ||
      action.label.toLowerCase().includes(q),
  );
}

function classificationVariant(
  c: string,
): "error" | "warning" | "navy" | "success" {
  switch (c) {
    case "SECRET":
      return "error";
    case "CONFIDENTIEL":
      return "error";
    case "INTERNE":
      return "navy";
    default:
      return "success";
  }
}

/** Small pill showing a relevance/confidence percentage for smart search results */
function ConfidenceBadge({ score }: { score?: number }) {
  if (score == null) return null;
  const color =
    score >= 80
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : score >= 50
        ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${color}`}
      title="Pertinence"
    >
      {score}%
    </span>
  );
}

/** Returns the display date from a result, checking multiple fields */
function getResultDate(r: SearchResult): string | undefined {
  return r.date || r.createdAt || r.updatedAt;
}

/** Skeleton row matching result card shape */
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

export default function SearchPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [results, setResults] = useState<{
    documents: SearchResult[];
    news: SearchResult[];
    wiki: SearchResult[];
    tickets: SearchResult[];
  }>({ documents: [], news: [], wiki: [], tickets: [] });
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"relevance" | "newest" | "oldest">(
    "relevance",
  );
  const [smartMode, setSmartMode] = useState(false);
  const [aiResults, setAiResults] = useState<{
    documents: any[];
    wiki: any[];
    tickets: any[];
    news: any[];
    runbooks: any[];
    veille: any[];
    kb: any[];
    suggestions: string[];
    didYouMean?: string[];
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [smartFilter, setSmartFilter] = useState<SmartFilter | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Keyboard shortcut: "/" focuses the search input when outside an input
  useEffect(() => {
    function handleSlash(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    document.addEventListener("keydown", handleSlash);
    return () => document.removeEventListener("keydown", handleSlash);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("omnitech_recent_searches");
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  const saveSearch = useCallback((term: string) => {
    if (!term.trim()) return;
    setRecentSearches((prev) => {
      const updated = [term, ...prev.filter((s) => s !== term)].slice(0, 10);
      localStorage.setItem("omnitech_recent_searches", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const [searchTime, setSearchTime] = useState(0);

  const search = useCallback(async () => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults({ documents: [], news: [], wiki: [], tickets: [] });
      return;
    }
    setLoading(true);
    const start = performance.now();
    try {
      // Try Meilisearch first, fallback to Prisma search
      let meiliOk = false;
      try {
        const meiliType =
          type === "all"
            ? undefined
            : type === "documents"
              ? "document"
              : type === "news"
                ? "news"
                : type === "wiki"
                  ? "wiki"
                  : type === "tickets"
                    ? "ticket"
                    : undefined;
        const { data: meiliData } = await api.get("/search/meili", {
          params: {
            q: debouncedQuery,
            ...(meiliType ? { type: meiliType } : {}),
            limit: 20,
          },
        });
        setSearchTime(Math.round(performance.now() - start));
        // Parse Meilisearch multi-index results into typed groups
        const docs: SearchResult[] = [];
        const newsArr: SearchResult[] = [];
        const wikiArr: SearchResult[] = [];
        const ticketsArr: SearchResult[] = [];
        for (const hit of meiliData.hits || []) {
          const formatted = hit._formatted || hit;
          const result: SearchResult = {
            id: (hit.id as string).replace(
              /^(document|ticket|wiki|news)[-:]/,
              "",
            ),
            title: formatted.title || hit.title,
            reference: hit.reference,
            slug: hit.url?.split("/").pop(),
            type: hit.type,
            excerpt: formatted.content
              ? (formatted.content as string).slice(0, 200)
              : undefined,
            classification: hit.classification,
            category: hit.category,
            status: hit.status,
            date: hit.date,
            createdAt: hit.date,
          };
          if (hit.type === "document") docs.push(result);
          else if (hit.type === "news") newsArr.push(result);
          else if (hit.type === "wiki") wikiArr.push(result);
          else if (hit.type === "ticket") ticketsArr.push(result);
        }
        setResults({
          documents: docs,
          news: newsArr,
          wiki: wikiArr,
          tickets: ticketsArr,
        });
        meiliOk = true;
      } catch {
        // Meilisearch unavailable — fallback to Prisma
      }
      if (!meiliOk) {
        const { data } = await api.get("/search", {
          params: {
            q: debouncedQuery,
            type,
            ...(dateRange !== "all" ? { dateRange } : {}),
            ...(sortBy !== "relevance" ? { sort: sortBy } : {}),
          },
        });
        setSearchTime(Math.round(performance.now() - start));
        setResults({
          documents: data.documents || [],
          news: data.news || [],
          wiki: data.wiki || [],
          tickets: data.tickets || [],
        });
      }
      saveSearch(debouncedQuery);
    } catch {
      setResults({ documents: [], news: [], wiki: [], tickets: [] });
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, type, dateRange, sortBy, saveSearch]);

  useEffect(() => {
    search();
  }, [search]);

  // AI smart search
  useEffect(() => {
    if (!smartMode || !debouncedQuery || debouncedQuery.length < 2) {
      setAiResults(null);
      return;
    }
    setAiLoading(true);
    api
      .get("/ai/search", { params: { q: debouncedQuery } })
      .then(({ data }) => {
        setAiResults(data);
        saveSearch(debouncedQuery);
      })
      .catch(() => setAiResults(null))
      .finally(() => setAiLoading(false));
  }, [debouncedQuery, smartMode, saveSearch]);

  // SmartFilterBar handler
  const handleSmartFilter = useCallback((filter: SmartFilter, _raw: string) => {
    setSmartFilter(filter);
  }, []);

  const filteredDocuments = useMemo(() => {
    let docs = results.documents;
    if (classificationFilter !== "all") {
      docs = docs.filter((d) => d.classification === classificationFilter);
    }
    return docs;
  }, [results.documents, classificationFilter]);

  // Apply smart-filter period filtering to all result groups
  const periodRange = useMemo(
    () => (smartFilter?.period ? periodToRange(smartFilter.period) : null),
    [smartFilter?.period],
  );

  function matchesPeriod(r: SearchResult): boolean {
    if (!periodRange) return true;
    const d = getResultDate(r);
    if (!d) return true; // keep results without dates
    return d >= periodRange.from && d < periodRange.to;
  }

  const sfFilteredDocuments = useMemo(
    () => filteredDocuments.filter(matchesPeriod),
    [filteredDocuments, periodRange],
  );
  const sfFilteredNews = useMemo(
    () => results.news.filter(matchesPeriod),
    [results.news, periodRange],
  );
  const sfFilteredWiki = useMemo(
    () => results.wiki.filter(matchesPeriod),
    [results.wiki, periodRange],
  );
  const sfFilteredTickets = useMemo(
    () => results.tickets.filter(matchesPeriod),
    [results.tickets, periodRange],
  );

  const quickActions = useMemo(
    () => matchQuickActions(debouncedQuery),
    [debouncedQuery],
  );

  const totalResults =
    sfFilteredDocuments.length +
    sfFilteredNews.length +
    sfFilteredWiki.length +
    sfFilteredTickets.length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("search.title")}
        subtitle={t("search.subtitle")}
        icon={Search}
        hub="monEspace"
      />

      <div className="flex gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
        <SearchInput
          ref={searchInputRef}
          value={query}
          onChange={setQuery}
          placeholder={t("search.placeholder")}
          className="flex-1 min-w-[200px]"
          autoFocus
        />
        {features.ai && (
          <button
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
        {!smartMode && (
          <Select
            options={[
              { value: "all", label: t("search.type.all") },
              { value: "documents", label: t("search.type.documents") },
              { value: "news", label: t("search.type.news") },
              { value: "wiki", label: "Wiki" },
              { value: "tickets", label: "Tickets" },
            ]}
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-40"
          />
        )}
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-label={
            showFilters ? "Masquer les filtres" : "Afficher les filtres"
          }
          aria-expanded={showFilters}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
            showFilters
              ? "border-seal-navy bg-seal-navy/5 dark:border-slate-400 dark:bg-slate-700"
              : "border-gray-200 dark:border-slate-600 hover:border-gray-300"
          }`}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          <ChevronDown
            className={`h-3 w-3 transition ${showFilters ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* SmartFilterBar — NL filter above results */}
      <SmartFilterBar
        placeholder="Filtrer : « mes documents cette semaine », « tickets ouverts critiques »..."
        onFilter={handleSmartFilter}
        className="mb-2"
      />

      {showFilters && (
        <Card>
          <CardContent className="py-3 sm:py-4">
            <div className="flex flex-wrap gap-4 sm:gap-6">
              <div>
                <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-1.5">
                  {t("search.filter.period")}
                </p>
                <div
                  className="flex gap-1.5 flex-wrap"
                  role="radiogroup"
                  aria-label={t("search.filter.period")}
                >
                  {[
                    { value: "all", label: "Tout" },
                    { value: "week", label: "7 jours" },
                    { value: "month", label: "30 jours" },
                    { value: "quarter", label: "3 mois" },
                    { value: "year", label: "1 an" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDateRange(opt.value)}
                      role="radio"
                      aria-checked={dateRange === opt.value}
                      className={`px-2.5 py-1 rounded text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
                        dateRange === opt.value
                          ? "bg-seal-navy text-white dark:bg-slate-600"
                          : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-1.5">
                  {t("search.filter.classification")}
                </p>
                <div
                  className="flex gap-1.5 flex-wrap"
                  role="radiogroup"
                  aria-label={t("search.filter.classification")}
                >
                  {[
                    { value: "all", label: "Toutes" },
                    { value: "PUBLIC", label: "Public" },
                    { value: "INTERNE", label: "Interne" },
                    { value: "CONFIDENTIEL", label: "Confidentiel" },
                    { value: "SECRET", label: "Secret" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setClassificationFilter(opt.value)}
                      role="radio"
                      aria-checked={classificationFilter === opt.value}
                      className={`px-2.5 py-1 rounded text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
                        classificationFilter === opt.value
                          ? "bg-seal-navy text-white dark:bg-slate-600"
                          : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-1.5">
                  {t("search.filter.sort")}
                </p>
                <div
                  className="flex gap-1.5 flex-wrap"
                  role="radiogroup"
                  aria-label={t("search.filter.sort")}
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
                      onClick={() => setSortBy(opt.value)}
                      role="radio"
                      aria-checked={sortBy === opt.value}
                      className={`px-2.5 py-1 rounded text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
                        sortBy === opt.value
                          ? "bg-seal-navy text-white dark:bg-slate-600"
                          : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions (command palette) */}
      {quickActions.length > 0 && debouncedQuery && (
        <div>
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> {t("search.quickActions")}
          </h2>
          <div className="space-y-1.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href}>
                  <Card hoverable>
                    <CardContent className="py-2.5 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-seal-navy dark:text-white">
                          {action.label}
                        </p>
                        <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                          {action.description}
                        </p>
                      </div>
                      <Badge variant="navy" className="text-[10px]">
                        Action
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!query && (
        <Card>
          <CardContent className="py-4 space-y-4">
            {/* Popular searches */}
            <div>
              <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
                {t("search.popular")}
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "ISO 27001",
                  "procédure",
                  "politique sécurité",
                  "incident",
                  "VPN",
                  "MFA",
                  "sauvegarde",
                  "FortiGate",
                ].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-3 py-1.5 rounded-full bg-primary/10 text-sm font-medium text-primary hover:bg-primary hover:text-white transition"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
                  {t("search.recent")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((term, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(term)}
                      className="px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-sm text-seal-navy dark:text-white hover:bg-primary hover:text-white transition"
                    >
                      {term}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setRecentSearches([]);
                      localStorage.removeItem("omnitech_recent_searches");
                    }}
                    className="px-3 py-1 text-xs text-seal-gray-500 hover:text-red-500"
                  >
                    {t("search.clear")}
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {smartMode && aiLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {[1, 2, 3].map((i) => (
            <ResultSkeleton key={i} />
          ))}
        </div>
      ) : smartMode &&
        debouncedQuery &&
        debouncedQuery.length >= 2 &&
        aiResults ? (
        <div className="space-y-4">
          {/* Summary bar with clickable counts */}
          <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
            {[
              {
                key: "ai-documents",
                icon: FileText,
                count: aiResults.documents.length,
                label: "documents",
                color: "text-primary bg-primary/10 hover:bg-primary/20",
              },
              {
                key: "ai-wiki",
                icon: BookOpen,
                count: aiResults.wiki.length,
                label: "wiki",
                color:
                  "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400",
              },
              {
                key: "ai-tickets",
                icon: Ticket,
                count: aiResults.tickets.length,
                label: "tickets",
                color:
                  "text-amber-600 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400",
              },
              {
                key: "ai-news",
                icon: Newspaper,
                count: aiResults.news.length,
                label: "actualites",
                color:
                  "text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400",
              },
              {
                key: "ai-runbooks",
                icon: PlayCircle,
                count: (aiResults.runbooks || []).length,
                label: "runbooks",
                color:
                  "text-violet-600 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 dark:text-violet-400",
              },
              {
                key: "ai-veille",
                icon: AlertTriangle,
                count: (aiResults.veille || []).length,
                label: "veille",
                color:
                  "text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 dark:text-rose-400",
              },
              {
                key: "ai-kb",
                icon: MessageCircle,
                count: (aiResults.kb || []).length,
                label: "KB",
                color:
                  "text-teal-600 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 dark:text-teal-400",
              },
            ]
              .filter((s) => s.count > 0)
              .map((s) => (
                <button
                  key={s.key}
                  onClick={() =>
                    document
                      .getElementById(s.key)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${s.color}`}
                >
                  <s.icon className="h-3.5 w-3.5" />
                  {s.count} {s.label}
                </button>
              ))}
            <span className="ml-auto text-xs text-seal-gray-500 dark:text-slate-400 font-medium">
              {aiResults.documents.length +
                aiResults.wiki.length +
                aiResults.tickets.length +
                aiResults.news.length +
                (aiResults.runbooks || []).length +
                (aiResults.veille || []).length +
                (aiResults.kb || []).length}{" "}
              resultats
            </span>
          </div>

          {aiResults.documents.length > 0 && (
            <div id="ai-documents">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Documents (
                {aiResults.documents.length})
              </h2>
              <div className="space-y-2">
                {aiResults.documents.map((doc: any) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <FileText className="h-5 w-5 text-seal-navy dark:text-blue-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(doc.title, debouncedQuery)}
                          </p>
                          {doc.reference && (
                            <p className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-400">
                              {doc.reference}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ConfidenceBadge score={doc.confidence} />
                          <Badge variant="navy">Document</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {aiResults.wiki.length > 0 && (
            <div id="ai-wiki">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-500" /> Wiki (
                {aiResults.wiki.length})
              </h2>
              <div className="space-y-2">
                {aiResults.wiki.map((page: any) => (
                  <Link
                    key={page.id}
                    href={`/wiki?article=${page.slug || page.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <BookOpen className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(page.title, debouncedQuery)}
                          </p>
                          {page.category && (
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                              {page.category}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ConfidenceBadge score={page.confidence} />
                          <Badge variant="success">Wiki</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {aiResults.tickets.length > 0 && (
            <div id="ai-tickets">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <Ticket className="h-4 w-4 text-amber-500" /> Tickets (
                {aiResults.tickets.length})
              </h2>
              <div className="space-y-2">
                {aiResults.tickets.map((t: any) => (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <Ticket className="h-5 w-5 text-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(t.title, debouncedQuery)}
                          </p>
                          {t.reference && (
                            <p className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-400">
                              {t.reference}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ConfidenceBadge score={t.confidence} />
                          <Badge
                            variant={
                              t.status === "RESOLVED" || t.status === "CLOSED"
                                ? "info"
                                : "warning"
                            }
                          >
                            {t.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {aiResults.news.length > 0 && (
            <div id="ai-news">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-blue-500" /> Actualités (
                {aiResults.news.length})
              </h2>
              <div className="space-y-2">
                {aiResults.news.map((n: any) => (
                  <Link
                    key={n.id}
                    href={`/news/${n.slug || n.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <Newspaper className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        <p className="text-sm font-semibold text-seal-navy dark:text-white flex-1">
                          {highlightMatch(n.title, debouncedQuery)}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ConfidenceBadge score={n.confidence} />
                          <Badge variant="info">Actualité</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {(aiResults.runbooks || []).length > 0 && (
            <div id="ai-runbooks">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-violet-500" /> Runbooks (
                {aiResults.runbooks.length})
              </h2>
              <div className="space-y-2">
                {aiResults.runbooks.map((rb: any) => (
                  <Link
                    key={rb.id}
                    href={`/runbooks/${rb.slug || rb.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <PlayCircle className="h-5 w-5 text-violet-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(rb.title, debouncedQuery)}
                          </p>
                          {rb.category && (
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                              {rb.category}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ConfidenceBadge score={rb.confidence} />
                          <Badge variant="navy">Runbook</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {(aiResults.veille || []).length > 0 && (
            <div id="ai-veille">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" /> Veille (
                {aiResults.veille.length})
              </h2>
              <div className="space-y-2">
                {aiResults.veille.map((v: any) => (
                  <div key={v.id} className="stagger-item">
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(v.title, debouncedQuery)}
                          </p>
                          {v.severity && (
                            <Badge
                              variant={
                                v.severity === "CRITICAL"
                                  ? "error"
                                  : v.severity === "HIGH"
                                    ? "warning"
                                    : "info"
                              }
                              className="mt-0.5"
                            >
                              {v.severity}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {v.sourceUrl && (
                            <a
                              href={v.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-seal-gray-500 hover:text-primary transition"
                              title="Source"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          <Link href="/veille">
                            <Badge variant="error">Veille</Badge>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(aiResults.kb || []).length > 0 && (
            <div id="ai-kb">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-teal-500" /> Base de
                connaissances ({aiResults.kb.length})
              </h2>
              <div className="space-y-2">
                {aiResults.kb.map((item: any) => (
                  <Card key={item.id} hoverable className="stagger-item">
                    <CardContent className="py-3">
                      <div className="flex items-start gap-3">
                        <MessageCircle className="h-5 w-5 text-teal-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(item.question, debouncedQuery)}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2 mt-1">
                            {item.answer}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ConfidenceBadge score={item.confidence} />
                          <Badge variant="success">KB</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* "Did you mean?" — shown when results are sparse and the backend found close title matches */}
          {aiResults.didYouMean && aiResults.didYouMean.length > 0 && (
            <Card className="border-l-4 border-l-amber-400">
              <CardContent className="py-3">
                <p className="text-xs font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-1.5">
                  <CornerDownRight className="h-3.5 w-3.5 text-amber-500" />{" "}
                  Vouliez-vous dire ?
                </p>
                <div className="flex flex-wrap gap-2">
                  {aiResults.didYouMean.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(s)}
                      className="px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition border border-amber-200 dark:border-amber-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {aiResults.suggestions.length > 0 && (
            <Card className="border-l-4 border-l-primary">
              <CardContent className="py-3">
                <p className="text-xs font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-primary" /> Suggestions
                  IA
                </p>
                <div className="flex flex-wrap gap-2">
                  {aiResults.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(s)}
                      className="px-3 py-1.5 rounded-full bg-primary/10 text-xs font-medium text-primary hover:bg-primary hover:text-white transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {aiResults.documents.length === 0 &&
            aiResults.wiki.length === 0 &&
            aiResults.tickets.length === 0 &&
            aiResults.news.length === 0 &&
            (aiResults.runbooks || []).length === 0 &&
            (aiResults.veille || []).length === 0 &&
            (aiResults.kb || []).length === 0 && (
              <EmptyState
                type="search"
                title="Aucun résultat"
                description={`Aucun contenu ne correspond à « ${debouncedQuery} ». Essayez des termes plus courts ou vérifiez l'orthographe.`}
              />
            )}
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {[1, 2, 3, 4].map((i) => (
            <ResultSkeleton key={i} />
          ))}
        </div>
      ) : !debouncedQuery ? (
        <div className="text-center py-12 sm:py-16 px-4">
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
      ) : totalResults === 0 ? (
        <EmptyState
          type="search"
          title="Aucun résultat"
          description={`Aucun contenu ne correspond à « ${debouncedQuery} ». Essayez des termes plus courts ou vérifiez l'orthographe.`}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm text-seal-gray-500 dark:text-slate-400 mb-4 flex-wrap">
            <span>
              <FileText className="h-4 w-4 inline" />{" "}
              {sfFilteredDocuments.length} documents
            </span>
            <span>
              <Newspaper className="h-4 w-4 inline" /> {sfFilteredNews.length}{" "}
              actualités
            </span>
            {sfFilteredWiki.length > 0 && (
              <span>
                <BookOpen className="h-4 w-4 inline" /> {sfFilteredWiki.length}{" "}
                wiki
              </span>
            )}
            {sfFilteredTickets.length > 0 && (
              <span>
                <Ticket className="h-4 w-4 inline" /> {sfFilteredTickets.length}{" "}
                tickets
              </span>
            )}
            <span className="ml-auto">
              {totalResults} résultats en {searchTime}ms
            </span>
          </div>

          {sfFilteredDocuments.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />{" "}
                {t("search.sectionDocuments")} ({sfFilteredDocuments.length})
              </h2>
              <div className="space-y-2">
                {sfFilteredDocuments.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <FileText className="h-5 w-5 text-seal-navy dark:text-blue-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(doc.title, debouncedQuery)}
                          </p>
                          {doc.reference && (
                            <p className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-400">
                              {doc.reference}
                            </p>
                          )}
                          {doc.excerpt && (
                            <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                              <Spotlight
                                text={doc.excerpt}
                                query={debouncedQuery}
                              />
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getResultDate(doc) && (
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                              {formatRelativeTime(getResultDate(doc)!)}
                            </span>
                          )}
                          {doc.classification && (
                            <Badge
                              variant={classificationVariant(
                                doc.classification,
                              )}
                            >
                              {doc.classification}
                            </Badge>
                          )}
                          <Badge variant="navy">
                            {t("search.badgeDocument")}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {sfFilteredNews.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-primary" />{" "}
                {t("search.sectionNews")} ({sfFilteredNews.length})
              </h2>
              <div className="space-y-2">
                {sfFilteredNews.map((n) => (
                  <Link
                    key={n.id}
                    href={`/news/${n.slug || n.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <Newspaper className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(n.title, debouncedQuery)}
                          </p>
                          {n.excerpt && (
                            <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                              <Spotlight
                                text={n.excerpt}
                                query={debouncedQuery}
                              />
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getResultDate(n) && (
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                              {formatRelativeTime(getResultDate(n)!)}
                            </span>
                          )}
                          <Badge variant="info">{t("search.badgeNews")}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {sfFilteredWiki.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Wiki (
                {sfFilteredWiki.length})
              </h2>
              <div className="space-y-2">
                {sfFilteredWiki.map((w) => (
                  <Link
                    key={w.id}
                    href={`/wiki?article=${w.slug || w.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <BookOpen className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(w.title, debouncedQuery)}
                          </p>
                          {w.category && (
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                              {w.category}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getResultDate(w) && (
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                              {formatRelativeTime(getResultDate(w)!)}
                            </span>
                          )}
                          <Badge variant="primary">Wiki</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {sfFilteredTickets.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" /> Tickets (
                {sfFilteredTickets.length})
              </h2>
              <div className="space-y-2">
                {sfFilteredTickets.map((tk) => (
                  <Link
                    key={tk.id}
                    href={`/tickets/${tk.id}`}
                    className="stagger-item block"
                  >
                    <Card hoverable>
                      <CardContent className="py-3 flex items-center gap-3">
                        <Ticket className="h-5 w-5 text-violet-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {highlightMatch(tk.title, debouncedQuery)}
                          </p>
                          {tk.reference && (
                            <p className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-400">
                              {tk.reference}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getResultDate(tk) && (
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                              {formatRelativeTime(getResultDate(tk)!)}
                            </span>
                          )}
                          {tk.status && (
                            <Badge
                              variant={
                                tk.status === "OPEN"
                                  ? "warning"
                                  : tk.status === "CLOSED"
                                    ? "approved"
                                    : "info"
                              }
                            >
                              {tk.status}
                            </Badge>
                          )}
                          <Badge variant="navy">Ticket</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
