"use client";

/**
 * <AiSmartResults />
 * ==================
 *
 * Mode "Recherche intelligente" (smart search) propulse par `/ai/search`.
 * Conserve toute l'UX v1 : ConfidenceBadge, didYouMean, suggestions, agreges
 * documents/wiki/tickets/news/runbooks/veille/kb.
 *
 * Decoupe en composant dedie pour ne pas mixer avec le rendu Meilisearch ;
 * activable via le toggle `Sparkles` quand `features.ai === true`.
 */

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CornerDownRight,
  ExternalLink,
  FileText,
  Lightbulb,
  MessageCircle,
  Newspaper,
  PlayCircle,
  Ticket,
} from "lucide-react";
import { Badge, Card, CardContent, EmptyState } from "@omnitech/ui";
import { Spotlight } from "@/components/ui/spotlight";

interface AiResults {
  documents: any[];
  wiki: any[];
  tickets: any[];
  news: any[];
  runbooks: any[];
  veille: any[];
  kb: any[];
  suggestions: string[];
  didYouMean?: string[];
}

interface AiSmartResultsProps {
  query: string;
  data: AiResults | null;
  loading: boolean;
  onSuggestionClick: (s: string) => void;
}

export function AiSmartResults({
  query,
  data,
  loading,
  onSuggestionClick,
}: AiSmartResultsProps): React.ReactElement | null {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="shimmer rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex items-center gap-3"
          >
            <div className="h-5 w-5 rounded bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-slate-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const total =
    data.documents.length +
    data.wiki.length +
    data.tickets.length +
    data.news.length +
    (data.runbooks || []).length +
    (data.veille || []).length +
    (data.kb || []).length;

  return (
    <div className="space-y-4">
      <SummaryBar data={data} />

      {data.documents.length > 0 && (
        <Section
          id="ai-documents"
          icon={FileText}
          iconColor="text-primary"
          title="Documents"
          count={data.documents.length}
        >
          {data.documents.map((doc: any) => (
            <Link
              key={doc.id}
              href={`/documents/${doc.id}`}
              className="stagger-item block"
            >
              <Card hoverable>
                <CardContent className="py-3 flex items-center gap-3">
                  <FileText
                    className="h-5 w-5 text-seal-navy dark:text-blue-400 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      <Spotlight text={doc.title} query={query} />
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
        </Section>
      )}

      {data.wiki.length > 0 && (
        <Section
          id="ai-wiki"
          icon={BookOpen}
          iconColor="text-emerald-500"
          title="Wiki"
          count={data.wiki.length}
        >
          {data.wiki.map((page: any) => (
            <Link
              key={page.id}
              href={`/wiki?article=${page.slug || page.id}`}
              className="stagger-item block"
            >
              <Card hoverable>
                <CardContent className="py-3 flex items-center gap-3">
                  <BookOpen
                    className="h-5 w-5 text-emerald-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      <Spotlight text={page.title} query={query} />
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
        </Section>
      )}

      {data.tickets.length > 0 && (
        <Section
          id="ai-tickets"
          icon={Ticket}
          iconColor="text-amber-500"
          title="Tickets"
          count={data.tickets.length}
        >
          {data.tickets.map((t: any) => (
            <Link
              key={t.id}
              href={`/tickets/${t.id}`}
              className="stagger-item block"
            >
              <Card hoverable>
                <CardContent className="py-3 flex items-center gap-3">
                  <Ticket
                    className="h-5 w-5 text-amber-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      <Spotlight text={t.title} query={query} />
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
        </Section>
      )}

      {data.news.length > 0 && (
        <Section
          id="ai-news"
          icon={Newspaper}
          iconColor="text-blue-500"
          title="Actualités"
          count={data.news.length}
        >
          {data.news.map((n: any) => (
            <Link
              key={n.id}
              href={`/news/${n.slug || n.id}`}
              className="stagger-item block"
            >
              <Card hoverable>
                <CardContent className="py-3 flex items-center gap-3">
                  <Newspaper
                    className="h-5 w-5 text-blue-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-seal-navy dark:text-white flex-1">
                    <Spotlight text={n.title} query={query} />
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ConfidenceBadge score={n.confidence} />
                    <Badge variant="info">Actualité</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </Section>
      )}

      {(data.runbooks || []).length > 0 && (
        <Section
          id="ai-runbooks"
          icon={PlayCircle}
          iconColor="text-violet-500"
          title="Runbooks"
          count={data.runbooks.length}
        >
          {data.runbooks.map((rb: any) => (
            <Link
              key={rb.id}
              href={`/runbooks/${rb.slug || rb.id}`}
              className="stagger-item block"
            >
              <Card hoverable>
                <CardContent className="py-3 flex items-center gap-3">
                  <PlayCircle
                    className="h-5 w-5 text-violet-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      <Spotlight text={rb.title} query={query} />
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
        </Section>
      )}

      {(data.veille || []).length > 0 && (
        <Section
          id="ai-veille"
          icon={AlertTriangle}
          iconColor="text-rose-500"
          title="Veille"
          count={data.veille.length}
        >
          {data.veille.map((v: any) => (
            <div key={v.id} className="stagger-item">
              <Card hoverable>
                <CardContent className="py-3 flex items-center gap-3">
                  <AlertTriangle
                    className="h-5 w-5 text-rose-500 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      <Spotlight text={v.title} query={query} />
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
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
        </Section>
      )}

      {(data.kb || []).length > 0 && (
        <Section
          id="ai-kb"
          icon={MessageCircle}
          iconColor="text-teal-500"
          title="Base de connaissances"
          count={data.kb.length}
        >
          {data.kb.map((item: any) => (
            <Card key={item.id} hoverable className="stagger-item">
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <MessageCircle
                    className="h-5 w-5 text-teal-500 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      <Spotlight text={item.question} query={query} />
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
        </Section>
      )}

      {data.didYouMean && data.didYouMean.length > 0 && (
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-1.5">
              <CornerDownRight className="h-3.5 w-3.5 text-amber-500" />{" "}
              Vouliez-vous dire ?
            </p>
            <div className="flex flex-wrap gap-2">
              {data.didYouMean.map((s, i) => (
                <button
                  key={`dym-${i}`}
                  type="button"
                  onClick={() => onSuggestionClick(s)}
                  className="px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition border border-amber-200 dark:border-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.suggestions.length > 0 && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-primary" /> Suggestions IA
            </p>
            <div className="flex flex-wrap gap-2">
              {data.suggestions.map((s, i) => (
                <button
                  key={`sug-${i}`}
                  type="button"
                  onClick={() => onSuggestionClick(s)}
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-xs font-medium text-primary hover:bg-primary hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {total === 0 && (
        <EmptyState
          type="search"
          title="Aucun résultat"
          description={`Aucun contenu ne correspond à « ${query} ». Essayez des termes plus courts ou vérifiez l'orthographe.`}
        />
      )}
    </div>
  );
}

interface SectionProps {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  title: string;
  count: number;
  children: React.ReactNode;
}

function Section({
  id,
  icon: Icon,
  iconColor,
  title,
  count,
  children,
}: SectionProps): React.ReactElement {
  return (
    <div id={id}>
      <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" /> {title} (
        {count})
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ConfidenceBadge({ score }: { score?: number }): React.ReactElement | null {
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

interface SummaryBarProps {
  data: AiResults;
}

function SummaryBar({ data }: SummaryBarProps): React.ReactElement {
  const stats = [
    {
      key: "ai-documents",
      icon: FileText,
      count: data.documents.length,
      label: "documents",
      color: "text-primary bg-primary/10 hover:bg-primary/20",
    },
    {
      key: "ai-wiki",
      icon: BookOpen,
      count: data.wiki.length,
      label: "wiki",
      color:
        "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400",
    },
    {
      key: "ai-tickets",
      icon: Ticket,
      count: data.tickets.length,
      label: "tickets",
      color:
        "text-amber-600 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400",
    },
    {
      key: "ai-news",
      icon: Newspaper,
      count: data.news.length,
      label: "actualites",
      color:
        "text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400",
    },
    {
      key: "ai-runbooks",
      icon: PlayCircle,
      count: (data.runbooks || []).length,
      label: "runbooks",
      color:
        "text-violet-600 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 dark:text-violet-400",
    },
    {
      key: "ai-veille",
      icon: AlertTriangle,
      count: (data.veille || []).length,
      label: "veille",
      color:
        "text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 dark:text-rose-400",
    },
    {
      key: "ai-kb",
      icon: MessageCircle,
      count: (data.kb || []).length,
      label: "KB",
      color:
        "text-teal-600 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 dark:text-teal-400",
    },
  ];
  const total = stats.reduce((acc, s) => acc + s.count, 0);

  return (
    <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
      {stats
        .filter((s) => s.count > 0)
        .map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() =>
              document
                .getElementById(s.key)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${s.color}`}
          >
            <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {s.count} {s.label}
          </button>
        ))}
      <span className="ml-auto text-xs text-seal-gray-500 dark:text-slate-400 font-medium">
        {total} resultats
      </span>
    </div>
  );
}
