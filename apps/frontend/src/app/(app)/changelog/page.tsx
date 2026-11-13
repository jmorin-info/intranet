import React from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, Badge, EmptyState } from "@omnitech/ui";
import {
  Sparkles,
  TrendingUp,
  Calendar,
  Tag,
  Shield,
  ScrollText,
  Brain,
  Search,
  MessageSquare,
  LayoutDashboard,
  Award,
  GitBranch,
  Clock,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/page-header";

interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
  type: "new" | "improvement";
}

const TYPE_CONFIG: Record<
  ChangelogEntry["type"],
  { label: string; variant: "success" | "info"; icon: React.ElementType }
> = {
  new: { label: "Nouveau", variant: "success", icon: Sparkles },
  improvement: { label: "Amelioration", variant: "info", icon: TrendingUp },
};

const ICON_MAP: Record<string, React.ElementType> = {
  "Module Certifications de formation": Award,
  "Integration KnowBe4": Shield,
  "Timeline unifiee": Clock,
  "Chatbot IA enrichi (RAG + detection d'intention)": Brain,
  "Dashboard Watch Faces": LayoutDashboard,
  "Recherche intelligente (Smart Filter)": Search,
  "Annotations collaboratives": MessageSquare,
  "Workflows d'approbation predefinis": GitBranch,
};

const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || "";

/**
 * Lit le changelog cote serveur (public/CHANGELOG.json).
 * Retourne [] si le fichier est absent ou invalide (comportement identique
 * a l'ancien fallback client sur echec de fetch).
 */
async function getChangelogEntries(): Promise<ChangelogEntry[]> {
  try {
    const filePath = path.join(process.cwd(), "public", "CHANGELOG.json");
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as ChangelogEntry[];
  } catch {
    return [];
  }
}

export default async function ChangelogPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value === "en" ? "en" : "fr";
  const entries = await getChangelogEntries();

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <PageHeader
        title={t("changelog.title", locale)}
        subtitle="Historique des nouvelles fonctionnalites, corrections et ameliorations."
        icon={ScrollText}
        actions={
          <div className="flex items-center gap-3">
            {BUILD_VERSION && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-mono">
                {BUILD_VERSION}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold">
              <Tag className="h-3.5 w-3.5" />
              {entries.length} entrees
            </span>
          </div>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          type="general"
          title="Aucune entrée dans le changelog"
          description="L'historique des changements de l'intranet apparaîtra ici."
        />
      ) : (
        /* Timeline verticale */
        <div className="relative">
          {/* Ligne verticale */}
          <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/40 via-muted-foreground/20 to-transparent hidden md:block" />

          <div className="space-y-6">
            {entries.map((entry, idx) => {
              const config = TYPE_CONFIG[entry.type];
              const EntryIcon = ICON_MAP[entry.title] ?? config.icon;
              const isFirst = idx === 0;

              return (
                <div
                  key={entry.title + entry.date}
                  className="relative animate-fade-in-up stagger-item"
                  style={{ animationDelay: `${idx * 80}ms`, animationFillMode: "both" }}
                >
                  {/* Point sur la timeline */}
                  <div className="hidden md:flex absolute left-0 top-5 z-10">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center shadow-sm ${
                        isFirst
                          ? "bg-primary text-white ring-4 ring-primary/20"
                          : "bg-white dark:bg-slate-800 border-2 border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      <EntryIcon className="h-5 w-5" />
                    </div>
                  </div>

                  <Card className={`md:ml-14 ${isFirst ? "ring-1 ring-primary/30" : ""}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          {/* Badge mobile */}
                          <span
                            className={`md:hidden flex h-10 w-10 items-center justify-center rounded-full ${
                              isFirst ? "bg-primary text-white" : "bg-primary/10 text-primary"
                            }`}
                          >
                            <EntryIcon className="h-5 w-5" />
                          </span>
                          <div>
                            <h2 className="text-lg font-semibold">{entry.title}</h2>
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(entry.date).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                        </div>
                        <Badge variant={config.variant}>
                          <config.icon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {entry.description}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
